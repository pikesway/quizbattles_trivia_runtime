/*
  # Strategic Index Cleanup

  1. Analysis Summary
    - Application is in MVP stage with limited production queries
    - Many indexes were created speculatively for future features
    - Foreign key indexes MUST be kept (prevent table locks)
    - Query filter indexes should be kept for common WHERE clauses

  2. Indexes Being Removed (Genuinely Unused)
    - slug index: No slug-based queries in codebase
    - topic index: No topic filtering in queries
    - source_batch index: No batch filtering in queries
    - webhook source/timestamp: No webhook filtering in queries
    - test session indexes: Minimal test usage

  3. Indexes Being Kept (Essential or Likely Needed)
    - Foreign key indexes: Prevent table locks
    - Status indexes: Used in admin filtering
    - Session/campaign indexes: Used in runtime queries
    - Email indexes: Used for admin user lookup

  4. Strategy
    - Remove confirmed unused indexes
    - Keep indexes that support common query patterns
    - Can always add back if needed
*/

-- Remove truly unused indexes (no queries use these columns for filtering)
DROP INDEX IF EXISTS idx_trivia_shells_slug;
DROP INDEX IF EXISTS idx_trivia_shells_topic;
DROP INDEX IF EXISTS idx_trivia_questions_source_batch;
DROP INDEX IF EXISTS idx_trivia_webhook_logs_source;
DROP INDEX IF EXISTS idx_trivia_webhook_logs_timestamp;
DROP INDEX IF EXISTS idx_test_sessions_shell_id;
DROP INDEX IF EXISTS idx_test_sessions_token_id;

-- KEEP but document the following indexes as essential:
-- idx_trivia_questions_is_active: Used for public question queries
-- idx_trivia_game_sessions_status: Used for session management
-- idx_trivia_session_answers_session_id: FK index (CRITICAL for joins)
-- idx_trivia_game_sessions_campaign: Used for campaign analytics
-- idx_trivia_shells_status: Used in admin filtering
-- idx_trivia_shells_visibility: Used for public shell queries
-- idx_trivia_shell_question_links_shell: FK index (CRITICAL for joins)
-- idx_trivia_shell_question_links_question: FK index (CRITICAL for joins)
-- idx_trivia_import_batches_status: Used in admin import tracking
-- idx_trivia_import_batches_source: Used in admin source filtering
-- idx_trivia_question_reviews_question: FK index (CRITICAL for joins)
-- idx_trivia_question_reviews_reviewer: Used for reviewer workload queries
-- idx_trivia_campaign_question_sets_instance: Used for campaign resolution
-- idx_trivia_game_sessions_shell: FK index (CRITICAL for joins)
-- idx_trivia_admin_users_email: Used for admin authentication
-- idx_end_screen_cases_shell_id: FK index (CRITICAL for joins)
-- idx_trivia_instance_overrides_campaign_id: Used for override resolution
-- idx_trivia_campaign_question_sets_shell_id: FK index we just added
-- idx_trivia_webhook_logs_batch_id: FK index we just added

COMMENT ON INDEX idx_trivia_session_answers_session_id IS 
  'CRITICAL: Foreign key index prevents table locks on session answer inserts';

COMMENT ON INDEX idx_trivia_shell_question_links_shell IS 
  'CRITICAL: Foreign key index prevents table locks on question link operations';

COMMENT ON INDEX idx_trivia_shell_question_links_question IS 
  'CRITICAL: Foreign key index prevents table locks on question link operations';
