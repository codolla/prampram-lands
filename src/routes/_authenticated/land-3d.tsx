import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Map as MapIcon, Globe2 } from "lucide-react";
import { formatArea } from "@/lib/boundary";

export const Route = createFileRoute("/_authenticated/land-3d")({
  component: Land3DPage,
});

interface LandRow {
  id: string;
  land_code: string;
  status: string;
  area_sqm: number | null;
  boundary_type: "survey" | "drawn" | null;
  ownerName: string | null;
  ring: [number, number][]; // [lng, lat][]
}

function Land3DPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<unknown>(null);
  const [selected, setSelected] = useState<LandRow | null>(null);

  const lands = useQuery({
    queryKey: ["lands-3d"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lands")
        .select(
          "id, land_code, status, area_sqm, boundary_type, landowners:current_owner_id(full_name), land_coordinates(seq, lat, lng)",
        );
      if (error) throw error;
      return data;
    },
  });

  const rows: LandRow[] = useMemo(() => {
    if (!lands.data) return [];
    const out: LandRow[] = [];
    for (const l of lands.data) {
      const coords = (
        (l.land_coordinates as { seq: number; lat: number; lng: number }[] | null) ?? []
      )
        .slice()
        .sort((a, b) => a.seq - b.seq);
      if (coords.length < 3) continue;
      out.push({
        id: l.id,
        land_code: l.land_code,
        status: String(l.status),
        area_sqm: l.area_sqm == null ? null : Number(l.area_sqm),
        boundary_type: (l.boundary_type as "survey" | "drawn" | null) ?? null,
        ownerName: (l.landowners as { full_name?: string } | null)?.full_name ?? null,
        ring: coords.map((c) => [Number(c.lng), Number(c.lat)] as [number, number]),
      });
    }
    return out;
  }, [lands.data]);

  // Init Cesium viewer (lazy import — Cesium is large + browser-only)
  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    let cancelled = false;

    (async () => {
      const Cesium = await import("cesium");
      // Inject Cesium widgets CSS once
      if (!document.getElementById("cesium-widgets-css")) {
        const link = document.createElement("link");
        link.id = "cesium-widgets-css";
        link.rel = "stylesheet";
        link.href = "https://cdn.jsdelivr.net/npm/cesium@1.140.0/Build/Cesium/Widgets/widgets.css";
        document.head.appendChild(link);
      }
      // Use a CDN base URL so Cesium can find its own assets/workers
      (
        window as unknown as { CESIUM_BASE_URL?: string }
      ).CESIUM_BASE_URL = "https://cdn.jsdelivr.net/npm/cesium@1.140.0/Build/Cesium/";
      if (cancelled || !containerRef.current) return;

      const viewer = new Cesium.Viewer(containerRef.current, {
        baseLayer: Cesium.ImageryLayer.fromProviderAsync(
          Promise.resolve(
            new Cesium.OpenStreetMapImageryProvider({
              url: "https://a.tile.openstreetmap.org/",
            }),
          ),
        ),
        terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        baseLayerPicker: false,
        geocoder: false,
        homeButton: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        timeline: false,
        animation: false,
        infoBox: false,
        selectionIndicator: false,
      });
      viewerRef.current = viewer;

      // Center on Ghana
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-1.0, 7.95, 1_500_000),
      });

      // Click handler
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
      handler.setInputAction((click: unknown) => {
        const ev = click as { position: import("cesium").Cartesian2 };
        const picked = viewer.scene.pick(ev.position);
        if (picked && picked.id && picked.id.properties?.landId) {
          const id = picked.id.properties.landId.getValue() as string;
          const row = rowsRef.current.find((r) => r.id === id) ?? null;
          setSelected(row);
          if (row) {
            viewer.flyTo(picked.id, { duration: 1.2 });
          }
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    })();

    return () => {
      cancelled = true;
      const v = viewerRef.current as { destroy?: () => void } | null;
      v?.destroy?.();
      viewerRef.current = null;
    };
  }, []);

  // Keep latest rows accessible to the click handler without re-binding it
  const rowsRef = useRef<LandRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Render polygons whenever rows change
  useEffect(() => {
    const viewer = viewerRef.current as
      | {
          entities: {
            removeAll: () => void;
            add: (e: unknown) => unknown;
          };
          flyTo: (
            target: unknown,
            opts?: { duration?: number },
          ) => Promise<boolean>;
        }
      | null;
    if (!viewer || rows.length === 0) return;
    let cancelled = false;

    (async () => {
      const Cesium = await import("cesium");
      if (cancelled) return;
      viewer.entities.removeAll();
      const allCarts: unknown[] = [];
      for (const r of rows) {
        const flat: number[] = [];
        for (const [lng, lat] of r.ring) {
          flat.push(lng, lat);
        }
        const isSurvey = r.boundary_type === "survey";
        const color =
          r.status === "disputed"
            ? Cesium.Color.fromCssColorString("#b91c1c")
            : r.status === "leased"
              ? Cesium.Color.fromCssColorString("#b45309")
              : Cesium.Color.fromCssColorString("#15803d");
        const entity = viewer.entities.add({
          name: r.land_code,
          properties: { landId: r.id },
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
            material: color.withAlpha(0.35),
            outline: true,
            outlineColor: color,
            height: 0,
            extrudedHeight: isSurvey ? 6 : 3,
          },
        });
        allCarts.push(entity);
      }
      // Fit camera to all entities
      if (allCarts.length) {
        viewer.flyTo(allCarts, { duration: 1.5 }).catch(() => {});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rows]);

  return (
    <AppShell title="3D land viewer">
      <div className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted-foreground">
              Solid extruded parcels are <strong>survey</strong> boundaries; lower extrusions are <strong>drawn</strong> approximations. Click a parcel for details.
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate({ to: "/land-mapping" })}>
                <MapIcon /> 2D mapping
              </Button>
              {selected && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const url = `${window.location.origin}/api/public/lands/${selected.id}/kml`;
                    window.open(
                      `https://earth.google.com/web/?url=${encodeURIComponent(url)}`,
                      "_blank",
                      "noopener,noreferrer",
                    );
                  }}
                >
                  <Globe2 /> Open in Google Earth
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            {lands.isLoading ? (
              <Skeleton className="h-[70vh] w-full rounded-md" />
            ) : (
              <div ref={containerRef} className="h-[70vh] w-full overflow-hidden rounded-md border border-border" />
            )}
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardContent className="grid gap-2 p-4 text-sm sm:grid-cols-2">
              <div><span className="text-muted-foreground">Land code:</span> <strong>{selected.land_code}</strong></div>
              <div><span className="text-muted-foreground">Owner:</span> {selected.ownerName ?? "—"}</div>
              <div><span className="text-muted-foreground">Status:</span> {selected.status}</div>
              <div><span className="text-muted-foreground">Source:</span> {selected.boundary_type ?? "—"}</div>
              <div><span className="text-muted-foreground">Area:</span> {formatArea(selected.area_sqm)}</div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}