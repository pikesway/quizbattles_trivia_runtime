/*
  # Add current_question_started_at to game sessions

  1. Changes
    - Add `current_question_started_at` timestamptz column to trivia_game_sessions table
    - Used for server-side per-question timer enforcement
    - Tracks when the current question was served to the player

  2. Notes
    - This enables server-side validation of per-question timeouts
    - Column is nullable (null for first question before getNextQuestion is called)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_game_sessions' AND column_name = 'current_question_started_at'
  ) THEN
    ALTER TABLE trivia_game_sessions ADD COLUMN current_question_started_at TIMESTAMPTZ;
  END IF;
END $$;