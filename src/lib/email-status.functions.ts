import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type EmailDomainStatus = {
  configured: boolean;
  verified: boolean;
  recentSends: number;
  recentFailures: number;
  lastSendAt: string | null;
  checkedAt: string;
  detail: string;
};

type EmailSendLogRow = {
  id: string;
  message_id: string | null;
  status: string;
  created_at: string;
};

type EmailDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      email_send_log: {
        Row: EmailSendLogRow;
        Insert: Partial<EmailSendLogRow>;
        Update: Partial<EmailSendLogRow>;
        Relationships: [];
      };
    };
  };
};

export const getEmailDomainStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<EmailDomainStatus> => {
    const checkedAt = new Date().toISOString();
    const SUPABASE_URL = process.env.SUPABASE_URL!;
    const SERVICE_KEY =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY!;

    const admin = createClient<EmailDatabase>(SUPABASE_URL, SERVICE_KEY);

    // Probe email_send_log – its presence indicates infra has been set up.
    const { error: probeError } = await admin
      .from("email_send_log")
      .select("id", { count: "exact", head: true });

    if (probeError) {
      return {
        configured: false,
        verified: false,
        recentSends: 0,
        recentFailures: 0,
        lastSendAt: null,
        checkedAt,
        detail:
          "No email infrastructure detected. Configure a sender domain to enable account emails.",
      };
    }

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: sentRows }, { data: failedRows }, { data: latest }] = await Promise.all([
      admin
        .from("email_send_log")
        .select("message_id")
        .eq("status", "sent")
        .gte("created_at", since),
      admin
        .from("email_send_log")
        .select("message_id")
        .in("status", ["dlq", "failed", "bounced"])
        .gte("created_at", since),
      admin
        .from("email_send_log")
        .select("created_at, status")
        .order("created_at", { ascending: false })
        .limit(1),
    ]);

    const uniq = (rows: Array<{ message_id: string | null }> | null) =>
      new Set((rows ?? []).map((r) => r.message_id).filter(Boolean)).size;

    const recentSends = uniq(sentRows ?? null);
    const recentFailures = uniq(failedRows ?? null);
    const lastSendAt = latest?.[0]?.created_at ?? null;
    const verified = recentSends > 0;

    return {
      configured: true,
      verified,
      recentSends,
      recentFailures,
      lastSendAt,
      checkedAt,
      detail: verified
        ? "Domain is configured and recently delivered email successfully."
        : lastSendAt
          ? "Domain is configured. No successful deliveries in the last 7 days."
          : "Email infrastructure is in place. Awaiting first send to confirm verification.",
    };
  });
