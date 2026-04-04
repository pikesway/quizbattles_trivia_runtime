/*
  # Fix All Recursive Admin RLS Policies

  ## Problem
  Multiple tables have RLS policies with direct EXISTS subqueries on trivia_admin_users.
  When these policies are evaluated, they query trivia_admin_users, which triggers RLS
  on that table, which may query trivia_admin_users again = infinite recursion.

  ## Affected Tables
  - trivia_admin_users (fixed in previous migration)
  - trivia_end_screen_cases
  - trivia_instance_overrides
  - trivia_test_tokens (should already use is_trivia_admin() from migration 20260327195206)
  - trivia_test_sessions (should already use is_trivia_admin() from migration 20260327195206)
  - trivia_test_session_answers (should already use is_trivia_admin() from migration 20260327195206)

  ## Solution
  Replace ALL direct EXISTS queries on trivia_admin_users with the SECURITY DEFINER
  functions is_trivia_admin() or is_trivia_admin_role() which bypass RLS.

  ## Functions Available (from migration 20260327195206)
  - is_trivia_admin(): checks if user is active admin (any role)
  - is_trivia_admin_role(): checks if user is active admin with 'admin' role specifically
*/

-- Fix trivia_end_screen_cases policies
DROP POLICY IF EXISTS "Authenticated users can view end screen cases" ON trivia_end_screen_cases;
DROP POLICY IF EXISTS "Authenticated users can manage end screen cases" ON trivia_end_screen_cases;
DROP POLICY IF EXISTS "Authenticated users can update end screen cases" ON trivia_end_screen_cases;
DROP POLICY IF EXISTS "Authenticated users can delete end screen cases" ON trivia_end_screen_cases;

CREATE POLICY "Authenticated users can view end screen cases"
  ON trivia_end_screen_cases
  FOR SELECT
  TO authenticated
  USING (is_trivia_admin());

CREATE POLICY "Authenticated users can manage end screen cases"
  ON trivia_end_screen_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (is_trivia_admin());

CREATE POLICY "Authenticated users can update end screen cases"
  ON trivia_end_screen_cases
  FOR UPDATE
  TO authenticated
  USING (is_trivia_admin())
  WITH CHECK (is_trivia_admin());

CREATE POLICY "Authenticated users can delete end screen cases"
  ON trivia_end_screen_cases
  FOR DELETE
  TO authenticated
  USING (is_trivia_admin());

-- Fix trivia_instance_overrides policies
DROP POLICY IF EXISTS "Admin users can manage instance overrides" ON trivia_instance_overrides;

CREATE POLICY "Admin users can manage instance overrides"
  ON trivia_instance_overrides
  FOR ALL
  TO authenticated
  USING (is_trivia_admin_role())
  WITH CHECK (is_trivia_admin_role());

-- Verify test table policies are already fixed (they should be from migration 20260327195206)
-- If they weren't fixed, fix them now

-- trivia_test_tokens
DROP POLICY IF EXISTS "Admins can manage test tokens" ON trivia_test_tokens;

CREATE POLICY "Admins can manage test tokens"
  ON trivia_test_tokens
  FOR ALL
  TO authenticated
  USING (is_trivia_admin())
  WITH CHECK (is_trivia_admin());

-- trivia_test_sessions
DROP POLICY IF EXISTS "Admins can manage test sessions" ON trivia_test_sessions;

CREATE POLICY "Admins can manage test sessions"
  ON trivia_test_sessions
  FOR ALL
  TO authenticated
  USING (is_trivia_admin())
  WITH CHECK (is_trivia_admin());

-- trivia_test_session_answers
DROP POLICY IF EXISTS "Admins can manage test answers" ON trivia_test_session_answers;

CREATE POLICY "Admins can manage test answers"
  ON trivia_test_session_answers
  FOR ALL
  TO authenticated
  USING (is_trivia_admin())
  WITH CHECK (is_trivia_admin());

-- Add comments for documentation
COMMENT ON FUNCTION is_trivia_admin() IS 
  'SECURITY DEFINER function that bypasses RLS when checking admin status. ALWAYS use this instead of direct EXISTS queries on trivia_admin_users to prevent infinite recursion.';

COMMENT ON FUNCTION is_trivia_admin_role() IS 
  'SECURITY DEFINER function that bypasses RLS when checking for admin role specifically. ALWAYS use this instead of direct EXISTS queries on trivia_admin_users to prevent infinite recursion.';
