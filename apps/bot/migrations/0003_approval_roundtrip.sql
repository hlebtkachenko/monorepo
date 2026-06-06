-- Complete the agent HITL round-trip (DEV-55): free-text answers, timeout policy, asker
-- identity, and reply-matching. The base `approval` table (0001) only stored a chosen
-- option; these columns add the missing half.
ALTER TABLE approval ADD COLUMN kind TEXT NOT NULL DEFAULT 'choice'; -- 'choice' | 'text'
ALTER TABLE approval ADD COLUMN answer_text TEXT;          -- free-text reply (kind='text')
ALTER TABLE approval ADD COLUMN answered_at INTEGER;       -- when decided / replied
ALTER TABLE approval ADD COLUMN asker TEXT;                -- which agent/source asked
ALTER TABLE approval ADD COLUMN on_timeout TEXT;           -- decision auto-applied past exp
ALTER TABLE approval ADD COLUMN prompt_message_id INTEGER; -- Telegram msg id, for reply matching
