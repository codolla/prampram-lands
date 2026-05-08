import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { polygonToKML, type LngLat } from "@/lib/boundary";

export const Route = createFileRoute("/api/public/lands/$landId/kml")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const landId = params.landId;
        // basic UUID guard
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(landId)) {
          return new Response("Invalid land id", { status: 400 });
        }

        // Pull land + owner + ordered vertices
        const { data: land, error: landErr } = await supabaseAdmin
          .from("lands")
          .select(
            "id, land_code, plot_number, status, area_sqm, boundary_type, location_description, landowners:current_owner_id(full_name)",
          )
          .eq("id", landId)
          .maybeSingle();
        if (landErr || !land) return new Response("Land not found", { status: 404 });

        const { data: coords, error: coordErr } = await supabaseAdmin
          .from("land_coordinates")
          .select("seq, lat, lng")
          .eq("land_id", landId)
          .order("seq");
        if (coordErr) return new Response("Failed to load boundary", { status: 500 });
        if (!coords || coords.length < 3) {
          return new Response("This land has no boundary defined yet.", { status: 404 });
        }

        const { data: latestBill } = await supabaseAdmin
          .from("bills")
          .select("billing_year, status, amount, due_date")
          .eq("land_id", landId)
          .order("billing_year", { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: photoDocs } = await supabaseAdmin
          .from("documents")
          .select("storage_path, file_name, created_at, mime_type")
          .eq("land_id", landId)
          .like("mime_type", "image/%")
          .order("created_at", { ascending: false })
          .limit(6);

        const photoUrls = await Promise.all(
          (photoDocs ?? []).map(async (d) => {
            const { data } = await supabaseAdmin.storage
              .from("land-documents")
              .createSignedUrl(d.storage_path, 60 * 60 * 24 * 7);
            return data?.signedUrl ? { url: data.signedUrl, name: d.file_name } : null;
          }),
        );
        const photos = photoUrls.filter(Boolean) as { url: string; name: string }[];

        const ring: LngLat[] = coords.map((p) => [Number(p.lng), Number(p.lat)]);
        if (ring.length >= 3) {
          const first = ring[0];
          const last = ring[ring.length - 1];
          if (first[0] !== last[0] || first[1] !== last[1]) {
            ring.push([first[0], first[1]]);
          }
        }
        const ownerName =
          (land.landowners as { full_name?: string } | null)?.full_name ?? "Unassigned";
        const billLine = latestBill
          ? `Year ${latestBill.billing_year} · ${latestBill.status} · GHS ${Number(latestBill.amount).toFixed(2)}${
              latestBill.due_date ? ` · Due ${latestBill.due_date}` : ""
            }`
          : "No bills yet";

        const description = `
<div>
  <div style="font-weight:700; font-size:14px;">${land.land_code}</div>
  <div>${land.plot_number ? `Plot: ${land.plot_number}<br/>` : ""}Owner: ${ownerName}<br/>Status: ${land.status}${
    land.location_description ? `<br/>Location: ${land.location_description}` : ""
  }${land.area_sqm ? `<br/>Area: ${Number(land.area_sqm).toFixed(1)} m²` : ""}${
    land.boundary_type ? `<br/>Source: ${land.boundary_type}` : ""
  }</div>
  <div style="margin-top:8px;">
    <div style="font-weight:600;">Latest rent bill</div>
    <div>${billLine}</div>
  </div>
  ${
    photos.length
      ? `<div style="margin-top:8px;">
    <div style="font-weight:600;">Photos</div>
    <div>${photos
      .map(
        (p) =>
          `<a href="${p.url}" target="_blank"><img src="${p.url}" alt="${p.name}" style="max-width:280px; width:280px; margin:4px 6px 0 0; border:1px solid #ddd;"/></a>`,
      )
      .join("")}</div>
  </div>`
      : ""
  }
</div>
`.trim();

        const kml = polygonToKML({
          name: land.land_code,
          description,
          polygon: { type: "Polygon", coordinates: [ring] },
        });

        return new Response(kml, {
          status: 200,
          headers: {
            "content-type": "application/vnd.google-earth.kml+xml; charset=utf-8",
            "content-disposition": `inline; filename="${land.land_code}.kml"`,
            "cache-control": "public, max-age=60",
            "access-control-allow-origin": "*",
          },
        });
      },
    },
  },
});
