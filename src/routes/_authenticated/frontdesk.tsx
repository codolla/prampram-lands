import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { TableSkeleton } from "@/components/skeletons";

export const Route = createFileRoute("/_authenticated/frontdesk")({
  component: FrontDeskPage,
});

type WalkinKind = "enquiry" | "complaint" | "other" | "payment";
type PaymentAs = "cash" | "momo" | "bank" | "other";

const PAGE_SIZE = 25;

type WalkinLogRow = {
  id: string;
  kind: WalkinKind;
  visitor_name: string | null;
  phone: string | null;
  subject: string | null;
  detail: string;
  payment_as: PaymentAs | null;
  created_at: string;
  created_by: string | null;
};

type WalkinLogsQuery = {
  select: (columns: string, options?: { count?: "exact" }) => WalkinLogsQuery;
  order: (column: string, options: { ascending: boolean }) => WalkinLogsQuery;
  eq: (column: string, value: string) => WalkinLogsQuery;
  gte: (column: string, value: string) => WalkinLogsQuery;
  lt: (column: string, value: string) => WalkinLogsQuery;
  range: (
    from: number,
    to: number,
  ) => Promise<{
    data: WalkinLogRow[] | null;
    error: { message: string } | null;
    count: number | null;
  }>;
};

type WalkinLogsTable = {
  select: (columns: string, options?: { count?: "exact" }) => WalkinLogsQuery;
  insert: (row: {
    kind: WalkinKind;
    visitor_name: string | null;
    phone: string | null;
    subject: string | null;
    detail: string;
    payment_as: PaymentAs | null;
    created_by: string;
  }) => Promise<{ error: { message: string } | null }>;
  update: (
    row: Partial<Omit<WalkinLogRow, "id" | "created_at" | "created_by">>,
  ) => WalkinLogsUpdateQuery;
};

type SupabaseWalkin = {
  from: (table: "walkin_logs") => WalkinLogsTable;
};

type WalkinLogsUpdateQuery = {
  eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
};

function formatTimeBeforeDate(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  const t = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${t} · ${formatDate(d)}`;
}

type DateFilter = "today" | "week" | "month" | "year" | "custom";

function yyyyMmDdUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function createdAtRange(filter: DateFilter, customDate: string): { from: string; to: string } {
  const now = new Date();
  if (filter === "today") {
    const day = yyyyMmDdUtc(now);
    const start = new Date(`${day}T00:00:00.000Z`);
    return {
      from: start.toISOString(),
      to: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  if (filter === "custom") {
    const day = (customDate || yyyyMmDdUtc(now)).slice(0, 10);
    const start = new Date(`${day}T00:00:00.000Z`);
    return {
      from: start.toISOString(),
      to: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    };
  }
  if (filter === "week") {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = d.getUTCDay();
    const deltaToMonday = (day + 6) % 7;
    const start = new Date(d.getTime() - deltaToMonday * 24 * 60 * 60 * 1000);
    return { from: start.toISOString(), to: now.toISOString() };
  }
  if (filter === "month") {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
    return { from: start.toISOString(), to: now.toISOString() };
  }
  const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0));
  return { from: start.toISOString(), to: now.toISOString() };
}

function FrontDeskPage() {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canUse = hasAnyRole(["admin", "developer", "manager", "frontdesk"]);

  const [kind, setKind] = useState<WalkinKind>("enquiry");
  const [filter, setFilter] = useState<"all" | WalkinKind>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [customDate, setCustomDate] = useState(() => yyyyMmDdUtc(new Date()));
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    visitor_name: "",
    phone: "",
    subject: "",
    detail: "",
    payment_as: "cash" as PaymentAs,
  });

  const logs = useQuery({
    queryKey: ["walkin-logs", filter, dateFilter, customDate, page],
    enabled: canUse,
    queryFn: async () => {
      const client = supabase as unknown as SupabaseWalkin;
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = client
        .from("walkin_logs")
        .select(
          "id, kind, visitor_name, phone, subject, detail, payment_as, created_at, created_by",
          {
            count: "exact",
          },
        );
      if (filter !== "all") q = q.eq("kind", filter);
      const r = createdAtRange(dateFilter, customDate);
      q = q.gte("created_at", r.from).lt("created_at", r.to);
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as WalkinLogRow[], count: count ?? 0 };
    },
  });

  useEffect(() => {
    setPage(1);
  }, [filter, dateFilter, customDate]);

  const create = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Not signed in");
      if (!form.detail.trim()) throw new Error("Notes are required");
      const client = supabase as unknown as SupabaseWalkin;
      const { error } = await client.from("walkin_logs").insert({
        kind,
        visitor_name: form.visitor_name.trim() || null,
        phone: form.phone.trim() || null,
        subject: form.subject.trim() || null,
        detail: form.detail.trim(),
        payment_as: kind === "payment" ? (form.payment_as ?? "cash") : null,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Saved to logbook");
      setForm({ visitor_name: "", phone: "", subject: "", detail: "", payment_as: "cash" });
      setKind("enquiry");
      await qc.invalidateQueries({ queryKey: ["walkin-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editKind, setEditKind] = useState<WalkinKind>("enquiry");
  const [editForm, setEditForm] = useState({
    visitor_name: "",
    phone: "",
    subject: "",
    detail: "",
    payment_as: "cash" as PaymentAs,
  });

  const openEdit = (r: WalkinLogRow) => {
    setEditId(r.id);
    setEditKind(r.kind);
    setEditForm({
      visitor_name: r.visitor_name ?? "",
      phone: r.phone ?? "",
      subject: r.subject ?? "",
      detail: r.detail ?? "",
      payment_as: r.payment_as ?? "cash",
    });
    setEditOpen(true);
  };

  const update = useMutation({
    mutationFn: async () => {
      if (!editId) throw new Error("No entry selected");
      if (!editForm.detail.trim()) throw new Error("Notes are required");
      const client = supabase as unknown as SupabaseWalkin;
      const { error } = await client
        .from("walkin_logs")
        .update({
          kind: editKind,
          visitor_name: editForm.visitor_name.trim() || null,
          phone: editForm.phone.trim() || null,
          subject: editForm.subject.trim() || null,
          detail: editForm.detail.trim(),
          payment_as: editKind === "payment" ? (editForm.payment_as ?? "cash") : null,
        })
        .eq("id", editId);
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Entry updated");
      setEditOpen(false);
      await qc.invalidateQueries({ queryKey: ["walkin-logs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = (logs.data as unknown as { count?: number } | null)?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageRows = (logs.data as unknown as { rows?: WalkinLogRow[] } | null)?.rows ?? [];

  if (!canUse) {
    return (
      <AppShell title="Front Desk">
        <Card>
          <CardContent className="py-8 text-sm text-muted-foreground">
            Access restricted.
          </CardContent>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell title="Front Desk">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Walk-in logbook</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid gap-1">
              <Label>Type</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as WalkinKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enquiry">Enquiry</SelectItem>
                  <SelectItem value="complaint">Complaint</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {kind === "payment" && (
              <div className="grid gap-1">
                <Label>Payment as</Label>
                <Select
                  value={form.payment_as}
                  onValueChange={(v) => setForm({ ...form, payment_as: v as PaymentAs })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="momo">Mobile Money</SelectItem>
                    <SelectItem value="bank">Bank</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1">
              <Label>Client name</Label>
              <Input
                value={form.visitor_name}
                onChange={(e) => setForm({ ...form, visitor_name: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label>Subject</Label>
              <Input
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
              />
            </div>
            <div className="grid gap-1">
              <Label>Notes *</Label>
              <Textarea
                rows={5}
                value={form.detail}
                onChange={(e) => setForm({ ...form, detail: e.target.value })}
              />
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save"}
            </Button>
            <div className="grid gap-2 pt-2 text-sm">
              <div className="font-medium">Quick actions</div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to="/lands">Register land</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/bills">Find bill / take payment</Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Recent entries</CardTitle>
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                {total} entries
              </div>
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                  <SelectItem value="custom">Custom date</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="enquiry">Enquiry</SelectItem>
                  <SelectItem value="complaint">Complaint</SelectItem>
                  <SelectItem value="payment">Payment</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {dateFilter === "custom" && (
              <div className="mb-3 flex items-end gap-2">
                <div className="grid gap-1">
                  <Label>Custom date</Label>
                  <Input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                  />
                </div>
              </div>
            )}
            {logs.isLoading ? (
              <TableSkeleton columns={5} rows={8} />
            ) : pageRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No entries yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="pb-2">Type</th>
                      <th className="pb-2">Client</th>
                      <th className="pb-2">Subject</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 capitalize">
                          {r.kind}
                          {r.kind === "payment" && r.payment_as ? ` · ${r.payment_as}` : ""}
                        </td>
                        <td className="py-2">
                          <div className="font-medium">{r.visitor_name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{r.phone ?? "—"}</div>
                        </td>
                        <td className="py-2">
                          <div className="font-medium">{r.subject ?? "—"}</div>
                          <div className="line-clamp-2 text-xs text-muted-foreground">
                            {r.detail}
                          </div>
                        </td>
                        <td className="py-2 text-muted-foreground">
                          {formatTimeBeforeDate(r.created_at)}
                        </td>
                        <td className="py-2 text-right">
                          <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      Page {page} of {totalPages} · {total} records
                    </div>
                    <div className="flex items-center gap-2">
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
                )}
              </div>
            )}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Edit entry</DialogTitle>
                </DialogHeader>
                <div className="grid gap-3">
                  <div className="grid gap-1">
                    <Label>Type</Label>
                    <Select value={editKind} onValueChange={(v) => setEditKind(v as WalkinKind)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="enquiry">Enquiry</SelectItem>
                        <SelectItem value="complaint">Complaint</SelectItem>
                        <SelectItem value="payment">Payment</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editKind === "payment" && (
                    <div className="grid gap-1">
                      <Label>Payment as</Label>
                      <Select
                        value={editForm.payment_as}
                        onValueChange={(v) =>
                          setEditForm({ ...editForm, payment_as: v as PaymentAs })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="momo">Mobile Money</SelectItem>
                          <SelectItem value="bank">Bank</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="grid gap-1">
                    <Label>Client name</Label>
                    <Input
                      value={editForm.visitor_name}
                      onChange={(e) => setEditForm({ ...editForm, visitor_name: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>Phone</Label>
                    <Input
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>Subject</Label>
                    <Input
                      value={editForm.subject}
                      onChange={(e) => setEditForm({ ...editForm, subject: e.target.value })}
                    />
                  </div>
                  <div className="grid gap-1">
                    <Label>Notes *</Label>
                    <Textarea
                      rows={5}
                      value={editForm.detail}
                      onChange={(e) => setEditForm({ ...editForm, detail: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setEditOpen(false)}
                    disabled={update.isPending}
                  >
                    Cancel
                  </Button>
                  <Button onClick={() => update.mutate()} disabled={update.isPending}>
                    {update.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
