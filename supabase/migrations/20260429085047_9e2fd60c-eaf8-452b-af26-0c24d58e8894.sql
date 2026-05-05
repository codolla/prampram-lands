REVOKE EXECUTE ON FUNCTION public.set_land_boundary_from_geojson(uuid, jsonb, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_overlapping_lands(jsonb, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rebuild_land_boundary_from_coords(uuid) FROM PUBLIC, anon;