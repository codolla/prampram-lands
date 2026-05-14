import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableSkeleton } from "@/components/skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Plus, Layers, BellRing } from "lucide-react";
import { toast } from "sonner";
import { BillStatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { useServerFn } from "@tanstack/react-start";
import { sendOverdueReminders } from "@/lib/sms.functions";
import { ConfirmDelete, DeleteImpactWarning } from "@/components/ConfirmDelete";
import { getUserFacingErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/bills/")({
  component: BillsPage,
});

const PAGE_SIZE = 25;

function BillsPage() {
  const qc = useQueryClient();
  const { hasAnyRole } = useAuth();
  const canBill = hasAnyRole(["admin", "developer", "manager", "finance"]);
  const canRemind = hasAnyRole(["admin", "developer"]);
  const canDelete = hasAnyRole(["admin", "developer"]);
  const sendReminders = useServerFn(sendOverdueReminders);
  const [status, setStatus] = useState<"all" | "pending" | "partial" | "paid" | "overdue">("all");
  const [family, setFamily] = useState<string>("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [status, family]);

  const families = useQuery<string[]>({
    queryKey: ["land-families"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lands")
        .select("family")
        .not("family", "is", null);
      if (error) throw error;
      const out = Array.from(
        new Set((data ?? []).map((r) => String((r as { family?: string | null }).family ?? ""))),
      )
        .map((s) => s.trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
      return out;
    },
  });

  const familyStats = useQuery({
    queryKey: ["bills-family-stats", family, status],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "bills_family_stats" as never,
        { family_text: family === "all" ? "" : family, status_filter: status } as never,
      );
      if (error) throw error;
      const row = (data as unknown as Array<Record<string, unknown>> | null)?.[0] ?? {};
      return {
        billsCount: Number(row.bills_count ?? 0),
        totalBilled: Number(row.total_billed ?? 0),
        totalPaid: Number(row.total_paid ?? 0),
        totalOutstanding: Number(row.total_outstanding ?? 0),
        pendingCount: Number(row.pending_count ?? 0),
        partialCount: Number(row.partial_count ?? 0),
        paidCount: Number(row.paid_count ?? 0),
        overdueCount: Number(row.overdue_count ?? 0),
      };
    },
  });

  const bills = useQuery({
    queryKey: ["bills", status, family, page],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("bills")
        .select(
          "id, billing_year, amount, due_date, status, lands!inner(land_code, plot_number, family, landowners(full_name))",
          {
            count: "exact",
          },
        )
        .order("issued_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      if (family !== "all") {
        if (family === "__other__") {
          q = q.or("family.is.null,family.eq.", { foreignTable: "lands" } as never);
        } else {
          q = q.eq("lands.family", family);
        }
      }
      const { data, count, error } = await q.range(from, to);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const lands = useQuery({
    queryKey: ["lands-mini"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lands")
        .select("id, land_code, annual_rent_amount, landowners(full_name)")
        .order("land_code");
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    land_id: "",
    billing_year: new Date().getFullYear().toString(),
    amount: "",
    due_date: `${new Date().getFullYear()}-12-31`,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.land_id) throw new Error("Choose a land");
      if (!form.amount) throw new Error("Amount required");
      const { error } = await supabase.from("bills").insert({
        land_id: form.land_id,
        billing_year: Number(form.billing_year),
        amount: Number(form.amount),
        due_date: form.due_date,
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bill generated");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Bulk bill generator
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulk, setBulk] = useState({
    billing_year: new Date().getFullYear().toString(),
    due_date: `${new Date().getFullYear()}-12-31`,
  });

  const bulkGenerate = useMutation({
    mutationFn: async () => {
      const year = Number(bulk.billing_year);
      if (!year) throw new Error("Year required");
      // 1) Active lands with rent > 0
      const { data: activeLands, error: lErr } = await supabase
        .from("lands")
        .select("id, annual_rent_amount")
        .eq("status", "active")
        .gt("annual_rent_amount", 0);
      if (lErr) throw lErr;
      const candidates = activeLands ?? [];
      if (candidates.length === 0) throw new Error("No active lands with annual rent set");

      // 2) Find lands that already have a bill for the year (skip them)
      const { data: existing, error: eErr } = await supabase
        .from("bills")
        .select("land_id")
        .eq("billing_year", year);
      if (eErr) throw eErr;
      const seen = new Set((existing ?? []).map((b) => b.land_id));

      const rows = candidates
        .filter((l) => !seen.has(l.id))
        .map((l) => ({
          land_id: l.id,
          billing_year: year,
          amount: Number(l.annual_rent_amount),
          due_date: bulk.due_date,
          status: "pending" as const,
        }));
      if (rows.length === 0) {
        return { created: 0, skipped: candidates.length };
      }
      const { error } = await supabase.from("bills").insert(rows);
      if (error) throw error;
      return { created: rows.length, skipped: candidates.length - rows.length };
    },
    onSuccess: (res) => {
      toast.success(`Generated ${res.created} bill(s) · skipped ${res.skipped}`);
      setBulkOpen(false);
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["report-bills"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remind = useMutation({
    mutationFn: async () => {
      const r = await sendReminders({ data: {} });
      if (!r.ok) throw new Error(r.error ?? "Failed to send reminders");
      return r;
    },
    onSuccess: (r) => {
      const emailSent = Number((r as { emailSent?: unknown }).emailSent ?? 0);
      const emailFailed = Number((r as { emailFailed?: unknown }).emailFailed ?? 0);
      toast.success(
        `Reminders: ${r.sent} SMS sent, ${r.failed} SMS failed, ${emailSent} email sent, ${emailFailed} email failed, ${r.skipped} skipped`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("bills").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Bill deleted");
      qc.invalidateQueries({ queryKey: ["bills"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: unknown) => toast.error(getUserFacingErrorMessage(e)),
  });

  return (
    <AppShell
      title="Bills"
      actions={
        <div className="flex items-center gap-2">
          {canRemind && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => remind.mutate()}
              disabled={remind.isPending}
            >
              <BellRing className="mr-1 h-4 w-4" />
              {remind.isPending ? "Sending…" : "Remind overdue"}
            </Button>
          )}
          {canBill && (
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <Layers className="mr-1 h-4 w-4" /> Bulk generate
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Bulk-generate annual bills</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <p className="text-sm text-muted-foreground">
                    Issues a bill at each active land's annual rent. Lands that already have a bill
                    for this year are skipped.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Billing year</Label>
                      <Input
                        type="number"
                        value={bulk.billing_year}
                        onChange={(e) => setBulk({ ...bulk, billing_year: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Due date</Label>
                      <Input
                        type="date"
                        value={bulk.due_date}
                        onChange={(e) => setBulk({ ...bulk, due_date: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBulkOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => bulkGenerate.mutate()} disabled={bulkGenerate.isPending}>
                    {bulkGenerate.isPending ? "Generating…" : "Generate"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> Generate bill
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Generate bill</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Land</Label>
                  <SearchableSelect
                    value={form.land_id}
                    onValueChange={(v) => {
                      const land = (lands.data ?? []).find((l) => l.id === v);
                      setForm({
                        ...form,
                        land_id: v,
                        amount: land?.annual_rent_amount?.toString() ?? form.amount,
                      });
                    }}
                    placeholder="Select land…"
                    searchPlaceholder="Search lands…"
                    options={(lands.data ?? []).map((l) => ({
                      value: l.id,
                      label: `${l.land_code} — ${(l.landowners as unknown as { full_name: string | null } | null)?.full_name ?? "No owner"}`,
                    }))}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Billing year</Label>
                    <Input
                      type="number"
                      value={form.billing_year}
                      onChange={(e) => setForm({ ...form, billing_year: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Amount (GHS)</Label>
                    <Input
                      type="number"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Due date</Label>
                  <Input
                    type="date"
                    value={form.due_date}
                    onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Saving…" : "Generate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bills</CardTitle>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            <Select value={family} onValueChange={(v) => setFamily(v)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue placeholder="All families" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All families</SelectItem>
                <SelectItem value="__other__">Others</SelectItem>
                {(families.data ?? []).map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Billed</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {familyStats.isLoading ? "—" : formatCurrency(familyStats.data?.totalBilled ?? 0)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Paid</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {familyStats.isLoading ? "—" : formatCurrency(familyStats.data?.totalPaid ?? 0)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Outstanding</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {familyStats.isLoading
                  ? "—"
                  : formatCurrency(familyStats.data?.totalOutstanding ?? 0)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Bills</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {familyStats.isLoading ? "—" : (familyStats.data?.billsCount ?? 0)}
              </p>
            </div>
          </div>

          {bills.isLoading ? (
            <TableSkeleton columns={7} rows={6} />
          ) : (bills.data?.rows ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills.</p>
          ) : (
            <>
              <div className="grid gap-2 md:hidden">
                {(bills.data?.rows ?? []).map((b) => {
                  const land = b.lands as unknown as {
                    land_code: string;
                    plot_number: string | null;
                    landowners: { full_name: string | null } | null;
                  } | null;
                  return (
                    <div key={b.id} className="rounded-md border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to="/bills/$billId"
                            params={{ billId: b.id }}
                            className="block truncate font-medium text-primary hover:underline"
                          >
                            {land?.land_code ?? "—"}
                          </Link>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Year {b.billing_year} · Due {formatDate(b.due_date)}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Owner {land?.landowners?.full_name ?? "—"}
                          </div>
                          <div className="mt-2">
                            <BillStatusBadge status={b.status} />
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold">{formatCurrency(b.amount)}</div>
                        </div>
                      </div>
                      {canDelete ? (
                        <div className="mt-2 flex justify-end">
                          <ConfirmDelete
                            onConfirm={() => remove.mutateAsync(b.id)}
                            pending={remove.isPending}
                            title={`Delete bill for ${land?.land_code ?? "land"} (${b.billing_year})?`}
                            description={
                              <>
                                This permanently removes the bill and cannot be undone.
                                <DeleteImpactWarning kind="bill" />
                              </>
                            }
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="pb-2">Land</th>
                      <th className="pb-2">Owner</th>
                      <th className="pb-2">Year</th>
                      <th className="pb-2">Due</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2 text-right">Amount</th>
                      {canDelete && <th className="pb-2"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(bills.data?.rows ?? []).map((b) => {
                      const land = b.lands as unknown as {
                        land_code: string;
                        plot_number: string | null;
                        landowners: { full_name: string | null } | null;
                      } | null;
                      return (
                        <tr key={b.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">
                            <Link
                              to="/bills/$billId"
                              params={{ billId: b.id }}
                              className="text-primary hover:underline"
                            >
                              {land?.land_code ?? "—"}
                            </Link>
                          </td>
                          <td className="py-2">{land?.landowners?.full_name ?? "—"}</td>
                          <td className="py-2">{b.billing_year}</td>
                          <td className="py-2">{formatDate(b.due_date)}</td>
                          <td className="py-2">
                            <BillStatusBadge status={b.status} />
                          </td>
                          <td className="py-2 text-right">{formatCurrency(b.amount)}</td>
                          {canDelete && (
                            <td className="py-2 text-right">
                              <ConfirmDelete
                                onConfirm={() => remove.mutateAsync(b.id)}
                                pending={remove.isPending}
                                title={`Delete bill for ${land?.land_code ?? "land"} (${b.billing_year})?`}
                                description={
                                  <>
                                    This permanently removes the bill and cannot be undone.
                                    <DeleteImpactWarning kind="bill" />
                                  </>
                                }
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {(() => {
            const total = bills.data?.count ?? 0;
            const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
            if (totalPages <= 1) return null;
            return (
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
            );
          })()}
        </CardContent>
      </Card>
    </AppShell>
  );
}
