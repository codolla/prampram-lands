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
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { TableSkeleton } from "@/components/skeletons";

export const Route = createFileRoute("/_authenticated/frontdesk")({
  component: FrontDeskPage,
});

type WalkinKind = "enquiry" | "complaint" | "other";

const PAGE_SIZE = 25;

type WalkinLogRow = {
  id: string;
  kind: WalkinKind;
  visitor_name: string | null;
  phone: string | null;
  subject: string | null;
  detail: string;
  created_at: string;
  created_by: string | null;
};

type WalkinLogsQuery = {
  select: (columns: string, options?: { count?: "exact" }) => WalkinLogsQuery;
  order: (column: string, options: { ascending: boolean }) => WalkinLogsQuery;
  eq: (column: string, value: string) => WalkinLogsQuery;
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
    created_by: string;
  }) => Promise<{ error: { message: string } | null }>;
};

type SupabaseWalkin = {
  from: (table: "walkin_logs") => WalkinLogsTable;
};

function FrontDeskPage() {
  const qc = useQueryClient();
  const { user, hasAnyRole } = useAuth();
  const canUse = hasAnyRole(["admin", "developer", "manager", "frontdesk"]);

  const [kind, setKind] = useState<WalkinKind>("enquiry");
  const [filter, setFilter] = useState<"all" | WalkinKind>("all");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    visitor_name: "",
    phone: "",
    subject: "",
    detail: "",
  });

  const logs = useQuery({
    queryKey: ["walkin-logs", filter, page],
    enabled: canUse,
    queryFn: async () => {
      const client = supabase as unknown as SupabaseWalkin;
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = client
        .from("walkin_logs")
        .select("id, kind, visitor_name, phone, subject, detail, created_at, created_by", {
          count: "exact",
        });
      if (filter !== "all") q = q.eq("kind", filter);
      const { data, error, count } = await q
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as WalkinLogRow[], count: count ?? 0 };
    },
  });

  useEffect(() => {
    setPage(1);
  }, [filter]);

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
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      toast.success("Saved to logbook");
      setForm({ visitor_name: "", phone: "", subject: "", detail: "" });
      setKind("enquiry");
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
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
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
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="enquiry">Enquiry</SelectItem>
                <SelectItem value="complaint">Complaint</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent>
            {logs.isLoading ? (
              <TableSkeleton columns={4} rows={8} />
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
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0">
                        <td className="py-2 capitalize">{r.kind}</td>
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
                        <td className="py-2 text-muted-foreground">{formatDate(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {totalPages > 1 && (
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
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
