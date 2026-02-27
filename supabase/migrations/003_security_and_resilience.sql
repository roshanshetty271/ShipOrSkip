-- =============================================
-- Migration: Security & Resilience Fixes
--
-- 1. Lock down increment_deep_count RPC
-- 2. Add stuck-research cleanup function
-- 3. Add persistent anonymous rate limiting table
-- =============================================


-- ─── 1. Lock down increment_deep_count ───
-- Only the backend (service_role) should call this.
-- Revoking from anon/authenticated prevents browser-console abuse.
REVOKE EXECUTE ON FUNCTION increment_deep_count(UUID) FROM PUBLIC, anon, authenticated;


-- ─── 2. Stuck-research cleanup ───
-- Marks research as 'failed' if it's been "processing" for over 10 minutes.
-- Called by the backend on startup and periodically.
CREATE OR REPLACE FUNCTION cleanup_stuck_research()
RETURNS INTEGER AS $$
DECLARE
    affected INTEGER;
BEGIN
    UPDATE research
    SET status = 'failed',
        result = jsonb_build_object('error', 'Research timed out after 10 minutes')
    WHERE status = 'processing'
      AND created_at < NOW() - INTERVAL '10 minutes';

    GET DIAGNOSTICS affected = ROW_COUNT;
    RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also restrict this to service_role only
REVOKE EXECUTE ON FUNCTION cleanup_stuck_research() FROM PUBLIC, anon, authenticated;


-- ─── 3. Anonymous rate limiting table ───
-- Tracks usage by hashed IP so it persists across restarts/workers.
-- We hash IPs with SHA-256 for privacy — no raw IPs stored.
CREATE TABLE IF NOT EXISTS anon_usage (
    ip_hash TEXT PRIMARY KEY,
    fast_count INTEGER DEFAULT 0,
    deep_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- No RLS needed — this table is only accessed via service_role from the backend.
-- But enable it and add no policies so anon/authenticated can't touch it.
ALTER TABLE anon_usage ENABLE ROW LEVEL SECURITY;
