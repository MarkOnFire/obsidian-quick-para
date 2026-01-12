# Maintenance Backlog

Items are worked incrementally. Any agent can pick up work.

## High Priority

(none)

## Normal Priority

- [ ] **Iterate on feature: tweaks to Resources Index template* (2026-01-12)
  - look at production vault version of template and copy those changes, just added a parameter for summaries and a few additional metadata items to the view. 

## Low Priority / Nice to Have

(none)

## Completed (Recent)

- [x] **Bug: Stale PARA tags not cleaned up on archive** (2026-01-12)
  - Fixed in `tagging.js` - now removes `project`, `projects`, `area`, `areas`, `resource`, `resources`, `inbox` tags when archiving

- [x] **Bug: PARA Visualizer dependency error on launch** (2026-01-12)
  - Fixed race condition in `para-visualizer/main.js` - dependency check now waits for `onLayoutReady()` to ensure all plugins are loaded
