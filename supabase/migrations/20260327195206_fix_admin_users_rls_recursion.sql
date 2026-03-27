/*
  # Fix Admin Users RLS Recursion

  1. Changes
    - Create a security definer function to check admin status without triggering RLS
    - Replace recursive RLS policies on trivia_admin_users with non-recursive versions
    - Update policies on trivia_test_tokens, trivia_test_sessions, and trivia_test_session_answers
      to use the new function

  2. Security
    - Function is SECURITY DEFINER to bypass RLS when checking admin status
    - This prevents infinite recursion when policies reference trivia_admin_users
*/

-- Create security definer function to check if current user is an active admin
CREATE OR REPLACE FUNCTION is_trivia_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trivia_admin_users
    WHERE auth_user_id = auth.uid()
    AND is_active = true
  );
$$;

-- Create security definer function to check if current user is an admin with 'admin' role
CREATE OR REPLACE FUNCTION is_trivia_admin_role()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trivia_admin_users
    WHERE auth_user_id = auth.uid()
    AND role = 'admin'
    AND is_active = true
  );
$$;

-- Drop existing policies on trivia_admin_users
DROP POLICY IF EXISTS "Users can read own admin profile" ON trivia_admin_users;
DROP POLICY IF EXISTS "Admins can read all admin users" ON trivia_admin_users;
DROP POLICY IF EXISTS "Admins can insert admin users" ON trivia_admin_users;
DROP POLICY IF EXISTS "Admins can update admin users" ON trivia_admin_users;
DROP POLICY IF EXISTS "Admins can delete admin users" ON trivia_admin_users;

-- Recreate policies using the security definer function
CREATE POLICY "Users can read own admin profile"
  ON trivia_admin_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

CREATE POLICY "Admins can read all admin users"
  ON trivia_admin_users
  FOR SELECT
  TO authenticated
  USING (is_trivia_admin_role());

CREATE POLICY "Admins can insert admin users"
  ON trivia_admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (is_trivia_admin_role());

CREATE POLICY "Admins can update admin users"
  ON trivia_admin_users
  FOR UPDATE
  TO authenticated
  USING (is_trivia_admin_role())
  WITH CHECK (is_trivia_admin_role());

CREATE POLICY "Admins can delete admin users"
  ON trivia_admin_users
  FOR DELETE
  TO authenticated
  USING (is_trivia_admin_role());

-- Update policies on trivia_test_tokens
DROP POLICY IF EXISTS "Admins can manage test tokens" ON trivia_test_tokens;

CREATE POLICY "Admins can manage test tokens"
  ON trivia_test_tokens
  FOR ALL
  TO authenticated
  USING (is_trivia_admin())
  WITH CHECK (is_trivia_admin());

-- Update policies on trivia_test_sessions  
DROP POLICY IF EXISTS "Admins can manage test sessions" ON trivia_test_sessions;

CREATE POLICY "Admins can manage test sessions"
  ON trivia_test_sessions
  FOR ALL
  TO authenticated
  USING (is_trivia_admin())
  WITH CHECK (is_trivia_admin());

-- Update policies on trivia_test_session_answers
DROP POLICY IF EXISTS "Admins can manage test answers" ON trivia_test_session_answers;

CREATE POLICY "Admins can manage test answers"
  ON trivia_test_session_answers
  FOR ALL
  TO authenticated
  USING (is_trivia_admin())
  WITH CHECK (is_trivia_admin());
