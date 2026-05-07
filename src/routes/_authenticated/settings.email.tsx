import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import {
  Mail,
  ExternalLink,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  XCircle,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getEmailDomainStatus } from "@/lib/email-status.functions";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export const Route = createFileRoute("/_authenticated/settings/email")({
  component: EmailSettingsPage,
});

function EmailSettingsPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  if (!isAdmin) {
    return (
      <AppShell>
        <div className="mx-auto max-w-2xl px-6 py-12">
          <Card>
            <CardHeader className="flex flex-row items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              <div>
                <CardTitle>Admins only</CardTitle>
                <CardDescription>
                  You need an administrator role to manage the email domain.
                </CardDescription>
              </div>
            </CardHeader>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Settings</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">Email domain</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Configure the sender domain used for password resets and other account emails. Once
            verified, emails will arrive from your own domain instead of a default address.
          </p>
        </div>

        <StatusPanel />

        <Card className="border-border/70 shadow-editorial">
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 text-primary">
                <Mail className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="font-serif text-2xl">Sender domain setup</CardTitle>
                <CardDescription className="mt-1">
                  Launch the guided setup to add a sending domain. DNS records are managed
                  automatically once you confirm ownership.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <ol className="space-y-3 text-sm text-muted-foreground">
              <li>
                <span className="font-medium text-foreground">1. Open setup.</span> Use the button
                below to launch the email domain dialog.
              </li>
              <li>
                <span className="font-medium text-foreground">2. Enter your domain.</span> For
                example, <code className="rounded bg-muted px-1">yourdomain.com</code>.
              </li>
              <li>
                <span className="font-medium text-foreground">3. Verify DNS.</span> Verification
                usually completes within a few minutes.
              </li>
            </ol>

            <div className="rounded-md border border-dashed border-border bg-muted/40 p-4 text-sm">
              <p className="font-medium text-foreground">How to configure</p>
              <p className="mt-1 text-muted-foreground">
                Email domain setup is managed through Lovable Cloud. Open the Lovable chat and ask{" "}
                <span className="italic">"set up my email domain"</span> — a guided dialog will
                appear to add your domain and DNS records.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <a href="https://docs.lovable.dev/features/cloud" target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Cloud documentation
                </a>
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              After verification, password reset emails will be sent from your configured domain.
              You can monitor delivery and DNS status in Cloud → Emails.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function StatusPanel() {
  const fetchStatus = useServerFn(getEmailDomainStatus);
  const { data, isFetching, refetch, error } = useQuery({
    queryKey: ["email-domain-status"],
    queryFn: () => fetchStatus(),
    staleTime: 60_000,
  });

  const state: "configured" | "unconfigured" | "warning" | "loading" = (() => {
    if (error) return "unconfigured";
    if (!data) return "loading";
    if (!data.configured) return "unconfigured";
    return data.verified ? "configured" : "warning";
  })();

  const Icon = (() => {
    if (state === "configured") return CheckCircle2;
    if (state === "warning") return AlertCircle;
    if (state === "unconfigured") return XCircle;
    return Loader2;
  })();

  const tone = (() => {
    if (state === "configured") return "text-emerald-600 bg-emerald-500/10";
    if (state === "warning") return "text-amber-600 bg-amber-500/10";
    if (state === "unconfigured") return "text-destructive bg-destructive/10";
    return "text-muted-foreground bg-muted";
  })();

  const label = (() => {
    if (state === "configured") return "Verified";
    if (state === "warning") return "Configured · Unverified";
    if (state === "unconfigured") return "Not configured";
    return "Checking…";
  })();

  return (
    <Card className="border-border/70 shadow-editorial">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="flex items-start gap-3">
          <div className={`rounded-md p-2 ${tone}`}>
            <Icon className={`h-5 w-5 ${state === "loading" ? "animate-spin" : ""}`} />
          </div>
          <div>
            <CardTitle className="font-serif text-2xl">Domain status</CardTitle>
            <CardDescription className="mt-1">
              {data?.detail ??
                (error
                  ? "Could not check status. Try again."
                  : "Checking the current configuration…")}
            </CardDescription>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <StatusRow label="Configuration">
          <Badge variant="outline" className={`border-transparent ${tone} font-medium`}>
            {label}
          </Badge>
        </StatusRow>
        <StatusRow label="Last checked">
          <span className="text-sm text-foreground">
            {data?.checkedAt ? `${formatDistanceToNow(new Date(data.checkedAt))} ago` : "—"}
          </span>
        </StatusRow>
        <StatusRow label="Successful sends (7d)">
          <span className="text-sm tabular-nums text-foreground">{data?.recentSends ?? 0}</span>
        </StatusRow>
        <StatusRow label="Failures (7d)">
          <span
            className={`text-sm tabular-nums ${
              (data?.recentFailures ?? 0) > 0 ? "text-destructive" : "text-foreground"
            }`}
          >
            {data?.recentFailures ?? 0}
          </span>
        </StatusRow>
        <StatusRow label="Last delivery attempt">
          <span className="text-sm text-foreground">
            {data?.lastSendAt
              ? `${formatDistanceToNow(new Date(data.lastSendAt))} ago`
              : "No activity yet"}
          </span>
        </StatusRow>
      </CardContent>
    </Card>
  );
}

function StatusRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
