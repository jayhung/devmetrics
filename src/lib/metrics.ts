import { getDb } from "./db";

interface DateRange {
  start?: string;
  end?: string;
}

interface RepoFilter {
  repoIds?: number[];
}

type Filters = DateRange & RepoFilter;

function buildDateFilter(column: string, filters: Filters) {
  const conditions: string[] = [];
  const params: string[] = [];

  if (filters.start) {
    conditions.push(`${column} >= ?`);
    params.push(filters.start);
  }
  if (filters.end) {
    conditions.push(`${column} <= ?`);
    params.push(filters.end);
  }

  return { conditions, params };
}

function buildRepoFilter(column: string, filters: Filters) {
  if (filters.repoIds && filters.repoIds.length > 0) {
    const placeholders = filters.repoIds.map(() => "?").join(",");
    return {
      condition: `${column} IN (${placeholders})`,
      params: filters.repoIds,
    };
  }
  return { condition: null, params: [] };
}

// summary stats
export function getSummaryStats(filters: Filters = {}) {
  const db = getDb();
  const dateFilter = buildDateFilter("committed_at", filters);
  const repoFilter = buildRepoFilter("repo_id", filters);

  const whereClause: string[] = [];
  const params: (string | number)[] = [];

  if (dateFilter.conditions.length > 0) {
    whereClause.push(...dateFilter.conditions);
    params.push(...dateFilter.params);
  }
  if (repoFilter.condition) {
    whereClause.push(repoFilter.condition);
    params.push(...repoFilter.params);
  }

  const where = whereClause.length > 0 ? `WHERE ${whereClause.join(" AND ")}` : "";

  const commits = db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(additions), 0) as additions, COALESCE(SUM(deletions), 0) as deletions 
       FROM commits ${where}`
    )
    .get(...params) as { count: number; additions: number; deletions: number };

  // for PRs, use created_at
  const prDateFilter = buildDateFilter("created_at", filters);
  const prWhere: string[] = [];
  const prParams: (string | number)[] = [];

  if (prDateFilter.conditions.length > 0) {
    prWhere.push(...prDateFilter.conditions);
    prParams.push(...prDateFilter.params);
  }
  if (repoFilter.condition) {
    prWhere.push(repoFilter.condition);
    prParams.push(...repoFilter.params);
  }

  const prWhereClause = prWhere.length > 0 ? `WHERE ${prWhere.join(" AND ")}` : "";

  const prs = db
    .prepare(
      `SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN merged_at IS NOT NULL THEN 1 END) as merged
       FROM pull_requests ${prWhereClause}`
    )
    .get(...prParams) as { total: number; merged: number };

  const contributorWhere = whereClause.length > 0
    ? `WHERE ${whereClause.join(" AND ")} AND author_login IS NOT NULL`
    : "WHERE author_login IS NOT NULL";

  const contributors = db
    .prepare(
      `SELECT COUNT(DISTINCT author_login) as count FROM commits ${contributorWhere}`
    )
    .get(...params) as { count: number };

  return {
    commits: commits.count,
    additions: commits.additions,
    deletions: commits.deletions,
    pullRequests: prs.total,
    mergedPRs: prs.merged,
    contributors: contributors.count,
  };
}

// commits by author
export function getCommitsByAuthor(filters: Filters = {}) {
  const db = getDb();
  const dateFilter = buildDateFilter("committed_at", filters);
  const repoFilter = buildRepoFilter("repo_id", filters);

  const whereClause: string[] = ["author_login IS NOT NULL"];
  const params: (string | number)[] = [];

  if (dateFilter.conditions.length > 0) {
    whereClause.push(...dateFilter.conditions);
    params.push(...dateFilter.params);
  }
  if (repoFilter.condition) {
    whereClause.push(repoFilter.condition);
    params.push(...repoFilter.params);
  }

  return db
    .prepare(
      `SELECT 
        author_login,
        COUNT(*) as commits,
        COALESCE(SUM(additions), 0) as additions,
        COALESCE(SUM(deletions), 0) as deletions
       FROM commits
       WHERE ${whereClause.join(" AND ")}
       GROUP BY author_login
       ORDER BY commits DESC`
    )
    .all(...params);
}

// PRs by author
export function getPRsByAuthor(filters: Filters = {}) {
  const db = getDb();
  const dateFilter = buildDateFilter("created_at", filters);
  const repoFilter = buildRepoFilter("repo_id", filters);

  const whereClause: string[] = ["author_login IS NOT NULL"];
  const params: (string | number)[] = [];

  if (dateFilter.conditions.length > 0) {
    whereClause.push(...dateFilter.conditions);
    params.push(...dateFilter.params);
  }
  if (repoFilter.condition) {
    whereClause.push(repoFilter.condition);
    params.push(...repoFilter.params);
  }

  return db
    .prepare(
      `SELECT 
        author_login,
        COUNT(*) as total,
        COUNT(CASE WHEN merged_at IS NOT NULL THEN 1 END) as merged,
        COALESCE(SUM(additions), 0) as additions,
        COALESCE(SUM(deletions), 0) as deletions
       FROM pull_requests
       WHERE ${whereClause.join(" AND ")}
       GROUP BY author_login
       ORDER BY total DESC`
    )
    .all(...params);
}

// reviews by reviewer
export function getReviewsByReviewer(filters: Filters = {}) {
  const db = getDb();
  const dateFilter = buildDateFilter("r.submitted_at", filters);
  const repoFilter = buildRepoFilter("pr.repo_id", filters);

  const whereClause: string[] = [];
  const params: (string | number)[] = [];

  if (dateFilter.conditions.length > 0) {
    whereClause.push(...dateFilter.conditions);
    params.push(...dateFilter.params);
  }
  if (repoFilter.condition) {
    whereClause.push(repoFilter.condition);
    params.push(...repoFilter.params);
  }

  const where = whereClause.length > 0 ? `WHERE ${whereClause.join(" AND ")}` : "";

  return db
    .prepare(
      `SELECT 
        r.reviewer_login,
        COUNT(*) as total_reviews,
        COUNT(CASE WHEN r.state = 'APPROVED' THEN 1 END) as approvals,
        COUNT(CASE WHEN r.state = 'CHANGES_REQUESTED' THEN 1 END) as changes_requested
       FROM reviews r
       JOIN pull_requests pr ON r.pr_id = pr.id
       ${where}
       GROUP BY r.reviewer_login
       ORDER BY total_reviews DESC`
    )
    .all(...params);
}

// commits by author and repo (for detailed table)
export function getCommitsByAuthorAndRepo(filters: Filters = {}) {
  const db = getDb();
  const dateFilter = buildDateFilter("c.committed_at", filters);
  const repoFilter = buildRepoFilter("c.repo_id", filters);

  const whereClause: string[] = ["c.author_login IS NOT NULL"];
  const params: (string | number)[] = [];

  if (dateFilter.conditions.length > 0) {
    whereClause.push(...dateFilter.conditions);
    params.push(...dateFilter.params);
  }
  if (repoFilter.condition) {
    whereClause.push(repoFilter.condition);
    params.push(...repoFilter.params);
  }

  return db
    .prepare(
      `SELECT 
        c.author_login,
        r.full_name as repo,
        COUNT(*) as commits,
        COALESCE(SUM(c.additions), 0) as additions,
        COALESCE(SUM(c.deletions), 0) as deletions
       FROM commits c
       JOIN repos r ON c.repo_id = r.id
       WHERE ${whereClause.join(" AND ")}
       GROUP BY c.author_login, c.repo_id
       ORDER BY commits DESC`
    )
    .all(...params);
}

// data range (min/max dates for commits)
export function getDataRange(filters: Filters = {}) {
  const db = getDb();
  const repoFilter = buildRepoFilter("c.repo_id", filters);

  const whereClause: string[] = [];
  const params: (string | number)[] = [];

  if (repoFilter.condition) {
    whereClause.push(repoFilter.condition);
    params.push(...repoFilter.params);
  }

  const where = whereClause.length > 0 ? `WHERE ${whereClause.join(" AND ")}` : "";

  const result = db
    .prepare(
      `SELECT 
        MIN(c.committed_at) as earliest_commit,
        MAX(c.committed_at) as latest_commit
       FROM commits c
       ${where}`
    )
    .get(...params) as { earliest_commit: string | null; latest_commit: string | null };

  return result;
}

// sync state for selected repos
export function getSyncStateForRepos(filters: Filters = {}) {
  const db = getDb();
  const repoFilter = buildRepoFilter("s.repo_id", filters);

  const whereClause: string[] = [];
  const params: (string | number)[] = [];

  if (repoFilter.condition) {
    whereClause.push(repoFilter.condition);
    params.push(...repoFilter.params);
  }

  const where = whereClause.length > 0 ? `WHERE ${whereClause.join(" AND ")}` : "";

  const result = db
    .prepare(
      `SELECT 
        MIN(s.last_commit_sync) as earliest_sync,
        MAX(s.last_commit_sync) as latest_sync,
        COUNT(s.repo_id) as synced_repos
       FROM repo_sync_state s
       ${where}`
    )
    .get(...params) as { earliest_sync: string | null; latest_sync: string | null; synced_repos: number };

  // also count total repos for comparison
  const repoFilter2 = buildRepoFilter("id", filters);
  const totalRepos = db
    .prepare(
      `SELECT COUNT(*) as count FROM repos ${repoFilter2.condition ? `WHERE ${repoFilter2.condition}` : ""}`
    )
    .get(...(repoFilter2.params || [])) as { count: number };

  return {
    ...result,
    total_repos: totalRepos.count,
  };
}

// activity over time (daily commits)
export function getActivityOverTime(filters: Filters = {}) {
  const db = getDb();
  const dateFilter = buildDateFilter("committed_at", filters);
  const repoFilter = buildRepoFilter("repo_id", filters);

  const whereClause: string[] = [];
  const params: (string | number)[] = [];

  if (dateFilter.conditions.length > 0) {
    whereClause.push(...dateFilter.conditions);
    params.push(...dateFilter.params);
  }
  if (repoFilter.condition) {
    whereClause.push(repoFilter.condition);
    params.push(...repoFilter.params);
  }

  const where = whereClause.length > 0 ? `WHERE ${whereClause.join(" AND ")}` : "";

  return db
    .prepare(
      `SELECT 
        DATE(committed_at) as date,
        COUNT(*) as commits
       FROM commits
       ${where}
       GROUP BY DATE(committed_at)
       ORDER BY date ASC`
    )
    .all(...params);
}
