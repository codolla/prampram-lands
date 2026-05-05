import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Provider = "arkesel" | "hubtel" | "mnotify";

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "233" + p.slice(1); // Ghana default
  if (!/^\d{9,15}$/.test(p)) return null;
  return p;
}

function renderTemplate(
  tpl: string,
  vars: Record<string, string | number>,
): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) =>
    vars[k] !== undefined ? String(vars[k]) : `{${k}}`,
  );
}

async function sendArkesel(opts: {
  apiKey: string;
  sender: string;
  to: string;
  message: string;
}): Promise<{ ok: boolean; response: string }> {
  const url = new URL("https://sms.arkesel.com/api/v2/sms/send");
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "api-key": opts.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sender: opts.sender,
      message: opts.message,
      recipients: [opts.to],
    }),
  });
  const text = await res.text();
  return { ok: res.ok, response: text.slice(0, 500) };
}

async function sendHubtel(opts: {
  clientId: string;
  clientSecret: string;
  sender: string;
  to: string;
  message: string;
}): Promise<{ ok: boolean; response: string }> {
  const params = new URLSearchParams({
    clientid: opts.clientId,
    clientsecret: opts.clientSecret,
    from: opts.sender,
    to: opts.to,
    content: opts.message,
  });
  const res = await fetch(
    `https://smsc.hubtel.com/v1/messages/send?${params.toString()}`,
    { method: "GET" },
  );
  const text = await res.text();
  return { ok: res.ok, response: text.slice(0, 500) };
}

async function sendMnotify(opts: {
  apiKey: string;
  sender: string;
  to: string;
  message: string;
}): Promise<{ ok: boolean; response: string }> {
  const res = await fetch(
    `https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(opts.apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: [opts.to],
        sender: opts.sender,
        message: opts.message,
        is_schedule: false,
      }),
    },
  );
  const text = await res.text();
  return { ok: res.ok, response: text.slice(0, 500) };
}

export const sendOverdueReminders = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { billIds?: string[]; testPhone?: string; testMessage?: string }) =>
      input,
  )
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load settings (RLS: admin only)
    const { data: settings, error: sErr } = await supabase
      .from("app_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (sErr || !settings) {
      return {
        ok: false,
        error:
          "Cannot load SMS settings. Only admins can send reminders. Configure SMS provider in Settings → SMS first.",
        sent: 0,
        failed: 0,
        skipped: 0,
      };
    }

    const provider = settings.sms_provider as Provider;
    const sender = settings.sms_sender_id || "PLS";

    // Quick credential check
    const credErr = (() => {
      if (provider === "arkesel" && !settings.arkesel_api_key)
        return "Arkesel API key is not set.";
      if (
        provider === "hubtel" &&
        (!settings.hubtel_client_id || !settings.hubtel_client_secret)
      )
        return "Hubtel client ID/secret is not set.";
      if (provider === "mnotify" && !settings.mnotify_api_key)
        return "mNotify API key is not set.";
      return null;
    })();
    if (credErr) {
      return { ok: false, error: credErr, sent: 0, failed: 0, skipped: 0 };
    }

    const dispatch = async (to: string, message: string) => {
      if (provider === "arkesel") {
        return sendArkesel({
          apiKey: settings.arkesel_api_key!,
          sender,
          to,
          message,
        });
      }
      if (provider === "hubtel") {
        return sendHubtel({
          clientId: settings.hubtel_client_id!,
          clientSecret: settings.hubtel_client_secret!,
          sender,
          to,
          message,
        });
      }
      return sendMnotify({
        apiKey: settings.mnotify_api_key!,
        sender,
        to,
        message,
      });
    };

    // Test mode
    if (data.testPhone) {
      const to = normalizePhone(data.testPhone);
      if (!to)
        return {
          ok: false,
          error: "Invalid phone number.",
          sent: 0,
          failed: 0,
          skipped: 0,
        };
      const message =
        data.testMessage ||
        "Test SMS from Customary Lands Secretariat. Configuration is working.";
      const r = await dispatch(to, message);
      await supabase.from("sms_logs").insert({
        phone: to,
        message,
        provider,
        status: r.ok ? "sent" : "failed",
        provider_response: r.response,
        sent_by: userId,
      });
      return {
        ok: r.ok,
        error: r.ok ? null : "Provider rejected the message.",
        sent: r.ok ? 1 : 0,
        failed: r.ok ? 0 : 1,
        skipped: 0,
      };
    }

    // Bulk mode: load overdue bills (optionally filtered)
    let q = supabase
      .from("bills")
      .select(
        "id, billing_year, amount, status, land_id",
      )
      .eq("status", "overdue");
    if (data.billIds && data.billIds.length > 0) {
      q = q.in("id", data.billIds);
    }
    const { data: bills, error: bErr } = await q;
    if (bErr) {
      return { ok: false, error: bErr.message, sent: 0, failed: 0, skipped: 0 };
    }

    // Load lands + owners in batch
    const landIds = Array.from(
      new Set((bills ?? []).map((b) => b.land_id).filter(Boolean) as string[]),
    );
    const { data: landRows } = await supabase
      .from("lands")
      .select("id, land_code, current_owner_id")
      .in("id", landIds.length ? landIds : ["00000000-0000-0000-0000-000000000000"]);
    const landMap = new Map((landRows ?? []).map((l) => [l.id, l]));
    const ownerIds = Array.from(
      new Set(
        (landRows ?? [])
          .map((l) => l.current_owner_id)
          .filter(Boolean) as string[],
      ),
    );
    const { data: ownerRows } = await supabase
      .from("landowners")
      .select("id, full_name, phone")
      .in(
        "id",
        ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"],
      );
    const ownerMap = new Map((ownerRows ?? []).map((o) => [o.id, o]));

    // Cooldown check via recent sms_logs
    const cooldownDays = settings.reminder_cooldown_days ?? 7;
    const since = new Date(
      Date.now() - cooldownDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data: recentLogs } = await supabase
      .from("sms_logs")
      .select("bill_id")
      .eq("status", "sent")
      .gte("created_at", since);
    const recentBillIds = new Set(
      (recentLogs ?? []).map((l) => l.bill_id).filter(Boolean) as string[],
    );

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const b of bills ?? []) {
      if (recentBillIds.has(b.id)) {
        skipped++;
        continue;
      }
      const land = landMap.get(b.land_id);
      const owner = land?.current_owner_id
        ? ownerMap.get(land.current_owner_id)
        : null;
      const phone = normalizePhone(owner?.phone);
      if (!phone) {
        skipped++;
        continue;
      }
      const message = renderTemplate(settings.reminder_template, {
        owner: owner?.full_name ?? "Landowner",
        bill: land?.land_code ?? b.id.slice(0, 8),
        amount: Number(b.amount).toFixed(2),
        year: b.billing_year,
      });
      const r = await dispatch(phone, message);
      await supabase.from("sms_logs").insert({
        bill_id: b.id,
        landowner_id: land?.current_owner_id ?? null,
        phone,
        message,
        provider,
        status: r.ok ? "sent" : "failed",
        provider_response: r.response,
        sent_by: userId,
      });
      if (r.ok) sent++;
      else failed++;
    }

    return { ok: true, error: null, sent, failed, skipped };
  });