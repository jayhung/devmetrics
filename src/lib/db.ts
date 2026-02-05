import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "dashboard.db");

let db: Database.Database | null = null;

/**
 * Gets the SQLite database instance, initializing it if needed.
 * Uses WAL mode for better concurrent read performance.
 * 
 * Database schema:
 * - repos: tracked repositories (id, owner, name, full_name, added_at)
 * - commits: commit history with stats (sha, repo_id, author_login, additions, deletions, etc.)
 * - pull_requests: PR data (id, repo_id, author_login, state, additions, deletions, etc.)
 * - reviews: PR review data (id, pr_id, reviewer_login, state, submitted_at)
 * - repo_sync_state: tracks last sync time per repo
 * - sync_runs: history of sync operations
 */
export function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    initSchema();
  }
  return db;
}

function initSchema() {
  const database = db!;

  // tracked repositories
  database.exec(`
    CREATE TABLE IF NOT EXISTS repos (
      id INTEGER PRIMARY KEY,
      owner TEXT NOT NULL,
      name TEXT NOT NULL,
      full_name TEXT UNIQUE NOT NULL,
      added_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // commits cache
  database.exec(`
    CREATE TABLE IF NOT EXISTS commits (
      sha TEXT PRIMARY KEY,
      repo_id INTEGER REFERENCES repos(id),
      author_login TEXT,
      author_email TEXT,
      message TEXT,
      additions INTEGER,
      deletions INTEGER,
      committed_at TEXT,
      fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // pull requests cache
  database.exec(`
    CREATE TABLE IF NOT EXISTS pull_requests (
      id INTEGER PRIMARY KEY,
      repo_id INTEGER REFERENCES repos(id),
      number INTEGER,
      author_login TEXT,
      title TEXT,
      state TEXT,
      additions INTEGER,
      deletions INTEGER,
      created_at TEXT,
      merged_at TEXT,
      closed_at TEXT,
      fetched_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // reviews cache
  database.exec(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY,
      pr_id INTEGER REFERENCES pull_requests(id),
      reviewer_login TEXT,
      state TEXT,
      submitted_at TEXT
    )
  `);

  // create indexes for common queries
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_commits_repo ON commits(repo_id);
    CREATE INDEX IF NOT EXISTS idx_commits_author ON commits(author_login);
    CREATE INDEX IF NOT EXISTS idx_commits_date ON commits(committed_at);
    CREATE INDEX IF NOT EXISTS idx_prs_repo ON pull_requests(repo_id);
    CREATE INDEX IF NOT EXISTS idx_prs_author ON pull_requests(author_login);
    CREATE INDEX IF NOT EXISTS idx_reviews_pr ON reviews(pr_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_reviewer ON reviews(reviewer_login);
  `);

  // sync tracking per repo
  database.exec(`
    CREATE TABLE IF NOT EXISTS repo_sync_state (
      repo_id INTEGER PRIMARY KEY REFERENCES repos(id),
      last_commit_sync TEXT,
      last_pr_sync TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // sync run history
  database.exec(`
    CREATE TABLE IF NOT EXISTS sync_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      status TEXT NOT NULL DEFAULT 'running',
      total_repos INTEGER,
      completed_repos INTEGER DEFAULT 0,
      total_commits INTEGER DEFAULT 0,
      total_prs INTEGER DEFAULT 0,
      total_reviews INTEGER DEFAULT 0,
      error_message TEXT
    )
  `);
}

/** Returns all tracked repositories, ordered by most recently added */
export function getRepos() {
  return getDb().prepare("SELECT * FROM repos ORDER BY added_at DESC").all();
}

/** Adds a repository to track. Ignores if already exists. */
export function addRepo(owner: string, name: string) {
  const fullName = `${owner}/${name}`;
  return getDb()
    .prepare("INSERT OR IGNORE INTO repos (owner, name, full_name) VALUES (?, ?, ?)")
    .run(owner, name, fullName);
}

/** Removes a repository and all its associated data (commits, PRs, reviews) */
export function removeRepo(id: number) {
  const db = getDb();
  // delete related data first
  db.prepare("DELETE FROM reviews WHERE pr_id IN (SELECT id FROM pull_requests WHERE repo_id = ?)").run(id);
  db.prepare("DELETE FROM pull_requests WHERE repo_id = ?").run(id);
  db.prepare("DELETE FROM commits WHERE repo_id = ?").run(id);
  return db.prepare("DELETE FROM repos WHERE id = ?").run(id);
}

/** Finds a repository by its full name (owner/repo format) */
export function getRepoByFullName(fullName: string) {
  return getDb().prepare("SELECT * FROM repos WHERE full_name = ?").get(fullName);
}

// commit queries
export function insertCommit(commit: {
  sha: string;
  repo_id: number;
  author_login: string | null;
  author_email: string | null;
  message: string;
  additions: number;
  deletions: number;
  committed_at: string;
}) {
  return getDb()
    .prepare(`
      INSERT OR REPLACE INTO commits 
      (sha, repo_id, author_login, author_email, message, additions, deletions, committed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      commit.sha,
      commit.repo_id,
      commit.author_login,
      commit.author_email,
      commit.message,
      commit.additions,
      commit.deletions,
      commit.committed_at
    );
}

// PR queries
export function insertPullRequest(pr: {
  id: number;
  repo_id: number;
  number: number;
  author_login: string | null;
  title: string;
  state: string;
  additions: number;
  deletions: number;
  created_at: string;
  merged_at: string | null;
  closed_at: string | null;
}) {
  return getDb()
    .prepare(`
      INSERT OR REPLACE INTO pull_requests
      (id, repo_id, number, author_login, title, state, additions, deletions, created_at, merged_at, closed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      pr.id,
      pr.repo_id,
      pr.number,
      pr.author_login,
      pr.title,
      pr.state,
      pr.additions,
      pr.deletions,
      pr.created_at,
      pr.merged_at,
      pr.closed_at
    );
}

// review queries
export function insertReview(review: {
  id: number;
  pr_id: number;
  reviewer_login: string;
  state: string;
  submitted_at: string;
}) {
  return getDb()
    .prepare(`
      INSERT OR REPLACE INTO reviews
      (id, pr_id, reviewer_login, state, submitted_at)
      VALUES (?, ?, ?, ?, ?)
    `)
    .run(review.id, review.pr_id, review.reviewer_login, review.state, review.submitted_at);
}

// sync state queries
export function getRepoSyncState(repoId: number) {
  return getDb()
    .prepare("SELECT * FROM repo_sync_state WHERE repo_id = ?")
    .get(repoId) as { repo_id: number; last_commit_sync: string | null; last_pr_sync: string | null } | undefined;
}

export function updateRepoSyncState(repoId: number, commitSync?: string, prSync?: string) {
  const existing = getRepoSyncState(repoId);
  const now = new Date().toISOString();
  
  if (existing) {
    return getDb()
      .prepare(`
        UPDATE repo_sync_state 
        SET last_commit_sync = COALESCE(?, last_commit_sync),
            last_pr_sync = COALESCE(?, last_pr_sync),
            updated_at = ?
        WHERE repo_id = ?
      `)
      .run(commitSync, prSync, now, repoId);
  } else {
    return getDb()
      .prepare(`
        INSERT INTO repo_sync_state (repo_id, last_commit_sync, last_pr_sync, updated_at)
        VALUES (?, ?, ?, ?)
      `)
      .run(repoId, commitSync, prSync, now);
  }
}

// sync run tracking
export function startSyncRun(totalRepos: number): number {
  const result = getDb()
    .prepare(`
      INSERT INTO sync_runs (started_at, status, total_repos)
      VALUES (?, 'running', ?)
    `)
    .run(new Date().toISOString(), totalRepos);
  return result.lastInsertRowid as number;
}

export function updateSyncRunProgress(
  runId: number,
  completedRepos: number,
  commits: number,
  prs: number,
  reviews: number
) {
  return getDb()
    .prepare(`
      UPDATE sync_runs 
      SET completed_repos = ?, total_commits = ?, total_prs = ?, total_reviews = ?
      WHERE id = ?
    `)
    .run(completedRepos, commits, prs, reviews, runId);
}

export function completeSyncRun(runId: number, status: "complete" | "partial" | "error", errorMessage?: string) {
  return getDb()
    .prepare(`
      UPDATE sync_runs 
      SET completed_at = ?, status = ?, error_message = ?
      WHERE id = ?
    `)
    .run(new Date().toISOString(), status, errorMessage || null, runId);
}

export function getLastSyncRun() {
  return getDb()
    .prepare(`
      SELECT * FROM sync_runs 
      ORDER BY id DESC 
      LIMIT 1
    `)
    .get() as {
      id: number;
      started_at: string;
      completed_at: string | null;
      status: string;
      total_repos: number;
      completed_repos: number;
      total_commits: number;
      total_prs: number;
      total_reviews: number;
      error_message: string | null;
    } | undefined;
}
