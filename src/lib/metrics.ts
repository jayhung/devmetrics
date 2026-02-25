import { getDb } from "./db";

/** Date range filter for metrics queries */
interface DateRange {
  start?: string;
  end?: string;
}

/** Repository filter for metrics queries */
interface RepoFilter {
  repoIds?: number[];
}

/** Combined filters for all metrics queries */
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

/**
 * Returns summary statistics: total commits, PRs, lines changed, and unique contributors.
 * @param filters - optional date range and repository filters
 */
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

/** Returns commit counts and line changes grouped by author */
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

/** Returns PR counts (opened, merged) grouped by author */
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

/** Returns review counts (total, approvals, changes requested) grouped by reviewer */
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

/**
 * Returns combined author metrics: commits, PRs, reviews, and derived stats per author per repo.
 * This is the main data source for the contributor details table.
 */
export function getAuthorMetrics(filters: Filters = {}) {
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

  // build PR date filter separately
  const prDateFilter = buildDateFilter("pr.created_at", filters);
  const prRepoFilter = buildRepoFilter("pr.repo_id", filters);
  const prWhere: string[] = ["pr.author_login IS NOT NULL"];
  const prParams: (string | number)[] = [];

  if (prDateFilter.conditions.length > 0) {
    prWhere.push(...prDateFilter.conditions);
    prParams.push(...prDateFilter.params);
  }
  if (prRepoFilter.condition) {
    prWhere.push(prRepoFilter.condition);
    prParams.push(...prRepoFilter.params);
  }

  // build review filter
  const reviewDateFilter = buildDateFilter("rv.submitted_at", filters);
  const reviewRepoFilter = buildRepoFilter("pr2.repo_id", filters);
  const reviewWhere: string[] = [];
  const reviewParams: (string | number)[] = [];

  if (reviewDateFilter.conditions.length > 0) {
    reviewWhere.push(...reviewDateFilter.conditions);
    reviewParams.push(...reviewDateFilter.params);
  }
  if (reviewRepoFilter.condition) {
    reviewWhere.push(reviewRepoFilter.condition);
    reviewParams.push(...reviewRepoFilter.params);
  }

  const reviewWhereClause = reviewWhere.length > 0 ? `WHERE ${reviewWhere.join(" AND ")}` : "";

  // get commit stats per author per repo
  const commitStats = db
    .prepare(
      `SELECT 
        c.author_login,
        r.full_name as repo,
        c.repo_id,
        COUNT(*) as commits,
        COALESCE(SUM(c.additions), 0) as additions,
        COALESCE(SUM(c.deletions), 0) as deletions
       FROM commits c
       JOIN repos r ON c.repo_id = r.id
       WHERE ${whereClause.join(" AND ")}
       GROUP BY c.author_login, c.repo_id`
    )
    .all(...params) as {
      author_login: string;
      repo: string;
      repo_id: number;
      commits: number;
      additions: number;
      deletions: number;
    }[];

  // get PR stats per author per repo
  const prStats = db
    .prepare(
      `SELECT 
        pr.author_login,
        r.full_name as repo,
        pr.repo_id,
        COUNT(*) as prs_opened,
        COUNT(CASE WHEN pr.merged_at IS NOT NULL THEN 1 END) as prs_merged
       FROM pull_requests pr
       JOIN repos r ON pr.repo_id = r.id
       WHERE ${prWhere.join(" AND ")}
       GROUP BY pr.author_login, pr.repo_id`
    )
    .all(...prParams) as {
      author_login: string;
      repo: string;
      repo_id: number;
      prs_opened: number;
      prs_merged: number;
    }[];

  // get review stats per reviewer per repo
  const reviewStats = db
    .prepare(
      `SELECT 
        rv.reviewer_login as author_login,
        r.full_name as repo,
        pr2.repo_id,
        COUNT(*) as reviews_given,
        COUNT(CASE WHEN rv.state = 'APPROVED' THEN 1 END) as approvals
       FROM reviews rv
       JOIN pull_requests pr2 ON rv.pr_id = pr2.id
       JOIN repos r ON pr2.repo_id = r.id
       ${reviewWhereClause}
       GROUP BY rv.reviewer_login, pr2.repo_id`
    )
    .all(...reviewParams) as {
      author_login: string;
      repo: string;
      repo_id: number;
      reviews_given: number;
      approvals: number;
    }[];

  // merge all stats by author + repo
  const metricsMap = new Map<string, {
    author_login: string;
    repo: string;
    commits: number;
    additions: number;
    deletions: number;
    prs_opened: number;
    prs_merged: number;
    reviews_given: number;
    avg_commit_size: number;
    merge_rate: number;
  }>();

  // add commit stats
  for (const stat of commitStats) {
    const key = `${stat.author_login}:${stat.repo}`;
    metricsMap.set(key, {
      author_login: stat.author_login,
      repo: stat.repo,
      commits: stat.commits,
      additions: stat.additions,
      deletions: stat.deletions,
      prs_opened: 0,
      prs_merged: 0,
      reviews_given: 0,
      avg_commit_size: stat.commits > 0 ? Math.round((stat.additions + stat.deletions) / stat.commits) : 0,
      merge_rate: 0,
    });
  }

  // merge PR stats
  for (const stat of prStats) {
    const key = `${stat.author_login}:${stat.repo}`;
    const existing = metricsMap.get(key);
    if (existing) {
      existing.prs_opened = stat.prs_opened;
      existing.prs_merged = stat.prs_merged;
      existing.merge_rate = stat.prs_opened > 0 ? Math.round((stat.prs_merged / stat.prs_opened) * 100) : 0;
    } else {
      metricsMap.set(key, {
        author_login: stat.author_login,
        repo: stat.repo,
        commits: 0,
        additions: 0,
        deletions: 0,
        prs_opened: stat.prs_opened,
        prs_merged: stat.prs_merged,
        reviews_given: 0,
        avg_commit_size: 0,
        merge_rate: stat.prs_opened > 0 ? Math.round((stat.prs_merged / stat.prs_opened) * 100) : 0,
      });
    }
  }

  // merge review stats
  for (const stat of reviewStats) {
    const key = `${stat.author_login}:${stat.repo}`;
    const existing = metricsMap.get(key);
    if (existing) {
      existing.reviews_given = stat.reviews_given;
    } else {
      metricsMap.set(key, {
        author_login: stat.author_login,
        repo: stat.repo,
        commits: 0,
        additions: 0,
        deletions: 0,
        prs_opened: 0,
        prs_merged: 0,
        reviews_given: stat.reviews_given,
        avg_commit_size: 0,
        merge_rate: 0,
      });
    }
  }

  // convert to array and sort by commits desc
  return Array.from(metricsMap.values()).sort((a, b) => b.commits - a.commits);
}

/** Returns daily commit counts for the activity chart */
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

/** Returns daily commit counts grouped by author for stacked activity chart */
export function getActivityByAuthor(filters: Filters = {}) {
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
        DATE(committed_at) as date,
        author_login,
        COUNT(*) as commits
       FROM commits
       WHERE ${whereClause.join(" AND ")}
       GROUP BY DATE(committed_at), author_login
       ORDER BY date ASC`
    )
    .all(...params) as { date: string; author_login: string; commits: number }[];
}

/** Returns daily PR counts (opened and merged) for time-series chart */
export function getPRActivityOverTime(filters: Filters = {}) {
  const db = getDb();
  const dateFilter = buildDateFilter("created_at", filters);
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
        DATE(created_at) as date,
        COUNT(*) as opened,
        COUNT(CASE WHEN merged_at IS NOT NULL THEN 1 END) as merged
       FROM pull_requests
       ${where}
       GROUP BY DATE(created_at)
       ORDER BY date ASC`
    )
    .all(...params) as { date: string; opened: number; merged: number }[];
}

/** Returns daily review counts for time-series chart */
export function getReviewActivityOverTime(filters: Filters = {}) {
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
        DATE(r.submitted_at) as date,
        COUNT(*) as reviews,
        COUNT(CASE WHEN r.state = 'APPROVED' THEN 1 END) as approvals
       FROM reviews r
       JOIN pull_requests pr ON r.pr_id = pr.id
       ${where}
       GROUP BY DATE(r.submitted_at)
       ORDER BY date ASC`
    )
    .all(...params) as { date: string; reviews: number; approvals: number }[];
}

/** Returns monthly merged PR counts grouped by author for stacked monthly chart */
export function getMergedPRsByMonth(filters: Filters = {}) {
  const db = getDb();
  const dateFilter = buildDateFilter("merged_at", filters);
  const repoFilter = buildRepoFilter("repo_id", filters);

  const whereClause: string[] = ["merged_at IS NOT NULL", "author_login IS NOT NULL"];
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
        strftime('%Y-%m', merged_at) as month,
        author_login,
        COUNT(*) as count
       FROM pull_requests
       WHERE ${whereClause.join(" AND ")}
       GROUP BY month, author_login
       ORDER BY month ASC`
    )
    .all(...params) as { month: string; author_login: string; count: number }[];
}

/** Returns monthly review counts grouped by reviewer for stacked monthly chart */
export function getReviewsByMonth(filters: Filters = {}) {
  const db = getDb();
  const dateFilter = buildDateFilter("r.submitted_at", filters);
  const repoFilter = buildRepoFilter("pr.repo_id", filters);

  const whereClause: string[] = ["r.reviewer_login IS NOT NULL"];
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
        strftime('%Y-%m', r.submitted_at) as month,
        r.reviewer_login,
        COUNT(*) as count
       FROM reviews r
       JOIN pull_requests pr ON r.pr_id = pr.id
       WHERE ${whereClause.join(" AND ")}
       GROUP BY month, r.reviewer_login
       ORDER BY month ASC`
    )
    .all(...params) as { month: string; reviewer_login: string; count: number }[];
}

/** Returns daily line changes (additions/deletions) for time-series chart */
export function getLinesChangedOverTime(filters: Filters = {}) {
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
        COALESCE(SUM(additions), 0) as additions,
        COALESCE(SUM(deletions), 0) as deletions
       FROM commits
       ${where}
       GROUP BY DATE(committed_at)
       ORDER BY date ASC`
    )
    .all(...params) as { date: string; additions: number; deletions: number }[];
}
