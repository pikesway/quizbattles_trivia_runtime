/*
  # Create Campaign Overrides Table

  1. New Tables
    - `trivia_campaign_overrides`
      - `campaign_id` (text, primary key) - External platform campaign identifier
      - `settings` (jsonb, not null, default '{}') - Campaign-specific override settings
      - `updated_at` (timestamptz, default now()) - Timestamp of last update

  2. Purpose
    This table serves as a landing zone for campaign-level overrides sent from the external B2B platform.
    It stores campaign-specific configurations that can override shell defaults at runtime.

  3. Security
    No RLS policies are applied to this table as it will be accessed exclusively via Edge Functions
    using the Service Role Key for webhook ingestion from the trusted external platform.

  4. Important Notes
    - This table is write-only from the platform via webhook
    - Runtime services read from this table to apply campaign-level customizations
    - Settings are stored as flexible JSONB to accommodate various override types
*/

CREATE TABLE IF NOT EXISTS trivia_campaign_overrides (
  campaign_id text PRIMARY KEY,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Index for efficient lookups during runtime
CREATE INDEX IF NOT EXISTS idx_campaign_overrides_updated_at 
  ON trivia_campaign_overrides(updated_at DESC);

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_campaign_override_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update timestamp on modification
DROP TRIGGER IF EXISTS trigger_update_campaign_override_timestamp ON trivia_campaign_overrides;
CREATE TRIGGER trigger_update_campaign_override_timestamp
  BEFORE UPDATE ON trivia_campaign_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_override_updated_at();