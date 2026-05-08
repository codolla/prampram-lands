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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Save, Upload, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { LandStatusBadge, BillStatusBadge } from "@/components/StatusBadge";
import { formatCurrency, formatDate } from "@/lib/format";
import { PolygonEditor, type LatLng } from "@/components/PolygonEditor";
import { useAuth } from "@/lib/auth";
import { LandStaffAssignments } from "@/components/LandStaffAssignments";
import { parseBoundaryFile } from "@/lib/boundary";
import { Switch } from "@/components/ui/switch";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";

export const Route = createFileRoute("/_authenticated/lands/$landId")({
  validateSearch: (search: Record<string, unknown>) => {
    const tabRaw = typeof search.tab === "string" ? search.tab : undefined;
    const allowed = new Set(["info", "map", "docs", "history", "bills", "staff"]);
    const tab = tabRaw && allowed.has(tabRaw) ? tabRaw : undefined;
    return tab ? { tab } : {};
  },
  component: LandDetail,
});

type LandDocRow = {
  id: string;
  file_name: string;
  kind: string;
  storage_path: string;
  mime_type: string | null;
  created_at: string;
};

function LandDetail() {
  const { landId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
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

  const documents = useQuery<LandDocRow[]>({
    queryKey: ["land-docs", landId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("id, file_name, kind, storage_path, mime_type, created_at")
        .eq("land_id", landId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as LandDocRow[];
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
  const [expectedPoints, setExpectedPoints] = useState(4);
  const [gpsAccuracyTargetM, setGpsAccuracyTargetM] = useState(25);
  const [minPointDistanceM, setMinPointDistanceM] = useState(3);
  const [autoOrderPoints, setAutoOrderPoints] = useState(true);
  useEffect(() => {
    if (coords.data) setPolygon(coords.data);
  }, [coords.data]);

  const [capturingGps, setCapturingGps] = useState(false);
  const boundaryFileRef = useRef<HTMLInputElement | null>(null);
  const [sitePlanOpen, setSitePlanOpen] = useState(false);
  const [sitePlanText, setSitePlanText] = useState("");

  const distanceMeters = (a: LatLng, b: LatLng) => {
    const R = 6371000;
    const lat1 = (a.lat * Math.PI) / 180;
    const lat2 = (b.lat * Math.PI) / 180;
    const dLat = lat2 - lat1;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    return R * c;
  };

  const orderByAngle = (pts: LatLng[]) => {
    if (pts.length < 3) return pts;
    const cLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const cLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
    return [...pts].sort((a, b) => {
      const aa = Math.atan2(a.lng - cLng, a.lat - cLat);
      const bb = Math.atan2(b.lng - cLng, b.lat - cLat);
      return aa - bb;
    });
  };

  const normalizePoints = (pts: LatLng[]) => {
    const out: LatLng[] = [];
    for (const p of pts) {
      const prev = out[out.length - 1];
      if (!prev) {
        out.push(p);
        continue;
      }
      const d = distanceMeters(prev, p);
      if (Number.isFinite(d) && d < Math.max(0, minPointDistanceM)) continue;
      out.push(p);
    }
    return out;
  };

  const captureGpsPoint = async () => {
    if (capturingGps) return;
    if (!("geolocation" in navigator)) {
      toast.error("GPS is not available on this device/browser.");
      return;
    }
    if (!window.isSecureContext) {
      toast.error("GPS requires HTTPS. Open the app on https:// and try again.");
      return;
    }
    setCapturingGps(true);
    try {
      const best = await new Promise<GeolocationPosition>((resolve, reject) => {
        const target = Math.max(5, gpsAccuracyTargetM || 0);
        let bestPos: GeolocationPosition | null = null;
        const startedAt = Date.now();
        const timeoutMs = 20000;
        const watchId = navigator.geolocation.watchPosition(
          (p) => {
            const acc = Number(p.coords.accuracy);
            if (!bestPos) bestPos = p;
            else {
              const bestAcc = Number(bestPos.coords.accuracy);
              if (Number.isFinite(acc) && (!Number.isFinite(bestAcc) || acc < bestAcc)) bestPos = p;
            }
            if (Number.isFinite(acc) && acc <= target) {
              navigator.geolocation.clearWatch(watchId);
              resolve(p);
              return;
            }
            if (Date.now() - startedAt > timeoutMs) {
              navigator.geolocation.clearWatch(watchId);
              if (bestPos) resolve(bestPos);
              else reject(new Error("GPS timeout. Try again."));
            }
          },
          (err) => {
            navigator.geolocation.clearWatch(watchId);
            reject(err);
          },
          { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
        );
      });

      const lat = Number(best.coords.latitude);
      const lng = Number(best.coords.longitude);
      const acc = Number(best.coords.accuracy);

      if (!Number.isFinite(lat) || !Number.isFinite(lng))
        throw new Error("GPS returned invalid coordinates.");
      if (!Number.isFinite(acc)) throw new Error("GPS did not provide accuracy. Try again.");
      if (acc > Math.max(10, gpsAccuracyTargetM || 0)) {
        throw new Error(
          `GPS accuracy is too low (~${Math.round(acc)}m). Move outside, turn on GPS, and try again.`,
        );
      }

      setPolygon((prev) => {
        const next = normalizePoints([...prev, { lat, lng }]);
        const prevLast = prev[prev.length - 1];
        const last = next[next.length - 1];
        if (!last) return prev;
        if (prevLast && distanceMeters(prevLast, last) < Math.max(0, minPointDistanceM))
          return prev;
        return next;
      });

      toast.success("Point captured", { description: `Accuracy ~${Math.round(acc)}m` });
    } catch (e) {
      const msg =
        e && typeof e === "object" && "code" in e
          ? (() => {
              const code = (e as { code?: number }).code;
              if (code === 1) return "Permission denied. Allow location access and try again.";
              if (code === 2) return "Location unavailable. Move to open area and try again.";
              if (code === 3) return "GPS timeout. Try again.";
              return "Could not get GPS location. Try again.";
            })()
          : e instanceof Error
            ? e.message
            : "Could not get GPS location. Try again.";
      toast.error(msg);
    } finally {
      setCapturingGps(false);
    }
  };

  const undoLastPoint = () => {
    setPolygon((prev) => prev.slice(0, -1));
  };

  const clearPoints = () => {
    setPolygon([]);
  };

  const convertSitePlan = useMutation({
    mutationFn: async () => {
      const lines = sitePlanText
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (!lines.length) throw new Error("Paste site plan coordinates first.");

      const fromToPairs: Array<{ from: [number, number]; to: [number, number] }> = [];
      const singlePairs: Array<[number, number]> = [];

      for (const line of lines) {
        const nums = (line.match(/-?\d+(?:\.\d+)?/g) ?? [])
          .map((s) => Number(s))
          .filter((n) => Number.isFinite(n));
        const candidates = nums.filter((n) => Math.abs(n) >= 100000);
        if (candidates.length >= 4) {
          const a1 = candidates[0]!;
          const b1 = candidates[1]!;
          const a2 = candidates[2]!;
          const b2 = candidates[3]!;
          const from: [number, number] = [Math.max(a1, b1), Math.min(a1, b1)];
          const to: [number, number] = [Math.max(a2, b2), Math.min(a2, b2)];
          fromToPairs.push({ from, to });
        } else if (candidates.length >= 2) {
          const a = candidates[0]!;
          const b = candidates[1]!;
          singlePairs.push([Math.max(a, b), Math.min(a, b)]);
        }
      }

      const pointsEn: Array<[number, number]> = [];

      if (fromToPairs.length > 0) {
        pointsEn.push(fromToPairs[0]!.from);
        for (const row of fromToPairs) pointsEn.push(row.to);
      } else {
        pointsEn.push(...singlePairs);
      }

      const deduped: Array<[number, number]> = [];
      for (const p of pointsEn) {
        const prev = deduped[deduped.length - 1];
        if (!prev || prev[0] !== p[0] || prev[1] !== p[1]) deduped.push(p);
      }

      const cleaned =
        deduped.length >= 2 &&
        deduped[0]![0] === deduped[deduped.length - 1]![0] &&
        deduped[0]![1] === deduped[deduped.length - 1]![1]
          ? deduped.slice(0, -1)
          : deduped;

      if (cleaned.length < 3) throw new Error("Need at least 3 unique points to form a boundary.");

      const distancesFromCenter = (() => {
        const avgE = cleaned.reduce((s, p) => s + p[0], 0) / cleaned.length;
        const avgN = cleaned.reduce((s, p) => s + p[1], 0) / cleaned.length;
        const ds = cleaned.map((p) => Math.hypot(p[0] - avgE, p[1] - avgN));
        const sorted = [...ds].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
        const max = sorted[sorted.length - 1] ?? 0;
        return { ds, median, max };
      })();

      const filtered = (() => {
        const { ds, median } = distancesFromCenter;
        const threshold = Math.max(2000, median * 10);
        const keep: Array<[number, number]> = [];
        for (let i = 0; i < cleaned.length; i++) {
          if ((ds[i] ?? 0) <= threshold) keep.push(cleaned[i]!);
        }
        return keep.length >= 3
          ? { points: keep, dropped: cleaned.length - keep.length }
          : { points: cleaned, dropped: 0 };
      })();

      const { data, error } = await supabase.rpc(
        "ghana_grid_points_to_wgs84" as never,
        {
          points: filtered.points,
        } as never,
      );
      if (error) throw error;

      const outRaw = (data as unknown as Array<[number, number]>).map(([lng, lat]) => ({
        lat: Number(lat),
        lng: Number(lng),
      }));

      const out = (() => {
        const pts =
          outRaw.length >= 2 &&
          outRaw[0]!.lat === outRaw[outRaw.length - 1]!.lat &&
          outRaw[0]!.lng === outRaw[outRaw.length - 1]!.lng
            ? outRaw.slice(0, -1)
            : outRaw;
        const cLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
        const cLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;
        return [...pts].sort((a, b) => {
          const aa = Math.atan2(a.lng - cLng, a.lat - cLat);
          const bb = Math.atan2(b.lng - cLng, b.lat - cLat);
          return aa - bb;
        });
      })();

      if (out.length < 3) throw new Error("Conversion returned too few points.");
      setPolygon(normalizePoints(out));
      setSitePlanOpen(false);
      toast.success("Coordinates converted", {
        description:
          filtered.dropped > 0
            ? `${normalizePoints(out).length} points loaded. Ignored ${filtered.dropped} far point(s).`
            : `${normalizePoints(out).length} points loaded.`,
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importBoundaryFile = async (file: File) => {
    try {
      const geo = await parseBoundaryFile(file);
      const ring = geo.coordinates[0] ?? [];
      const points = ring.map(([lng, lat]) => ({ lat: Number(lat), lng: Number(lng) }));
      const cleaned =
        points.length >= 2 &&
        points[0].lat === points[points.length - 1].lat &&
        points[0].lng === points[points.length - 1].lng
          ? points.slice(0, -1)
          : points;
      if (cleaned.length < 3) throw new Error("Imported boundary needs at least 3 points.");
      const normalized = normalizePoints(cleaned);
      setPolygon(normalized);
      toast.success("Coordinates imported", { description: `${normalized.length} points loaded.` });
      navigate({ search: (prev) => ({ ...prev, tab: "map" }) });
    } catch (e) {
      toast.error("Import failed", {
        description: e instanceof Error ? e.message : "Could not read boundary file.",
      });
    } finally {
      if (boundaryFileRef.current) boundaryFileRef.current.value = "";
    }
  };

  const savePolygon = useMutation({
    mutationFn: async () => {
      if (polygon.length < 3) throw new Error("Draw at least 3 points");
      const minPts = Math.max(3, expectedPoints || 0);
      if (polygon.length < minPts)
        throw new Error(`Capture at least ${minPts} point(s) before saving`);
      const { error: delErr } = await supabase
        .from("land_coordinates")
        .delete()
        .eq("land_id", landId);
      if (delErr) throw delErr;
      const ordered = autoOrderPoints
        ? orderByAngle(normalizePoints(polygon))
        : normalizePoints(polygon);
      if (ordered.length < 3) throw new Error("Too few valid points after cleanup.");
      const rows = ordered.map((p, i) => ({
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
  const photosRef = useRef<HTMLInputElement | null>(null);
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

  const uploadPhotos = useMutation({
    mutationFn: async (files: File[]) => {
      if (!files.length) return;
      let failed = 0;
      for (const file of files) {
        if (!file.type.startsWith("image/")) {
          failed++;
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          failed++;
          continue;
        }
        const path = `lands/${landId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("land-documents")
          .upload(path, file, { contentType: file.type });
        if (upErr) {
          failed++;
          continue;
        }
        const { error: docErr } = await supabase.from("documents").insert({
          land_id: landId,
          kind: "other",
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: user?.id,
        });
        if (docErr) failed++;
      }
      if (failed > 0) throw new Error(`${failed} photo(s) failed to upload.`);
    },
    onSuccess: () => {
      toast.success("Photos uploaded");
      qc.invalidateQueries({ queryKey: ["land-docs", landId] });
      if (photosRef.current) photosRef.current.value = "";
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

  const docs = documents.data ?? [];
  const photoDocs = docs.filter((d) => (d.mime_type ?? "").startsWith("image/"));
  const otherDocs = docs.filter((d) => !(d.mime_type ?? "").startsWith("image/"));

  const photoUrls = useQuery<Record<string, string>>({
    queryKey: ["land-photo-urls", landId, photoDocs.map((d) => d.storage_path).join("|")],
    enabled: photoDocs.length > 0,
    queryFn: async () => {
      const out: Record<string, string> = {};
      await Promise.all(
        photoDocs.map(async (d) => {
          const { data, error } = await supabase.storage
            .from("land-documents")
            .createSignedUrl(d.storage_path, 60 * 60);
          if (!error && data?.signedUrl) out[d.storage_path] = data.signedUrl;
        }),
      );
      return out;
    },
  });

  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerIndex, setPhotoViewerIndex] = useState(0);
  const [photoCarouselApi, setPhotoCarouselApi] = useState<CarouselApi | null>(null);

  const photoSlides = photoDocs.map((d) => ({
    id: d.id,
    name: d.file_name,
    url: photoUrls.data?.[d.storage_path] ?? null,
  }));

  useEffect(() => {
    if (!photoViewerOpen) return;
    if (!photoCarouselApi) return;
    photoCarouselApi.scrollTo(photoViewerIndex, true);
  }, [photoViewerOpen, photoViewerIndex, photoCarouselApi]);

  useEffect(() => {
    if (!photoCarouselApi) return;
    const onSelect = () => setPhotoViewerIndex(photoCarouselApi.selectedScrollSnap());
    onSelect();
    photoCarouselApi.on("select", onSelect);
    return () => {
      photoCarouselApi.off("select", onSelect);
    };
  }, [photoCarouselApi]);

  const center: LatLng = {
    lat: form.gps_lat ? Number(form.gps_lat) : 5.7167,
    lng: form.gps_lng ? Number(form.gps_lng) : 0.117,
  };
  const polygonForEditor = autoOrderPoints
    ? orderByAngle(normalizePoints(polygon))
    : normalizePoints(polygon);

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

      <Tabs
        value={search.tab ?? "info"}
        onValueChange={(v) => navigate({ search: (prev) => ({ ...prev, tab: v }) })}
        className="mt-4"
      >
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="info" className="shrink-0">
            Information
          </TabsTrigger>
          <TabsTrigger value="map" className="shrink-0">
            Coordinates
          </TabsTrigger>
          <TabsTrigger value="docs" className="shrink-0">
            Documents
          </TabsTrigger>
          <TabsTrigger value="history" className="shrink-0">
            Ownership history
          </TabsTrigger>
          <TabsTrigger value="bills" className="shrink-0">
            Bills
          </TabsTrigger>
          <TabsTrigger value="staff" className="shrink-0">
            Assigned staff
          </TabsTrigger>
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
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs text-muted-foreground">
                  Walk to each corner of the land and capture a point (4–6 points). When you have at
                  least 3 points, the app will connect them into a polygon.
                </div>
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Points</Label>
                    <Input
                      type="number"
                      min={3}
                      max={20}
                      value={expectedPoints}
                      className="h-9 w-20"
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setExpectedPoints(Number.isFinite(v) ? v : 4);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Accuracy (m)</Label>
                    <Input
                      type="number"
                      min={5}
                      max={200}
                      value={gpsAccuracyTargetM}
                      className="h-9 w-24"
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setGpsAccuracyTargetM(Number.isFinite(v) ? v : 25);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Min dist (m)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={50}
                      value={minPointDistanceM}
                      className="h-9 w-20"
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setMinPointDistanceM(Number.isFinite(v) ? v : 3);
                      }}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={autoOrderPoints} onCheckedChange={setAutoOrderPoints} />
                    <span className="text-xs text-muted-foreground">Auto-order</span>
                  </div>
                  <Input
                    ref={boundaryFileRef}
                    type="file"
                    accept=".kml,.geojson,.json,.csv,.txt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void importBoundaryFile(f);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => boundaryFileRef.current?.click()}
                  >
                    Import coordinates
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setSitePlanOpen(true)}>
                    Site plan coordinates
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void captureGpsPoint()}
                    disabled={capturingGps}
                  >
                    {capturingGps ? "Capturing…" : "Capture GPS point"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={undoLastPoint}
                    disabled={polygon.length === 0 || capturingGps}
                  >
                    Undo last
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={clearPoints}
                    disabled={polygon.length === 0 || capturingGps}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              {coords.isLoading ? (
                <Skeleton className="h-72 w-full rounded-md" />
              ) : (
                <PolygonEditor
                  initial={polygonForEditor}
                  center={center}
                  onChange={(pts) => setPolygon(normalizePoints(pts))}
                  minPolygonPoints={Math.max(3, expectedPoints || 0)}
                />
              )}
              <Dialog open={sitePlanOpen} onOpenChange={setSitePlanOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Site plan coordinates (Ghana National Grid)</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-2">
                    <div className="text-sm text-muted-foreground">
                      Paste coordinates from the site plan. The app supports either one point per
                      line (E/N or N/E) or full table rows (FROM and TO coordinates). Values are
                      treated as Ghana National Grid (EPSG:2136) and converted to GPS lat/lng.
                    </div>
                    <Textarea
                      rows={10}
                      value={sitePlanText}
                      onChange={(e) => setSitePlanText(e.target.value)}
                      placeholder={`Example (one point per line)\n1277595.85 386665.09\n1277639.63 386733.33\n1277731.38 386657.28\n1277690.50 386588.45`}
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setSitePlanOpen(false)}
                        disabled={convertSitePlan.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={() => convertSitePlan.mutate()}
                        disabled={convertSitePlan.isPending}
                      >
                        {convertSitePlan.isPending ? "Converting…" : "Convert & load"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
              <div className="flex items-center gap-3">
                <Button
                  onClick={() => savePolygon.mutate()}
                  disabled={
                    savePolygon.isPending ||
                    polygonForEditor.length < Math.max(3, expectedPoints || 0)
                  }
                >
                  {savePolygon.isPending ? "Saving…" : "Save polygon"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {polygonForEditor.length}/{Math.max(3, expectedPoints || 0)} points
                </p>
              </div>
              {polygon.length > 0 ? (
                <div className="rounded-md border border-border bg-background p-3">
                  <div className="mb-2 text-xs font-medium text-muted-foreground">
                    Captured points
                  </div>
                  <div className="grid gap-1 text-xs">
                    {polygon.map((p, i) => (
                      <div key={`${p.lat}-${p.lng}-${i}`} className="flex justify-between">
                        <span className="text-muted-foreground">#{i + 1}</span>
                        <span className="font-mono">
                          {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Photos & documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
                <div className="text-sm font-medium">Land photos</div>
                <div className="flex items-center gap-2">
                  <Input
                    ref={photosRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      if (files.length) uploadPhotos.mutate(files);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => photosRef.current?.click()}
                    disabled={uploadPhotos.isPending}
                  >
                    <Upload className="mr-1 h-4 w-4" />
                    {uploadPhotos.isPending ? "Uploading…" : "Add photos"}
                  </Button>
                </div>
              </div>

              {photoDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No land photos yet.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {photoDocs.map((d) => {
                    const url = photoUrls.data?.[d.storage_path];
                    return (
                      <div key={d.id} className="group relative overflow-hidden rounded-md border">
                        <button
                          type="button"
                          className="block w-full"
                          onClick={() => {
                            const idx = photoDocs.findIndex((p) => p.id === d.id);
                            setPhotoViewerIndex(Math.max(0, idx));
                            setPhotoViewerOpen(true);
                          }}
                        >
                          {url ? (
                            <img
                              src={url}
                              alt={d.file_name}
                              className="h-32 w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-32 items-center justify-center bg-muted text-xs text-muted-foreground">
                              Loading…
                            </div>
                          )}
                        </button>
                        <div className="flex items-center justify-between gap-2 border-t bg-background px-2 py-1">
                          <div className="min-w-0">
                            <p className="truncate text-[11px]">{d.file_name}</p>
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() =>
                              deleteDoc.mutate({ id: d.id, storage_path: d.storage_path })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <Dialog open={photoViewerOpen} onOpenChange={setPhotoViewerOpen}>
                <DialogContent className="max-w-5xl p-0">
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <div className="text-sm font-medium">
                      Photos{" "}
                      <span className="text-muted-foreground">
                        ({photoSlides.length ? photoViewerIndex + 1 : 0}/{photoSlides.length})
                      </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setPhotoViewerOpen(false)}>
                      Close
                    </Button>
                  </div>
                  <div className="relative bg-black">
                    <Carousel
                      className="mx-auto w-full"
                      setApi={(api) => setPhotoCarouselApi(api)}
                      opts={{ loop: false }}
                    >
                      <CarouselContent className="ml-0">
                        {photoSlides.map((p) => (
                          <CarouselItem key={p.id} className="pl-0">
                            <div className="flex h-[70vh] w-full items-center justify-center">
                              {p.url ? (
                                <img
                                  src={p.url}
                                  alt={p.name}
                                  className="h-full w-full object-contain"
                                />
                              ) : (
                                <div className="text-sm text-white/80">Loading…</div>
                              )}
                            </div>
                          </CarouselItem>
                        ))}
                      </CarouselContent>
                      <CarouselPrevious className="left-4 text-white hover:text-white" />
                      <CarouselNext className="right-4 text-white hover:text-white" />
                    </Carousel>
                  </div>
                </DialogContent>
              </Dialog>

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

              {otherDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
              ) : (
                <ul className="divide-y">
                  {otherDocs.map((d) => (
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
