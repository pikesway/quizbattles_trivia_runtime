/*
  # Add Anonymous Read Access for Trivia Shells (Test Preview)

  ## Overview
  This migration adds a RLS policy to allow anonymous users to read trivia_shells.
  This is required for the mobile test preview feature where users scan a QR code
  and play a test quiz without being authenticated.

  ## Security Changes
  - Adds SELECT policy for anonymous users on trivia_shells table
  - Policy allows reading any shell to support test token-based preview links
  
  ## Why This Is Safe
  - Shells contain configuration data, not sensitive user data
  - The test token system already validates access via trivia_test_tokens table
  - This only grants read access, not write access
  - Production gameplay already uses similar patterns via edge functions
*/

-- Allow anonymous users to read shells for test preview functionality
CREATE POLICY "Anonymous users can read shells for test preview"
  ON trivia_shells
  FOR SELECT
  TO anon
  USING (true);
