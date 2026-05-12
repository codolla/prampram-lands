import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";

export interface LngLatRing {
  lng: number;
  lat: number;
}

interface ExistingZone {
  id: string;
  name: string;
  ring: LngLatRing[];
  active: boolean;
  highlight?: boolean;
}

/**
 * Map editor for staff zones. Shows existing zones (read-only colored polygons)
 * and lets the user draw / edit a single new polygon, emitted as a lng/lat ring.
 */
export function ZoneMapEditor({
  initial,
  existingZones,
  center = { lat: 5.7167, lng: 0.117 },
  onChange,
}: {
  initial: LngLatRing[];
  existingZones: ExistingZone[];
  center?: { lat: number; lng: number };
  onChange: (ring: LngLatRing[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const editLayerRef = useRef<L.FeatureGroup | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView([center.lat, center.lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    editLayerRef.current = drawn;

    if (initial.length >= 3) {
      const poly = L.polygon(
        initial.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#0d7a5f" },
      );
      drawn.addLayer(poly);
      map.fitBounds(poly.getBounds(), { padding: [20, 20] });
    }

    const DrawCtor = (L.Control as unknown as { Draw: new (opts: unknown) => L.Control }).Draw;
    const drawControl = new DrawCtor({
      edit: { featureGroup: drawn },
      draw: {
        polygon: { allowIntersection: false, showArea: true },
        marker: false,
        circle: false,
        circlemarker: false,
        polyline: false,
        rectangle: false,
      },
    });
    map.addControl(drawControl);

    const emit = () => {
      const layers = drawn.getLayers();
      const last = layers[layers.length - 1] as L.Polygon | undefined;
      if (!last) {
        onChangeRef.current([]);
        return;
      }
      const ll = last.getLatLngs() as L.LatLng[][];
      const ring = ll[0] ?? [];
      onChangeRef.current(ring.map((p) => ({ lat: p.lat, lng: p.lng })));
    };

    map.on("draw:created", (e: unknown) => {
      const ev = e as { layer: L.Layer };
      drawn.clearLayers();
      drawn.addLayer(ev.layer);
      emit();
    });
    map.on("draw:edited", emit);
    map.on("draw:deleted", emit);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render existing zones as a non-editable underlay
  const overlayRef = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    overlayRef.current?.remove();
    const group = L.layerGroup().addTo(map);
    overlayRef.current = group;

    const allBounds: L.LatLngExpression[] = [];
    for (const z of existingZones) {
      if (z.ring.length < 3) continue;
      const latlngs = z.ring.map((p) => [p.lat, p.lng] as [number, number]);
      const color = z.highlight ? "#0d7a5f" : z.active ? "#3b6fa0" : "#94a3b8";
      const poly = L.polygon(latlngs, {
        color,
        weight: z.highlight ? 3 : 2,
        fillOpacity: z.highlight ? 0.25 : 0.1,
        dashArray: z.active ? undefined : "4 4",
        interactive: false,
      }).bindTooltip(z.name, { sticky: true });
      group.addLayer(poly);
      latlngs.forEach((p) => allBounds.push(p));
    }

    if (allBounds.length && initial.length < 3) {
      map.fitBounds(L.latLngBounds(allBounds), { padding: [30, 30] });
    }
  }, [existingZones, initial.length]);

  return (
    <div ref={containerRef} className="relative z-0 h-120 w-full rounded-md border border-border" />
  );
}
