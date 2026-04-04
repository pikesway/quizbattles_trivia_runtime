/*
  # Fix Remaining Function Search Path Issue

  1. Problem
    - is_trivia_admin() without arguments still has mutable search_path
    - This version is used in some RLS policies

  2. Solution
    - Set explicit search_path on the no-args version
    - Ensure both overloads are secured

  3. Security Impact
    - Prevents search_path attacks on both function signatures
*/

-- Fix is_trivia_admin (no arguments version)
CREATE OR REPLACE FUNCTION is_trivia_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trivia_admin_users
    WHERE auth_user_id = auth.uid()
    AND is_active = true
  );
$$;

-- Ensure the version with arguments is also properly secured
CREATE OR REPLACE FUNCTION is_trivia_admin(user_uuid UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM trivia_admin_users
    WHERE auth_user_id = user_uuid
      AND is_active = true
      AND role IN ('super_admin', 'admin', 'content_editor')
  );
END;
$$;
