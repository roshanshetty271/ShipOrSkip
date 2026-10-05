-- =============================================
-- Migration: One processing deep research per user
--
-- The backend checks for a processing row before starting a deep run,
-- but two requests can pass that check at the same time. This partial
-- unique index makes the database reject the second processing row.
-- The backend answers that violation with HTTP 409.
-- =============================================


-- ─── 1. Clear rows that would block the index ───
-- Time out anything stuck in processing for over 10 minutes.
SELECT cleanup_stuck_research();

-- If a user still has several processing rows, keep the newest and
-- mark the older ones failed.
UPDATE research AS older
SET status = 'failed',
    result = jsonb_build_object('error', 'Superseded by a newer research run')
WHERE older.status = 'processing'
  AND EXISTS (
      SELECT 1
      FROM research AS newer
      WHERE newer.user_id = older.user_id
        AND newer.status = 'processing'
        AND (newer.created_at, newer.id) > (older.created_at, older.id)
  );


-- ─── 2. At most one processing row per user ───
CREATE UNIQUE INDEX IF NOT EXISTS idx_research_one_processing_per_user
ON research(user_id)
WHERE status = 'processing';
