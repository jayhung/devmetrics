# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0]

### Changed

- **Breaking**: Database filename changed from `dashboard.db` to `devmetrics.db` (auto-migrates on first run)

## [0.2.0]

### Added

- Comprehensive README with installation and troubleshooting guides
- Display names feature to map GitHub usernames to alternative labels
- Browse repos button with GitHub URL parsing support
- Data folder README with schema documentation
- New metrics charts: PRs by author, reviews by reviewer, lines changed over time, commits by author over time
- Activity by author stacked bar chart
- Prettier code formatting
- Changelog page
- License

## [0.1.0]

### Added

- GitHub metrics dashboard with commit, PR, and review tracking
- Multi-repository support with incremental sync
- Date range and repository filtering
- Activity charts and contributor analytics
- SQLite storage with real-time sync console
