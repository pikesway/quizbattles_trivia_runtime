/*
  # Add Instance Gate Fields to trivia_instance_overrides

  ## Summary
  Adds scheduling and status gate fields to the trivia_instance_overrides table
  so the Runtime can enforce access rules (draft/not-started/ended) locally
  without querying the external Platform database.

  ## Changes

  ### Modified Tables
  - `trivia_instance_overrides`
    - `status` (text, default 'active') - Gate status: 'draft', 'active', 'paused', 'ended'
    - `start_time` (timestamptz, nullable) - When this instance becomes accessible
    - `end_time` (timestamptz, nullable) - When this instance stops being accessible

  ## Notes
  1. Existing rows default to 'active' so no existing live instances are blocked
  2. Standalone instances (no override row) bypass the bouncer entirely
  3. The Platform syncs these values down via the sync-instance-override function
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_instance_overrides' AND column_name = 'status'
  ) THEN
    ALTER TABLE trivia_instance_overrides
      ADD COLUMN status text NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'active', 'paused', 'ended'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_instance_overrides' AND column_name = 'start_time'
  ) THEN
    ALTER TABLE trivia_instance_overrides
      ADD COLUMN start_time timestamptz;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'trivia_instance_overrides' AND column_name = 'end_time'
  ) THEN
    ALTER TABLE trivia_instance_overrides
      ADD COLUMN end_time timestamptz;
  END IF;
END $$;
