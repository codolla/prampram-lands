-- Activity logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "activity_logs read" ON public.activity_logs;
CREATE POLICY "activity_logs read"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
  );

CREATE OR REPLACE FUNCTION public.log_activity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor text;
  v_actor_id uuid;
  v_entity_id uuid;
  v_action text;
  v_message text;
  v_meta jsonb;
  v_new jsonb;
  v_old jsonb;
BEGIN
  v_actor := nullif(current_setting('request.jwt.claim.sub', true), '');
  v_actor_id := CASE WHEN v_actor IS NULL THEN NULL ELSE v_actor::uuid END;

  v_action := lower(TG_OP);

  v_new := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE '{}'::jsonb END;
  v_old := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE '{}'::jsonb END;

  v_entity_id := CASE
    WHEN TG_OP IN ('INSERT','UPDATE') THEN (v_new->>'id')::uuid
    ELSE (v_old->>'id')::uuid
  END;

  v_meta := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'amount', COALESCE(v_new->'amount', v_old->'amount'),
    'status', COALESCE(v_new->'status', v_old->'status'),
    'land_code', COALESCE(v_new->'land_code', v_old->'land_code'),
    'receipt_number', COALESCE(v_new->'receipt_number', v_old->'receipt_number'),
    'role', COALESCE(v_new->'role', v_old->'role')
  );

  v_message := CASE TG_TABLE_NAME
    WHEN 'payments' THEN
      CASE TG_OP
        WHEN 'INSERT' THEN 'Payment recorded'
        WHEN 'DELETE' THEN 'Payment deleted'
        ELSE 'Payment updated'
      END
    WHEN 'bills' THEN
      CASE TG_OP
        WHEN 'INSERT' THEN 'Bill created'
        WHEN 'DELETE' THEN 'Bill deleted'
        ELSE 'Bill updated'
      END
    WHEN 'lands' THEN
      CASE TG_OP
        WHEN 'INSERT' THEN 'Land registered'
        WHEN 'DELETE' THEN 'Land deleted'
        ELSE 'Land updated'
      END
    WHEN 'landowners' THEN
      CASE TG_OP
        WHEN 'INSERT' THEN 'Landowner created'
        WHEN 'DELETE' THEN 'Landowner deleted'
        ELSE 'Landowner updated'
      END
    WHEN 'sms_logs' THEN
      CASE TG_OP
        WHEN 'INSERT' THEN 'SMS dispatched'
        WHEN 'DELETE' THEN 'SMS log deleted'
        ELSE 'SMS log updated'
      END
    WHEN 'walkin_logs' THEN
      CASE TG_OP
        WHEN 'INSERT' THEN 'Walk-in logged'
        WHEN 'DELETE' THEN 'Walk-in deleted'
        ELSE 'Walk-in updated'
      END
    WHEN 'user_roles' THEN
      CASE TG_OP
        WHEN 'INSERT' THEN 'Role granted'
        WHEN 'DELETE' THEN 'Role revoked'
        ELSE 'Role updated'
      END
    ELSE TG_TABLE_NAME || ' ' || lower(TG_OP)
  END;

  INSERT INTO public.activity_logs (actor_id, action, entity, entity_id, message, metadata)
  VALUES (v_actor_id, v_action, TG_TABLE_NAME, v_entity_id, v_message, v_meta);

  RETURN NULL;
END;
$$;

-- Attach triggers to core tables
DROP TRIGGER IF EXISTS activity_log_lands ON public.lands;
CREATE TRIGGER activity_log_lands
  AFTER INSERT OR UPDATE OR DELETE ON public.lands
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS activity_log_landowners ON public.landowners;
CREATE TRIGGER activity_log_landowners
  AFTER INSERT OR UPDATE OR DELETE ON public.landowners
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS activity_log_bills ON public.bills;
CREATE TRIGGER activity_log_bills
  AFTER INSERT OR UPDATE OR DELETE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS activity_log_payments ON public.payments;
CREATE TRIGGER activity_log_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS activity_log_sms_logs ON public.sms_logs;
CREATE TRIGGER activity_log_sms_logs
  AFTER INSERT OR DELETE ON public.sms_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS activity_log_walkin_logs ON public.walkin_logs;
CREATE TRIGGER activity_log_walkin_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.walkin_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();

DROP TRIGGER IF EXISTS activity_log_user_roles ON public.user_roles;
CREATE TRIGGER activity_log_user_roles
  AFTER INSERT OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_activity();
