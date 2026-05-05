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

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    address: "",
    national_id: "",
    notes: "",
    avatar_url: "" as string | null | "",
  });

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