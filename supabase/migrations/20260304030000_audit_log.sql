-- ============================================================================
-- Audit Log: track all CRM data changes
-- ============================================================================

CREATE TABLE public.audit_log (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    table_name text NOT NULL,
    record_id bigint NOT NULL,
    action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    old_data jsonb,
    new_data jsonb,
    changed_by bigint REFERENCES sales(id),
    changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_table_record_idx ON public.audit_log (table_name, record_id);
CREATE INDEX audit_log_changed_at_idx ON public.audit_log (changed_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read the audit log
CREATE POLICY "audit_log_select" ON public.audit_log
    FOR SELECT TO authenticated USING (true);

-- Only service_role can insert (via trigger)
CREATE POLICY "audit_log_insert" ON public.audit_log
    FOR INSERT TO authenticated WITH CHECK (false);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

-- ─── Audit Trigger Function ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.audit_trigger_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sales_id bigint;
BEGIN
  -- Try to get the current user's sales_id
  BEGIN
    SELECT id INTO v_sales_id FROM public.sales WHERE user_id = auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_sales_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), v_sales_id);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), v_sales_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_log (table_name, record_id, action, old_data, changed_by)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), v_sales_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ─── Attach triggers to core tables ──────────────────────────────────

CREATE TRIGGER audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER audit_companies
  AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER audit_deals
  AFTER INSERT OR UPDATE OR DELETE ON deals
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER audit_tasks
  AFTER INSERT OR UPDATE OR DELETE ON tasks
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER audit_contact_notes
  AFTER INSERT OR UPDATE OR DELETE ON contact_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();

CREATE TRIGGER audit_deal_notes
  AFTER INSERT OR UPDATE OR DELETE ON deal_notes
  FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_fn();
