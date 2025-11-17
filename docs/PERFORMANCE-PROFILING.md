# Quick PARA Performance Profiling Guide (Issue B)

> Use this document while executing **Issue B — Mobile Optimization Phase 1**. The new diagnostics tooling lives inside the plugin now; this guide explains how to use it and what data to capture.

---

## 1. Enable Profiling

1. Open **Settings → Community Plugins → Quick PARA → Diagnostics & Profiling**.
2. Toggle **Enable profiling logs**.
3. (Optional) Adjust **Slow operation threshold (ms)** if you want more/less sensitive warnings. The default is `200ms`.
4. Leave **Log summary on unload** enabled so you automatically get a snapshot when disabling the plugin or turning profiling off.
5. Use the **Log snapshot now** button (or the `Quick PARA: Log profiling snapshot to console` command) any time you want to dump the current counters/timings to the developer console.
6. Use **Reset profiling session** before each benchmark run so you only capture the new activity.

> ⚠️ Profiling is chatty. Disable it when you are not actively benchmarking to avoid log noise.

---

## 2. What Gets Measured

| Metric ID | Type | Description |
|-----------|------|-------------|
| `plugin:onload` | timing | Time from manager boot to plugin being ready (enable profiling, then disable/enable plugin or restart Obsidian to capture). |
| `events:create`, `events:rename`, `events:modify`, `events:modify:skipped-age` | counters | How many vault events fired; useful to confirm listener volume on desktop vs mobile. |
| `events:*:update` | timing | Duration of the actual tagging work triggered by each event type. |
| `tagging:update` | timing | How long `updateParaTags()` takes per file. Context includes the file path and PARA target. |
| `tagging:updated`, `tagging:skip:*`, `tagging:errors` | counters | Counts of applied updates, template skips, non-PARA skips, and failures. |
| `tagging:bulk-update` | timing | Bulk helper duration and how many notes it touched. |
| `templates:*` | timing | Template deployment/regen durations (handy when provisioning on mobile). |
| `agenda:*` | timing | Parsing and formatting phases inside `AgendaManager`, including `agenda:update` end-to-end time. |
| `project-updates:*` | counters/timing | Success/error counts plus duration for generating all updates and each project. |

Every summary includes:
- `Event counters` — map of counter IDs to counts
- `Timing stats` — count/avg/max/min durations for each timer label

All slow operations (>= threshold) emit a warning so you can quickly see bottlenecks in the console.

---

## 3. Measurement Workflow

### Desktop (Mac)

1. Enable profiling and **Reset profiling session**.
2. Reload Quick PARA (disable → enable) or restart Obsidian.
3. Watch the console for:
   - `plugin:onload` timing
   - `events:*` counters during vault load (should be low on desktop)
4. Run representative actions:
   - Create note in each PARA folder
   - Move a note between folders (rename event)
   - Trigger bulk tagging (`Update PARA tags for all files`)
5. After each scenario, run **Log profiling snapshot now**. Copy the console output into your bench notes.

### Mobile (iPhone/iPad)

1. Sync the updated plugin to mobile.
2. Enable profiling from the plugin settings pane (available on mobile) and reset counters.
3. Force-close Obsidian and relaunch to capture `plugin:onload`.
4. Repeat the same scenarios as desktop:
   - Capture event counts while the vault finishes loading (watch for `events:modify` spikes).
   - Create/move notes using the mobile UI.
   - Trigger bulk tagging command via command palette.
5. Use the command palette to run **Quick PARA: Log profiling snapshot to console** after each scenario. On mobile, view logs via the developer console (Settings → Advanced → Show debug console).

> Tip: leave **Log summary on unload** enabled so simply toggling the plugin or turning profiling off will dump the latest stats.

---

## 4. Benchmark Vault Plan

Recreate three vault sizes so we can compare scaling:

| Vault | Target File Count | Notes |
|-------|------------------|-------|
| Small | 50 markdown files | Roughly matches a fresh PARA setup |
| Medium | 500 markdown files | Represents active daily usage |
| Large | 1,000+ markdown files | Stress test for batching strategies |

Suggested approach:

1. Start from an empty sandbox vault.
2. Run the Quick PARA setup wizard.
3. Duplicate template-based notes using Templater or the native `CMD+D` duplicate to reach target sizes (spread evenly across PARA folders).
4. Run `Update PARA tags for all files` once to ensure baseline metadata.
5. Record how long bulk updates take for each vault size (see `tagging:bulk-update` timing).

---

## 5. Reporting Template

Use one table per device. Fill it with numbers from the profiling snapshot (`Timing stats` and `Event counters`).

```markdown
### Device: ______________________

| Vault Size | plugin:onload (ms) | tagging:update avg/max (ms) | events:create | events:rename | events:modify | tagging:updated | Notes |
|------------|-------------------|------------------------------|---------------|---------------|---------------|-----------------|-------|
| Small      |                   |                              |               |               |               |                 |       |
| Medium     |                   |                              |               |               |               |                 |       |
| Large      |                   |                              |               |               |               |                 |       |
```

Add supporting notes:
- Any warnings emitted (slow operations)
- Subjective lag on mobile (UI freezes, typing delay, etc.)
- Screenshots of console output if helpful

---

## 6. Next Steps After Profiling

1. Highlight the biggest offenders (highest `avgMs` or `maxMs`) and note the corresponding counters.
2. Update `docs/planning/QUICK-PARA-MOBILE-OPTIMIZATION-ROADMAP.md` with the measured baseline numbers.
3. Use the stored metrics to prioritize the Phase 2 quick wins (event listener reductions, lazy loading, batching).
4. Leave profiling disabled once you have captured the data to keep normal usage quiet.

Everything needed for Issue B Phase 1 is now baked into the plugin; no external scripts required. Just follow this guide, capture the metrics, and document them in the roadmap.
