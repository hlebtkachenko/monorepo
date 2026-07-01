-- Correlate an answer back to its originating agent run, and let the resumeWorkflow
-- dispatch target a ref other than main. Both nullable/optional — old rows and old
-- callers keep working (run_id stays null, resume_ref falls back to "main" at dispatch).
ALTER TABLE approval ADD COLUMN resume_ref TEXT; -- git ref for resume_workflow; null => "main"
ALTER TABLE approval ADD COLUMN run_id TEXT;     -- agent run id an answer correlates back to
