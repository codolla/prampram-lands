import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ParcelDetailModal } from "@/components/ParcelDetailModal";
import { polygonToKML, type LngLat } from "@/lib/boundary";
import { Download, FileCode2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/map")({
  component: MapPage,
});

const STATUS_COLORS: Record<string, string> = {
  active: "#15803d",
  disputed: "#b91c1c",
  leased: "#b45309",
};

function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [openLandId, setOpenLandId] = useState<string | null>(null);
  const [exportingKml, setExportingKml] = useState(false);

  const openParcel = useCallback((landId: string) => {
    setOpenLandId((current) => (current === landId ? current : landId));
  }, []);

  const lands = useQuery({
    queryKey: ["map-lands"],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lands")
        .select(
          "id, land_code, plot_number, status, gps_lat, gps_lng, location_description, land_coordinates(seq, lat, lng)",
        );
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current).setView([5.7167, 0.117], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lands.data) return;
    const layers: L.Layer[] = [];
    const bounds: L.LatLngExpression[] = [];

    for (const l of lands.data) {
      const color = STATUS_COLORS[l.status] ?? "#15803d";
      const coords = (
        (l.land_coordinates as unknown as { seq: number; lat: number; lng: number }[]) ?? []
      )
        .slice()
        .sort((a, b) => a.seq - b.seq);
      if (coords.length >= 3) {
        const poly = L.polygon(
          coords.map((p) => [Number(p.lat), Number(p.lng)] as [number, number]),
          { color, fillOpacity: 0.25 },
        ).bindTooltip(l.land_code, { sticky: true });
        poly.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          openParcel(l.id);
        });
        poly.addTo(map);
        layers.push(poly);
        coords.forEach((p) => bounds.push([Number(p.lat), Number(p.lng)]));
      } else if (l.gps_lat && l.gps_lng) {
        const m = L.circleMarker([Number(l.gps_lat), Number(l.gps_lng)], {
          radius: 8,
          color,
          fillOpacity: 0.7,
        }).bindTooltip(l.land_code, { sticky: true });
        m.on("click", (e) => {
          L.DomEvent.stopPropagation(e);
          openParcel(l.id);
        });
        m.addTo(map);
        layers.push(m);
        bounds.push([Number(l.gps_lat), Number(l.gps_lng)]);
      }
    }

    if (bounds.length) map.fitBounds(L.latLngBounds(bounds), { padding: [30, 30] });

    return () => {
      layers.forEach((layer) => layer.remove());
    };
  }, [lands.data, openParcel]);

  const exportAllGeoJson = () => {
    if (!lands.data) return;
    const features = lands.data
      .map((l) => {
        const coords = (
          (l.land_coordinates as unknown as { seq: number; lat: number; lng: number }[]) ?? []
        )
          .slice()
          .sort((a, b) => a.seq - b.seq);
        if (coords.length < 3) return null;
        const ring: LngLat[] = coords.map((p) => [Number(p.lng), Number(p.lat)]);
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);
        return {
          type: "Feature",
          properties: {
            land_code: l.land_code,
            plot_number: l.plot_number,
            status: l.status,
          },
          geometry: { type: "Polygon", coordinates: [ring] },
        };
      })
      .filter(Boolean);
    if (features.length === 0) {
      toast.error("No parcels with boundaries to export.");
      return;
    }
    const fc = { type: "FeatureCollection", features };
    const blob = new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `parcels-${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${features.length} parcel${features.length === 1 ? "" : "s"}.`);
  };

  const exportAllKml = async () => {
    if (!lands.data || exportingKml) return;
    setExportingKml(true);
    const placemarks: string[] = [];
    try {
      const ids = lands.data.map((l) => l.id);
      const { data: bills } =
        ids.length === 0
          ? { data: [] as unknown[] }
          : await supabase
              .from("bills")
              .select("land_id, billing_year, status, amount, due_date")
              .in("land_id", ids)
              .order("billing_year", { ascending: false });

      const latestBillByLand = new Map<
        string,
        { billing_year: number; status: string; amount: number; due_date: string | null }
      >();
      for (const b of (bills ?? []) as unknown as Array<{
        land_id: string;
        billing_year: number;
        status: string;
        amount: number;
        due_date: string | null;
      }>) {
        if (!latestBillByLand.has(b.land_id)) latestBillByLand.set(b.land_id, b);
      }

      const { data: docs } =
        ids.length === 0
          ? { data: [] as unknown[] }
          : await supabase
              .from("documents")
              .select("land_id, storage_path, file_name, mime_type, created_at")
              .in("land_id", ids)
              .like("mime_type", "image/%")
              .order("created_at", { ascending: false })
              .limit(300);

      const photosByLand = new Map<string, Array<{ storage_path: string; file_name: string }>>();
      for (const d of (docs ?? []) as unknown as Array<{
        land_id: string;
        storage_path: string;
        file_name: string;
      }>) {
        const arr = photosByLand.get(d.land_id) ?? [];
        if (arr.length >= 2) continue;
        arr.push({ storage_path: d.storage_path, file_name: d.file_name });
        photosByLand.set(d.land_id, arr);
      }

      const signedUrlByPath = new Map<string, string>();
      const uniquePaths = Array.from(
        new Set(
          Array.from(photosByLand.values())
            .flat()
            .map((p) => p.storage_path),
        ),
      );
      await Promise.all(
        uniquePaths.map(async (path) => {
          const { data } = await supabase.storage
            .from("land-documents")
            .createSignedUrl(path, 60 * 60 * 24 * 7);
          if (data?.signedUrl) signedUrlByPath.set(path, data.signedUrl);
        }),
      );

      for (const l of lands.data) {
        const coords = (
          (l.land_coordinates as unknown as { seq: number; lat: number; lng: number }[]) ?? []
        )
          .slice()
          .sort((a, b) => a.seq - b.seq);
        if (coords.length < 3) continue;

        const ring: LngLat[] = coords.map((p) => [Number(p.lng), Number(p.lat)]);
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]]);

        const latestBill = latestBillByLand.get(l.id);
        const billLine = latestBill
          ? `Year ${latestBill.billing_year} · ${latestBill.status} · GHS ${Number(
              latestBill.amount,
            ).toFixed(2)}${latestBill.due_date ? ` · Due ${latestBill.due_date}` : ""}`
          : "No bills yet";

        const photos = photosByLand.get(l.id) ?? [];
        const photosHtml = photos
          .map((p) => {
            const url = signedUrlByPath.get(p.storage_path);
            if (!url) return "";
            return `<a href="${url}" target="_blank"><img src="${url}" alt="${p.file_name}" style="max-width:280px; width:280px; margin:4px 6px 0 0; border:1px solid #ddd;"/></a>`;
          })
          .filter(Boolean)
          .join("");

        const photosSection = photosHtml
          ? `<div style="margin-top:8px;"><div style="font-weight:600;">Photos</div>${photosHtml}</div>`
          : "";

        const description = `
<div>
  <div style="font-weight:700; font-size:14px;">${l.land_code}</div>
  <div>${l.plot_number ? `Plot: ${l.plot_number}<br/>` : ""}Status: ${l.status}${
    l.location_description ? `<br/>Location: ${l.location_description}` : ""
  }</div>
  <div style="margin-top:8px;">
    <div style="font-weight:600;">Latest rent bill</div>
    <div>${billLine}</div>
  </div>
  ${photosSection}
</div>
`.trim();

        const single = polygonToKML({
          name: l.land_code,
          description,
          polygon: { type: "Polygon", coordinates: [ring] },
        });
        const m = single.match(/<Placemark>[\s\S]*?<\/Placemark>/);
        if (m) placemarks.push(m[0]);
      }
      if (placemarks.length === 0) {
        toast.error("No parcels with boundaries to export.");
        return;
      }
      const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>All parcels</name>
    <Style id="landStyle_normal">
      <LineStyle><color>ff15803d</color><width>3</width></LineStyle>
      <PolyStyle><color>00ffffff</color><fill>0</fill><outline>1</outline></PolyStyle>
    </Style>
    <Style id="landStyle_highlight">
      <LineStyle><color>ff15803d</color><width>4</width></LineStyle>
      <PolyStyle><color>00ffffff</color><fill>0</fill><outline>1</outline></PolyStyle>
    </Style>
    <StyleMap id="landStyle">
      <Pair><key>normal</key><styleUrl>#landStyle_normal</styleUrl></Pair>
      <Pair><key>highlight</key><styleUrl>#landStyle_highlight</styleUrl></Pair>
    </StyleMap>
    ${placemarks.join("\n    ")}
  </Document>
</kml>`;
      const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `parcels-${new Date().toISOString().slice(0, 10)}.kml`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${placemarks.length} parcel${placemarks.length === 1 ? "" : "s"}.`);
    } finally {
      setExportingKml(false);
    }
  };

  return (
    <AppShell title="Parcel map">
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Click any parcel for full details, billing, photos, and exports.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void exportAllKml()}
                disabled={exportingKml}
              >
                <Download /> Export all (KML)
              </Button>
              <Button variant="outline" size="sm" onClick={exportAllGeoJson}>
                <FileCode2 /> Export all (GeoJSON)
              </Button>
            </div>
          </div>
          <div ref={containerRef} className="h-[70vh] w-full rounded-md border border-border" />
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <LegendDot color="#15803d" label="Active" />
            <LegendDot color="#b45309" label="Leased" />
            <LegendDot color="#b91c1c" label="Disputed" />
          </div>
        </CardContent>
      </Card>
      <ParcelDetailModal
        landId={openLandId}
        onOpenChange={(open) => !open && setOpenLandId(null)}
      />
    </AppShell>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block h-3 w-3 rounded-sm border border-border"
        style={{ backgroundColor: color, opacity: 0.4, borderColor: color }}
      />
      {label}
    </span>
  );
}
