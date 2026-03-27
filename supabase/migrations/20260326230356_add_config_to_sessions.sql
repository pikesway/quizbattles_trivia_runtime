/*
  # Add config column to game sessions

  1. Changes
    - Add `config` JSONB column to trivia_game_sessions table
    - Stores the game configuration snapshot including end_screen_rules
    - This ensures the configuration used at game start is preserved for completion

  2. Notes
    - Config is stored as immutable snapshot at session creation
    - Used by trivia-complete to retrieve end_screen_rules
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_game_sessions' AND column_name = 'config'
  ) THEN
    ALTER TABLE trivia_game_sessions ADD COLUMN config JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;