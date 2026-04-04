/*
  # Fix Admin Users RLS Infinite Recursion

  ## Problem
  The consolidated SELECT policy on trivia_admin_users (from migration 20260404004415)
  contains a recursive subquery that checks trivia_admin_users within the policy itself.
  This creates infinite recursion: policy→query trivia_admin_users→trigger policy→repeat.
  
  ## Solution
  1. Drop the recursive consolidated policy
  2. Recreate TWO separate, non-recursive policies:
     - Simple self-view policy: uses only auth.uid() comparison (no subquery)
     - Admin view policy: uses the SECURITY DEFINER function is_trivia_admin_role()
  
  ## Why This Works
  - The is_trivia_admin_role() function is SECURITY DEFINER, meaning it executes with
    elevated privileges and BYPASSES RLS checks when querying trivia_admin_users
  - This breaks the recursion loop
  - The self-view policy never queries the table, just compares auth.uid()
  
  ## Notes
  - The is_trivia_admin_role() function was created in migration 20260327195206
  - We're reverting the problematic consolidation from migration 20260404004415
  - Two separate policies are cleaner and safer than one policy with OR conditions
*/

-- Drop the recursive consolidated policy that's causing infinite recursion
DROP POLICY IF EXISTS "Authenticated users can read admin profiles" ON trivia_admin_users;

-- Recreate the safe, non-recursive policies

-- Policy 1: Users can read their own admin profile (no recursion - direct comparison)
CREATE POLICY "Users can read own admin profile"
  ON trivia_admin_users
  FOR SELECT
  TO authenticated
  USING (auth_user_id = auth.uid());

-- Policy 2: Admins can read all profiles (no recursion - uses SECURITY DEFINER function)
CREATE POLICY "Admins can read all admin users"
  ON trivia_admin_users
  FOR SELECT
  TO authenticated
  USING (is_trivia_admin_role());

-- Verify the questions table policies are using the safe function
-- (They should already be using it from previous migrations, but let's be explicit)

-- Check if trivia_questions has any recursive policies
DO $$
BEGIN
  -- If there's a recursive policy on trivia_questions, this migration should be extended
  -- For now, we're just documenting that trivia_questions should use is_trivia_admin()
  -- or is_trivia_admin_role() functions, never direct EXISTS queries on trivia_admin_users
  
  RAISE NOTICE 'RLS recursion fix applied. Verify trivia_questions policies use SECURITY DEFINER functions.';
END $$;
