import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

const polygonSchema = z.object({
  type: z.literal("Polygon"),
  coordinates: z.array(z.array(lngLat).min(4)).min(1),
});

const saveSchema = z.object({
  landId: z.string().uuid(),
  polygon: polygonSchema,
  boundaryType: z.enum(["survey", "drawn"]),
});

/**
 * Save a polygon boundary to a land. Calls the PostGIS RPC, which:
 * - validates the geometry (ST_IsValid / ST_MakeValid)
 * - replaces land_coordinates rows
 * - updates lands.boundary, area_sqm, boundary_type
 * RLS on lands still applies (admin/staff write).
 */
export const saveLandBoundary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: result, error } = await supabase.rpc("set_land_boundary_from_geojson", {
      _land_id: data.landId,
      // RPC expects jsonb; cast through unknown to satisfy generated Json type
      _geojson: data.polygon as unknown as never,
      _boundary_type: data.boundaryType,
    });
    if (error) {
      throw new Error(error.message);
    }
    return result as { area_sqm: number; boundary_type: string };
  });

const overlapSchema = z.object({
  polygon: polygonSchema,
  excludeLandId: z.string().uuid().optional(),
});

/** Returns lands whose boundary overlaps the supplied polygon. */
export const findOverlappingLands = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => overlapSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("find_overlapping_lands", {
      _geojson: data.polygon as unknown as never,
      _exclude_land_id: data.excludeLandId,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<{
      land_id: string;
      land_code: string;
      overlap_sqm: number;
    }>;
  });
