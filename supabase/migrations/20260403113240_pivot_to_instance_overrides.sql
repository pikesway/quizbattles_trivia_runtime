/*
  # Pivot Campaign Overrides to Instance Overrides

  1. Changes
    - DROP `trivia_campaign_overrides` table and related triggers/functions
    - CREATE `trivia_instance_overrides` table to support game instance-level overrides
  
  2. New Tables
    - `trivia_instance_overrides`
      - `instance_id` (text, primary key) - Unique game instance identifier from platform
      - `campaign_id` (text, not null) - Parent campaign identifier for grouping
      - `settings` (jsonb, not null, default '{}') - Override configuration data
      - `updated_at` (timestamptz, default now()) - Last modification timestamp
  
  3. Indexes
    - Index on `campaign_id` for efficient campaign-level queries
  
  4. Triggers
    - Auto-update `updated_at` timestamp on modifications
  
  5. Security
    - No RLS policies (accessed exclusively via Service Role Key through Edge Functions)
  
  6. Rationale
    - Single campaigns can contain multiple unique trivia instances
    - Each instance requires independent override configuration
    - Campaign-level grouping preserved via `campaign_id` field
*/

-- Drop existing campaign overrides table and trigger
DROP TRIGGER IF EXISTS update_trivia_campaign_overrides_updated_at ON trivia_campaign_overrides;
DROP FUNCTION IF EXISTS update_trivia_campaign_overrides_timestamp();
DROP TABLE IF EXISTS trivia_campaign_overrides;

-- Create instance-level overrides table
CREATE TABLE IF NOT EXISTS trivia_instance_overrides (
  instance_id text PRIMARY KEY,
  campaign_id text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- Create index on campaign_id for efficient campaign-level lookups
CREATE INDEX IF NOT EXISTS idx_trivia_instance_overrides_campaign_id 
  ON trivia_instance_overrides(campaign_id);

-- Create trigger function for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_trivia_instance_overrides_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger to table
CREATE TRIGGER update_trivia_instance_overrides_updated_at
  BEFORE UPDATE ON trivia_instance_overrides
  FOR EACH ROW
  EXECUTE FUNCTION update_trivia_instance_overrides_timestamp();