CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);

CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_todos_updated_at ON todos(updated_at);

CREATE TABLE IF NOT EXISTS scheduledBlocks (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_scheduledBlocks_updated_at ON scheduledBlocks(updated_at);

CREATE TABLE IF NOT EXISTS practiceItems (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_practiceItems_updated_at ON practiceItems(updated_at);

CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_stories_updated_at ON stories(updated_at);

CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_reviews_updated_at ON reviews(updated_at);

CREATE TABLE IF NOT EXISTS progressLog (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_progressLog_updated_at ON progressLog(updated_at);

CREATE TABLE IF NOT EXISTS modules (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_modules_updated_at ON modules(updated_at);

CREATE TABLE IF NOT EXISTS learning (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_learning_updated_at ON learning(updated_at);

CREATE TABLE IF NOT EXISTS content (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_content_updated_at ON content(updated_at);

CREATE TABLE IF NOT EXISTS create_ideas (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_create_ideas_updated_at ON create_ideas(updated_at);

CREATE TABLE IF NOT EXISTS create_posts (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_create_posts_updated_at ON create_posts(updated_at);

CREATE TABLE IF NOT EXISTS singletons (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS idx_singletons_updated_at ON singletons(updated_at);
