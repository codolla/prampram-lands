import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Save, Upload, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LandStatusBadge, BillStatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { PolygonEditor, type LatLng } from "@/components/PolygonEditor";
import { useAuth } from "@/lib/auth";
import { LandStaffAssignments } from "@/components/LandStaffAssignments";

export const Route = createFileRoute("/_authenticated/lands/$landId")({
  component: LandDetail,
});

function LandDetail() {
  const { landId } = Route.useParams();
  const qc = useQueryClient();
  const { user } = useAuth();

  const land = useQuery({
    queryKey: ["land", landId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lands")
        .select("*, landowners(id, full_name)")
        .eq("id", landId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const owners = useQuery({
    queryKey: ["landowners-mini"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("landowners")
        .select("id, full_name")
        .order("full_name");
      if (error) throw error;
      return data;
    },
  });

  const coords = useQuery({
    queryKey: ["land-coords", landId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("land_coordinates")
        .select("seq, lat, lng")
        .eq("land_id", landId)
        .order("seq");
      if (error) throw error;
      return (data ?? []).map((p) => ({ lat: Number(p.lat), lng: Number(p.lng) })) as LatLng[];
    },
  });

  const history = useQuery({
    queryKey: ["land-history", landId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ownership_history")
        .select("id, start_date, end_date, transfer_note, landowners(full_name)")
        .eq("land_id", landId)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const bills = useQuery({
    queryKey: ["land-bills", landId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, billing_year, amount, status, due_date")
        .eq("land_id", landId)
        .order("billing_year", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const documents = useQuery({
    queryKey: ["land-docs", landId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, file_name, kind, storage_path, mime_type, created_at")
        .eq("land_id", landId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    plot_number: "",
    family: "",
    size_value: "",
    size_unit: "acres" as "acres" | "hectares",
    location_description: "",
    gps_lat: "",
    gps_lng: "",
    status: "active" as "active" | "disputed" | "leased",
    current_owner_id: "",
    annual_rent_amount: "",
    notes: "",
  });

  useEffect(() => {
    if (land.data) {
      setForm({
        plot_number: land.data.plot_number ?? "",
        family: (land.data as unknown as { family?: string | null }).family ?? "",
        size_value: land.data.size_value?.toString() ?? "",
        size_unit: land.data.size_unit,
        location_description: land.data.location_description ?? "",
        gps_lat: land.data.gps_lat?.toString() ?? "",
        gps_lng: land.data.gps_lng?.toString() ?? "",
        status: land.data.status,
        current_owner_id: land.data.current_owner_id ?? "",
        annual_rent_amount: land.data.annual_rent_amount?.toString() ?? "",
        notes: land.data.notes ?? "",
      });
    }
  }, [land.data]);

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        plot_number: form.plot_number || null,
        family: form.family || null,
        size_value: form.size_value ? Number(form.size_value) : null,
        size_unit: form.size_unit,
        location_description: form.location_description || null,
        gps_lat: form.gps_lat ? Number(form.gps_lat) : null,
        gps_lng: form.gps_lng ? Number(form.gps_lng) : null,
        status: form.status,
        current_owner_id: form.current_owner_id || null,
        annual_rent_amount: form.annual_rent_amount ? Number(form.annual_rent_amount) : 0,
        notes: form.notes || null,
      };
      const { error } = await supabase
        .from("lands")
        .update(payload as never)
        .eq("id", landId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Land updated");
      qc.invalidateQueries({ queryKey: ["land", landId] });
      qc.invalidateQueries({ queryKey: ["land-history", landId] });
      qc.invalidateQueries({ queryKey: ["lands"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [polygon, setPolygon] = useState<LatLng[]>([]);
  useEffect(() => {
    if (coords.data) setPolygon(coords.data);
  }, [coords.data]);

  const savePolygon = useMutation({
    mutationFn: async () => {
      if (polygon.length < 3) throw new Error("Draw at least 3 points");
      const { error: delErr } = await supabase
        .from("land_coordinates")
        .delete()
        .eq("land_id", landId);
      if (delErr) throw delErr;
      const rows = polygon.map((p, i) => ({
        land_id: landId,
        seq: i,
        lat: p.lat,
        lng: p.lng,
      }));
      const { error } = await supabase.from("land_coordinates").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Polygon saved");
      qc.invalidateQueries({ queryKey: ["land-coords", landId] });
      qc.invalidateQueries({ queryKey: ["map-lands"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Documents upload
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [docKind, setDocKind] = useState<"indenture" | "agreement" | "receipt" | "other">(
    "indenture",
  );

  const uploadDoc = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 10 * 1024 * 1024) throw new Error("Max file size is 10MB");
      const path = `lands/${landId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("land-documents")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error } = await supabase.from("documents").insert({
        land_id: landId,
        kind: docKind,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        uploaded_by: user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      qc.invalidateQueries({ queryKey: ["land-docs", landId] });
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteDoc = useMutation({
    mutationFn: async (doc: { id: string; storage_path: string }) => {
      await supabase.storage.from("land-documents").remove([doc.storage_path]);
      const { error } = await supabase.from("documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document deleted");
      qc.invalidateQueries({ queryKey: ["land-docs", landId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadDoc = async (path: string) => {
    const { data, error } = await supabase.storage.from("land-documents").createSignedUrl(path, 60);
    if (error) {
      toast.error(error.message);
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  const center: LatLng = {
    lat: form.gps_lat ? Number(form.gps_lat) : 5.7167,
    lng: form.gps_lng ? Number(form.gps_lng) : 0.117,
  };

  return (
    <AppShell
      title={land.data?.land_code ?? "Land"}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/lands">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back
          </Link>
        </Button>
      }
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            Plot {land.data?.plot_number ?? "—"} · {land.data?.location_description ?? "—"}
          </p>
          <div className="mt-1">{land.data && <LandStatusBadge status={land.data.status} />}</div>
        </div>
      </div>

      <Tabs defaultValue="info" className="mt-4">
        <TabsList>
          <TabsTrigger value="info">Information</TabsTrigger>
          <TabsTrigger value="map">Coordinates</TabsTrigger>
          <TabsTrigger value="docs">Documents</TabsTrigger>
          <TabsTrigger value="history">Ownership history</TabsTrigger>
          <TabsTrigger value="bills">Bills</TabsTrigger>
          <TabsTrigger value="staff">Assigned staff</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Land details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <FieldInput
                  label="Plot number"
                  value={form.plot_number}
                  onChange={(v) => setForm({ ...form, plot_number: v })}
                />
                <FieldInput
                  label="Annual rent (GHS)"
                  value={form.annual_rent_amount}
                  onChange={(v) => setForm({ ...form, annual_rent_amount: v })}
                  type="number"
                />
              </div>
              <FieldInput
                label="Family (optional)"
                value={form.family}
                onChange={(v) => setForm({ ...form, family: v })}
              />
              <div className="grid grid-cols-3 gap-3">
                <FieldInput
                  label="Size"
                  value={form.size_value}
                  onChange={(v) => setForm({ ...form, size_value: v })}
                  type="number"
                />
                <div className="space-y-1">
                  <Label>Unit</Label>
                  <Select
                    value={form.size_unit}
                    onValueChange={(v) =>
                      setForm({ ...form, size_unit: v as typeof form.size_unit })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="acres">Acres</SelectItem>
                      <SelectItem value="hectares">Hectares</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="disputed">Disputed</SelectItem>
                      <SelectItem value="leased">Leased</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <FieldInput
                label="Location description"
                value={form.location_description}
                onChange={(v) => setForm({ ...form, location_description: v })}
              />
              <div className="grid grid-cols-2 gap-3">
                <FieldInput
                  label="GPS latitude"
                  value={form.gps_lat}
                  onChange={(v) => setForm({ ...form, gps_lat: v })}
                  type="number"
                />
                <FieldInput
                  label="GPS longitude"
                  value={form.gps_lng}
                  onChange={(v) => setForm({ ...form, gps_lng: v })}
                  type="number"
                />
              </div>
              <div className="space-y-1">
                <Label>Current owner</Label>
                <SearchableSelect
                  value={form.current_owner_id || "__none__"}
                  onValueChange={(v) =>
                    setForm({ ...form, current_owner_id: v === "__none__" ? "" : v })
                  }
                  searchPlaceholder="Search owners…"
                  options={[
                    { value: "__none__", label: "— Unassigned —" },
                    ...(owners.data ?? []).map((o) => ({ value: o.id, label: o.full_name })),
                  ]}
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
        </TabsContent>

        <TabsContent value="map" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Polygon boundary</CardTitle>
              <p className="text-sm text-muted-foreground">
                Use the draw tool on the map to outline the parcel. Existing polygons can be edited
                or deleted.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {coords.isLoading ? (
                <Skeleton className="h-72 w-full rounded-md" />
              ) : (
                <PolygonEditor initial={coords.data ?? []} center={center} onChange={setPolygon} />
              )}
              <div className="flex items-center gap-3">
                <Button onClick={() => savePolygon.mutate()} disabled={savePolygon.isPending}>
                  {savePolygon.isPending ? "Saving…" : "Save polygon"}
                </Button>
                <p className="text-xs text-muted-foreground">{polygon.length} points</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={docKind} onValueChange={(v) => setDocKind(v as typeof docKind)}>
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="indenture">Indenture</SelectItem>
                      <SelectItem value="agreement">Agreement</SelectItem>
                      <SelectItem value="receipt">Receipt</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  className="max-w-sm"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadDoc.mutate(f);
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploadDoc.isPending}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  {uploadDoc.isPending ? "Uploading…" : "Upload"}
                </Button>
              </div>

              {(documents.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <ul className="divide-y">
                  {(documents.data ?? []).map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{d.file_name}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {d.kind} · {formatDate(d.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => downloadDoc(d.storage_path)}
                        >
                          Download
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            deleteDoc.mutate({ id: d.id, storage_path: d.storage_path })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ownership history</CardTitle>
            </CardHeader>
            <CardContent>
              {(history.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No history yet.</p>
              ) : (
                <ul className="divide-y">
                  {(history.data ?? []).map((h) => {
                    const o = h.landowners as unknown as { full_name: string } | null;
                    return (
                      <li key={h.id} className="py-2">
                        <p className="text-sm font-medium">{o?.full_name ?? "Unknown"}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(h.start_date)} –{" "}
                          {h.end_date ? formatDate(h.end_date) : "present"}
                          {h.transfer_note ? ` · ${h.transfer_note}` : ""}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bills" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bills</CardTitle>
            </CardHeader>
            <CardContent>
              {(bills.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No bills yet. Create one from the{" "}
                  <Link to="/bills" className="text-primary underline">
                    Bills page
                  </Link>
                  .
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                      <th className="pb-2">Year</th>
                      <th className="pb-2">Due</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2 text-right">Amount</th>
                      <th className="pb-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(bills.data ?? []).map((b) => (
                      <tr key={b.id} className="border-b last:border-0">
                        <td className="py-2 font-medium">{b.billing_year}</td>
                        <td className="py-2">{formatDate(b.due_date)}</td>
                        <td className="py-2">
                          <BillStatusBadge status={b.status} />
                        </td>
                        <td className="py-2 text-right">{formatCurrency(b.amount)}</td>
                        <td className="py-2 text-right">
                          <Link
                            to="/bills/$billId"
                            params={{ billId: b.id }}
                            className="text-primary text-xs hover:underline"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="staff" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assigned staff</CardTitle>
            </CardHeader>
            <CardContent>
              <LandStaffAssignments landId={landId} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function FieldInput({
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
