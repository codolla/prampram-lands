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

        const ring: LngLat[] = coords.map((p) => [Number(p.lng), Number(p.lat)]);
        const ownerName =
          (land.landowners as { full_name?: string } | null)?.full_name ?? "Unassigned";
        const description = [
          `Land code: ${land.land_code}`,
          land.plot_number ? `Plot: ${land.plot_number}` : null,
          `Owner: ${ownerName}`,
          `Status: ${land.status}`,
          land.area_sqm ? `Area: ${Number(land.area_sqm).toFixed(1)} m²` : null,
          land.boundary_type ? `Source: ${land.boundary_type}` : null,
          land.location_description ? `Location: ${land.location_description}` : null,
        ]
          .filter(Boolean)
          .join("\n");

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