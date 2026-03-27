/*
  # Create Admin Users Table

  1. New Tables
    - `trivia_admin_users`
      - `id` (uuid, primary key) - Internal identifier
      - `auth_user_id` (uuid, unique) - References Supabase auth.users.id
      - `email` (text, unique) - User email for display and bootstrap verification
      - `display_name` (text) - Display name for UI
      - `role` (text) - Role: 'admin', 'editor', or 'reviewer'
      - `is_active` (boolean) - Whether account is active
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Security
    - Enable RLS on `trivia_admin_users` table
    - Policy: Users can read their own record
    - Policy: Admins can read all records
    - Policy: Admins can insert new records
    - Policy: Admins can update records
    - Policy: Admins can delete records

  3. Indexes
    - Index on `auth_user_id` for fast auth lookups
    - Index on `email` for bootstrap verification

  4. Notes
    - Role 'reviewer' included for future compatibility but not actively used in v1
    - Two-tier model for v1: admin (full access), editor (all except user management)
    - is_active must be enforced at both UI and backend layers
*/

CREATE TABLE IF NOT EXISTS trivia_admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  display_name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'editor', 'reviewer')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trivia_admin_users_auth_user_id ON trivia_admin_users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_trivia_admin_users_email ON trivia_admin_users(email);

ALTER TABLE trivia_admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own admin profile"
  ON trivia_admin_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

CREATE POLICY "Admins can read all admin users"
  ON trivia_admin_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE auth_user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
    )
  );

CREATE POLICY "Admins can insert admin users"
  ON trivia_admin_users
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE auth_user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
    )
  );

CREATE POLICY "Admins can update admin users"
  ON trivia_admin_users
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE auth_user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE auth_user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
    )
  );

CREATE POLICY "Admins can delete admin users"
  ON trivia_admin_users
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE auth_user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
    )
  );