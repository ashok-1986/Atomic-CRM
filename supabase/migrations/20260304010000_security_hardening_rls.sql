-- ============================================================================
-- Security Hardening: Rewrite all RLS policies
-- ============================================================================
-- DESIGN:
--   - All authenticated users can READ all records (shared CRM visibility)
--   - Users can only UPDATE/DELETE records assigned to them (sales_id match)
--   - Admins can UPDATE/DELETE any record
--   - Tags are shared resources (no sales_id) — any authenticated user can CRUD
--   - sales table: users can update own non-sensitive fields; only admins
--     can change administrator/disabled fields or manage other users
--   - Attachments bucket made private
-- ============================================================================

-- ============================================
-- 1. COMPANIES
-- ============================================
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON companies;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON companies;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON companies;
DROP POLICY IF EXISTS "Company Delete Policy" ON companies;

-- Read: all authenticated
CREATE POLICY "companies_select" ON companies
  FOR SELECT TO authenticated USING (true);

-- Insert: any authenticated (trigger auto-sets sales_id)
CREATE POLICY "companies_insert" ON companies
  FOR INSERT TO authenticated WITH CHECK (true);

-- Update: owner or admin
CREATE POLICY "companies_update" ON companies
  FOR UPDATE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- Delete: owner or admin
CREATE POLICY "companies_delete" ON companies
  FOR DELETE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- ============================================
-- 2. CONTACTS
-- ============================================
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON contacts;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON contacts;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON contacts;
DROP POLICY IF EXISTS "Contact Delete Policy" ON contacts;

CREATE POLICY "contacts_select" ON contacts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "contacts_insert" ON contacts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "contacts_update" ON contacts
  FOR UPDATE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "contacts_delete" ON contacts
  FOR DELETE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- ============================================
-- 3. CONTACT NOTES
-- ============================================
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON contact_notes;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON contact_notes;
DROP POLICY IF EXISTS "Contact Notes Update policy" ON contact_notes;
DROP POLICY IF EXISTS "Contact Notes Delete Policy" ON contact_notes;

CREATE POLICY "contact_notes_select" ON contact_notes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "contact_notes_insert" ON contact_notes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "contact_notes_update" ON contact_notes
  FOR UPDATE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "contact_notes_delete" ON contact_notes
  FOR DELETE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- ============================================
-- 4. DEALS
-- ============================================
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON deals;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON deals;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON deals;
DROP POLICY IF EXISTS "Deals Delete Policy" ON deals;

CREATE POLICY "deals_select" ON deals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "deals_insert" ON deals
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "deals_update" ON deals
  FOR UPDATE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  )
  WITH CHECK (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "deals_delete" ON deals
  FOR DELETE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- ============================================
-- 5. DEAL NOTES
-- ============================================
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON deal_notes;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON deal_notes;
DROP POLICY IF EXISTS "Deal Notes Update Policy" ON deal_notes;
DROP POLICY IF EXISTS "Deal Notes Delete Policy" ON deal_notes;

CREATE POLICY "deal_notes_select" ON deal_notes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "deal_notes_insert" ON deal_notes
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "deal_notes_update" ON deal_notes
  FOR UPDATE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "deal_notes_delete" ON deal_notes
  FOR DELETE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- ============================================
-- 6. TASKS
-- ============================================
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON tasks;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON tasks;
DROP POLICY IF EXISTS "Task Update Policy" ON tasks;
DROP POLICY IF EXISTS "Task Delete Policy" ON tasks;

CREATE POLICY "tasks_select" ON tasks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "tasks_insert" ON tasks
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "tasks_update" ON tasks
  FOR UPDATE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "tasks_delete" ON tasks
  FOR DELETE TO authenticated
  USING (
    sales_id IN (SELECT id FROM sales WHERE user_id = auth.uid())
    OR public.is_admin()
  );

-- ============================================
-- 7. SALES (critical: prevent privilege escalation)
-- ============================================
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON sales;
-- INSERT/UPDATE were already dropped in migration 20241104153231

-- Read: all authenticated
CREATE POLICY "sales_select" ON sales
  FOR SELECT TO authenticated USING (true);

-- Insert: only via trigger/admin (not directly by regular users)
CREATE POLICY "sales_insert" ON sales
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()    -- can only create own record
    AND administrator = false  -- cannot self-promote to admin
  );

-- Update: own profile only, cannot change sensitive fields unless admin
CREATE POLICY "sales_update" ON sales
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()    -- users can update their own record
    OR public.is_admin()    -- admins can update anyone
  )
  WITH CHECK (
    CASE
      WHEN public.is_admin() THEN true  -- admins can change anything
      ELSE (
        user_id = auth.uid()
        -- Non-admins cannot change these fields:
        AND administrator = (SELECT administrator FROM sales s WHERE s.user_id = auth.uid())
        AND disabled = (SELECT disabled FROM sales s WHERE s.user_id = auth.uid())
      )
    END
  );

-- Delete: admin only
CREATE POLICY "sales_delete" ON sales
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================
-- 8. TAGS (shared resource — keep open)
-- ============================================
-- Tags are shared across all users, no sales_id.
-- Keep existing permissive policies (already correct for shared resources).

-- ============================================
-- 9. STORAGE: Make attachments bucket private
-- ============================================
UPDATE storage.buckets SET public = false WHERE id = 'attachments';
