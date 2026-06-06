-- Answer-as-trigger (DEV-55 follow-up). The whole point: the OWNER's answer must WAKE the
-- agent, not the agent poll/self-wake (agent wakeups are unreliable). So on resolve the bot
-- fires an outbound trigger — a webhook POST and/or a GitHub workflow_dispatch carrying the
-- answer — driven by the tap/reply, run on reliable infra. Polling /answer stays as a floor.
ALTER TABLE approval ADD COLUMN callback_url TEXT;     -- POST the resolved answer here
ALTER TABLE approval ADD COLUMN callback_token TEXT;   -- sent as Bearer to callback_url (optional)
ALTER TABLE approval ADD COLUMN resume_workflow TEXT;  -- GitHub workflow file to dispatch on resolve
ALTER TABLE approval ADD COLUMN delivered INTEGER NOT NULL DEFAULT 0; -- 1 once the trigger fired (idempotent)
