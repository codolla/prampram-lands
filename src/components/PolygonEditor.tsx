import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";

export interface LatLng {
  lat: number;
  lng: number;
}

export function PolygonEditor({
  initial,
  center,
  onChange,
}: {
  initial: LatLng[];
  center: LatLng;
  onChange: (points: LatLng[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView([center.lat, center.lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    layerRef.current = drawn;

    if (initial.length >= 3) {
      const poly = L.polygon(
        initial.map((p) => [p.lat, p.lng] as [number, number]),
        { color: "#15803d" },
      );
      drawn.addLayer(poly);
      map.fitBounds(poly.getBounds(), { padding: [20, 20] });
    }

    const DrawCtor = (
      L.Control as unknown as {
        Draw: new (opts: unknown) => L.Control;
      }
    ).Draw;
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
        onChange([]);
        return;
      }
      const ll = last.getLatLngs() as L.LatLng[][];
      const ring = ll[0] ?? [];
      onChange(ring.map((p) => ({ lat: p.lat, lng: p.lng })));
    };

    map.on("draw:created", (e: unknown) => {
      const ev = e as { layer: L.Layer };
      // single polygon: clear existing first
      drawn.clearLayers();
      drawn.addLayer(ev.layer);
      emit();
    });
    map.on("draw:edited", emit);
    map.on("draw:deleted", emit);

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative z-0 h-[420px] w-full rounded-md border border-border"
    />
  );
}
