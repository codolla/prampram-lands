import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { TableSkeleton } from "@/components/skeletons";
import { RefreshCw, ShieldAlert, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { resetSeedData } from "@/lib/seed.functions";
import { toast } from "sonner";
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
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/settings/system")({
  component: SystemSettingsPage,
});

type ActivityRow = {
  id: string;
  created_at: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  message: string | null;
  metadata: Record<string, unknown> | null;
};

function SystemSettingsPage() {
  const auth = useAuth();
  const canViewLogs = auth.hasAnyRole(["admin", "manager"]);
  const isAdmin = auth.hasRole("admin");
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;

  const reseed = useServerFn(resetSeedData);
  const [resetting, setResetting] = useState(false);
  const [clearing, setClearing] = useState(false);

  const activity = useQuery<{ rows: (ActivityRow & { actorLabel: string })[]; count: number }>({
    queryKey: ["activity_logs", page],
    enabled: canViewLogs,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      type ActivityQueryResult = {
        data: ActivityRow[] | null;
        error: { message: string } | null;
        count: number | null;
      };
      type ActivityClient = {
        from: (t: "activity_logs") => {
          select: (
            columns: string,
            opts: { count: "exact" },
          ) => {
            order: (
              column: "created_at",
              opts: { ascending: boolean },
            ) => { range: (from: number, to: number) => Promise<ActivityQueryResult> };
          };
        };
      };
      const activityDb = supabase as unknown as ActivityClient;
      const res = await activityDb
        .from("activity_logs")
        .select("id, created_at, actor_id, action, entity, entity_id, message, metadata", {
          count: "exact",
        })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (res.error) throw res.error;
      const rows = (res.data ?? []) as ActivityRow[];
      const count = (res.count ?? 0) as number;

      const actorIds = Array.from(
        new Set(rows.map((r) => r.actor_id).filter((v): v is string => !!v)),
      );

      const profilesRes =
        actorIds.length === 0
          ? { data: [], error: null as unknown as null }
          : await supabase.from("profiles").select("id, full_name, email").in("id", actorIds);
      if (profilesRes.error) throw profilesRes.error;

      const byId = new Map<string, { full_name: string | null; email: string | null }>();
      for (const p of profilesRes.data ?? []) {
        byId.set(p.id, { full_name: p.full_name, email: p.email });
      }

      const withActors = rows.map((r) => {
        if (!r.actor_id) return { ...r, actorLabel: "System" };
        const p = byId.get(r.actor_id);
        if (p?.full_name?.trim()) return { ...r, actorLabel: p.full_name.trim() };
        if (p?.email?.trim()) return { ...r, actorLabel: p.email.trim() };
        return { ...r, actorLabel: r.actor_id.slice(0, 8) + "…" };
      });

      return { rows: withActors, count };
    },
  });

  const total = activity.data?.count ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);

  const clearActivityLogs = async () => {
    setClearing(true);
    try {
      type ActivityClearClient = {
        from: (t: "activity_logs") => {
          delete: () => {
            not: (
              column: "id",
              operator: "is",
              value: null,
            ) => Promise<{ error: { message: string } | null }>;
          };
        };
      };
      const activityDb = supabase as unknown as ActivityClearClient;
      const { error } = await activityDb.from("activity_logs").delete().not("id", "is", null);
      if (error) throw new Error(error.message);
      toast.success("Activity log cleared");
      setPage(1);
      await qc.invalidateQueries({ queryKey: ["activity_logs"] });
    } catch (e) {
      toast.error("Clear failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setClearing(false);
    }
  };

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
      await qc.invalidateQueries();
    } catch (e) {
      toast.error("Reset failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setResetting(false);
    }
  };

  if (!canViewLogs) {
    return (
      <AppShell title="System & Logs">
        <div className="mx-auto max-w-2xl">
          <Card>
            <CardHeader className="flex flex-row items-center gap-3">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              <div>
                <CardTitle>Admins or managers only</CardTitle>
                <CardDescription>You do not have access to system settings.</CardDescription>
              </div>
            </CardHeader>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="System & Logs">
      <div className="mx-auto grid w-full max-w-6xl gap-6">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="text-base">Activity log</CardTitle>
              <CardDescription>
                Audit trail of changes across lands, bills, payments, SMS and staff actions.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => qc.invalidateQueries({ queryKey: ["activity_logs"] })}
                disabled={activity.isFetching}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${activity.isFetching ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
              {isAdmin ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={clearing}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      {clearing ? "Clearing…" : "Clear logs"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear activity logs?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes all activity log records. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={clearActivityLogs}>
                        Yes, clear logs
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {activity.isLoading ? (
              <TableSkeleton rows={6} />
            ) : activity.isError ? (
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
                Failed to load logs.
              </div>
            ) : (activity.data?.rows ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity yet.</p>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Time</th>
                        <th className="px-3 py-2 text-left font-medium">Actor</th>
                        <th className="px-3 py-2 text-left font-medium">Action</th>
                        <th className="px-3 py-2 text-left font-medium">Entity</th>
                        <th className="px-3 py-2 text-left font-medium">Message</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(activity.data?.rows ?? []).map((r) => (
                        <tr key={r.id} className="border-t border-border">
                          <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                            {formatDate(r.created_at)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{r.actorLabel}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <Badge variant="secondary" className="capitalize">
                              {r.action}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="capitalize">{r.entity}</span>
                            {r.entity_id ? (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {r.entity_id.slice(0, 8)}…
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <div className="line-clamp-2 text-foreground/80">
                              {r.message ?? "—"}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 ? (
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      Page {page} of {totalPages} · {total} records
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Data reset</CardTitle>
            <CardDescription>
              Reset the database to a fresh practice dataset. User accounts are kept.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Deletes landowners, lands, rent packages, bills, payments, ownership history, parcel
              coordinates, walk-in logs and SMS logs.
            </div>
            <div className="flex items-center gap-2">
              {!isAdmin ? (
                <div className="text-xs text-muted-foreground">Admin only</div>
              ) : resetting ? (
                <Button variant="outline" size="sm" disabled>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Resetting…
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Reset to fresh data
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Reset to fresh data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This permanently deletes all landowners, lands, rent packages, bills,
                        payments, ownership history, parcel coordinates, walk-in logs and SMS logs,
                        then loads a fresh practice dataset. User accounts, land types and user
                        roles are kept. Use only in non-production environments.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleReset}>
                        Yes, wipe and reseed
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
