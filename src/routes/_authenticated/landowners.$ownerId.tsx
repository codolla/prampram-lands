import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { LandStatusBadge } from "@/components/StatusBadge";
import { AvatarUpload } from "@/components/AvatarUpload";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/landowners/$ownerId")({
  component: LandownerDetail,
});

function LandownerDetail() {
  const { ownerId } = Route.useParams();
  const qc = useQueryClient();

  const owner = useQuery({
    queryKey: ["landowner", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landowners")
        .select("*")
        .eq("id", ownerId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const lands = useQuery({
    queryKey: ["landowner-lands", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lands")
        .select("id, land_code, plot_number, status, location_description")
        .eq("current_owner_id", ownerId);
      if (error) throw error;
      return data;
    },
  });

  const advance = useQuery({
    queryKey: ["advance-balance", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landowner_advance_balances" as never)
        .select("balance")
        .eq("landowner_id", ownerId)
        .maybeSingle();
      if (error) throw error;
      return Number((data as unknown as { balance?: number | null } | null)?.balance ?? 0);
    },
  });

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    address: "",
    national_id: "",
    notes: "",
    avatar_url: "" as string | null | "",
  });

  const [deposit, setDeposit] = useState({
    land_id: "",
    amount: "",
    paid_at: new Date().toISOString().slice(0, 10),
    method: "cash" as "cash" | "momo" | "bank",
    reference: "",
  });

  useEffect(() => {
    if (!deposit.land_id && (lands.data ?? []).length > 0) {
      setDeposit((d) => ({ ...d, land_id: lands.data?.[0]?.id ?? "" }));
    }
  }, [lands.data, deposit.land_id]);

  useEffect(() => {
    if (owner.data) {
      setForm({
        full_name: owner.data.full_name ?? "",
        phone: owner.data.phone ?? "",
        email: owner.data.email ?? "",
        address: owner.data.address ?? "",
        national_id: owner.data.national_id ?? "",
        notes: owner.data.notes ?? "",
        avatar_url: owner.data.avatar_url ?? "",
      });
    }
  }, [owner.data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("landowners")
        .update({
          full_name: form.full_name,
          phone: form.phone || null,
          email: form.email || null,
          address: form.address || null,
          national_id: form.national_id || null,
          notes: form.notes || null,
          avatar_url: form.avatar_url || null,
        })
        .eq("id", ownerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["landowner", ownerId] });
      qc.invalidateQueries({ queryKey: ["landowners"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addAdvance = useMutation({
    mutationFn: async () => {
      const amt = Number(deposit.amount);
      if (!Number.isFinite(amt) || amt <= 0) throw new Error("Enter a valid amount");
      if (!deposit.land_id) throw new Error("Select a land");
      const payload = {
        bill_id: null,
        kind: "advance_deposit",
        land_id: deposit.land_id,
        landowner_id: ownerId,
        amount: amt,
        paid_at: deposit.paid_at,
        method: deposit.method,
        reference: deposit.reference || null,
        notes: "Advance payment (credit)",
      };
      const { error } = await supabase.from("payments").insert(payload as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Advance payment saved");
      setDeposit((d) => ({ ...d, amount: "", reference: "" }));
      qc.invalidateQueries({ queryKey: ["advance-balance", ownerId] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["recent-payments"] });
      qc.invalidateQueries({ queryKey: ["payments-all"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell
      title={owner.data?.full_name ?? "Landowner"}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/landowners">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <AvatarUpload
              value={form.avatar_url || null}
              onChange={(url) => setForm({ ...form, avatar_url: url ?? "" })}
              folder="landowners"
              entityId={ownerId}
              fallback={form.full_name || "L"}
              size={96}
            />
            <Field
              label="Full name"
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
            <div>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="mr-1 h-4 w-4" />
                {save.isPending ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Lands owned</CardTitle>
          </CardHeader>
          <CardContent>
            {(lands.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No lands assigned.</p>
            ) : (
              <ul className="space-y-2">
                {(lands.data ?? []).map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between rounded-md border border-border p-2"
                  >
                    <div>
                      <Link
                        to="/lands/$landId"
                        params={{ landId: l.id }}
                        search={{ tab: undefined }}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        {l.land_code}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {l.plot_number ?? "—"} · {l.location_description ?? "—"}
                      </p>
                    </div>
                    <LandStatusBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Advance account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-md border border-border bg-muted/40 p-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Available balance</span>
                <span className="font-semibold">
                  {advance.isLoading ? "…" : formatCurrency(advance.data ?? 0)}
                </span>
              </div>
            </div>

            <div className="space-y-1">
              <Label>Land (for receipt)</Label>
              <Select
                value={deposit.land_id || "__none__"}
                onValueChange={(v) =>
                  setDeposit((d) => ({ ...d, land_id: v === "__none__" ? "" : v }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Select a land</SelectItem>
                  {(lands.data ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.land_code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Amount (GHS)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={deposit.amount}
                onChange={(e) => setDeposit((d) => ({ ...d, amount: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                type="date"
                value={deposit.paid_at}
                onChange={(e) => setDeposit((d) => ({ ...d, paid_at: e.target.value }))}
              />
            </div>

            <div className="space-y-1">
              <Label>Method</Label>
              <Select
                value={deposit.method}
                onValueChange={(v) => setDeposit((d) => ({ ...d, method: v as typeof d.method }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="momo">Mobile Money</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Reference</Label>
              <Input
                value={deposit.reference}
                onChange={(e) => setDeposit((d) => ({ ...d, reference: e.target.value }))}
                placeholder="Transaction ID, slip no., etc."
              />
            </div>

            <Button
              className="w-full"
              onClick={() => addAdvance.mutate()}
              disabled={addAdvance.isPending}
            >
              {addAdvance.isPending ? "Saving…" : "Add advance payment"}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
