# Changelog

Notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0]

- GitHub metrics dashboard with commit, PR, and review tracking
- Multi-repository support with incremental sync
- Date range and repository filtering
- Activity charts and contributor analytics
- SQLite storage with real-time sync console

- **Breaking**: Database filename changed from `dashboard.db` to `devmetrics.db` (auto-migrates on first run if you had installed a version prior to this release)
