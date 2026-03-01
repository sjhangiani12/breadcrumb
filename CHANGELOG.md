# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-02-28

### Added
- Test suite with Vitest (43 tests across core, sinks, and adapters)
- ESLint with typescript-eslint for linting
- `timeoutMs` option on `SlackSinkConfig` (default 10s) for Slack API call timeouts
- Single-retry on Slack rate limits (`ratelimited` errors)
- `StoredTrace` type export from memory sink and main index
- `engines` field requiring Node.js >= 18
- PR template, issue templates, and CHANGELOG
- Node 18/20/22 matrix testing in CI

### Fixed
- Slack sink now throws on `onTraceStart` failure instead of silently dropping all events
- Slack sink `postToThread` now warns on failure instead of silently discarding responses
- CI workflow: fixed package name check (`breadcrumb` -> `breadcrumb-chat`), removed duplicate publish workflow race condition
- Fixed stale JSDoc referencing `wrapAISDK` (actual export is `wrapStreamText`)
- Fixed all import paths in README, CLI output, and docs (`breadcrumb` -> `breadcrumb-chat`)
- Removed fictional "Completed (2s)" footer from README Slack output section

### Changed
- Traces now throw if events are added after `trace.end()` is called
- Sink notification now snapshots the sinks array to prevent mutation during iteration
- Replaced generic `notifySinks` with explicit typed methods (removed `@ts-expect-error`)
- Documented all `SlackSinkConfig` options, `wrapGenerateText`, and `createTracedStreamText` in README

## [0.1.8] - 2025-05-15

### Fixed
- Use `userName` as Slack trace title instead of hardcoded "New conversation"

### Changed
- Removed redundant docstrings, dead code, and unused variables

## [0.1.7] - 2025-05-14

### Added
- `verbosity` option to `SlackSinkConfig` for controlling tool event output detail (`"concise"` or `"verbose"`)

## [0.1.6] - 2025-05-13

### Changed
- Clean up Slack thread messages by summarizing tool calls and results in concise mode

## [0.1.5] - 2025-05-12

### Added
- Event filtering for Slack sink (`events` config option)
- Breadcrumb landing page website

## [0.1.4] - 2025-05-11

### Added
- `keepalive: true` on fetch calls for serverless reliability

## [0.1.3] - 2025-05-10

### Added
- GitHub Actions workflow for auto-publish to npm

### Changed
- Improved Slack sink formatting and added user info support

## [0.1.2] - 2025-05-09

### Changed
- Renamed package to `breadcrumb-chat`
- Prepared for open source release

## [0.1.1] - 2025-05-08

### Fixed
- ESM compatibility in CLI (use import instead of require)
- Slack manifest format for URL parameter

### Added
- Examples and test scripts

## [0.1.0] - 2025-05-07

### Added
- Initial release
- Core tracing library with `TraceInstance` and `Breadcrumb` classes
- Slack sink with threaded messages
- PostgreSQL sink with auto-migration
- Memory sink for development and testing
- Vercel AI SDK adapter (`wrapStreamText`, `wrapGenerateText`, `createTracedStreamText`)
- CLI for interactive Slack setup (`npx breadcrumb slack`)
