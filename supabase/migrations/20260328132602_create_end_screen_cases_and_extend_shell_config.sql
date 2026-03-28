/*
  # End Screen Cases System and Shell Config Extensions

  1. New Tables
    - `trivia_end_screen_cases`
      - `id` (uuid, primary key)
      - `shell_id` (uuid, foreign key to trivia_shells)
      - `min_percentage` (integer 0-100, minimum score percentage for this case)
      - `max_percentage` (integer 0-100 or null for open-ended max)
      - `message` (text, the message to display)
      - `enabled` (boolean, whether this case is active)
      - `sort_order` (integer, display ordering)
      - `share_text_override` (text, optional per-case share text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on `trivia_end_screen_cases` table
    - Add policies for authenticated admin users to manage cases

  3. Indexes
    - Index on shell_id for efficient querying
    - Unique constraint on (shell_id, sort_order)

  4. Notes
    - Percentage-based matching (0-100)
    - max_percentage = null means open-ended (100+)
    - Existing score_range_messages in shell config preserved for backward compatibility
*/

CREATE TABLE IF NOT EXISTS trivia_end_screen_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_id uuid NOT NULL REFERENCES trivia_shells(id) ON DELETE CASCADE,
  min_percentage integer NOT NULL CHECK (min_percentage >= 0 AND min_percentage <= 100),
  max_percentage integer CHECK (max_percentage IS NULL OR (max_percentage >= 0 AND max_percentage <= 100)),
  message text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  share_text_override text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_percentage_range CHECK (max_percentage IS NULL OR min_percentage <= max_percentage)
);

CREATE INDEX IF NOT EXISTS idx_end_screen_cases_shell_id ON trivia_end_screen_cases(shell_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_end_screen_cases_shell_order ON trivia_end_screen_cases(shell_id, sort_order);

ALTER TABLE trivia_end_screen_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view end screen cases"
  ON trivia_end_screen_cases
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE trivia_admin_users.auth_user_id = auth.uid()
      AND trivia_admin_users.is_active = true
    )
  );

CREATE POLICY "Admin users can insert end screen cases"
  ON trivia_end_screen_cases
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE trivia_admin_users.auth_user_id = auth.uid()
      AND trivia_admin_users.is_active = true
    )
  );

CREATE POLICY "Admin users can update end screen cases"
  ON trivia_end_screen_cases
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE trivia_admin_users.auth_user_id = auth.uid()
      AND trivia_admin_users.is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE trivia_admin_users.auth_user_id = auth.uid()
      AND trivia_admin_users.is_active = true
    )
  );

CREATE POLICY "Admin users can delete end screen cases"
  ON trivia_end_screen_cases
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE trivia_admin_users.auth_user_id = auth.uid()
      AND trivia_admin_users.is_active = true
    )
  );

CREATE OR REPLACE FUNCTION update_end_screen_cases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_end_screen_cases_updated_at ON trivia_end_screen_cases;
CREATE TRIGGER trigger_update_end_screen_cases_updated_at
  BEFORE UPDATE ON trivia_end_screen_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_end_screen_cases_updated_at();