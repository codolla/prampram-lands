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
import { clearAllData, resetSeedData } from "@/lib/seed.functions";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  message: string;
  metadata: Record<string, unknown>;
};

function SystemSettingsPage() {
  const auth = useAuth();
  const canViewLogs = auth.hasAnyRole(["admin", "manager", "developer"]);
  const isAdmin = auth.hasRole("admin");
  const isDeveloper = auth.hasRole("developer");
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [selectedLog, setSelectedLog] = useState<(ActivityRow & { actorLabel: string }) | null>(
    null,
  );
  const [logOpen, setLogOpen] = useState(false);

  const clearData = useServerFn(clearAllData);
  const seedData = useServerFn(resetSeedData);
  const [resetting, setResetting] = useState(false);
  const [seeding, setSeeding] = useState(false);
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
          : await supabase
              .from("profiles")
              .select("id, full_name, email, phone")
              .in("id", actorIds);
      if (profilesRes.error) throw profilesRes.error;

      const byId = new Map<
        string,
        { full_name: string | null; email: string | null; phone: string | null }
      >();
      for (const p of profilesRes.data ?? []) {
        byId.set(p.id, { full_name: p.full_name, email: p.email, phone: p.phone });
      }

      const withActors = rows.map((r) => {
        if (!r.actor_id) return { ...r, actorLabel: "System" };
        const p = byId.get(r.actor_id);
        if (p?.full_name?.trim()) return { ...r, actorLabel: p.full_name.trim() };
        if (p?.email?.trim()) return { ...r, actorLabel: p.email.trim() };
        if (p?.phone?.trim()) return { ...r, actorLabel: p.phone.trim() };
        return { ...r, actorLabel: r.actor_id.slice(0, 8) + "…" };
      });

      return { rows: withActors, count };
    },
  });

  const logDetail = useQuery<{
    log: ActivityRow;
    actor: {
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
    } | null;
    related: { table: string; row: Record<string, unknown> } | null;
  }>({
    queryKey: ["activity_log_detail", selectedLog?.id],
    enabled: logOpen && !!selectedLog?.id,
    queryFn: async () => {
      if (!selectedLog?.id) throw new Error("No activity log selected");
      const db = supabase as unknown as {
        from: (t: string) => {
          select: (columns: string) => {
            eq: (
              column: string,
              value: string,
            ) => {
              maybeSingle: () => Promise<{
                data: unknown | null;
                error: { message: string } | null;
              }>;
            };
          };
        };
      };

      const { data: log, error: logErr } = await db
        .from("activity_logs")
        .select("id, created_at, actor_id, action, entity, entity_id, message, metadata")
        .eq("id", selectedLog.id)
        .maybeSingle();
      if (logErr) throw new Error(logErr.message);
      if (!log) throw new Error("Log not found");
      const logRow = log as unknown as ActivityRow;

      const actor = await (async () => {
        const actorId = logRow.actor_id;
        if (!actorId) return null;
        const { data, error } = await db
          .from("profiles")
          .select("id, full_name, email, phone")
          .eq("id", actorId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return (
          (data as unknown as {
            id: string;
            full_name: string | null;
            email: string | null;
            phone: string | null;
          }) ?? null
        );
      })();

      const related = await (async () => {
        const entityId = logRow.entity_id;
        if (!entityId) return null;
        const id = entityId;
        const table = logRow.entity;
        const safeSelect = async (t: string, columns: string) => {
          const { data, error } = await db.from(t).select(columns).eq("id", id).maybeSingle();
          if (error) throw new Error(error.message);
          return data as unknown as Record<string, unknown> | null;
        };

        if (table === "payments") {
          const row = await safeSelect(
            "payments",
            "id, kind, amount, method, receipt_number, paid_at, bill_id, land_id, landowner_id, reference, notes",
          );
          return row ? { table, row } : null;
        }
        if (table === "bills") {
          const row = await safeSelect(
            "bills",
            "id, billing_year, amount, status, due_date, issued_at, land_id, notes",
          );
          return row ? { table, row } : null;
        }
        if (table === "lands") {
          const row = await safeSelect(
            "lands",
            "id, land_code, plot_number, status, location_description, gps_lat, gps_lng, size_value, size_unit, area_sqm, boundary_type, current_owner_id",
          );
          return row ? { table, row } : null;
        }
        if (table === "landowners") {
          const row = await safeSelect(
            "landowners",
            "id, full_name, phone, email, address, national_id, notes",
          );
          return row ? { table, row } : null;
        }
        if (table === "sms_logs") {
          const row = await safeSelect(
            "sms_logs",
            "id, phone, status, provider, message, provider_response, bill_id, landowner_id, sent_by, created_at",
          );
          return row ? { table, row } : null;
        }
        if (table === "walkin_logs") {
          const row = await safeSelect(
            "walkin_logs",
            "id, kind, visitor_name, phone, subject, detail, created_by, created_at",
          );
          return row ? { table, row } : null;
        }
        if (table === "user_roles") {
          const row = await safeSelect("user_roles", "id, user_id, role, created_at");
          return row ? { table, row } : null;
        }

        return null;
      })();

      return { log: logRow, actor, related };
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
      const res = await clearData();
      if (!res || res.ok !== true || !res.counts) {
        throw new Error(
          "Reset failed: server response was invalid. This feature requires the app to run as a Node.js server (TanStack Start SSR), not as a static Vite site.",
        );
      }
      toast.success("Data cleared", {
        description: `Deleted ${res.counts.landowners} landowners, ${res.counts.lands} lands, ${res.counts.bills} bills and ${res.counts.payments} payments.`,
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

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await seedData();
      if (!res || res.ok !== true || !res.counts) {
        throw new Error(
          "Seed failed: server response was invalid. This feature requires the app to run as a Node.js server (TanStack Start SSR), not as a static Vite site.",
        );
      }
      toast.success("Seed data loaded", {
        description: `Created ${res.counts.landowners} landowners, ${res.counts.lands} lands and ${res.counts.bills} bills.`,
      });
      await qc.invalidateQueries();
    } catch (e) {
      toast.error("Seed failed", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setSeeding(false);
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
                <CardTitle>Admins, managers or developers only</CardTitle>
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
                        <tr
                          key={r.id}
                          role="button"
                          tabIndex={0}
                          className="cursor-pointer border-t border-border transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                          onClick={() => {
                            setSelectedLog(r);
                            setLogOpen(true);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" && e.key !== " ") return;
                            e.preventDefault();
                            setSelectedLog(r);
                            setLogOpen(true);
                          }}
                        >
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

                <Dialog
                  open={logOpen}
                  onOpenChange={(open) => {
                    setLogOpen(open);
                    if (!open) setSelectedLog(null);
                  }}
                >
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Activity log details</DialogTitle>
                      <DialogDescription>
                        {logDetail.data?.log
                          ? formatDate(logDetail.data.log.created_at)
                          : selectedLog
                            ? formatDate(selectedLog.created_at)
                            : ""}
                      </DialogDescription>
                    </DialogHeader>
                    {logDetail.isFetching ? (
                      <div className="text-sm text-muted-foreground">Loading details…</div>
                    ) : logDetail.isError ? (
                      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                        Failed to load log details.
                      </div>
                    ) : selectedLog ? (
                      <div className="grid gap-4 text-sm">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="rounded-md border border-border bg-muted/30 p-3">
                            <div className="text-xs text-muted-foreground">Actor</div>
                            <div className="mt-1 font-medium">
                              {logDetail.data?.actor?.full_name?.trim()
                                ? logDetail.data.actor.full_name.trim()
                                : logDetail.data?.actor?.email?.trim()
                                  ? logDetail.data.actor.email.trim()
                                  : logDetail.data?.actor?.phone?.trim()
                                    ? logDetail.data.actor.phone.trim()
                                    : selectedLog.actorLabel}
                            </div>
                            {logDetail.data?.actor?.email?.trim() ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {logDetail.data.actor.email.trim()}
                              </div>
                            ) : null}
                            {logDetail.data?.actor?.phone?.trim() ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {logDetail.data.actor.phone.trim()}
                              </div>
                            ) : null}
                            {(logDetail.data?.log.actor_id ?? selectedLog.actor_id) ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {logDetail.data?.log.actor_id ?? selectedLog.actor_id}
                              </div>
                            ) : null}
                          </div>
                          <div className="rounded-md border border-border bg-muted/30 p-3">
                            <div className="text-xs text-muted-foreground">Action</div>
                            <div className="mt-1">
                              <Badge variant="secondary" className="capitalize">
                                {logDetail.data?.log.action ?? selectedLog.action}
                              </Badge>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">Entity</div>
                            <div className="mt-1 font-medium capitalize">
                              {logDetail.data?.log.entity ?? selectedLog.entity}
                            </div>
                            {(logDetail.data?.log.entity_id ?? selectedLog.entity_id) ? (
                              <div className="mt-1 text-xs text-muted-foreground">
                                {logDetail.data?.log.entity_id ?? selectedLog.entity_id}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {(() => {
                          const meta = (logDetail.data?.log.metadata ??
                            selectedLog.metadata) as Record<string, unknown>;
                          const amount = meta.amount;
                          const status = meta.status;
                          const landCode = meta.land_code;
                          const receipt = meta.receipt_number;
                          const role = meta.role;
                          const hasHighlights =
                            amount != null ||
                            status != null ||
                            landCode != null ||
                            receipt != null ||
                            role != null;
                          if (!hasHighlights) return null;
                          return (
                            <div className="rounded-md border border-border bg-muted/20 p-3">
                              <div className="text-xs text-muted-foreground">Highlights</div>
                              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                {landCode != null ? (
                                  <div>
                                    <div className="text-xs text-muted-foreground">Land code</div>
                                    <div className="mt-0.5 font-medium">{String(landCode)}</div>
                                  </div>
                                ) : null}
                                {amount != null ? (
                                  <div>
                                    <div className="text-xs text-muted-foreground">Amount</div>
                                    <div className="mt-0.5 font-medium">{String(amount)}</div>
                                  </div>
                                ) : null}
                                {status != null ? (
                                  <div>
                                    <div className="text-xs text-muted-foreground">Status</div>
                                    <div className="mt-0.5 font-medium">{String(status)}</div>
                                  </div>
                                ) : null}
                                {receipt != null ? (
                                  <div>
                                    <div className="text-xs text-muted-foreground">
                                      Receipt number
                                    </div>
                                    <div className="mt-0.5 font-medium">{String(receipt)}</div>
                                  </div>
                                ) : null}
                                {role != null ? (
                                  <div>
                                    <div className="text-xs text-muted-foreground">Role</div>
                                    <div className="mt-0.5 font-medium">{String(role)}</div>
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })()}

                        <div className="rounded-md border border-border p-3">
                          <div className="text-xs text-muted-foreground">Message</div>
                          <div className="mt-1 whitespace-pre-wrap text-foreground/90">
                            {logDetail.data?.log.message ?? selectedLog.message}
                          </div>
                        </div>

                        {logDetail.data?.related ? (
                          <div className="rounded-md border border-border p-3">
                            <div className="text-xs text-muted-foreground">
                              Related record ({logDetail.data.related.table})
                            </div>
                            <pre className="mt-2 max-h-[45vh] overflow-auto rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
                              {JSON.stringify(logDetail.data.related.row, null, 2)}
                            </pre>
                          </div>
                        ) : null}

                        <div className="rounded-md border border-border p-3">
                          <div className="text-xs text-muted-foreground">Metadata</div>
                          {selectedLog.metadata ? (
                            <pre className="mt-2 max-h-[45vh] overflow-auto rounded-md bg-muted/40 p-3 text-xs leading-relaxed">
                              {JSON.stringify(
                                (logDetail.data?.log.metadata ?? selectedLog.metadata) as Record<
                                  string,
                                  unknown
                                >,
                                null,
                                2,
                              )}
                            </pre>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </DialogContent>
                </Dialog>

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
            <CardDescription>Clear all system data. User accounts are kept.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Deletes landowners, lands, rent packages, bills, payments, ownership history, parcel
              coordinates, payroll runs, payslips, walk-in logs, SMS logs and activity logs.
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
                        payments, ownership history, parcel coordinates, payroll data, walk-in logs,
                        SMS logs and activity logs. User accounts, land types, payroll components,
                        settings and user roles are kept. Use only in non-production environments.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleReset}>
                        Yes, clear all data
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Developer seed</CardTitle>
            <CardDescription>
              Load demo data for testing. For developer accounts only.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              Wipes transactional data and loads sample landowners, lands, bills, payments, zones
              and a few demo parcel boundaries.
            </div>
            <div className="flex items-center gap-2">
              {!isDeveloper ? (
                <div className="text-xs text-muted-foreground">Developer only</div>
              ) : seeding ? (
                <Button variant="outline" size="sm" disabled>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Seeding…
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm">
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Load seed data
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Load seed data?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This wipes current data (except users, land types, settings and roles) and
                        loads demo records for testing. Use only in non-production environments.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleSeed}>
                        Yes, load seed data
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
