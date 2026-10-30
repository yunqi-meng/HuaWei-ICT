"""增量、非破坏式 V1 schema；旧开发库原位升级。"""
SCHEMA_V1 = """
CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS model_runs (
 id TEXT PRIMARY KEY, operation TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL,
 status TEXT NOT NULL, elapsed_ms INTEGER NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0,
 output_tokens INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS attachments (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id),
 session_id TEXT REFERENCES diagnosis_sessions(id), ticket_id TEXT REFERENCES tickets(id),
 storage_key TEXT NOT NULL, content_type TEXT NOT NULL, byte_size INTEGER NOT NULL,
 original_name TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 body TEXT NOT NULL, link TEXT NOT NULL DEFAULT '', read_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS outbox (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, payload TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 available_at TEXT NOT NULL, last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox(status, available_at);
CREATE TABLE IF NOT EXISTS verification_codes (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), digest TEXT NOT NULL,
 expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (
 key TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS content_submissions (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, entity_id TEXT, title TEXT NOT NULL,
 payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', author_id TEXT NOT NULL REFERENCES users(id),
 reviewer_id TEXT REFERENCES users(id), review_note TEXT NOT NULL DEFAULT '', version_id TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS retrieval_traces (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL, query TEXT NOT NULL, mode TEXT NOT NULL,
 citation_ids TEXT NOT NULL, elapsed_ms INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ticket_reviews (
 ticket_id TEXT PRIMARY KEY REFERENCES tickets(id), user_id TEXT NOT NULL REFERENCES users(id),
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS appointment_proposals (
 id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id), slot_id TEXT NOT NULL REFERENCES service_slots(id),
 user_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
);
"""
