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
import { toast } from "sonner";

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

type ViewerLike = {
  entities: { removeAll: () => void; add: (e: unknown) => unknown };
  flyTo: (target: unknown, opts?: { duration?: number }) => Promise<boolean>;
  camera: { setView: (opts: { destination: unknown }) => void };
  canvas: HTMLCanvasElement;
  scene: { pick: (position: unknown) => unknown };
  resize: () => void;
};

function Land3DPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<unknown>(null);
  const [selected, setSelected] = useState<LandRow | null>(null);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [viewerReady, setViewerReady] = useState(false);

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
    let handler: unknown = null;
    let ro: ResizeObserver | null = null;
    let rafId = 0;
    let renderRafId = 0;
    const suppressSceneRequired = (msg: string) => msg.toLowerCase().includes("scene is required");
    const onWindowError = (event: ErrorEvent) => {
      const msg = event.error instanceof Error ? event.error.message : String(event.message);
      if (!suppressSceneRequired(msg)) return;
      event.preventDefault();
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const msg = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
      if (!suppressSceneRequired(msg)) return;
      event.preventDefault();
    };
    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    (async () => {
      const baseUrl = "https://cdn.jsdelivr.net/npm/cesium@1.140.0/Build/Cesium/";
      (window as unknown as { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = baseUrl;

      const Cesium = await import("cesium");
      const buildModuleUrl = (Cesium as unknown as { buildModuleUrl?: unknown }).buildModuleUrl as
        | { setBaseUrl?: (url: string) => void }
        | undefined;
      buildModuleUrl?.setBaseUrl?.(baseUrl);

      // Inject Cesium widgets CSS once
      if (!document.getElementById("cesium-widgets-css")) {
        const link = document.createElement("link");
        link.id = "cesium-widgets-css";
        link.rel = "stylesheet";
        link.href = `${baseUrl}Widgets/widgets.css`;
        document.head.appendChild(link);
      }
      if (cancelled || !containerRef.current) return;

      const supportsWebgl = (Cesium as unknown as { FeatureDetection?: unknown })
        .FeatureDetection as
        | { supportsWebgl?: () => boolean; supportsWebgl2?: () => boolean }
        | undefined;
      const webglOk =
        typeof supportsWebgl?.supportsWebgl === "function"
          ? supportsWebgl.supportsWebgl()
          : typeof supportsWebgl?.supportsWebgl2 === "function"
            ? supportsWebgl.supportsWebgl2()
            : true;
      if (!webglOk) throw new Error("WebGL is not supported on this device/browser.");

      const viewer = new Cesium.Viewer(containerRef.current, {
        baseLayer: new Cesium.ImageryLayer(
          new Cesium.UrlTemplateImageryProvider({
            url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            subdomains: ["a", "b", "c"],
          }),
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
        scene3DOnly: true,
      });
      viewerRef.current = viewer;
      viewer.useDefaultRenderLoop = false;

      setViewerError(null);
      setViewerReady(true);
      // Center on Ghana
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(-1.0, 7.95, 1_500_000),
      });

      const render = () => {
        if (cancelled) return;
        const v = viewerRef.current as { isDestroyed?: () => boolean; render?: () => void } | null;
        if (!v || (v.isDestroyed && v.isDestroyed())) return;
        try {
          v.render?.();
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.toLowerCase().includes("scene is required")) throw e;
        }
        renderRafId = requestAnimationFrame(render);
      };
      renderRafId = requestAnimationFrame(render);

      // Click handler
      handler = new Cesium.ScreenSpaceEventHandler(viewer.canvas);
      (
        handler as { setInputAction: (fn: (click: unknown) => void, type: unknown) => void }
      ).setInputAction((click: unknown) => {
        if (cancelled) return;
        const v = viewerRef.current as {
          isDestroyed?: () => boolean;
          scene?: { pick: (pos: unknown) => unknown };
          flyTo?: (target: unknown, opts: unknown) => Promise<boolean>;
        } | null;
        if (!v || !v.scene || (v.isDestroyed && v.isDestroyed())) return;

        try {
          const ev = click as { position: import("cesium").Cartesian2 };
          const picked = v.scene.pick(ev.position) as
            | { id?: { properties?: { landId?: { getValue: () => string } } } }
            | undefined;
          if (picked && picked.id && picked.id.properties?.landId) {
            const id = picked.id.properties.landId.getValue() as string;
            const row = rowsRef.current.find((r) => r.id === id) ?? null;
            setSelected(row);
            if (row) {
              v.flyTo?.(picked.id, { duration: 1.2 })?.catch(() => {});
            }
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.toLowerCase().includes("scene is required")) return;
          throw e;
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

      ro =
        "ResizeObserver" in window
          ? new ResizeObserver(() => {
              if (cancelled) return;
              const v = viewerRef.current as {
                isDestroyed?: () => boolean;
                resize?: () => void;
              } | null;
              if (v && (!v.isDestroyed || !v.isDestroyed())) {
                v.resize?.();
              }
            })
          : null;
      ro?.observe(containerRef.current);
      rafId = requestAnimationFrame(() => {
        if (cancelled) return;
        const v = viewerRef.current as {
          isDestroyed?: () => boolean;
          resize?: () => void;
        } | null;
        if (v && (!v.isDestroyed || !v.isDestroyed())) {
          v.resize?.();
        }
      });
    })().catch((e: unknown) => {
      if (cancelled) return;
      const maybeMsg = e instanceof Error ? e.message : String(e);
      if (maybeMsg.toLowerCase().includes("scene is required")) return;
      const msg =
        e instanceof Error ? e.message : "Failed to initialize the 3D viewer. Check console.";
      setViewerError(msg);
      setViewerReady(false);
      toast.error(msg);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      cancelAnimationFrame(renderRafId);
      ro?.disconnect();
      ro = null;
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      (handler as { destroy?: () => void; isDestroyed?: () => boolean } | null)?.destroy?.();
      const v = viewerRef.current as {
        destroy?: () => void;
        isDestroyed?: () => boolean;
        useDefaultRenderLoop?: boolean;
        clock?: { shouldAnimate?: boolean };
        camera?: { cancelFlight?: () => void };
      } | null;
      if (v && (!v.isDestroyed || !v.isDestroyed())) {
        v.camera?.cancelFlight?.();
        if (v.clock) v.clock.shouldAnimate = false;
        v.useDefaultRenderLoop = false;
        v.destroy?.();
      }
      viewerRef.current = null;
      setViewerReady(false);
    };
  }, []);

  // Keep latest rows accessible to the click handler without re-binding it
  const rowsRef = useRef<LandRow[]>([]);
  useEffect(() => {
    rowsRef.current = rows;
  }, [rows]);

  // Render polygons whenever rows change
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const Cesium = await import("cesium");
      if (cancelled) return;
      const viewer = viewerRef.current as (ViewerLike & { isDestroyed?: () => boolean }) | null;
      if (!viewer || (viewer.isDestroyed && viewer.isDestroyed())) return;

      viewer.entities.removeAll();
      if (rows.length === 0) return;

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
        try {
          viewer.flyTo(allCarts, { duration: 1.5 }).catch(() => {});
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.toLowerCase().includes("scene is required")) return;
          throw e;
        }
      }
    })().catch((e: unknown) => {
      if (cancelled) return;
      const v = viewerRef.current as { isDestroyed?: () => boolean } | null;
      if (!v || (v.isDestroyed && v.isDestroyed())) return;
      const msg = e instanceof Error ? e.message : "Failed to render parcels in 3D.";
      if (msg.toLowerCase().includes("scene is required")) return;
      setViewerError(msg);
      toast.error(msg);
    });

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
              Solid extruded parcels are <strong>survey</strong> boundaries; lower extrusions are{" "}
              <strong>drawn</strong> approximations. Click a parcel for details.
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
          <CardContent className="p-3 relative">
            {viewerError && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-md border border-border bg-background/80 p-6 text-sm text-muted-foreground backdrop-blur-sm m-3">
                {viewerError}
              </div>
            )}
            {(lands.isLoading || !viewerReady) && !viewerError && (
              <Skeleton className="absolute inset-0 z-10 m-3 rounded-md" />
            )}
            <div
              ref={containerRef}
              className="h-[70vh] w-full overflow-hidden rounded-md border border-border"
            />
          </CardContent>
        </Card>

        {selected && (
          <Card>
            <CardContent className="grid gap-2 p-4 text-sm sm:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Land code:</span>{" "}
                <strong>{selected.land_code}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Owner:</span> {selected.ownerName ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Status:</span> {selected.status}
              </div>
              <div>
                <span className="text-muted-foreground">Source:</span>{" "}
                {selected.boundary_type ?? "—"}
              </div>
              <div>
                <span className="text-muted-foreground">Area:</span> {formatArea(selected.area_sqm)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
