DROP POLICY IF EXISTS "land_coords read scoped" ON public.land_coordinates;

CREATE POLICY "land_coords read scoped"
  ON public.land_coordinates FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.has_role(auth.uid(), 'finance'::app_role)
    OR public.has_role(auth.uid(), 'frontdesk'::app_role)
    OR (public.has_role(auth.uid(), 'staff'::app_role)
        AND public.is_staff_assigned_to_land(auth.uid(), land_id))
  );
