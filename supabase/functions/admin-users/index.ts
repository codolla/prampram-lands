// Admin user management edge function.
// Requires the caller to have the 'admin' role (validated via service-role lookup of user_roles).
// Supported actions:
//   - create_user: create a new auth user with email + password and assign roles
//   - reset_password: update another user's password
//   - update_email: update another user's email
//   - delete_user: delete an auth user (cascades to profile and roles)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action =
  | {
      action: "create_user";
      email: string;
      password: string;
      full_name?: string;
      phone?: string;
      avatar_url?: string | null;
      roles?: Array<"admin" | "staff" | "finance" | "manager" | "frontdesk" | "developer">;
    }
  | { action: "ensure_default_developer" }
  | { action: "reset_password"; user_id: string; password: string }
  | { action: "update_email"; user_id: string; email: string }
  | { action: "delete_user"; user_id: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) return json({ error: "Missing authorization" }, 401);

    // Verify caller using anon client + their JWT
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return json({ error: "Invalid session" }, 401);
    }
    const callerId = userData.user.id;

    // Service-role client for privileged operations
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // Confirm caller is admin
    const { data: roleRows, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (roleErr) return json({ error: roleErr.message }, 500);
    const isAdmin = (roleRows ?? []).some((r) => r.role === "admin");
    const isDeveloper = (roleRows ?? []).some((r) => r.role === "developer");
    if (!isAdmin && !isDeveloper) return json({ error: "Admin role required" }, 403);

    const body = (await req.json()) as Action;

    switch (body.action) {
      case "ensure_default_developer": {
        const { data: existingDev, error: devErr } = await admin
          .from("user_roles")
          .select("user_id")
          .eq("role", "developer")
          .limit(1);
        if (devErr) return json({ error: devErr.message }, 500);
        const hasDeveloper = (existingDev ?? []).length > 0;
        if (hasDeveloper && !isDeveloper) {
          return json({ error: "Only a developer can manage developer accounts" }, 403);
        }

        const email = "code@codollastudio.com";
        const full_name = "Codolla";
        const phone = "0244909165";
        const password = "password";

        const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        if (listErr) return json({ error: listErr.message }, 500);
        const existing = (listed?.users ?? []).find((u) => u.email?.toLowerCase() === email);

        let userId = existing?.id;
        if (!userId) {
          const { data: created, error: createErr } = await admin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name },
          });
          if (createErr || !created.user) {
            return json({ error: createErr?.message ?? "Create failed" }, 400);
          }
          userId = created.user.id;
        } else {
          const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
            password,
            user_metadata: { full_name },
          });
          if (updateErr) return json({ error: updateErr.message }, 400);
        }

        await admin.from("profiles").update({ full_name, phone, email }).eq("id", userId);

        const { error: upsertErr } = await admin
          .from("user_roles")
          .upsert({ user_id: userId, role: "developer" }, { onConflict: "user_id,role" });
        if (upsertErr) return json({ error: upsertErr.message }, 400);

        return json({ ok: true, user_id: userId });
      }

      case "create_user": {
        if (!body.email || !body.password) {
          return json({ error: "Email and password are required" }, 400);
        }
        const desiredRaw = body.roles && body.roles.length > 0 ? body.roles : ["staff"];
        const wantsDeveloper = desiredRaw.includes("developer");

        if (wantsDeveloper && !isDeveloper) {
          const { data: existingDev, error: devErr } = await admin
            .from("user_roles")
            .select("user_id")
            .eq("role", "developer")
            .limit(1);
          if (devErr) return json({ error: devErr.message }, 500);
          const hasDeveloper = (existingDev ?? []).length > 0;
          if (hasDeveloper) {
            return json({ error: "Only a developer can create developer users" }, 403);
          }
        }

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: body.email,
          password: body.password,
          email_confirm: true,
          user_metadata: {
            full_name: body.full_name ?? body.email.split("@")[0],
          },
        });
        if (createErr || !created.user) {
          return json({ error: createErr?.message ?? "Create failed" }, 400);
        }
        const newId = created.user.id;

        // Profile is created by handle_new_user trigger; update phone/full_name if provided
        await admin
          .from("profiles")
          .update({
            full_name: body.full_name ?? null,
            phone: body.phone ?? null,
            avatar_url: body.avatar_url ?? null,
          })
          .eq("id", newId);

        // Replace default roles assigned by trigger with the requested ones
        const desiredBase = isDeveloper ? desiredRaw : desiredRaw.filter((r) => r !== "developer");
        const desired = desiredBase.length > 0 ? desiredBase : ["staff"];
        await admin.from("user_roles").delete().eq("user_id", newId);
        const inserts = desired.map((role) => ({ user_id: newId, role }));
        const { error: roleInsertErr } = await admin.from("user_roles").insert(inserts);
        if (roleInsertErr) return json({ error: roleInsertErr.message }, 400);

        return json({ ok: true, user_id: newId });
      }

      case "reset_password": {
        if (!body.user_id || !body.password) {
          return json({ error: "user_id and password are required" }, 400);
        }
        if (!isDeveloper) {
          const { data: targetRoles, error: tErr } = await admin
            .from("user_roles")
            .select("role")
            .eq("user_id", body.user_id);
          if (tErr) return json({ error: tErr.message }, 500);
          if ((targetRoles ?? []).some((r) => r.role === "developer")) {
            return json({ error: "Only a developer can manage developer accounts" }, 403);
          }
        }
        const { error } = await admin.auth.admin.updateUserById(body.user_id, {
          password: body.password,
        });
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      case "update_email": {
        if (!body.user_id || !body.email) {
          return json({ error: "user_id and email are required" }, 400);
        }
        if (!isDeveloper) {
          const { data: targetRoles, error: tErr } = await admin
            .from("user_roles")
            .select("role")
            .eq("user_id", body.user_id);
          if (tErr) return json({ error: tErr.message }, 500);
          if ((targetRoles ?? []).some((r) => r.role === "developer")) {
            return json({ error: "Only a developer can manage developer accounts" }, 403);
          }
        }
        const { error } = await admin.auth.admin.updateUserById(body.user_id, {
          email: body.email,
          email_confirm: true,
        });
        if (error) return json({ error: error.message }, 400);
        await admin.from("profiles").update({ email: body.email }).eq("id", body.user_id);
        return json({ ok: true });
      }

      case "delete_user": {
        if (!body.user_id) return json({ error: "user_id required" }, 400);
        if (body.user_id === callerId) {
          return json({ error: "You cannot delete your own account" }, 400);
        }
        if (!isDeveloper) {
          const { data: targetRoles, error: tErr } = await admin
            .from("user_roles")
            .select("role")
            .eq("user_id", body.user_id);
          if (tErr) return json({ error: tErr.message }, 500);
          if ((targetRoles ?? []).some((r) => r.role === "developer")) {
            return json({ error: "Only a developer can manage developer accounts" }, 403);
          }
        }
        const { error } = await admin.auth.admin.deleteUser(body.user_id);
        if (error) return json({ error: error.message }, 400);
        return json({ ok: true });
      }

      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unexpected error";
    return json({ error: msg }, 500);
  }
});
