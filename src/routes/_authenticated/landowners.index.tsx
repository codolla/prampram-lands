import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableSkeleton } from "@/components/skeletons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Search, User } from "lucide-react";
import { toast } from "sonner";
import { formatDate } from "@/lib/format";
import { AvatarUpload } from "@/components/AvatarUpload";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConfirmDelete, DeleteImpactWarning } from "@/components/ConfirmDelete";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/landowners/")({
  component: LandownersPage,
});

const PAGE_SIZE = 25;

function LandownersPage() {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const { hasAnyRole } = useAuth();
  const canDelete = hasAnyRole(["admin"]);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ["landowners", search, page],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("landowners")
        .select("id, full_name, phone, email, address, national_id, avatar_url, created_at", {
          count: "exact",
        })
        .order("full_name");
      if (search) q = q.ilike("full_name", `%${search}%`);
      const { data, count, error } = await q.range(from, to);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    address: "",
    national_id: "",
    notes: "",
    avatar_url: "" as string | null | "",
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!form.full_name.trim()) throw new Error("Full name is required");
      const payload = {
        full_name: form.full_name.trim(),
        phone: form.phone || null,
        email: form.email || null,
        address: form.address || null,
        national_id: form.national_id || null,
        notes: form.notes || null,
        avatar_url: form.avatar_url || null,
      };
      const { error } = await supabase.from("landowners").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Landowner created");
      setOpen(false);
      setForm({
        full_name: "",
        phone: "",
        email: "",
        address: "",
        national_id: "",
        notes: "",
        avatar_url: "",
      });
      qc.invalidateQueries({ queryKey: ["landowners"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("landowners").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Landowner deleted");
      qc.invalidateQueries({ queryKey: ["landowners"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title="Landowners"
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-1 h-4 w-4" /> New landowner
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New landowner</DialogTitle>
              <DialogDescription>
                Add a person or entity that owns one or more parcels.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <AvatarUpload
                value={form.avatar_url || null}
                onChange={(url) => setForm({ ...form, avatar_url: url ?? "" })}
                folder="landowners"
                fallback={form.full_name || "L"}
              />
              <Field
                label="Full name *"
                value={form.full_name}
                onChange={(v) => setForm({ ...form, full_name: v })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label="Phone"
                  value={form.phone}
                  onChange={(v) => setForm({ ...form, phone: v })}
                />
                <Field
                  label="Email"
                  type="email"
                  value={form.email}
                  onChange={(v) => setForm({ ...form, email: v })}
                />
              </div>
              <Field
                label="Address"
                value={form.address}
                onChange={(v) => setForm({ ...form, address: v })}
              />
              <Field
                label="National ID"
                value={form.national_id}
                onChange={(v) => setForm({ ...form, national_id: v })}
              />
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All landowners</CardTitle>
          <div className="relative mt-2 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton columns={5} rows={6} />
          ) : (data?.rows ?? []).length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Phone</th>
                    <th className="pb-2">Email</th>
                    <th className="pb-2">National ID</th>
                    <th className="pb-2">Added</th>
                    {canDelete && <th className="pb-2"></th>}
                  </tr>
                </thead>
                <tbody>
                  {(data?.rows ?? []).map((o) => (
                    <tr key={o.id} className="border-b last:border-0">
                      <td className="py-2 font-medium">
                        <Link
                          to="/landowners/$ownerId"
                          params={{ ownerId: o.id }}
                          className="flex items-center gap-2 text-primary hover:underline"
                        >
                          <Avatar className="h-7 w-7">
                            {o.avatar_url ? (
                              <AvatarImage src={o.avatar_url} alt={o.full_name} />
                            ) : null}
                            <AvatarFallback>{o.full_name.slice(0, 2).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          {o.full_name}
                        </Link>
                      </td>
                      <td className="py-2">{o.phone || "—"}</td>
                      <td className="py-2">{o.email || "—"}</td>
                      <td className="py-2">{o.national_id || "—"}</td>
                      <td className="py-2 text-muted-foreground">{formatDate(o.created_at)}</td>
                      {canDelete && (
                        <td className="py-2 text-right">
                          <ConfirmDelete
                            onConfirm={() => remove.mutateAsync(o.id)}
                            pending={remove.isPending}
                            title={`Delete ${o.full_name}?`}
                            description={
                              <>
                                This permanently removes the landowner record and cannot be undone.
                                <DeleteImpactWarning kind="landowner" />
                              </>
                            }
                          />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(() => {
            const total = data?.count ?? 0;
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

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} type={type} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
      <User className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No landowners yet.</p>
    </div>
  );
}
