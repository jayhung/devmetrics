/**
 * Alternative display name mappings for dashboard. Raw org/repo/contributor names are
 * stored and used for API and DB; these functions return the labels shown in the UI.
 * Any matched names will display the alternative name instead of the original.
 *
 * This was initially created as a screenshot-friendly tool to deidentify some of the
 * author, repository, and organization names in the dashboard. Feel free to use it as
 * you see fit.
 */

const CONTRIBUTOR_DISPLAY_NAMES: Record<string, string> = {
  // jayhung: "davidlightman",
  // developer2: "richieadler",
  // developer3: "acidburn",
};

/** GitHub organization (owner) names → display names. */
const ORGANIZATION_DISPLAY_NAMES: Record<string, string> = {
  // organization1: "starkindustries",
  // owner1: "tonystark",
};

/** GitHub repository names (the repo part of owner/repo) → display names. */
const REPOSITORY_DISPLAY_NAMES: Record<string, string> = {
  // repository1: "D.A.R.Y.L.",
  // repository2: "jarvis",
};

function lookup<K extends string>(map: Record<string, string>, key: K): string {
  if (!key) return key;
  const normalized = key.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === normalized) return v;
  }
  return key;
}

/** Returns the display name for a contributor login, or the original if unmapped. */
export function displayContributorName(login: string): string {
  return lookup(CONTRIBUTOR_DISPLAY_NAMES, login);
}

/** Returns the display name for a GitHub organization (owner), or the original if unmapped. */
export function displayOrganizationName(org: string): string {
  return lookup(ORGANIZATION_DISPLAY_NAMES, org);
}

/** Returns the display name for a repository name (repo segment only), or the original if unmapped. */
export function displayRepoName(repoName: string): string {
  return lookup(REPOSITORY_DISPLAY_NAMES, repoName);
}

/**
 * Returns the display name for a repo full_name (owner/repo).
 * Uses organization map for owner and repository map for repo name.
 */
export function displayRepositoryName(fullName: string): string {
  if (!fullName) return fullName;
  const i = fullName.indexOf("/");
  if (i === -1) return displayOrganizationName(fullName);
  const owner = fullName.slice(0, i);
  const repo = fullName.slice(i + 1);
  return `${displayOrganizationName(owner)}/${displayRepoName(repo)}`;
}
