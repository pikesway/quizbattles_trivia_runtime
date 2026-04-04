/*
  # Consolidate Multiple Permissive RLS Policies

  1. Problem
    - Multiple SELECT policies on the same table for the same role
    - PostgreSQL ORs them together, but this is confusing and redundant

  2. Solution
    - Consolidate into single policies with OR conditions where appropriate
    - Keep separation only where functionally necessary

  3. Tables Fixed
    - trivia_admin_users: Merge admin and self-view policies
    - trivia_answers: Keep separate (public vs admin have different purposes)
    - trivia_questions: Keep separate (public vs admin have different purposes)
    - trivia_instance_overrides: Merge duplicate admin policies

  4. Note
    - Some "duplicate" policies serve different purposes (public vs admin access)
    - Only consolidating truly redundant policies
*/

-- Consolidate trivia_admin_users policies
DROP POLICY IF EXISTS "Admins can read all admin users" ON trivia_admin_users;
DROP POLICY IF EXISTS "Users can read own admin profile" ON trivia_admin_users;

CREATE POLICY "Authenticated users can read admin profiles"
  ON trivia_admin_users
  FOR SELECT
  TO authenticated
  USING (
    -- Users can read their own profile
    auth_user_id = (SELECT auth.uid())
    OR
    -- Admins can read all profiles
    EXISTS (
      SELECT 1 FROM trivia_admin_users self
      WHERE self.auth_user_id = (SELECT auth.uid())
      AND self.is_active = true
      AND self.role IN ('super_admin', 'admin')
    )
  );

-- Consolidate trivia_instance_overrides policies
DROP POLICY IF EXISTS "Admin users can view instance overrides" ON trivia_instance_overrides;
DROP POLICY IF EXISTS "Admin users can manage instance overrides" ON trivia_instance_overrides;

-- Single consolidated policy for admins
CREATE POLICY "Admin users can manage instance overrides"
  ON trivia_instance_overrides
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE trivia_admin_users.auth_user_id = (SELECT auth.uid())
      AND trivia_admin_users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE trivia_admin_users.auth_user_id = (SELECT auth.uid())
      AND trivia_admin_users.role IN ('super_admin', 'admin')
    )
  );

-- Note: Keeping separate policies for trivia_answers and trivia_questions
-- These serve different purposes:
-- 1. "Anyone can view [active]" - allows anon/public runtime access
-- 2. "Admin users can manage" - allows authenticated admin full access
-- These cannot be merged as they target different roles and purposes

COMMENT ON POLICY "Anyone can view answers" ON trivia_answers IS 
  'Public runtime access - separate from admin management policy by design';

COMMENT ON POLICY "Admin users can manage answers" ON trivia_answers IS 
  'Admin full access - separate from public read policy by design';

COMMENT ON POLICY "Anyone can view active questions" ON trivia_questions IS 
  'Public runtime access - separate from admin management policy by design';

COMMENT ON POLICY "Admin users can manage questions" ON trivia_questions IS 
  'Admin full access - separate from public read policy by design';
