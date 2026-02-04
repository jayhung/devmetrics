import Database from "better-sqlite3";
import path from "path";

const dbPath = path.join(process.cwd(), "data", "dashboard.db");

let db: Database.Database | null = null;

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
}

// repo queries
export function getRepos() {
  return getDb().prepare("SELECT * FROM repos ORDER BY added_at DESC").all();
}

export function addRepo(owner: string, name: string) {
  const fullName = `${owner}/${name}`;
  return getDb()
    .prepare("INSERT OR IGNORE INTO repos (owner, name, full_name) VALUES (?, ?, ?)")
    .run(owner, name, fullName);
}

export function removeRepo(id: number) {
  const db = getDb();
  // delete related data first
  db.prepare("DELETE FROM reviews WHERE pr_id IN (SELECT id FROM pull_requests WHERE repo_id = ?)").run(id);
  db.prepare("DELETE FROM pull_requests WHERE repo_id = ?").run(id);
  db.prepare("DELETE FROM commits WHERE repo_id = ?").run(id);
  return db.prepare("DELETE FROM repos WHERE id = ?").run(id);
}

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
