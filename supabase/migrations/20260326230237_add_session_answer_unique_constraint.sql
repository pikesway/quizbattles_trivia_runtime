/*
  # Add unique constraint for session answers

  1. Changes
    - Add unique constraint on trivia_session_answers(session_id, question_id) to prevent duplicate answer submissions at the database level
    - This provides an additional layer of protection beyond the application-level check

  2. Security
    - Ensures data integrity by preventing the same question from being answered twice in a session
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trivia_session_answers_session_question_unique'
  ) THEN
    ALTER TABLE trivia_session_answers
    ADD CONSTRAINT trivia_session_answers_session_question_unique
    UNIQUE (session_id, question_id);
  END IF;
END $$;