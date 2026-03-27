/*
  # Trivia Runtime Service Database Schema

  ## Overview
  This migration creates the complete database schema for the Trivia Runtime Service,
  a standalone gameplay execution engine that integrates with the BizGamez platform.

  ## 1. New Tables

  ### trivia_questions
  Stores all trivia questions with metadata for filtering and selection
  - `id` (uuid, primary key) - Unique question identifier
  - `question_text` (text) - The actual question to display
  - `explanation` (text) - Educational explanation shown after answering
  - `topic` (text) - Category or subject area for filtering
  - `tags` (text[]) - Additional tags for flexible querying
  - `difficulty` (int) - Difficulty level (1-5 scale)
  - `is_active` (boolean) - Enable/disable questions without deletion
  - `created_at` (timestamptz) - Record creation timestamp

  ### trivia_answers
  Stores all possible answers for each question
  - `id` (uuid, primary key) - Unique answer identifier
  - `question_id` (uuid, foreign key) - References trivia_questions
  - `answer_text` (text) - The answer option text
  - `is_correct` (boolean) - Flag indicating the correct answer
  - `display_order` (int) - Original ordering for fixed-mode display
  - Constraint: Exactly one correct answer per question enforced at application level

  ### trivia_game_sessions
  Manages individual gameplay sessions with complete state tracking
  - `id` (uuid, primary key) - Unique session identifier
  - `campaign_id` (text) - External campaign reference from platform
  - `campaign_game_instance_id` (text) - External game instance reference
  - `lead_id` (text, nullable) - External lead reference (platform owns leads)
  - `status` (text) - Session state: in_progress, completed, abandoned
  - `score` (int) - Current score (count of correct answers)
  - `total_questions` (int) - Total questions in this session
  - `correct_answers` (int) - Count of correct answers
  - `started_at` (timestamptz) - Session start time
  - `completed_at` (timestamptz, nullable) - Session completion time
  - `timer_mode` (text) - per_question or per_quiz
  - `timer_seconds` (int) - Timer duration in seconds
  - `question_set` (jsonb) - Immutable snapshot of questions for this session
  - `current_index` (int) - Current position in question set (0-based)

  ### trivia_session_answers
  Records each answer submitted during gameplay
  - `id` (uuid, primary key) - Unique answer record identifier
  - `session_id` (uuid, foreign key) - References trivia_game_sessions
  - `question_id` (uuid) - Question that was answered
  - `selected_answer_id` (uuid) - Answer option that was selected
  - `is_correct` (boolean) - Whether the answer was correct
  - `time_to_answer_ms` (int) - Response time in milliseconds
  - `answered_at` (timestamptz) - Timestamp of answer submission

  ## 2. Security
  - Enable RLS on all tables
  - Initial policies allow authenticated access (will be refined based on auth requirements)
  - All tables use UUID primary keys for security and scalability
  - Foreign key constraints ensure referential integrity

  ## 3. Performance
  - Indexes on foreign keys for efficient joins
  - Indexes on frequently queried fields (status, is_active)
  - JSONB for flexible config storage with GIN index support

  ## 4. Important Notes
  - This service does NOT store leads as source of truth (lead_id is external reference only)
  - question_set stored as JSONB snapshot ensures immutable gameplay
  - Timer enforcement happens server-side; these fields support that logic
  - Session state transitions are enforced at application level
*/

-- Create trivia_questions table
CREATE TABLE IF NOT EXISTS trivia_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_text text NOT NULL,
  explanation text NOT NULL DEFAULT '',
  topic text NOT NULL DEFAULT '',
  tags text[] DEFAULT ARRAY[]::text[],
  difficulty int DEFAULT 1 CHECK (difficulty >= 1 AND difficulty <= 5),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Create trivia_answers table
CREATE TABLE IF NOT EXISTS trivia_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES trivia_questions(id) ON DELETE CASCADE,
  answer_text text NOT NULL,
  is_correct boolean DEFAULT false,
  display_order int DEFAULT 0
);

-- Create trivia_game_sessions table
CREATE TABLE IF NOT EXISTS trivia_game_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id text NOT NULL,
  campaign_game_instance_id text NOT NULL,
  lead_id text,
  status text DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  score int DEFAULT 0,
  total_questions int DEFAULT 0,
  correct_answers int DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  timer_mode text DEFAULT 'per_question' CHECK (timer_mode IN ('per_question', 'per_quiz')),
  timer_seconds int DEFAULT 15,
  question_set jsonb DEFAULT '[]'::jsonb,
  current_index int DEFAULT 0
);

-- Create trivia_session_answers table
CREATE TABLE IF NOT EXISTS trivia_session_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES trivia_game_sessions(id) ON DELETE CASCADE,
  question_id uuid NOT NULL,
  selected_answer_id uuid NOT NULL,
  is_correct boolean DEFAULT false,
  time_to_answer_ms int DEFAULT 0,
  answered_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trivia_answers_question_id ON trivia_answers(question_id);
CREATE INDEX IF NOT EXISTS idx_trivia_questions_is_active ON trivia_questions(is_active);
CREATE INDEX IF NOT EXISTS idx_trivia_questions_topic ON trivia_questions(topic);
CREATE INDEX IF NOT EXISTS idx_trivia_game_sessions_status ON trivia_game_sessions(status);
CREATE INDEX IF NOT EXISTS idx_trivia_session_answers_session_id ON trivia_session_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_trivia_game_sessions_campaign ON trivia_game_sessions(campaign_id, campaign_game_instance_id);

-- Enable Row Level Security
ALTER TABLE trivia_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_session_answers ENABLE ROW LEVEL SECURITY;

-- RLS Policies for trivia_questions
CREATE POLICY "Anyone can view active questions"
  ON trivia_questions FOR SELECT
  USING (is_active = true);

CREATE POLICY "Authenticated users can manage questions"
  ON trivia_questions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for trivia_answers
CREATE POLICY "Anyone can view answers"
  ON trivia_answers FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage answers"
  ON trivia_answers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for trivia_game_sessions
CREATE POLICY "Anyone can view sessions"
  ON trivia_game_sessions FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create sessions"
  ON trivia_game_sessions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update sessions"
  ON trivia_game_sessions FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- RLS Policies for trivia_session_answers
CREATE POLICY "Anyone can view session answers"
  ON trivia_session_answers FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create session answers"
  ON trivia_session_answers FOR INSERT
  WITH CHECK (true);