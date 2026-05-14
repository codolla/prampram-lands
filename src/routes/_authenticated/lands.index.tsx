import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TableSkeleton } from "@/components/skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Plus, Search, Landmark, X, ImagePlus, Users } from "lucide-react";
import { toast } from "sonner";
import { LandStatusBadge } from "@/components/StatusBadge";
import { formatCurrency } from "@/lib/format";
import { useAuth } from "@/lib/auth";
import { Progress } from "@/components/ui/progress";
import { ConfirmDelete, DeleteImpactWarning } from "@/components/ConfirmDelete";
import { getUserFacingErrorMessage } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/lands/")({
  validateSearch: (search: Record<string, unknown>) => {
    const registerRaw = search.register;
    const register =
      registerRaw === true || registerRaw === "true" || registerRaw === "1" || registerRaw === 1;
    const ownerId = typeof search.ownerId === "string" ? search.ownerId : undefined;
    if (ownerId && register) return { register: true, ownerId };
    if (ownerId) return { ownerId };
    return {};
  },
  component: LandsPage,
});

type Status = "all" | "active" | "disputed" | "leased";

const PAGE_SIZE = 25;
const ACRES_PER_PLOT = 0.16;
const ACRES_PER_HECTARE = 2.471053814671653;

function LandsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const routeSearch = Route.useSearch();
  const { user, hasAnyRole } = useAuth();
  const canDelete = hasAnyRole(["admin"]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [family, setFamily] = useState<string>("all");
  const [page, setPage] = useState(1);
  const openedFromOwnerRef = useRef(false);

  useEffect(() => {
    setPage(1);
  }, [search, status, family, routeSearch.ownerId]);

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
    queryKey: ["lands-family-stats", family, status, search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "lands_family_stats" as never,
        {
          family_text: family === "all" ? "" : family,
          status_filter: status,
          search_text: search,
        } as never,
      );
      if (error) throw error;
      const row = (data as unknown as Array<Record<string, unknown>> | null)?.[0] ?? {};
      return {
        landsCount: Number(row.lands_count ?? 0),
        totalAnnualRent: Number(row.total_annual_rent ?? 0),
        activeCount: Number(row.active_count ?? 0),
        disputedCount: Number(row.disputed_count ?? 0),
        leasedCount: Number(row.leased_count ?? 0),
      };
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

  const landTypes = useQuery({
    queryKey: ["land-types-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("land_types")
        .select("id, label, active, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  type RentPackageRow = {
    id: string;
    name: string;
    land_type_id: string;
    annual_amount: number;
    active: boolean;
  };

  const rentPackages = useQuery({
    queryKey: ["rent-packages-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rent_packages")
        .select("id, name, land_type_id, annual_amount, active")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as RentPackageRow[];
    },
  });

  const lands = useQuery({
    queryKey: ["lands", search, status, family, routeSearch.ownerId, page],
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let q = supabase
        .from("lands")
        .select(
          "id, land_code, plot_number, family, size_value, size_unit, status, annual_rent_amount, location_description, current_owner_id, landowners(full_name)",
          { count: "exact" },
        )
        .order("land_code");
      if (search) q = q.or(`land_code.ilike.%${search}%,plot_number.ilike.%${search}%`);
      if (status !== "all") q = q.eq("status", status);
      if (family !== "all") q = q.eq("family", family);
      if (routeSearch.ownerId) q = q.eq("current_owner_id", routeSearch.ownerId as string);
      const { data, count, error } = await q.range(from, to);
      if (error) throw error;
      return { rows: data ?? [], count: count ?? 0 };
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
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
    land_type_id: "",
    rent_package_id: "",
  });
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
    fileName: string;
    stage: "idle" | "saving" | "uploading" | "done";
  }>({ current: 0, total: 0, fileName: "", stage: "idle" });

  useEffect(() => {
    if (openedFromOwnerRef.current) return;
    if (!routeSearch.register || !routeSearch.ownerId) return;
    openedFromOwnerRef.current = true;
    setOpen(true);
    setForm((cur) => ({ ...cur, current_owner_id: routeSearch.ownerId as string }));
  }, [routeSearch.ownerId, routeSearch.register]);

  const addImages = (files: FileList | null) => {
    if (!files) return;
    const accepted: File[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) {
        toast.error(`${f.name} is not an image`);
        continue;
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error(`${f.name} exceeds 10MB`);
        continue;
      }
      accepted.push(f);
    }
    setImages((prev) => [...prev, ...accepted]);
    setPreviews((prev) => [...prev, ...accepted.map((f) => URL.createObjectURL(f))]);
  };

  const removeImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
    setPreviews((prev) => {
      const url = prev[idx];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const resetForm = () => {
    previews.forEach((u) => URL.revokeObjectURL(u));
    setImages([]);
    setPreviews([]);
    setForm({
      family: "",
      size_value: "",
      size_unit: "acres",
      location_description: "",
      gps_lat: "",
      gps_lng: "",
      status: "active",
      current_owner_id: "",
      annual_rent_amount: "",
      notes: "",
      land_type_id: "",
      rent_package_id: "",
    });
  };

  const sizeValueNum = useMemo(() => {
    const raw = form.size_value.trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [form.size_value]);

  const acres = useMemo(() => {
    if (sizeValueNum == null) return null;
    return form.size_unit === "hectares" ? sizeValueNum * ACRES_PER_HECTARE : sizeValueNum;
  }, [form.size_unit, sizeValueNum]);

  const plots = useMemo(() => {
    if (acres == null) return null;
    return acres / ACRES_PER_PLOT;
  }, [acres]);

  const selectedPackage = useMemo(() => {
    if (!form.rent_package_id) return null;
    return (rentPackages.data ?? []).find((p) => p.id === form.rent_package_id) ?? null;
  }, [form.rent_package_id, rentPackages.data]);

  const computedAnnualRent = useMemo(() => {
    if (!selectedPackage || plots == null) return null;
    const value = Number(selectedPackage.annual_amount) * plots;
    return Math.round(value * 100) / 100;
  }, [plots, selectedPackage]);

  const formatInputNumber = (n: number, maxDecimals = 4) => {
    const s = n.toFixed(maxDecimals);
    return s.replace(/\.?0+$/, "");
  };

  useEffect(() => {
    if (!form.rent_package_id || computedAnnualRent == null) return;
    const next = formatInputNumber(computedAnnualRent, 2);
    setForm((cur) =>
      cur.annual_rent_amount === next ? cur : { ...cur, annual_rent_amount: next },
    );
  }, [computedAnnualRent, form.rent_package_id]);

  useEffect(() => {
    if (!form.land_type_id) return;
    const options = (rentPackages.data ?? []).filter((p) => p.land_type_id === form.land_type_id);
    if (options.length === 0) return;
    setForm((cur) => (cur.rent_package_id ? cur : { ...cur, rent_package_id: options[0].id }));
  }, [form.land_type_id, rentPackages.data]);

  const create = useMutation({
    mutationFn: async () => {
      if (!form.land_type_id) throw new Error("Land type is required");
      if (!form.rent_package_id) throw new Error("Rent package is required");
      if (sizeValueNum == null) throw new Error("Size is required");
      if (computedAnnualRent == null) throw new Error("Annual rent could not be calculated");
      setUploadProgress({ current: 0, total: images.length, fileName: "", stage: "saving" });
      const payload = {
        family: form.family || null,
        size_value: form.size_value ? Number(form.size_value) : null,
        size_unit: form.size_unit,
        location_description: form.location_description || null,
        gps_lat: form.gps_lat ? Number(form.gps_lat) : null,
        gps_lng: form.gps_lng ? Number(form.gps_lng) : null,
        status: form.status,
        current_owner_id: form.current_owner_id || null,
        annual_rent_amount: computedAnnualRent,
        notes: form.notes || null,
        land_type_id: form.land_type_id,
        rent_package_id: form.rent_package_id,
      };
      const { data: inserted, error } = await supabase
        .from("lands")
        .insert(payload as never)
        .select("id, land_code")
        .single();
      if (error) throw error;

      // Upload images (if any) and link as documents
      if (images.length && inserted?.id) {
        const newLandId = inserted.id as string;
        let failed = 0;
        for (let i = 0; i < images.length; i++) {
          const file = images[i];
          setUploadProgress({
            current: i,
            total: images.length,
            fileName: file.name,
            stage: "uploading",
          });
          const path = `lands/${newLandId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
          const { error: upErr } = await supabase.storage
            .from("land-documents")
            .upload(path, file, { contentType: file.type });
          if (upErr) {
            failed++;
            continue;
          }
          const { error: docErr } = await supabase.from("documents").insert({
            land_id: newLandId,
            kind: "other",
            storage_path: path,
            file_name: file.name,
            mime_type: file.type,
            size_bytes: file.size,
            uploaded_by: user?.id,
          });
          if (docErr) failed++;
          setUploadProgress({
            current: i + 1,
            total: images.length,
            fileName: file.name,
            stage: "uploading",
          });
        }
        if (failed > 0) toast.warning(`${failed} image(s) failed to upload`);
      }
      setUploadProgress((p) => ({ ...p, stage: "done" }));
      return inserted;
    },
    onSuccess: (inserted) => {
      toast.success("Land registered", {
        description: inserted?.land_code ? `Land code: ${inserted.land_code}` : undefined,
      });
      setOpen(false);
      resetForm();
      setUploadProgress({ current: 0, total: 0, fileName: "", stage: "idle" });
      qc.invalidateQueries({ queryKey: ["lands"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      if (inserted?.id) {
        navigate({
          to: "/lands/$landId",
          params: { landId: inserted.id as string },
          search: { tab: "docs" },
        });
      }
    },
    onError: (e: unknown) => {
      toast.error(getUserFacingErrorMessage(e));
      setUploadProgress({ current: 0, total: 0, fileName: "", stage: "idle" });
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lands").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Land deleted");
      qc.invalidateQueries({ queryKey: ["lands"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e: unknown) => toast.error(getUserFacingErrorMessage(e)),
  });

  return (
    <AppShell
      title="Lands"
      actions={
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/landowners">
              <Users className="mr-1 h-4 w-4" />
              Landowners
            </Link>
          </Button>

          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v);
              if (!v) resetForm();
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" /> Register land
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Register a new land parcel</DialogTitle>
                <DialogDescription>
                  You can add polygon coordinates from the land detail page after creation.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Land code</Label>
                    <Input value="Auto-generated" readOnly disabled />
                  </div>
                  <div className="space-y-1">
                    <Label>Plot number</Label>
                    <Input value="Auto-generated" readOnly disabled />
                  </div>
                </div>
                <FieldInput
                  label="Grantor/Family"
                  value={form.family}
                  onChange={(v) => setForm({ ...form, family: v })}
                />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                  <FieldInput
                    label="Plots"
                    value={plots == null ? "" : formatInputNumber(plots)}
                    onChange={(v) => {
                      const raw = v.trim();
                      if (!raw) {
                        setForm({ ...form, size_value: "" });
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isFinite(n) || n < 0) return;
                      const nextAcres = n * ACRES_PER_PLOT;
                      const nextSize =
                        form.size_unit === "hectares" ? nextAcres / ACRES_PER_HECTARE : nextAcres;
                      setForm({ ...form, size_value: formatInputNumber(nextSize) });
                    }}
                    type="number"
                  />
                  <FieldInput
                    label="Annual rent (GHS)"
                    value={form.annual_rent_amount}
                    onChange={(v) => setForm({ ...form, annual_rent_amount: v })}
                    type="number"
                    readOnly
                  />
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
                <div className="grid grid-cols-2 gap-3">
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
                  <div className="space-y-1">
                    <Label>Land type *</Label>
                    <SearchableSelect
                      value={form.land_type_id || undefined}
                      onValueChange={(v) =>
                        setForm({ ...form, land_type_id: v, rent_package_id: "" })
                      }
                      placeholder="Select land type…"
                      searchPlaceholder="Search land types…"
                      options={(landTypes.data ?? []).map((t) => ({
                        value: t.id,
                        label: t.label,
                      }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Rent package *</Label>
                    <SearchableSelect
                      value={form.rent_package_id || undefined}
                      onValueChange={(v) => setForm({ ...form, rent_package_id: v })}
                      placeholder={
                        form.land_type_id ? "Select package…" : "Select land type first…"
                      }
                      searchPlaceholder="Search packages…"
                      options={(rentPackages.data ?? [])
                        .filter((p) => p.land_type_id === form.land_type_id)
                        .map((p) => ({ value: p.id, label: p.name }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Current owner</Label>
                    <SearchableSelect
                      value={form.current_owner_id || "__none__"}
                      onValueChange={(v) =>
                        setForm({ ...form, current_owner_id: v === "__none__" ? "" : v })
                      }
                      placeholder="Select…"
                      searchPlaceholder="Search owners…"
                      options={[
                        { value: "__none__", label: "— Unassigned —" },
                        ...(owners.data ?? []).map((o) => ({ value: o.id, label: o.full_name })),
                      ]}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Land photos (optional)</Label>
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground transition hover:bg-muted/50">
                    <ImagePlus className="h-6 w-6" />
                    <span>Click to add images (JPG/PNG, up to 10MB each)</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        addImages(e.target.files);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {previews.length > 0 && (
                    <div className="grid grid-cols-4 gap-2">
                      {previews.map((src, i) => (
                        <div
                          key={src}
                          className="group relative aspect-square overflow-hidden rounded-md border"
                        >
                          <img
                            src={src}
                            alt={images[i]?.name ?? "preview"}
                            className="h-full w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(i)}
                            className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 shadow transition group-hover:opacity-100"
                            aria-label="Remove image"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {images.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {images.length} image(s) selected
                    </p>
                  )}
                </div>
              </div>
              {create.isPending && (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">
                      {uploadProgress.stage === "saving" && "Saving land details…"}
                      {uploadProgress.stage === "uploading" &&
                        `Uploading photo ${uploadProgress.current + (uploadProgress.current < uploadProgress.total ? 1 : 0)} of ${uploadProgress.total}`}
                      {uploadProgress.stage === "done" && "Finishing up…"}
                      {uploadProgress.stage === "idle" && "Preparing…"}
                    </span>
                    <span className="text-muted-foreground">
                      {uploadProgress.total > 0
                        ? `${Math.round((uploadProgress.current / uploadProgress.total) * 100)}%`
                        : ""}
                    </span>
                  </div>
                  <Progress
                    value={
                      uploadProgress.stage === "saving"
                        ? 5
                        : uploadProgress.stage === "done"
                          ? 100
                          : uploadProgress.total > 0
                            ? (uploadProgress.current / uploadProgress.total) * 100
                            : 50
                    }
                    className="h-1.5"
                  />
                  {uploadProgress.fileName && uploadProgress.stage === "uploading" && (
                    <p className="truncate text-xs text-muted-foreground">
                      {uploadProgress.fileName}
                    </p>
                  )}
                </div>
              )}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setOpen(false);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={() => create.mutate()} disabled={create.isPending}>
                  {create.isPending ? "Saving…" : "Register"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      }
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lands</CardTitle>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by code or plot…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as Status)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="disputed">Disputed</SelectItem>
                <SelectItem value="leased">Leased</SelectItem>
              </SelectContent>
            </Select>
            <Select value={family} onValueChange={(v) => setFamily(v)}>
              <SelectTrigger className="w-56">
                <SelectValue placeholder="All families" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All families</SelectItem>
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
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Lands</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {familyStats.isLoading ? "—" : (familyStats.data?.landsCount ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Annual rent</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {familyStats.isLoading
                  ? "—"
                  : formatCurrency(familyStats.data?.totalAnnualRent ?? 0)}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Active</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {familyStats.isLoading
                  ? "—"
                  : (familyStats.data?.activeCount ?? 0).toLocaleString()}
              </p>
            </div>
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">Disputed / Leased</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {familyStats.isLoading
                  ? "—"
                  : `${(familyStats.data?.disputedCount ?? 0).toLocaleString()} / ${(familyStats.data?.leasedCount ?? 0).toLocaleString()}`}
              </p>
            </div>
          </div>

          {lands.isLoading ? (
            <TableSkeleton columns={7} rows={6} />
          ) : (lands.data?.rows ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <Landmark className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No lands match.</p>
            </div>
          ) : (
            <>
              <div className="grid gap-2 md:hidden">
                {(lands.data?.rows ?? []).map((l) => {
                  const owner = l.landowners as unknown as { full_name: string } | null;
                  return (
                    <div key={l.id} className="rounded-md border border-border bg-background p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to="/lands/$landId"
                            params={{ landId: l.id }}
                            search={{ tab: undefined }}
                            className="block truncate font-medium text-primary hover:underline"
                          >
                            {l.land_code}
                          </Link>
                          <div className="mt-1 text-sm">{l.plot_number || "—"}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            {owner?.full_name ?? "—"}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <LandStatusBadge status={l.status} />
                            <span className="text-xs text-muted-foreground">
                              {l.size_value ? `${l.size_value} ${l.size_unit}` : "No size"}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-semibold">
                            {formatCurrency(l.annual_rent_amount)}
                          </div>
                          <div className="text-xs text-muted-foreground">Annual rent</div>
                        </div>
                      </div>
                      {canDelete ? (
                        <div className="mt-2 flex justify-end">
                          <ConfirmDelete
                            onConfirm={() => remove.mutateAsync(l.id)}
                            pending={remove.isPending}
                            title={`Delete land ${l.land_code}?`}
                            description={
                              <>
                                This permanently removes the land parcel and cannot be undone.
                                <DeleteImpactWarning kind="land" />
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
                      <th className="pb-2">Code</th>
                      <th className="pb-2">Plot</th>
                      <th className="pb-2">Owner</th>
                      <th className="pb-2">Size</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2 text-right">Annual rent</th>
                      {canDelete && <th className="pb-2"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(lands.data?.rows ?? []).map((l) => {
                      const owner = l.landowners as unknown as { full_name: string } | null;
                      return (
                        <tr key={l.id} className="border-b last:border-0">
                          <td className="py-2 font-medium">
                            <Link
                              to="/lands/$landId"
                              params={{ landId: l.id }}
                              search={{ tab: undefined }}
                              className="text-primary hover:underline"
                            >
                              {l.land_code}
                            </Link>
                          </td>
                          <td className="py-2">{l.plot_number || "—"}</td>
                          <td className="py-2">{owner?.full_name ?? "—"}</td>
                          <td className="py-2">
                            {l.size_value ? `${l.size_value} ${l.size_unit}` : "—"}
                          </td>
                          <td className="py-2">
                            <LandStatusBadge status={l.status} />
                          </td>
                          <td className="py-2 text-right">
                            {formatCurrency(l.annual_rent_amount)}
                          </td>
                          {canDelete && (
                            <td className="py-2 text-right">
                              <ConfirmDelete
                                onConfirm={() => remove.mutateAsync(l.id)}
                                pending={remove.isPending}
                                title={`Delete land ${l.land_code}?`}
                                description={
                                  <>
                                    This permanently removes the land parcel and cannot be undone.
                                    <DeleteImpactWarning kind="land" />
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
            const total = lands.data?.count ?? 0;
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

function FieldInput({
  label,
  value,
  onChange,
  type = "text",
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        type={type}
        readOnly={readOnly}
      />
    </div>
  );
}
