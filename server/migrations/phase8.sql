-- Phase 8 Migration

-- Conversations: one chat session per topic
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject     TEXT NOT NULL,
  title       TEXT NOT NULL DEFAULT 'New Chat',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Link messages to a conversation (nullable so existing rows stay intact)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON messages(conversation_id);

-- Message feedback for rating feature
ALTER TABLE messages ADD COLUMN IF NOT EXISTS feedback TEXT CHECK (feedback IN ('positive', 'negative'));

-- Back-fill: create one legacy conversation per topic, link all existing messages to it
INSERT INTO conversations (subject, title, created_at)
SELECT subject, 'Chat 1', MIN(created_at)
FROM messages
WHERE subject IS NOT NULL AND subject != ''
GROUP BY subject
ON CONFLICT DO NOTHING;

UPDATE messages m
SET conversation_id = c.id
FROM conversations c
WHERE m.subject = c.subject
  AND m.conversation_id IS NULL;
