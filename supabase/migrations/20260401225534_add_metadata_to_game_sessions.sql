/*
  # Add metadata column to trivia_game_sessions

  1. Changes
    - Add `metadata` JSONB column to `trivia_game_sessions` table
    - This column will store flexible runtime data including platform integration data
    - Default value is an empty JSON object
  
  2. Purpose
    - Store platform-returned lead_id from webhook responses
    - Allow flexible storage of integration-related data without schema changes
    - Support data integrity and backward compatibility
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_game_sessions' AND column_name = 'metadata'
  ) THEN
    ALTER TABLE trivia_game_sessions 
    ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
  END IF;
END $$;
