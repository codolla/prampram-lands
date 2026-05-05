import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/SearchableSelect";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Upload,
  Pencil,
  Map as MapIcon,
  Globe2,
  Box,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { parseBoundaryFile, formatArea, type GeoJSONPolygon } from "@/lib/boundary";
import { LandBoundaryMap, type LandFeature } from "@/components/LandBoundaryMap";
import { saveLandBoundary, findOverlappingLands } from "@/lib/boundary.functions";

export const Route = createFileRoute("/_authenticated/land-mapping")({
  component: LandMappingPage,
});

type Mode = "view" | "upload" | "draw";

function LandMappingPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [mode, setMode] = useState<Mode>("view");
  const [selectedLandId, setSelectedLandId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    polygon: GeoJSONPolygon | null;
    areaSqm: number;
    error: string | null;
  }>({ polygon: null, areaSqm: 0, error: null });
  const [overlaps, setOverlaps] = useState<
    Array<{ land_id: string; land_code: string; overlap_sqm: number }>
  >([]);

  const lands = useQuery({
    queryKey: ["mapping-lands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lands")
        .select(
          "id, land_code, plot_number, status, area_sqm, boundary_type, current_owner_id, landowners:current_owner_id(full_name), land_coordinates(seq, lat, lng)",
        )
        .order("land_code");
      if (error) throw error;
      return data;
    },
  });

  const features: LandFeature[] = useMemo(() => {
    if (!lands.data) return [];
    const out: LandFeature[] = [];
    for (const l of lands.data) {
      const coords = (
        (l.land_coordinates as { seq: number; lat: number; lng: number }[] | null) ?? []
      )
        .slice()
        .sort((a, b) => a.seq - b.seq);
      if (coords.length < 3) continue;
      out.push({
        id: l.id,
        landCode: l.land_code,
        ownerName: (l.landowners as { full_name?: string } | null)?.full_name ?? null,
        status: String(l.status),
        areaSqm: l.area_sqm == null ? null : Number(l.area_sqm),
        boundaryType: (l.boundary_type as "survey" | "drawn" | null) ?? null,
        ring: coords.map((c) => [Number(c.lng), Number(c.lat)] as [number, number]),
      });
    }
    return out;
  }, [lands.data]);

  const landOptions = useMemo(
    () =>
      (lands.data ?? []).map((l) => ({
        id: l.id,
        label: `${l.land_code}${l.plot_number ? ` · ${l.plot_number}` : ""}`,
      })),
    [lands.data],
  );

  const saveBoundary = useServerFn(saveLandBoundary);
  const checkOverlaps = useServerFn(findOverlappingLands);

  const checkOverlapMut = useMutation({
    mutationFn: async (polygon: GeoJSONPolygon) => {
      return checkOverlaps({
        data: { polygon, excludeLandId: selectedLandId ?? undefined },
      });
    },
    onSuccess: (rows) => setOverlaps(rows),
    onError: () => setOverlaps([]),
  });

  const saveMut = useMutation({
    mutationFn: async (args: { boundaryType: "survey" | "drawn" }) => {
      if (!selectedLandId) throw new Error("Select a land first");
      if (!draft.polygon) throw new Error("No polygon to save");
      return saveBoundary({
        data: {
          landId: selectedLandId,
          polygon: draft.polygon,
          boundaryType: args.boundaryType,
        },
      });
    },
    onSuccess: (result) => {
      toast.success(`Boundary saved (${formatArea(result.area_sqm)}).`);
      setDraft({ polygon: null, areaSqm: 0, error: null });
      setOverlaps([]);
      setMode("view");
      qc.invalidateQueries({ queryKey: ["mapping-lands"] });
      qc.invalidateQueries({ queryKey: ["map-lands"] });
      qc.invalidateQueries({ queryKey: ["land-coords", selectedLandId] });
      qc.invalidateQueries({ queryKey: ["land", selectedLandId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFile = async (file: File) => {
    setDraft({ polygon: null, areaSqm: 0, error: null });
    setOverlaps([]);
    try {
      const polygon = await parseBoundaryFile(file);
      const { approximateAreaSqm } = await import("@/lib/boundary");
      const area = approximateAreaSqm(polygon.coordinates[0]);
      setDraft({ polygon, areaSqm: area, error: null });
      checkOverlapMut.mutate(polygon);
    } catch (err) {
      setDraft({
        polygon: null,
        areaSqm: 0,
        error: err instanceof Error ? err.message : "Could not read file",
      });
    }
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setDraft({ polygon: null, areaSqm: 0, error: null });
    setOverlaps([]);
  };

  const openInGoogleEarth = () => {
    if (!selectedLandId) {
      toast.error("Select a land first");
      return;
    }
    const url = `${window.location.origin}/api/public/lands/${selectedLandId}/kml`;
    window.open(
      `https://earth.google.com/web/?url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  return (
    <AppShell title="Land mapping">
      <div className="flex flex-col gap-4">
        {/* Top controls */}
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 p-4">
            <div className="flex-1 min-w-[220px]">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Working land
              </Label>
              <SearchableSelect
                value={selectedLandId ?? undefined}
                onValueChange={(v) => setSelectedLandId(v)}
                placeholder="Choose a parcel"
                searchPlaceholder="Search parcels…"
                options={landOptions.map((o) => ({ value: o.id, label: o.label }))}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant={mode === "upload" ? "default" : "outline"}
                onClick={() => switchMode("upload")}
              >
                <Upload /> Upload survey data
              </Button>
              <Button
                variant={mode === "draw" ? "default" : "outline"}
                onClick={() => switchMode("draw")}
              >
                <Pencil /> Draw land
              </Button>
            </div>

            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                variant={mode === "view" ? "default" : "outline"}
                onClick={() => switchMode("view")}
              >
                <MapIcon /> Map view
              </Button>
              <Button variant="outline" onClick={() => navigate({ to: "/land-3d" })}>
                <Box /> 3D view
              </Button>
              <Button variant="outline" onClick={openInGoogleEarth}>
                <Globe2 /> Open in Google Earth
                <ExternalLink className="opacity-60" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Mode-specific panels */}
        {mode === "upload" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Upload survey file</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Accepts GeoJSON, KML, or CSV (lat,lng or lng,lat). Coordinates must be WGS84
                (EPSG:4326).
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".geojson,.json,.kml,.csv,.txt"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                }}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground hover:file:bg-primary/90"
              />
              {draft.error && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Could not parse file</AlertTitle>
                  <AlertDescription>{draft.error}</AlertDescription>
                </Alert>
              )}
              {draft.polygon && (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                  <div className="flex flex-wrap gap-3">
                    <span>
                      <strong>{draft.polygon.coordinates[0].length - 1}</strong> vertices
                    </span>
                    <span>
                      Approx area: <strong>{formatArea(draft.areaSqm)}</strong>
                    </span>
                    <span>
                      Source: <Badge variant="secondary">survey</Badge>
                    </span>
                  </div>
                </div>
              )}
              {overlaps.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Possible overlap with existing lands</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 list-disc pl-5">
                      {overlaps.map((o) => (
                        <li key={o.land_id}>
                          {o.land_code} — overlap {o.overlap_sqm.toFixed(1)} m²
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex justify-end">
                <Button
                  disabled={!selectedLandId || !draft.polygon || saveMut.isPending}
                  onClick={() => saveMut.mutate({ boundaryType: "survey" })}
                >
                  {saveMut.isPending ? "Saving…" : "Save as survey boundary"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {mode === "draw" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Draw boundary on map</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Use the polygon tool on the map's top-left toolbar. Click to add vertices,
                double-click to finish. Then save.
              </p>
              {draft.polygon && (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                  Live area: <strong>{formatArea(draft.areaSqm)}</strong>
                  <span className="ml-3">
                    Source: <Badge variant="secondary">drawn</Badge>
                  </span>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!draft.polygon) return;
                    checkOverlapMut.mutate(draft.polygon);
                  }}
                  disabled={!draft.polygon || checkOverlapMut.isPending}
                >
                  Check for overlaps
                </Button>
                <Button
                  disabled={!selectedLandId || !draft.polygon || saveMut.isPending}
                  onClick={() => saveMut.mutate({ boundaryType: "drawn" })}
                >
                  {saveMut.isPending ? "Saving…" : "Save drawn boundary"}
                </Button>
              </div>
              {overlaps.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Possible overlap</AlertTitle>
                  <AlertDescription>
                    <ul className="mt-1 list-disc pl-5">
                      {overlaps.map((o) => (
                        <li key={o.land_id}>
                          {o.land_code} — overlap {o.overlap_sqm.toFixed(1)} m²
                        </li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        {/* Map */}
        <Card>
          <CardContent className="p-3">
            {lands.isLoading ? (
              <Skeleton className="h-[70vh] w-full rounded-md" />
            ) : (
              <LandBoundaryMap
                features={features}
                draftPolygon={draft.polygon}
                drawingEnabled={mode === "draw"}
                onDraftChange={(polygon, areaSqm) => setDraft({ polygon, areaSqm, error: null })}
                onSelectLand={(id) => setSelectedLandId(id)}
                selectedLandId={selectedLandId}
              />
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Solid outlines are <strong>survey</strong>-grade boundaries. Dashed outlines are{" "}
              <strong>drawn</strong> approximations. Click any parcel for details.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
