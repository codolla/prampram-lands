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
  minPolygonPoints = 3,
}: {
  initial: LatLng[];
  center: LatLng;
  onChange: (points: LatLng[]) => void;
  minPolygonPoints?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.FeatureGroup | null>(null);

  const renderInitial = () => {
    const map = mapRef.current;
    const drawn = layerRef.current;
    if (!map || !drawn) return;
    drawn.clearLayers();

    if (initial.length === 0) {
      map.setView([center.lat, center.lng], 16);
      return;
    }

    const latLngs = initial.map((p) => [p.lat, p.lng] as [number, number]);
    for (const [lat, lng] of latLngs) {
      L.circleMarker([lat, lng], {
        radius: 5,
        color: "#2563eb",
        weight: 2,
        fillOpacity: 0.7,
      }).addTo(drawn);
    }

    if (latLngs.length >= Math.max(3, minPolygonPoints)) {
      const poly = L.polygon(latLngs, { color: "#15803d", weight: 3, fillOpacity: 0.2 });
      drawn.addLayer(poly);
      map.fitBounds(poly.getBounds(), { padding: [20, 20], maxZoom: 19 });
    } else if (latLngs.length >= 2) {
      const line = L.polyline(latLngs, { color: "#2563eb", weight: 3 });
      drawn.addLayer(line);
      map.fitBounds(line.getBounds(), { padding: [20, 20], maxZoom: 19 });
    } else {
      map.setView([latLngs[0][0], latLngs[0][1]], 19);
    }
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView([center.lat, center.lng], 16);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);

    const drawn = new L.FeatureGroup();
    map.addLayer(drawn);
    layerRef.current = drawn;

    mapRef.current = map;
    renderInitial();

    const DrawCtor = (
      L.Control as unknown as {
        Draw: new (opts: unknown) => L.Control;
      }
    ).Draw;
    const drawControl = new DrawCtor({
      edit: { featureGroup: drawn },
      draw: {
        polyline: { shapeOptions: { color: "#2563eb", weight: 3 }, finishOnDoubleClick: true },
        polygon: false,
        marker: false,
        circle: false,
        circlemarker: false,
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
      drawn.clearLayers();
      const latlngsRaw = (ev.layer as unknown as { getLatLngs?: () => unknown }).getLatLngs?.();
      const pts = Array.isArray(latlngsRaw)
        ? Array.isArray(latlngsRaw[0])
          ? (latlngsRaw[0] as L.LatLng[])
          : (latlngsRaw as L.LatLng[])
        : [];
      if (pts.length >= 3) {
        const poly = L.polygon(pts, { color: "#15803d", weight: 3, fillOpacity: 0.2 });
        drawn.addLayer(poly);
      }
      emit();
    });
    map.on("draw:edited", emit);
    map.on("draw:deleted", emit);

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

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    renderInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial, center.lat, center.lng]);

  return (
    <div ref={containerRef} className="relative z-0 h-105 w-full rounded-md border border-border" />
  );
}
