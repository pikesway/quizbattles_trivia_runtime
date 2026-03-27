/*
  # Create Test Sessions and Test Tokens Tables

  1. New Tables
    - `trivia_test_tokens`
      - `id` (uuid, primary key)
      - `shell_id` (uuid, references trivia_shells)
      - `token` (text, unique) - the shareable token for test links
      - `created_at` (timestamptz)
      - `created_by` (uuid)
      - `expires_at` (timestamptz, nullable) - optional expiration
      - `is_active` (boolean) - can be revoked

    - `trivia_test_sessions`
      - `id` (uuid, primary key)
      - `shell_id` (uuid, references trivia_shells)
      - `test_token_id` (uuid, nullable, references trivia_test_tokens)
      - `status` (text) - in_progress, completed, abandoned
      - `score` (integer)
      - `total_questions` (integer)
      - `correct_answers` (integer)
      - `question_set` (jsonb) - snapshot of questions for this test
      - `config` (jsonb) - snapshot of shell config
      - `current_index` (integer)
      - `started_at` (timestamptz)
      - `completed_at` (timestamptz, nullable)

  2. Security
    - Enable RLS on both tables
    - Test tokens readable by authenticated admin users
    - Test sessions are isolated from production
*/

-- Create test tokens table
CREATE TABLE IF NOT EXISTS trivia_test_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_id uuid NOT NULL REFERENCES trivia_shells(id) ON DELETE CASCADE,
  token text UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  expires_at timestamptz,
  is_active boolean DEFAULT true
);

ALTER TABLE trivia_test_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage test tokens"
  ON trivia_test_tokens
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE auth_user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE auth_user_id = auth.uid() AND is_active = true
    )
  );

-- Allow public read for valid active tokens (for shared test links)
CREATE POLICY "Public can read active tokens"
  ON trivia_test_tokens
  FOR SELECT
  TO anon
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- Create test sessions table
CREATE TABLE IF NOT EXISTS trivia_test_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_id uuid NOT NULL REFERENCES trivia_shells(id) ON DELETE CASCADE,
  test_token_id uuid REFERENCES trivia_test_tokens(id) ON DELETE SET NULL,
  status text DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  score integer DEFAULT 0,
  total_questions integer DEFAULT 0,
  correct_answers integer DEFAULT 0,
  question_set jsonb DEFAULT '[]'::jsonb,
  config jsonb DEFAULT '{}'::jsonb,
  current_index integer DEFAULT 0,
  current_question_started_at timestamptz,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE trivia_test_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage test sessions"
  ON trivia_test_sessions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE auth_user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE auth_user_id = auth.uid() AND is_active = true
    )
  );

-- Allow anonymous users to create and update test sessions (for shared links)
CREATE POLICY "Anyone can create test sessions"
  ON trivia_test_sessions
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anyone can read own test sessions"
  ON trivia_test_sessions
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can update test sessions"
  ON trivia_test_sessions
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- Create test session answers table (isolated from production)
CREATE TABLE IF NOT EXISTS trivia_test_session_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_session_id uuid NOT NULL REFERENCES trivia_test_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  selected_answer_id uuid,
  is_correct boolean DEFAULT false,
  time_to_answer_ms integer DEFAULT 0,
  answered_at timestamptz DEFAULT now(),
  UNIQUE(test_session_id, question_id)
);

ALTER TABLE trivia_test_session_answers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage test answers"
  ON trivia_test_session_answers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE auth_user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM trivia_admin_users
      WHERE auth_user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Anyone can manage test answers for their sessions"
  ON trivia_test_session_answers
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_test_tokens_shell_id ON trivia_test_tokens(shell_id);
CREATE INDEX IF NOT EXISTS idx_test_tokens_token ON trivia_test_tokens(token);
CREATE INDEX IF NOT EXISTS idx_test_sessions_shell_id ON trivia_test_sessions(shell_id);
CREATE INDEX IF NOT EXISTS idx_test_sessions_token_id ON trivia_test_sessions(test_token_id);
