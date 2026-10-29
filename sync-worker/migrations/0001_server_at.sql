-- 2026-10-29: when each record reached the Worker, for pulls (see src/index.js).
-- Only for a database created from schema.sql before that date; a newer
-- schema.sql already has the column. Additive: existing rows keep server_at
-- NULL and are listed by their updated_at until next written.
ALTER TABLE projects ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_projects_server_at ON projects(server_at);
ALTER TABLE todos ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_todos_server_at ON todos(server_at);
ALTER TABLE scheduledBlocks ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_scheduledBlocks_server_at ON scheduledBlocks(server_at);
ALTER TABLE practiceItems ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_practiceItems_server_at ON practiceItems(server_at);
ALTER TABLE stories ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_stories_server_at ON stories(server_at);
ALTER TABLE reviews ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_reviews_server_at ON reviews(server_at);
ALTER TABLE progressLog ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_progressLog_server_at ON progressLog(server_at);
ALTER TABLE modules ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_modules_server_at ON modules(server_at);
ALTER TABLE learning ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_learning_server_at ON learning(server_at);
ALTER TABLE content ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_content_server_at ON content(server_at);
ALTER TABLE create_ideas ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_create_ideas_server_at ON create_ideas(server_at);
ALTER TABLE create_posts ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_create_posts_server_at ON create_posts(server_at);
ALTER TABLE singletons ADD COLUMN server_at TEXT;
CREATE INDEX IF NOT EXISTS idx_singletons_server_at ON singletons(server_at);
