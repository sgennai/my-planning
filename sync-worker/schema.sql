CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at);
CREATE INDEX IF NOT EXISTS idx_projects_server_at ON projects(server_at);

CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_todos_updated_at ON todos(updated_at);
CREATE INDEX IF NOT EXISTS idx_todos_server_at ON todos(server_at);

CREATE TABLE IF NOT EXISTS scheduledBlocks (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_scheduledBlocks_updated_at ON scheduledBlocks(updated_at);
CREATE INDEX IF NOT EXISTS idx_scheduledBlocks_server_at ON scheduledBlocks(server_at);

CREATE TABLE IF NOT EXISTS practiceItems (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_practiceItems_updated_at ON practiceItems(updated_at);
CREATE INDEX IF NOT EXISTS idx_practiceItems_server_at ON practiceItems(server_at);

CREATE TABLE IF NOT EXISTS stories (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_stories_updated_at ON stories(updated_at);
CREATE INDEX IF NOT EXISTS idx_stories_server_at ON stories(server_at);

CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_reviews_updated_at ON reviews(updated_at);
CREATE INDEX IF NOT EXISTS idx_reviews_server_at ON reviews(server_at);

CREATE TABLE IF NOT EXISTS progressLog (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_progressLog_updated_at ON progressLog(updated_at);
CREATE INDEX IF NOT EXISTS idx_progressLog_server_at ON progressLog(server_at);

CREATE TABLE IF NOT EXISTS modules (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_modules_updated_at ON modules(updated_at);
CREATE INDEX IF NOT EXISTS idx_modules_server_at ON modules(server_at);

CREATE TABLE IF NOT EXISTS learning (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_learning_updated_at ON learning(updated_at);
CREATE INDEX IF NOT EXISTS idx_learning_server_at ON learning(server_at);

CREATE TABLE IF NOT EXISTS content (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_content_updated_at ON content(updated_at);
CREATE INDEX IF NOT EXISTS idx_content_server_at ON content(server_at);

CREATE TABLE IF NOT EXISTS create_ideas (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_create_ideas_updated_at ON create_ideas(updated_at);
CREATE INDEX IF NOT EXISTS idx_create_ideas_server_at ON create_ideas(server_at);

CREATE TABLE IF NOT EXISTS create_posts (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_create_posts_updated_at ON create_posts(updated_at);
CREATE INDEX IF NOT EXISTS idx_create_posts_server_at ON create_posts(server_at);

CREATE TABLE IF NOT EXISTS singletons (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, server_at TEXT);
CREATE INDEX IF NOT EXISTS idx_singletons_updated_at ON singletons(updated_at);
CREATE INDEX IF NOT EXISTS idx_singletons_server_at ON singletons(server_at);
