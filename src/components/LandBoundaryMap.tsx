import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import type { GeoJSONPolygon, LngLat } from "@/lib/boundary";
import { ringCenter } from "@/lib/boundary";

export interface LandFeature {
  id: string;
  landCode: string;
  ownerName: string | null;
  status: string;
  areaSqm: number | null;
  boundaryType: "survey" | "drawn" | null;
  ring: LngLat[]; // [lng, lat][]
}

export function LandBoundaryMap({
  features,
  draftPolygon,
  drawingEnabled,
  onDraftChange,
  onSelectLand,
  selectedLandId,
}: {
  features: LandFeature[];
  draftPolygon?: GeoJSONPolygon | null;
  drawingEnabled?: boolean;
  onDraftChange?: (polygon: GeoJSONPolygon | null, areaSqm: number) => void;
  onSelectLand?: (id: string) => void;
  selectedLandId?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const featuresLayerRef = useRef<L.FeatureGroup | null>(null);
  const draftLayerRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control | null>(null);

  // init
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView([5.7167, 0.117], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    featuresLayerRef.current = new L.FeatureGroup().addTo(map);
    draftLayerRef.current = new L.FeatureGroup().addTo(map);
    mapRef.current = map;

    let raf = 0;
    const ro =
      "ResizeObserver" in window
        ? new ResizeObserver(() => {
            cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => {
              map.invalidateSize();
            });
          })
        : null;
    if (ro && containerRef.current) ro.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // render features
  useEffect(() => {
    const map = mapRef.current;
    const group = featuresLayerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    const all: L.LatLngExpression[] = [];
    for (const f of features) {
      const isSurvey = f.boundaryType === "survey";
      const isSelected = f.id === selectedLandId;
      const color =
        f.status === "disputed" ? "#b91c1c" : f.status === "leased" ? "#b45309" : "#15803d";
      const poly = L.polygon(
        f.ring.map(([lng, lat]) => [lat, lng] as [number, number]),
        {
          color,
          weight: isSelected ? 4 : 2,
          dashArray: isSurvey ? undefined : "6 6",
          fillOpacity: isSelected ? 0.35 : 0.18,
        },
      ).bindPopup(
        `<strong>${f.landCode}</strong><br/>` +
          `Owner: ${f.ownerName ?? "—"}<br/>` +
          `Status: ${f.status}<br/>` +
          (f.areaSqm ? `Area: ${f.areaSqm.toFixed(1)} m²<br/>` : "") +
          `Source: ${f.boundaryType ?? "—"}`,
      );
      poly.on("click", () => onSelectLand?.(f.id));
      poly.addTo(group);
      f.ring.forEach(([lng, lat]) => all.push([lat, lng]));
    }
    if (all.length && !drawingEnabled) {
      map.fitBounds(L.latLngBounds(all), { padding: [30, 30], maxZoom: 18 });
    }
  }, [features, selectedLandId, drawingEnabled, onSelectLand]);

  // draft polygon (passive render of survey upload preview)
  useEffect(() => {
    const map = mapRef.current;
    const group = draftLayerRef.current;
    if (!map || !group) return;
    group.clearLayers();
    if (!draftPolygon) return;
    const ring = draftPolygon.coordinates[0];
    const poly = L.polygon(
      ring.map(([lng, lat]) => [lat, lng] as [number, number]),
      { color: "#2563eb", weight: 3, fillOpacity: 0.2 },
    ).addTo(group);
    map.fitBounds(poly.getBounds(), { padding: [30, 30], maxZoom: 19 });
  }, [draftPolygon]);

  // draw control
  useEffect(() => {
    const map = mapRef.current;
    const draftGroup = draftLayerRef.current;
    if (!map || !draftGroup) return;

    if (drawingEnabled && !drawControlRef.current) {
      const DrawCtor = (L.Control as unknown as { Draw: new (opts: unknown) => L.Control }).Draw;
      const control = new DrawCtor({
        edit: { featureGroup: draftGroup },
        draw: {
          polygon: { allowIntersection: false, showArea: true },
          marker: false,
          circle: false,
          circlemarker: false,
          polyline: false,
          rectangle: false,
        },
      });
      map.addControl(control);
      drawControlRef.current = control;

      const emit = () => {
        const layers = draftGroup.getLayers();
        const last = layers[layers.length - 1] as L.Polygon | undefined;
        if (!last) {
          onDraftChange?.(null, 0);
          return;
        }
        const ll = last.getLatLngs() as L.LatLng[][];
        const ring: LngLat[] = (ll[0] ?? []).map((p) => [p.lng, p.lat]);
        // close it
        if (ring.length >= 3) {
          const first = ring[0];
          const last2 = ring[ring.length - 1];
          if (first[0] !== last2[0] || first[1] !== last2[1]) ring.push([first[0], first[1]]);
        }
        const polygon: GeoJSONPolygon = { type: "Polygon", coordinates: [ring] };
        // approx area via leaflet-geometryutil-free fallback: use simple formula in boundary helpers
        // import lazily to avoid cycle:
        import("@/lib/boundary").then(({ approximateAreaSqm }) => {
          onDraftChange?.(polygon, approximateAreaSqm(ring));
        });
      };

      const onCreated = (e: unknown) => {
        const ev = e as { layer: L.Layer };
        draftGroup.clearLayers();
        draftGroup.addLayer(ev.layer);
        emit();
      };
      map.on("draw:created", onCreated);
      map.on("draw:edited", emit);
      map.on("draw:deleted", emit);
      return () => {
        map.off("draw:created", onCreated);
        map.off("draw:edited", emit);
        map.off("draw:deleted", emit);
      };
    }

    if (!drawingEnabled && drawControlRef.current) {
      map.removeControl(drawControlRef.current);
      drawControlRef.current = null;
      draftGroup.clearLayers();
    }
  }, [drawingEnabled, onDraftChange]);

  // recenter on draft
  useEffect(() => {
    if (!draftPolygon || !mapRef.current) return;
    const c = ringCenter(draftPolygon.coordinates[0]);
    mapRef.current.setView([c.lat, c.lng], 17);
  }, [draftPolygon]);

  return (
    <div
      ref={containerRef}
      className="relative z-0 h-[70vh] w-full rounded-md border border-border"
    />
  );
}
