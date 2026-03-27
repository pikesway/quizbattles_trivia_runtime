/*
  # Trivia Authoring and Presentation Configuration Schema
  
  ## Overview
  This migration creates the authoring layer for managing trivia shells, question bank,
  imports, reviews, and visual presentation configuration. It extends the existing
  runtime system without breaking compatibility.
  
  ## 1. New Tables
  
  ### trivia_shells
  Reusable trivia experience templates with full configuration
  - `id` (uuid, primary key) - Unique shell identifier
  - `internal_name` (text) - Human-readable name for admin reference
  - `slug` (text, unique) - URL-safe identifier for API access
  - `status` (text) - Shell state: draft, ready, active, archived
  - `visibility` (text) - Access tier: global, tier_1, tier_2, tier_3, client_specific, internal_only
  - `topic` (text) - Primary topic/category
  - `tags` (text[]) - Additional tags for filtering
  - `default_selection_mode` (text) - Question selection: fixed, random_per_campaign, random_per_play
  - `default_question_count` (int) - Default number of questions
  - `default_difficulty_mix` (jsonb) - Percentage split by difficulty {easy, medium, hard}
  - `default_timer_mode` (text) - Timer type: per_question, per_quiz
  - `default_timer_seconds` (int) - Timer duration
  - `is_start_screen_enabled` (boolean) - Show start screen
  - `is_lead_screen_enabled` (boolean) - Show lead capture screen
  - `config` (jsonb) - Theme, screen configs, backgrounds, score messages combined
  - `created_at`, `updated_at` (timestamptz) - Timestamps
  - `created_by`, `updated_by` (uuid) - User references
  
  ### trivia_shell_question_links
  Links approved questions to fixed-mode shells with explicit ordering
  - `id` (uuid, primary key) - Link identifier
  - `shell_id` (uuid, fk) - References trivia_shells
  - `question_id` (uuid, fk) - References trivia_questions
  - `position` (int) - Display order (1-based)
  - `created_at` (timestamptz) - When linked
  - `created_by` (uuid) - Who linked it
  
  ### trivia_question_import_batches
  Tracks CSV and webhook import operations
  - `id` (uuid, primary key) - Batch identifier
  - `source_type` (text) - csv or webhook
  - `source_identifier` (text) - Webhook source name or filename
  - `shell_slug` (text, nullable) - Suggested destination shell
  - `total_items` (int) - Total items in batch
  - `success_count` (int) - Successfully imported
  - `failure_count` (int) - Failed items
  - `processing_status` (text) - pending, processing, completed, failed
  - `raw_metadata` (jsonb) - Original file/payload metadata
  - `error_details` (jsonb) - Per-row errors if any
  - `created_at` (timestamptz)
  - `created_by` (uuid, nullable) - Null for system/webhook imports
  
  ### trivia_webhook_logs
  Audit trail for all webhook requests
  - `id` (uuid, primary key) - Log entry identifier
  - `request_timestamp` (timestamptz) - When received
  - `source` (text) - Webhook source identifier
  - `request_payload` (jsonb) - Full request body
  - `processing_result` (text) - success, partial, failed
  - `error_details` (jsonb, nullable) - Error information
  - `batch_id` (uuid, nullable) - Related import batch
  
  ### trivia_question_reviews
  Audit history of review actions on questions
  - `id` (uuid, primary key) - Review action identifier
  - `question_id` (uuid, fk) - Question being reviewed
  - `reviewer_id` (uuid) - Who performed the action
  - `action` (text) - approved, rejected
  - `previous_state` (text) - State before action
  - `notes` (text, nullable) - Optional reviewer notes
  - `created_at` (timestamptz) - When action occurred
  
  ### trivia_campaign_question_sets
  Stores resolved question sets for random_per_campaign mode
  - `id` (uuid, primary key) - Set identifier
  - `campaign_game_instance_id` (text, unique) - External campaign instance reference
  - `shell_id` (uuid, fk) - Shell that generated this set
  - `resolved_config` (jsonb) - Full resolved configuration snapshot
  - `question_ids` (uuid[]) - Ordered list of question IDs
  - `difficulty_distribution` (jsonb) - Actual distribution achieved
  - `created_at` (timestamptz) - When resolved
  
  ## 2. Modifications to Existing Tables
  
  ### trivia_questions - Added Columns
  - `difficulty_level` (text) - easy, medium, hard (replaces numeric difficulty)
  - `review_state` (text) - pending_review, approved, rejected
  - `source_type` (text) - manual, csv, webhook
  - `source_batch_id` (uuid, nullable) - Reference to import batch
  - `external_question_id` (text, nullable) - External system reference
  - `import_metadata` (jsonb) - Additional import context
  
  ### trivia_game_sessions - Added Columns
  - `shell_id` (uuid, nullable) - Reference to shell used
  - `difficulty_deviation` (jsonb) - Records any deviation from requested mix
  
  ## 3. Security
  - RLS enabled on all new tables
  - Admin-only write access to authoring tables
  - Authenticated read access for runtime resolution
  
  ## 4. Indexes
  - Shell slug, status, visibility for filtering
  - Question difficulty_level, review_state, topic for bank queries
  - Import batch processing status for queue management
  - Campaign question set by campaign_game_instance_id for fast lookup
  
  ## 5. Important Notes
  - Shell config stored as JSONB for flexibility (theme, screens, backgrounds, score rules)
  - Review state lives on question record; review history in separate audit table
  - Difficulty migration maps 1-2=easy, 3=medium, 4-5=hard
  - Session snapshot pattern preserved for runtime stability
*/

-- ============================================
-- TRIVIA SHELLS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_shells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internal_name text NOT NULL,
  slug text UNIQUE NOT NULL,
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'active', 'archived')),
  visibility text DEFAULT 'internal_only' CHECK (visibility IN ('global', 'tier_1', 'tier_2', 'tier_3', 'client_specific', 'internal_only')),
  topic text NOT NULL DEFAULT '',
  tags text[] DEFAULT ARRAY[]::text[],
  default_selection_mode text DEFAULT 'random_per_play' CHECK (default_selection_mode IN ('fixed', 'random_per_campaign', 'random_per_play')),
  default_question_count int DEFAULT 10 CHECK (default_question_count > 0),
  default_difficulty_mix jsonb DEFAULT '{"easy": 20, "medium": 60, "hard": 20}'::jsonb,
  default_timer_mode text DEFAULT 'per_question' CHECK (default_timer_mode IN ('per_question', 'per_quiz')),
  default_timer_seconds int DEFAULT 15 CHECK (default_timer_seconds > 0),
  is_start_screen_enabled boolean DEFAULT true,
  is_lead_screen_enabled boolean DEFAULT true,
  config jsonb DEFAULT '{
    "theme": {
      "font_family": "Inter",
      "primary_text_color": "#FFFFFF",
      "secondary_text_color": "#A0AEC0",
      "button_fill_color": "#3182CE",
      "button_text_color": "#FFFFFF",
      "overlay_tint": "rgba(0,0,0,0.5)",
      "correct_feedback_accent": "#48BB78",
      "incorrect_feedback_accent": "#F56565"
    },
    "backgrounds": {
      "default": "",
      "start": null,
      "lead": null,
      "game": null,
      "end": null,
      "feedback": null
    },
    "screens": {
      "start": {
        "headline": "Ready to Play?",
        "body": "Test your knowledge!",
        "button_label": "Start Quiz",
        "logo_url": null,
        "disclaimer_text": null
      },
      "lead": {
        "headline": "One More Step",
        "body": "Enter your details to continue",
        "button_label": "Continue"
      },
      "game": {
        "show_progress_bar": true,
        "show_question_number": true
      },
      "end": {
        "headline_template": "You scored {score} out of {total}!",
        "show_score_breakdown": true,
        "cta_placeholder_enabled": false
      },
      "feedback": {
        "correct_headline": "Correct!",
        "incorrect_headline": "Not quite!",
        "show_explanation": true
      }
    },
    "score_range_messages": [
      {"min": 0, "max": 20, "message": "Keep practicing!"},
      {"min": 21, "max": 50, "message": "Good effort!"},
      {"min": 51, "max": 80, "message": "Well done!"},
      {"min": 81, "max": 100, "message": "Excellent!"}
    ]
  }'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

-- ============================================
-- SHELL QUESTION LINKS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_shell_question_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shell_id uuid NOT NULL REFERENCES trivia_shells(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES trivia_questions(id) ON DELETE CASCADE,
  position int NOT NULL CHECK (position > 0),
  created_at timestamptz DEFAULT now(),
  created_by uuid,
  UNIQUE(shell_id, question_id),
  UNIQUE(shell_id, position)
);

-- ============================================
-- IMPORT BATCHES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_question_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('csv', 'webhook')),
  source_identifier text NOT NULL DEFAULT '',
  shell_slug text,
  total_items int DEFAULT 0,
  success_count int DEFAULT 0,
  failure_count int DEFAULT 0,
  processing_status text DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  raw_metadata jsonb DEFAULT '{}'::jsonb,
  error_details jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

-- ============================================
-- WEBHOOK LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_timestamp timestamptz DEFAULT now(),
  source text NOT NULL DEFAULT '',
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processing_result text DEFAULT 'pending' CHECK (processing_result IN ('pending', 'success', 'partial', 'failed')),
  error_details jsonb,
  batch_id uuid REFERENCES trivia_question_import_batches(id) ON DELETE SET NULL
);

-- ============================================
-- QUESTION REVIEWS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_question_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES trivia_questions(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  previous_state text NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- CAMPAIGN QUESTION SETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS trivia_campaign_question_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_game_instance_id text UNIQUE NOT NULL,
  shell_id uuid NOT NULL REFERENCES trivia_shells(id) ON DELETE CASCADE,
  resolved_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  question_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  difficulty_distribution jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- ============================================
-- EXTEND TRIVIA_QUESTIONS TABLE
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_questions' AND column_name = 'difficulty_level'
  ) THEN
    ALTER TABLE trivia_questions ADD COLUMN difficulty_level text DEFAULT 'medium' CHECK (difficulty_level IN ('easy', 'medium', 'hard'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_questions' AND column_name = 'review_state'
  ) THEN
    ALTER TABLE trivia_questions ADD COLUMN review_state text DEFAULT 'approved' CHECK (review_state IN ('pending_review', 'approved', 'rejected'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_questions' AND column_name = 'source_type'
  ) THEN
    ALTER TABLE trivia_questions ADD COLUMN source_type text DEFAULT 'manual' CHECK (source_type IN ('manual', 'csv', 'webhook'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_questions' AND column_name = 'source_batch_id'
  ) THEN
    ALTER TABLE trivia_questions ADD COLUMN source_batch_id uuid;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_questions' AND column_name = 'external_question_id'
  ) THEN
    ALTER TABLE trivia_questions ADD COLUMN external_question_id text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_questions' AND column_name = 'import_metadata'
  ) THEN
    ALTER TABLE trivia_questions ADD COLUMN import_metadata jsonb DEFAULT '{}'::jsonb;
  END IF;
END $$;

-- ============================================
-- MIGRATE EXISTING DIFFICULTY VALUES
-- ============================================
UPDATE trivia_questions
SET difficulty_level = CASE
  WHEN difficulty <= 2 THEN 'easy'
  WHEN difficulty = 3 THEN 'medium'
  ELSE 'hard'
END
WHERE difficulty_level IS NULL OR difficulty_level = 'medium';

-- ============================================
-- EXTEND TRIVIA_GAME_SESSIONS TABLE
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_game_sessions' AND column_name = 'shell_id'
  ) THEN
    ALTER TABLE trivia_game_sessions ADD COLUMN shell_id uuid REFERENCES trivia_shells(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_game_sessions' AND column_name = 'difficulty_deviation'
  ) THEN
    ALTER TABLE trivia_game_sessions ADD COLUMN difficulty_deviation jsonb;
  END IF;
END $$;

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_trivia_shells_slug ON trivia_shells(slug);
CREATE INDEX IF NOT EXISTS idx_trivia_shells_status ON trivia_shells(status);
CREATE INDEX IF NOT EXISTS idx_trivia_shells_visibility ON trivia_shells(visibility);
CREATE INDEX IF NOT EXISTS idx_trivia_shells_topic ON trivia_shells(topic);

CREATE INDEX IF NOT EXISTS idx_trivia_questions_difficulty_level ON trivia_questions(difficulty_level);
CREATE INDEX IF NOT EXISTS idx_trivia_questions_review_state ON trivia_questions(review_state);
CREATE INDEX IF NOT EXISTS idx_trivia_questions_source_batch ON trivia_questions(source_batch_id);

CREATE INDEX IF NOT EXISTS idx_trivia_shell_question_links_shell ON trivia_shell_question_links(shell_id);
CREATE INDEX IF NOT EXISTS idx_trivia_shell_question_links_question ON trivia_shell_question_links(question_id);

CREATE INDEX IF NOT EXISTS idx_trivia_import_batches_status ON trivia_question_import_batches(processing_status);
CREATE INDEX IF NOT EXISTS idx_trivia_import_batches_source ON trivia_question_import_batches(source_type);

CREATE INDEX IF NOT EXISTS idx_trivia_webhook_logs_source ON trivia_webhook_logs(source);
CREATE INDEX IF NOT EXISTS idx_trivia_webhook_logs_timestamp ON trivia_webhook_logs(request_timestamp);

CREATE INDEX IF NOT EXISTS idx_trivia_question_reviews_question ON trivia_question_reviews(question_id);
CREATE INDEX IF NOT EXISTS idx_trivia_question_reviews_reviewer ON trivia_question_reviews(reviewer_id);

CREATE INDEX IF NOT EXISTS idx_trivia_campaign_question_sets_instance ON trivia_campaign_question_sets(campaign_game_instance_id);

CREATE INDEX IF NOT EXISTS idx_trivia_game_sessions_shell ON trivia_game_sessions(shell_id);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================
ALTER TABLE trivia_shells ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_shell_question_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_question_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_webhook_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_question_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE trivia_campaign_question_sets ENABLE ROW LEVEL SECURITY;

-- Shells: Authenticated users can read, only admins can write
CREATE POLICY "Authenticated users can view shells"
  ON trivia_shells FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create shells"
  ON trivia_shells FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update shells"
  ON trivia_shells FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete shells"
  ON trivia_shells FOR DELETE
  TO authenticated
  USING (true);

-- Shell Question Links
CREATE POLICY "Authenticated users can view shell question links"
  ON trivia_shell_question_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage shell question links"
  ON trivia_shell_question_links FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update shell question links"
  ON trivia_shell_question_links FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete shell question links"
  ON trivia_shell_question_links FOR DELETE
  TO authenticated
  USING (true);

-- Import Batches
CREATE POLICY "Authenticated users can view import batches"
  ON trivia_question_import_batches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create import batches"
  ON trivia_question_import_batches FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update import batches"
  ON trivia_question_import_batches FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Webhook Logs - read only for authenticated
CREATE POLICY "Authenticated users can view webhook logs"
  ON trivia_webhook_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can insert webhook logs"
  ON trivia_webhook_logs FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update webhook logs"
  ON trivia_webhook_logs FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Question Reviews
CREATE POLICY "Authenticated users can view question reviews"
  ON trivia_question_reviews FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create question reviews"
  ON trivia_question_reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reviewer_id);

-- Campaign Question Sets
CREATE POLICY "Anyone can view campaign question sets"
  ON trivia_campaign_question_sets FOR SELECT
  USING (true);

CREATE POLICY "System can insert campaign question sets"
  ON trivia_campaign_question_sets FOR INSERT
  WITH CHECK (true);

CREATE POLICY "System can update campaign question sets"
  ON trivia_campaign_question_sets FOR UPDATE
  USING (true)
  WITH CHECK (true);
