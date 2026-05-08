import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";
import { normalisePhone, phoneToAuthEmail } from "@/lib/phone-auth";
import { createHash, randomBytes } from "node:crypto";

type Provider = "arkesel" | "hubtel" | "mnotify";

function normalizeSmsPhone(raw: string): string | null {
  let p = raw.replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("00")) p = p.slice(2);
  if (p.startsWith("0")) p = "233" + p.slice(1);
  if (!/^\d{9,15}$/.test(p)) return null;
  return p;
}

function providerFailureHint(response: string): string | null {
  const text = (response ?? "").toString().trim();
  if (!text) return null;

  const compact = text.replace(/\s+/g, " ").slice(0, 160);

  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") return compact;

    const obj = parsed as Record<string, unknown>;
    const candidates: unknown[] = [
      obj.message,
      obj.Message,
      obj.error,
      obj.Error,
      obj.errors,
      obj.Errors,
      obj.status,
      obj.Status,
      obj.code,
      obj.Code,
    ];

    for (const c of candidates) {
      if (typeof c === "string" && c.trim()) return c.trim().replace(/\s+/g, " ").slice(0, 160);
      if (Array.isArray(c) && c.length > 0) {
        const first = c[0] as unknown;
        if (typeof first === "string" && first.trim())
          return first.trim().replace(/\s+/g, " ").slice(0, 160);
        if (first && typeof first === "object") {
          const fo = first as Record<string, unknown>;
          const msg = fo.message ?? fo.Message ?? fo.error ?? fo.Error;
          if (typeof msg === "string" && msg.trim())
            return msg.trim().replace(/\s+/g, " ").slice(0, 160);
        }
      }
    }

    return compact;
  } catch {
    return compact;
  }
}

function phoneCandidates(input: string): string[] {
  const raw = input.trim();
  const compact = raw.replace(/[\s\-()]/g, "");
  const digits = compact.replace(/[^\d]/g, "");
  const out = new Set<string>();

  if (raw) out.add(raw);
  if (compact) out.add(compact);

  const e164 = normalisePhone(compact);
  out.add(e164);
  if (e164.startsWith("+")) out.add(e164.slice(1));

  if (digits) {
    out.add(digits);
    if (digits.startsWith("2330")) out.add("+233" + digits.slice(4));
    if (digits.startsWith("233")) out.add("+" + digits);
    if (digits.startsWith("0")) out.add("+233" + digits.slice(1));
    if (digits.length === 9) out.add("+233" + digits);
  }

  return Array.from(out);
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
  let providerOk = res.ok;
  try {
    const parsed = JSON.parse(text) as unknown as Record<string, unknown>;
    const code = parsed.code ?? parsed.Code ?? parsed.status ?? parsed.Status;
    const msg = parsed.message ?? parsed.Message;
    const msgSuccess =
      typeof msg === "string" &&
      (msg.toLowerCase().includes("success") || msg.toLowerCase().includes("sent"));
    let codeOk: boolean | null = null;
    if (typeof code === "string") {
      const v = code.toLowerCase();
      codeOk = v === "ok" || v === "success" || v === "successful" || v === "0" || v === "1000";
    } else if (typeof code === "number") {
      codeOk = code === 0 || code === 1000;
    }
    providerOk = (codeOk ?? false) || msgSuccess || res.ok;
  } catch {
    providerOk = res.ok;
  }
  return { ok: providerOk, response: text.slice(0, 500) };
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
  const res = await fetch(`https://smsc.hubtel.com/v1/messages/send?${params.toString()}`, {
    method: "GET",
  });
  const text = await res.text();
  let providerOk = res.ok;
  try {
    const parsed = JSON.parse(text) as unknown as Record<string, unknown>;
    const status = parsed.status ?? parsed.Status ?? parsed.code ?? parsed.Code;
    const msg = parsed.message ?? parsed.Message;
    const msgSuccess =
      typeof msg === "string" &&
      (msg.toLowerCase().includes("success") || msg.toLowerCase().includes("sent"));
    let codeOk: boolean | null = null;
    if (typeof status === "number") {
      codeOk = status === 0;
    } else if (typeof status === "string") {
      const v = status.toLowerCase();
      codeOk = v === "0" || v === "success" || v === "ok";
    }
    providerOk = (codeOk ?? false) || msgSuccess || res.ok;
  } catch {
    providerOk = res.ok;
  }
  return { ok: providerOk, response: text.slice(0, 500) };
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
  let providerOk = res.ok;
  try {
    const parsed = JSON.parse(text) as unknown as Record<string, unknown>;
    const code = parsed.code ?? parsed.Code ?? parsed.status ?? parsed.Status;
    const msg = parsed.message ?? parsed.Message;
    const msgSuccess =
      typeof msg === "string" &&
      (msg.toLowerCase().includes("success") || msg.toLowerCase().includes("sent"));
    let codeOk: boolean | null = null;
    if (typeof code === "string") {
      const v = code.toLowerCase();
      codeOk = v === "1000" || v === "0" || v === "ok" || v === "success" || v === "successful";
    } else if (typeof code === "number") {
      codeOk = code === 1000 || code === 0;
    }
    providerOk = (codeOk ?? false) || msgSuccess || res.ok;
  } catch {
    providerOk = res.ok;
  }
  return { ok: providerOk, response: text.slice(0, 500) };
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

type LoginOtpSelectRow = {
  id: string;
  created_at: string;
  phone: string;
  salt: string;
  code_hash: string;
  expires_at: string;
  used_at: string | null;
  attempts: number;
};

type LoginOtpClient = {
  from: (t: "login_otps") => {
    select: (columns: string) => {
      eq: (
        column: "phone",
        value: string,
      ) => {
        gte: (
          column: "created_at",
          value: string,
        ) => {
          order: (
            column: "created_at",
            opts: { ascending: boolean },
          ) => {
            limit: (
              n: number,
            ) => Promise<{ data: { id: string }[] | null; error: { message: string } | null }>;
          };
        };
        order: (
          column: "created_at",
          opts: { ascending: boolean },
        ) => {
          limit: (
            n: number,
          ) => Promise<{ data: LoginOtpSelectRow[] | null; error: { message: string } | null }>;
        };
      };
    };
    insert: (row: {
      phone: string;
      salt: string;
      code_hash: string;
      expires_at: string;
    }) => Promise<{ error: { message: string } | null }>;
    update: (patch: { attempts?: number; used_at?: string }) => {
      eq: (column: "id", value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

export const requestLoginOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string }) => input)
  .handler(async ({ data }) => {
    const phone = normalisePhone(data.phone);
    const phoneDigits = normalizeSmsPhone(phone);
    if (!phoneDigits) return { ok: false, error: "Invalid phone number." };

    const db = supabaseAdmin;
    const otpDb = db as unknown as LoginOtpClient;
    const { data: profile, error: pErr } = await db
      .from("profiles")
      .select("id, phone")
      .in("phone", phoneCandidates(data.phone))
      .limit(1)
      .maybeSingle();
    if (pErr) return { ok: false, error: pErr.message };
    if (!profile?.id) return { ok: false, error: "Phone number is not registered." };
    if (profile.phone !== phone) {
      await db.from("profiles").update({ phone }).eq("id", profile.id);
    }

    const { data: roleRows, error: rErr } = await db
      .from("user_roles")
      .select("id")
      .eq("user_id", profile.id)
      .limit(1);
    if (rErr) return { ok: false, error: rErr.message };
    if (!roleRows || roleRows.length === 0)
      return { ok: false, error: "Account is not authorised for this system." };

    const since = new Date(Date.now() - 30 * 1000).toISOString();
    const { data: recent } = await otpDb
      .from("login_otps")
      .select("id")
      .eq("phone", phone)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if ((recent ?? []).length > 0) {
      return { ok: false, error: "Please wait a moment before requesting another code." };
    }

    const { data: settings, error: sErr } = await db
      .from("app_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (sErr || !settings) {
      return { ok: false, error: "SMS settings are not configured yet." };
    }

    const provider = settings.sms_provider as Provider;
    const sender = settings.sms_sender_id || "PLS";
    const credErr = (() => {
      if (provider === "arkesel" && !settings.arkesel_api_key) return "Arkesel API key is not set.";
      if (provider === "hubtel" && (!settings.hubtel_client_id || !settings.hubtel_client_secret))
        return "Hubtel client ID/secret is not set.";
      if (provider === "mnotify" && !settings.mnotify_api_key) return "mNotify API key is not set.";
      return null;
    })();
    if (credErr) return { ok: false, error: credErr };

    const code = generateOtp();
    const salt = randomBytes(16).toString("hex");
    const code_hash = sha256(`${salt}:${code}`);
    const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const message = `PCLS login code: ${code}. Expires in 10 minutes.`;

    const dispatch = async () => {
      if (provider === "arkesel") {
        return sendArkesel({
          apiKey: settings.arkesel_api_key!,
          sender,
          to: phoneDigits,
          message,
        });
      }
      if (provider === "hubtel") {
        return sendHubtel({
          clientId: settings.hubtel_client_id!,
          clientSecret: settings.hubtel_client_secret!,
          sender,
          to: phoneDigits,
          message,
        });
      }
      return sendMnotify({
        apiKey: settings.mnotify_api_key!,
        sender,
        to: phoneDigits,
        message,
      });
    };

    const sendRes = await dispatch();
    await db.from("sms_logs").insert({
      phone: phoneDigits,
      message,
      provider,
      status: sendRes.ok ? "sent" : "failed",
      provider_response: sendRes.response,
      sent_by: profile.id,
    });
    if (!sendRes.ok) {
      const hint = providerFailureHint(sendRes.response);
      return {
        ok: false,
        error: hint ? `Could not send OTP. ${hint}` : "Could not send OTP. Try again.",
      };
    }

    await otpDb.from("login_otps").insert({
      phone,
      salt,
      code_hash,
      expires_at,
    });

    return { ok: true };
  });

export const verifyLoginOtp = createServerFn({ method: "POST" })
  .inputValidator((input: { phone: string; code: string }) => input)
  .handler(async ({ data }) => {
    const phone = normalisePhone(data.phone);
    const code = data.code.replace(/[^\d]/g, "");
    if (code.length !== 6) return { ok: false, error: "Enter the 6-digit code." };

    const db = supabaseAdmin;
    const otpDb = db as unknown as LoginOtpClient;
    const now = new Date().toISOString();
    const { data: rows, error } = await otpDb
      .from("login_otps")
      .select("id, salt, code_hash, expires_at, used_at, attempts")
      .eq("phone", phone)
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) return { ok: false, error: error.message };
    const row = (rows ?? [])[0];
    if (!row) return { ok: false, error: "No code requested for this number." };
    if (row.used_at) return { ok: false, error: "That code has already been used." };
    if (row.expires_at <= now) {
      return { ok: false, error: "That code has expired. Request a new one." };
    }
    if (row.attempts >= 5) return { ok: false, error: "Too many attempts. Request a new code." };

    const match = sha256(`${row.salt}:${code}`) === row.code_hash;
    if (!match) {
      await otpDb
        .from("login_otps")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      return { ok: false, error: "Invalid code." };
    }

    const { data: profile, error: pErr } = await db
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .maybeSingle();
    if (pErr) return { ok: false, error: pErr.message };
    if (!profile?.id) return { ok: false, error: "Phone number is not registered." };

    const { data: userRes, error: uErr } = await db.auth.admin.getUserById(profile.id);
    if (uErr) return { ok: false, error: uErr.message };
    const email = userRes.user?.email ?? phoneToAuthEmail(phone);

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      return { ok: false, error: "Server is missing Supabase environment variables." };
    }

    const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return { ok: false, error: linkErr?.message ?? "Could not create a login session." };
    }

    const anon = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    });
    const { data: verified, error: vErr } = await anon.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (vErr || !verified.session) {
      return { ok: false, error: vErr?.message ?? "Could not verify login session." };
    }

    await otpDb
      .from("login_otps")
      .update({ used_at: now, attempts: row.attempts + 1 })
      .eq("id", row.id);

    return {
      ok: true,
      session: {
        access_token: verified.session.access_token,
        refresh_token: verified.session.refresh_token,
      },
    };
  });
