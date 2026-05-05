import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TableSkeleton } from "@/components/skeletons";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export const Route = createFileRoute("/_authenticated/bills/")({
  component: BillsPage,
});

function BillsPage() {
  const qc = useQueryClient();
  const { hasAnyRole } = useAuth();
  const canBill = hasAnyRole(["admin", "finance"]);
  const canRemind = hasAnyRole(["admin", "finance"]);
  const canDelete = hasAnyRole(["admin"]);
  const sendReminders = useServerFn(sendOverdueReminders);
  const [status, setStatus] = useState<"all" | "pending" | "partial" | "paid" | "overdue">("all");

  const bills = useQuery({
    queryKey: ["bills", status],
    queryFn: async () => {
      let q = supabase
        .from("bills")
        .select("id, billing_year, amount, due_date, status, lands(land_code, plot_number)")
        .order("issued_at", { ascending: false });
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const lands = useQuery({
    queryKey: ["lands-mini"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lands")
        .select("id, land_code, annual_rent_amount")
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
      toast.success(
        `Reminders: ${r.sent} sent, ${r.failed} failed, ${r.skipped} skipped`,
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
    onError: (e: Error) => toast.error(e.message),
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
            {remind.isPending ? "Sending…" : "SMS overdue"}
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
                  Issues a bill at each active land's annual rent. Lands that already
                  have a bill for this year are skipped.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Billing year</Label>
                    <Input
                      type="number"
                      value={bulk.billing_year}
                      onChange={(e) =>
                        setBulk({ ...bulk, billing_year: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Due date</Label>
                    <Input
                      type="date"
                      value={bulk.due_date}
                      onChange={(e) =>
                        setBulk({ ...bulk, due_date: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBulkOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => bulkGenerate.mutate()}
                  disabled={bulkGenerate.isPending}
                >
                  {bulkGenerate.isPending ? "Generating…" : "Generate"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="mr-1 h-4 w-4" /> Generate bill</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Generate bill</DialogTitle></DialogHeader>
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
                    label: l.land_code,
                  }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Billing year</Label>
                  <Input type="number" value={form.billing_year} onChange={(e) => setForm({ ...form, billing_year: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>Amount (GHS)</Label>
                  <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Due date</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
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
          <CardTitle className="text-base">All bills</CardTitle>
          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <SelectTrigger className="mt-2 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {bills.isLoading ? (
            <TableSkeleton columns={6} rows={6} />
          ) : (bills.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No bills.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="pb-2">Land</th>
                  <th className="pb-2">Year</th>
                  <th className="pb-2">Due</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2 text-right">Amount</th>
                  {canDelete && <th className="pb-2"></th>}
                </tr>
              </thead>
              <tbody>
                {(bills.data ?? []).map((b) => {
                  const land = b.lands as unknown as { land_code: string; plot_number: string | null } | null;
                  return (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <Link to="/bills/$billId" params={{ billId: b.id }} className="text-primary hover:underline">
                          {land?.land_code ?? "—"}
                        </Link>
                      </td>
                      <td className="py-2">{b.billing_year}</td>
                      <td className="py-2">{formatDate(b.due_date)}</td>
                      <td className="py-2"><BillStatusBadge status={b.status} /></td>
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
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}