-- Phase 9: per-chat document scoping + document deletion
-- (applied to Supabase as migration phase9_doc_scoping)

-- Per-chat document scoping: docs a conversation must NOT retrieve from
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS excluded_doc_ids BIGINT[] NOT NULL DEFAULT '{}';

-- Speeds DELETE /api/documents/:id chunk cleanup
CREATE INDEX IF NOT EXISTS chunks_doc_id_idx ON chunks (doc_id);
