import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CONTACT_LINE } from "@/lib/contact";

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

function normalizeEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim();
  if (!e) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e.toLowerCase();
}

function renderTemplate(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

async function sendResendEmail(opts: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ ok: boolean; response: string }> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
    }),
  });
  const text = await res.text();
  return { ok: res.ok, response: text.slice(0, 500) };
}

function emailConfig(): { apiKey: string; from: string } | null {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.RESEND_FROM ?? process.env.RESEND_FROM_EMAIL ?? "").trim();
  if (!apiKey || !from) return null;
  return { apiKey, from };
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
  const res = await fetch(`https://smsc.hubtel.com/v1/messages/send?${params.toString()}`, {
    method: "GET",
  });
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
    (input: { billIds?: string[]; testPhone?: string; testMessage?: string }) => input,
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
      if (provider === "arkesel" && !settings.arkesel_api_key) return "Arkesel API key is not set.";
      if (provider === "hubtel" && (!settings.hubtel_client_id || !settings.hubtel_client_secret))
        return "Hubtel client ID/secret is not set.";
      if (provider === "mnotify" && !settings.mnotify_api_key) return "mNotify API key is not set.";
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
        data.testMessage || "Test SMS from Customary Lands Secretariat. Configuration is working.";
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
      .select("id, billing_year, amount, status, land_id")
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
      new Set((landRows ?? []).map((l) => l.current_owner_id).filter(Boolean) as string[]),
    );
    const { data: ownerRows } = await supabase
      .from("landowners")
      .select("id, full_name, phone, email")
      .in("id", ownerIds.length ? ownerIds : ["00000000-0000-0000-0000-000000000000"]);
    const ownerMap = new Map((ownerRows ?? []).map((o) => [o.id, o]));

    // Cooldown check via recent sms_logs
    const cooldownDays = settings.reminder_cooldown_days ?? 7;
    const since = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000).toISOString();
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
    let emailSent = 0;
    let emailFailed = 0;
    let emailSkipped = 0;

    const emailCfg = emailConfig();
    const emailSubject = "Overdue land rate bill reminder";

    for (const b of bills ?? []) {
      if (recentBillIds.has(b.id)) {
        skipped++;
        continue;
      }
      const land = landMap.get(b.land_id);
      const owner = land?.current_owner_id ? ownerMap.get(land.current_owner_id) : null;
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

      const toEmail = normalizeEmail(owner?.email);
      if (toEmail && emailCfg) {
        const text = `${message}\n\nIf you have already paid, please ignore this reminder.\n`;
        const er = await sendResendEmail({
          apiKey: emailCfg.apiKey,
          from: emailCfg.from,
          to: toEmail,
          subject: emailSubject,
          text,
        });
        if (er.ok) emailSent++;
        else emailFailed++;
      } else {
        emailSkipped++;
      }
    }

    return {
      ok: true,
      error: null,
      sent,
      failed,
      skipped,
      emailSent,
      emailFailed,
      emailSkipped,
    };
  });

export const sendPaymentNotification = createServerFn({ method: "POST" })
  .inputValidator((input: { paymentId: string }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: roleRows, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (roleErr) throw new Error(roleErr.message);
    const roles = new Set((roleRows ?? []).map((r) => r.role));
    if (!roles.has("admin") && !roles.has("finance")) {
      throw new Error("Only admins and finance can send payment notifications.");
    }

    if (!data.paymentId) throw new Error("paymentId is required");

    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .select(
        "id, bill_id, amount, paid_at, method, receipt_number, bills(billing_year, lands(land_code, plot_number, landowners(id, full_name, phone, email)))",
      )
      .eq("id", data.paymentId)
      .single();
    if (payErr || !payment) throw new Error(payErr?.message ?? "Payment not found");

    const bill = payment.bills as unknown as {
      billing_year: number;
      lands: {
        land_code: string;
        plot_number: string | null;
        landowners: {
          id: string;
          full_name: string | null;
          phone: string | null;
          email: string | null;
        } | null;
      } | null;
    };

    const landCode = bill?.lands?.land_code ?? "Land";
    const plotNumber = bill?.lands?.plot_number ?? "—";
    const ownerName = bill?.lands?.landowners?.full_name ?? "Customer";

    const { data: settings, error: sErr } = await supabaseAdmin
      .from("app_settings")
      .select("*")
      .limit(1)
      .maybeSingle();
    if (sErr || !settings) {
      return { ok: false, error: "SMS settings not configured.", sent: 0, failed: 0, skipped: 0 };
    }

    const provider = settings.sms_provider as Provider;
    const sender = settings.sms_sender_id || "PLS";
    const template =
      settings.payment_template ||
      "Payment received: {owner} paid GHS {amount} for {land} ({year}). Receipt: {receipt}. Thank you.";

    const credErr = (() => {
      if (provider === "arkesel" && !settings.arkesel_api_key) return "Arkesel API key is not set.";
      if (provider === "hubtel" && (!settings.hubtel_client_id || !settings.hubtel_client_secret)) {
        return "Hubtel client ID/secret is not set.";
      }
      if (provider === "mnotify" && !settings.mnotify_api_key) return "mNotify API key is not set.";
      return null;
    })();
    if (credErr) return { ok: false, error: credErr, sent: 0, failed: 0, skipped: 0 };

    const dispatch = async (to: string, message: string) => {
      if (provider === "arkesel") {
        return sendArkesel({ apiKey: settings.arkesel_api_key!, sender, to, message });
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
      return sendMnotify({ apiKey: settings.mnotify_api_key!, sender, to, message });
    };

    const message = renderTemplate(template, {
      owner: ownerName,
      amount: Number(payment.amount).toFixed(2),
      land: `${landCode} · Plot ${plotNumber}`,
      year: bill?.billing_year ?? "",
      receipt: payment.receipt_number,
      method: String(payment.method).toUpperCase(),
      date: payment.paid_at,
    });

    const byRole = async (role: "admin" | "manager") => {
      const { data: rows, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", role);
      if (error) throw error;
      const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
      if (ids.length === 0) return [];
      const { data: profs, error: pErr } = await supabase
        .from("profiles")
        .select("id, phone")
        .in("id", ids);
      if (pErr) throw pErr;
      return (profs ?? []).map((p) => normalizePhone(p.phone)).filter(Boolean) as string[];
    };

    const recipients = new Map<string, { kind: "customer" | "admin" | "manager" }>();

    const customerPhone = normalizePhone(bill?.lands?.landowners?.phone);
    if (customerPhone) recipients.set(customerPhone, { kind: "customer" });

    for (const p of await byRole("admin")) {
      if (!recipients.has(p)) recipients.set(p, { kind: "admin" });
    }

    const managerThreshold = 1000;
    const ghHour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        hourCycle: "h23",
        timeZone: "Africa/Accra",
      }).format(new Date()),
    );
    const managerQuietHours = ghHour >= 17 || ghHour < 7;
    if (Number(payment.amount) <= managerThreshold && !managerQuietHours) {
      for (const p of await byRole("manager")) {
        if (!recipients.has(p)) recipients.set(p, { kind: "manager" });
      }
    }

    let sent = 0;
    let failed = 0;
    let skipped = 0;
    let emailSent = 0;
    let emailFailed = 0;
    let emailSkipped = 0;

    const landownerId = bill?.lands?.landowners?.id ?? null;

    for (const [phone, meta] of recipients.entries()) {
      const r = await dispatch(phone, message);
      await supabase.from("sms_logs").insert({
        bill_id: payment.bill_id,
        landowner_id: meta.kind === "customer" ? landownerId : null,
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

    if (recipients.size === 0) skipped = 1;

    const toEmail = normalizeEmail(bill?.lands?.landowners?.email);
    const emailCfg = emailConfig();
    if (toEmail && emailCfg) {
      const subject = `Payment received · ${landCode} (${bill?.billing_year ?? ""})`;
      const text = `${message}\n\nContact: ${CONTACT_LINE}\n`;
      const er = await sendResendEmail({
        apiKey: emailCfg.apiKey,
        from: emailCfg.from,
        to: toEmail,
        subject,
        text,
      });
      if (er.ok) emailSent++;
      else emailFailed++;
    } else {
      emailSkipped++;
    }

    return {
      ok: failed === 0 && emailFailed === 0,
      error: failed === 0 && emailFailed === 0 ? null : "Some notifications failed.",
      sent,
      failed,
      skipped,
      emailSent,
      emailFailed,
      emailSkipped,
    };
  });
