# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.0]

### Added
- Comprehensive README with installation, setup, and troubleshooting guides
- Token validation API (`/api/status`) and UI with rate limit display
- JSDoc documentation for core library functions
- Changelog page accessible from app navigation

### Changed
- Improved error handling with `GitHubConfigError` for missing/invalid tokens
- Better UX when token not configured (clear feedback, disabled controls)
- Updated `.gitignore` to exclude AI context files (`AGENTS.md`, `agents/`)

## [0.1.0] - Initial Commit

### Added
- GitHub metrics dashboard with commit, PR, and review tracking
- Multi-repository support
- Incremental sync with rate limit handling
- Date range and repository filtering
- Activity charts and contributor analytics
- SQLite-based local storage
- Real-time sync progress console
