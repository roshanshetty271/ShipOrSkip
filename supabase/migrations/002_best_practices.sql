-- =============================================
-- Migration: Best Practices Hardening
-- Adds missing RLS policies and composite indexes
-- per Supabase Postgres best practices audit.
-- All changes are additive — no existing logic is modified.
-- =============================================


-- ─── 1. Missing RLS policies (defense-in-depth) ───

-- Allow authenticated users to delete their own research.
-- Backend already scopes deletes via service key + user_id filter,
-- but this protects against accidental anon-key misuse.
CREATE POLICY "Users can delete own research"
ON research FOR DELETE TO authenticated
USING ((SELECT auth.uid()) = user_id);

-- Allow authenticated users to insert chat messages
-- only for research they own.
CREATE POLICY "Users can insert own chat messages"
ON chat_messages FOR INSERT TO authenticated
WITH CHECK (
    research_id IN (
        SELECT id FROM research WHERE user_id = (SELECT auth.uid())
    )
);


-- ─── 2. Composite indexes for specific query patterns ───

-- Covers the daily rate-limit query:
--   research WHERE user_id = ? AND analysis_type = 'fast' AND created_at >= today
CREATE INDEX IF NOT EXISTS idx_research_user_type_date
ON research(user_id, analysis_type, created_at);

-- Covers the concurrent-research check:
--   research WHERE user_id = ? AND status = 'processing'
-- Partial index keeps it tiny — only rows still processing are indexed.
CREATE INDEX IF NOT EXISTS idx_research_user_processing
ON research(user_id)
WHERE status = 'processing';

-- Covers the chat message count + history queries:
--   chat_messages WHERE research_id = ? AND role = 'user' (count)
--   chat_messages WHERE research_id = ? ORDER BY created_at (history)
CREATE INDEX IF NOT EXISTS idx_chat_messages_research_role
ON chat_messages(research_id, role);
