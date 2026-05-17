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
import { Save, ArrowLeft, Landmark, Plus, Trash2 } from "lucide-react";
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
import { useAuth } from "@/lib/auth";
import { looksLikePhone, normalisePhone } from "@/lib/phone-auth";
import { getUserFacingErrorMessage } from "@/lib/utils";
import { ConfirmDelete, DeleteImpactWarning } from "@/components/ConfirmDelete";

export const Route = createFileRoute("/_authenticated/landowners/$ownerId")({
  component: LandownerDetail,
});

type OwnerRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  national_id: string | null;
  identity_type: string | null;
  identity_number: string | null;
  notes: string | null;
  avatar_url: string | null;
};

function LandownerDetail() {
  const { ownerId } = Route.useParams();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();
  const { hasAnyRole } = useAuth();
  const canDeleteLand = hasAnyRole(["admin", "developer"]);

  const owner = useQuery<OwnerRow>({
    queryKey: ["landowner", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landowners")
        .select("*")
        .eq("id", ownerId)
        .single();
      if (error) throw error;
      return data as unknown as OwnerRow;
    },
  });

  const phones = useQuery({
    queryKey: ["landowner-phones", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landowner_phones" as never)
        .select("id, phone, is_primary")
        .eq("landowner_id", ownerId)
        .order("is_primary", { ascending: false })
        .order("phone");
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; phone: string; is_primary: boolean }>;
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

  const removeLand = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lands").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Land deleted");
      qc.invalidateQueries({ queryKey: ["landowner-lands", ownerId] });
      qc.invalidateQueries({ queryKey: ["lands"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: unknown) => toast.error(getUserFacingErrorMessage(e)),
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
    identity_type: "" as "" | "ghana_card" | "nhis" | "drivers_license" | "passport",
    identity_number: "",
    notes: "",
    avatar_url: "" as string | null | "",
  });
  const [extraPhones, setExtraPhones] = useState<string[]>([]);

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
        phone:
          owner.data.phone && looksLikePhone(owner.data.phone)
            ? normalisePhone(owner.data.phone)
            : (owner.data.phone ?? ""),
        email: owner.data.email ?? "",
        address: owner.data.address ?? "",
        identity_type: (owner.data.identity_type ?? "") as
          | ""
          | "ghana_card"
          | "nhis"
          | "drivers_license"
          | "passport",
        identity_number: (owner.data.identity_number ?? owner.data.national_id ?? "") as string,
        notes: owner.data.notes ?? "",
        avatar_url: owner.data.avatar_url ?? "",
      });
    }
  }, [owner.data]);

  useEffect(() => {
    if (!phones.data) return;
    const primary = phones.data.find((p) => p.is_primary)?.phone ?? "";
    setForm((f) => ({
      ...f,
      phone: f.phone.trim() ? f.phone : primary ? normalisePhone(primary) : f.phone,
    }));
    setExtraPhones(phones.data.filter((p) => !p.is_primary).map((p) => p.phone));
  }, [phones.data]);

  const save = useMutation({
    mutationFn: async () => {
      const primaryRaw = form.phone.trim();
      if (primaryRaw && !looksLikePhone(primaryRaw)) throw new Error("Enter a valid phone number");
      const primary = primaryRaw ? normalisePhone(primaryRaw) : null;
      const identityNumber = form.identity_number.trim();
      const identityType = form.identity_type || "";
      if (!identityNumber) throw new Error("Identity number is required");

      const extras = extraPhones
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => {
          if (!looksLikePhone(p)) throw new Error(`Invalid extra phone: ${p}`);
          return normalisePhone(p);
        })
        .filter((p) => p !== primary);
      const uniqueExtras = Array.from(new Set(extras));

      const updatePayload: Record<string, unknown> = {
        full_name: form.full_name,
        phone: primary,
        email: form.email || null,
        address: form.address || null,
        notes: form.notes || null,
        avatar_url: form.avatar_url || null,
      };
      if (identityType && identityNumber) {
        updatePayload.identity_type = identityType;
        updatePayload.identity_number = identityNumber;
        updatePayload.national_id = null;
      } else {
        updatePayload.identity_type = null;
        updatePayload.identity_number = null;
        updatePayload.national_id = identityNumber;
      }

      const { error } = await supabase
        .from("landowners")
        .update(updatePayload as never)
        .eq("id", ownerId);
      if (error) throw error;

      const desiredPhones = new Set<string>(uniqueExtras);
      if (primary) desiredPhones.add(primary);

      if (desiredPhones.size === 0) {
        const { error: delAllErr } = await supabase
          .from("landowner_phones" as never)
          .delete()
          .eq("landowner_id", ownerId);
        if (delAllErr) throw delAllErr;
        return;
      }

      const { data: existing, error: existingErr } = await supabase
        .from("landowner_phones" as never)
        .select("phone")
        .eq("landowner_id", ownerId);
      if (existingErr) throw existingErr;

      const existingPhones = new Set(
        ((existing ?? []) as Array<{ phone: string }>).map((r) => r.phone),
      );
      const toDelete = Array.from(existingPhones).filter((p) => !desiredPhones.has(p));
      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("landowner_phones" as never)
          .delete()
          .eq("landowner_id", ownerId)
          .in("phone", toDelete);
        if (delErr) throw delErr;
      }

      const upsertRows = Array.from(desiredPhones).map((phone) => ({
        landowner_id: ownerId,
        phone,
        is_primary: false,
      }));
      const { error: upsertErr } = await supabase
        .from("landowner_phones" as never)
        .upsert(upsertRows as never, { onConflict: "landowner_id,phone" });
      if (upsertErr) throw upsertErr;

      const { error: resetPrimaryErr } = await supabase
        .from("landowner_phones" as never)
        .update({ is_primary: false } as never)
        .eq("landowner_id", ownerId);
      if (resetPrimaryErr) throw resetPrimaryErr;

      if (primary) {
        const { error: setPrimaryErr } = await supabase
          .from("landowner_phones" as never)
          .update({ is_primary: true } as never)
          .eq("landowner_id", ownerId)
          .eq("phone", primary);
        if (setPrimaryErr) throw setPrimaryErr;
      }
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["landowner", ownerId] });
      qc.invalidateQueries({ queryKey: ["landowners"] });
      qc.invalidateQueries({ queryKey: ["landowner-phones", ownerId] });
    },
    onError: (e: unknown) => toast.error(getUserFacingErrorMessage(e)),
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
              } else {
                navigate({
                  to: "/landowners",
                  search: { q: "", mode: "unlinked", page: 1, pageSize: 25 },
                });
              }
            }}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Button>
          <Button asChild size="sm">
            <Link to="/lands" search={{ register: true, ownerId }}>
              <Landmark className="mr-1 h-4 w-4" />
              {(lands.data ?? []).length > 0 ? "Add another land" : "Register land"}
            </Link>
          </Button>
        </div>
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
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Additional phone numbers</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setExtraPhones((p) => [...p, ""])}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  Add phone
                </Button>
              </div>
              {extraPhones.length === 0 ? (
                <p className="text-sm text-muted-foreground">No additional phone numbers.</p>
              ) : (
                <div className="grid gap-2">
                  {extraPhones.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        value={p}
                        onChange={(e) =>
                          setExtraPhones((list) =>
                            list.map((v, i) => (i === idx ? e.target.value : v)),
                          )
                        }
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const phone = extraPhones[idx] ?? "";
                          setForm((f) => ({ ...f, phone }));
                          setExtraPhones((list) => list.filter((_, i) => i !== idx));
                        }}
                      >
                        Make primary
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setExtraPhones((list) => list.filter((_, i) => i !== idx))}
                        aria-label="Remove phone"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Field
              label="Address"
              value={form.address}
              onChange={(v) => setForm({ ...form, address: v })}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Identity type</Label>
                <Select
                  value={form.identity_type}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      identity_type: v as "ghana_card" | "nhis" | "drivers_license" | "passport",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ghana_card">Ghana Card</SelectItem>
                    <SelectItem value="nhis">Health insurance</SelectItem>
                    <SelectItem value="drivers_license">Driver’s license</SelectItem>
                    <SelectItem value="passport">Passport</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Field
                label="Identity number *"
                value={form.identity_number}
                onChange={(v) => setForm({ ...form, identity_number: v })}
              />
            </div>
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
                        {l.plot_number ?? "—"}
                        {l.location_description ? ` · ${l.location_description}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <LandStatusBadge status={l.status} />
                      {canDeleteLand ? (
                        <ConfirmDelete
                          onConfirm={() => removeLand.mutateAsync(l.id)}
                          pending={removeLand.isPending}
                          title={`Delete land ${l.land_code}?`}
                          description={
                            <>
                              This permanently removes the land parcel and cannot be undone.
                              <DeleteImpactWarning kind="land" />
                            </>
                          }
                        />
                      ) : null}
                    </div>
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
