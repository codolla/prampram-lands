import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Landmark,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { AddEmailBanner } from "@/components/AddEmailBanner";
import { TableSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useServerFn } from "@tanstack/react-start";
import { resetSeedData } from "@/lib/seed.functions";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const auth = useAuth();
  const isAdmin = auth.hasRole("admin");
  const queryClient = useQueryClient();
  const reseed = useServerFn(resetSeedData);
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    setResetting(true);
    try {
      const res = await reseed();
      if (!res || res.ok !== true || !res.counts) {
        throw new Error(
          "Reset failed: server response was invalid. This feature requires the app to run as a Node.js server (TanStack Start SSR), not as a static Vite site.",
        );
      }
      toast.success("Database reset", {
        description: `Reseeded ${res.counts.lands} lands, ${res.counts.bills} bills, ${res.counts.payments} payments.`,
      });
      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error("Reset failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setResetting(false);
    }
  };

  const stats = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const [{ count: lands }, { count: activeLands }, paymentsRes, billsRes] = await Promise.all([
        supabase.from("lands").select("*", { count: "exact", head: true }),
        supabase.from("lands").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("payments").select("amount"),
        supabase
          .from("bills")
          .select("amount, status")
          .in("status", ["pending", "partial", "overdue"]),
      ]);
      const collected = (paymentsRes.data ?? []).reduce((s, p) => s + Number(p.amount), 0);
      const outstanding = (billsRes.data ?? []).reduce((s, b) => s + Number(b.amount), 0);
      return {
        lands: lands ?? 0,
        activeLands: activeLands ?? 0,
        collected,
        outstanding,
      };
    },
  });

  const recent = useQuery({
    queryKey: ["recent-payments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payments")
        .select(
          "id, amount, paid_at, method, receipt_number, bills!inner(id, billing_year, lands!inner(land_code, plot_number))",
        )
        .order("paid_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data ?? [];
    },
  });

  const cards = [
    {
      label: "Total Lands",
      value: stats.data?.lands ?? 0,
      icon: Landmark,
      tone: "text-primary",
      bg: "from-primary/10 to-primary/0",
    },
    {
      label: "Active Lands",
      value: stats.data?.activeLands ?? 0,
      icon: CheckCircle2,
      tone: "text-primary",
      bg: "from-primary/10 to-primary/0",
    },
    {
      label: "Revenue Collected",
      value: formatCurrency(stats.data?.collected ?? 0),
      icon: CreditCard,
      tone: "text-accent-foreground",
      bg: "from-accent/25 to-accent/0",
    },
    {
      label: "Outstanding",
      value: formatCurrency(stats.data?.outstanding ?? 0),
      icon: AlertCircle,
      tone: "text-destructive",
      bg: "from-destructive/10 to-destructive/0",
    },
  ];

  return (
    <AppShell title="Dashboard">
      <AddEmailBanner />
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-primary">
            Overview
          </p>
          <h2 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-balance">
            A snapshot of the Secretariat today
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Active land records, revenue collected and outstanding ground rent at a glance.
          </p>
        </div>
        {isAdmin && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={resetting}>
                <RefreshCw className={`mr-2 h-4 w-4 ${resetting ? "animate-spin" : ""}`} />
                {resetting ? "Resetting…" : "Reset to seed data"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset to seed data?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes all landowners, lands, rent packages, bills, payments,
                  ownership history, parcel coordinates and SMS logs, then loads a fresh practice
                  dataset. User accounts and land types are kept. Use only in non-production
                  environments.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset}>Yes, wipe and reseed</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Card
            key={c.label}
            className={`relative overflow-hidden border-border/70 bg-gradient-to-br ${c.bg} shadow-editorial`}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {c.label}
              </CardTitle>
              <span className="rounded-md bg-background/80 p-1.5 ring-1 ring-border/60">
                <c.icon className={`h-4 w-4 ${c.tone}`} />
              </span>
            </CardHeader>
            <CardContent>
              <div className="font-serif text-3xl font-semibold tracking-tight">
                {stats.isLoading ? <Skeleton className="h-8 w-24" /> : c.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-8 border-border/70 shadow-editorial">
        <CardHeader className="flex flex-row items-end justify-between">
          <div>
            <CardTitle className="font-serif text-xl font-semibold">Recent payments</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              Latest receipts issued by the Secretariat.
            </p>
          </div>
          <Link
            to="/payments"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </CardHeader>
        <CardContent>
          {recent.isLoading ? (
            <TableSkeleton columns={6} rows={5} />
          ) : (recent.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    <th className="pb-3 font-medium">Receipt</th>
                    <th className="pb-3 font-medium">Land</th>
                    <th className="pb-3 font-medium">Year</th>
                    <th className="pb-3 font-medium">Method</th>
                    <th className="pb-3 text-right font-medium">Amount</th>
                    <th className="pb-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {(recent.data ?? []).map((p) => {
                    const bill = p.bills as unknown as {
                      id: string;
                      billing_year: number;
                      lands: { land_code: string; plot_number: string | null } | null;
                    } | null;
                    return (
                      <tr
                        key={p.id}
                        className="border-b border-border/50 last:border-0 hover:bg-muted/40"
                      >
                        <td className="py-3 font-mono text-xs">
                          <Link
                            to="/payments/$paymentId/receipt"
                            params={{ paymentId: p.id }}
                            className="font-medium text-primary hover:underline"
                          >
                            {p.receipt_number}
                          </Link>
                        </td>
                        <td className="py-3 font-medium">{bill?.lands?.land_code ?? "—"}</td>
                        <td className="py-3">{bill?.billing_year ?? "—"}</td>
                        <td className="py-3">
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase tracking-wide"
                          >
                            {p.method}
                          </Badge>
                        </td>
                        <td className="py-3 text-right font-mono font-medium tabular-nums">
                          {formatCurrency(p.amount)}
                        </td>
                        <td className="py-3 text-muted-foreground">{formatDate(p.paid_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
