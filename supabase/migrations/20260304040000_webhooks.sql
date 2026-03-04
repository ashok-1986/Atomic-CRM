-- ============================================================================
-- Webhooks table and delivery logic
-- ============================================================================

-- Ensure pg_net is enabled (Supabase standard for webhook delivery)
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.webhooks (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    url text NOT NULL,
    events jsonb NOT NULL, -- e.g. ["contact.created", "deal.updated"]
    active boolean NOT NULL DEFAULT true,
    created_by bigint REFERENCES sales(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

-- Admins can manage webhooks
CREATE POLICY "webhooks_admin_all" ON public.webhooks
    FOR ALL TO authenticated
    USING (public.is_admin());

-- Users can read their own webhooks
CREATE POLICY "webhooks_select_own" ON public.webhooks
    FOR SELECT TO authenticated
    USING (created_by IN (SELECT id FROM sales WHERE user_id = auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.webhooks TO authenticated;
GRANT ALL ON public.webhooks TO service_role;

-- ─── Webhook Delivery Function ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.deliver_webhooks_fn()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_name text;
  v_webhook record;
  v_payload jsonb;
BEGIN
  -- Determine event name (e.g. "contact.insert", "deal.update")
  v_event_name := lower(TG_TABLE_NAME) || '.' || lower(TG_OP);

  -- Build payload
  IF TG_OP = 'DELETE' THEN
    v_payload := jsonb_build_object(
      'event', v_event_name,
      'timestamp', now(),
      'old_record', row_to_json(OLD)
    );
  ELSE
    v_payload := jsonb_build_object(
      'event', v_event_name,
      'timestamp', now(),
      'record', row_to_json(NEW)
    );
  END IF;

  -- Find all active webhooks subscribed to this event or to all events ('*')
  FOR v_webhook IN
    SELECT url FROM public.webhooks
    WHERE active = true 
      AND (events ? v_event_name OR events ? '*')
  LOOP
    -- Use pg_net to send the HTTP POST asynchronously
    PERFORM net.http_post(
      url := v_webhook.url,
      body := v_payload,
      headers := '{"Content-Type": "application/json", "X-Webhook-Event": "' || v_event_name || '"}'::jsonb
    );
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- ─── Attach triggers to core tables ──────────────────────────────────

CREATE TRIGGER trigger_webhooks_contacts
  AFTER INSERT OR UPDATE OR DELETE ON contacts
  FOR EACH ROW EXECUTE FUNCTION public.deliver_webhooks_fn();

CREATE TRIGGER trigger_webhooks_companies
  AFTER INSERT OR UPDATE OR DELETE ON companies
  FOR EACH ROW EXECUTE FUNCTION public.deliver_webhooks_fn();

CREATE TRIGGER trigger_webhooks_deals
  AFTER INSERT OR UPDATE OR DELETE ON deals
  FOR EACH ROW EXECUTE FUNCTION public.deliver_webhooks_fn();
