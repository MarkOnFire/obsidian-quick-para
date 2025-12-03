# Quick PARA Benchmark Testing Guide

Complete guide for performance testing the Quick PARA plugin using automated test vault generation.

---

## Overview

This guide walks through:
1. Generating test vaults (50, 500, 1000+ notes)
2. Running performance profiling
3. Capturing benchmark data
4. Cleaning up after testing

**Safety:** All scripts are restricted to Test Vault only. Your main MarkBrain vault is never touched.

---

## Quick Start

```bash
cd /Users/mriechers/Developer/obsidian-config/custom-extensions/plugins/quick-para/scripts

# Generate a small test vault (50 notes)
./benchmark-helper.sh setup small

# Open Test Vault in Obsidian and run profiling (see below)

# Clean up when done
./benchmark-helper.sh clean
```

---

## Test Vault Sizes

| Size   | File Count | Use Case |
|--------|-----------|----------|
| Small  | 50        | Quick validation, feature testing |
| Medium | 500       | Realistic daily usage simulation |
| Large  | 1000+     | Stress testing, mobile optimization |

---

## Step-by-Step Workflow

### 1. Generate Test Vault

**Using the helper script (recommended):**

```bash
cd /Users/mriechers/Developer/obsidian-config/custom-extensions/plugins/quick-para/scripts

# Small vault (50 notes)
./benchmark-helper.sh setup small

# Medium vault (500 notes)
./benchmark-helper.sh setup medium

# Large vault (1000 notes)
./benchmark-helper.sh setup large

# Custom size (e.g., 250 notes)
./benchmark-helper.sh setup 250
```

**Using the Python script directly:**

```bash
cd /Users/mriechers/Developer/obsidian-config/custom-extensions/plugins/quick-para/scripts

# Preset sizes
python3 generate-test-notes.py --size small
python3 generate-test-notes.py --size medium
python3 generate-test-notes.py --size large

# Custom count
python3 generate-test-notes.py --count 250

# Generate without tasks (faster, smaller files)
python3 generate-test-notes.py --size small --no-tasks

# Clean existing test notes
python3 generate-test-notes.py --clean
```

---

### 2. Check Test Vault Status

```bash
./benchmark-helper.sh status
```

**Output:**
```
Test Vault Status:
  Location: /Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/Test Vault
  ✓ Vault exists
  Test notes: 50

  Distribution:
    0 - INBOX:           5 notes
    1 - PROJECTS:        20 notes
    2 - AREAS:           10 notes
    3 - RESOURCES:       10 notes
    4 - ARCHIVE:         5 notes
```

---

### 3. Run Performance Profiling

Follow the detailed profiling guide: **[PERFORMANCE-PROFILING.md](./PERFORMANCE-PROFILING.md)**

**Quick summary:**

1. **Open Test Vault in Obsidian**
2. **Enable profiling:**
   - Settings → Community Plugins → Quick PARA → Diagnostics & Profiling
   - Toggle "Enable profiling logs"
   - Click "Reset profiling session"
3. **Run benchmarks:**
   - Reload plugin (disable → enable)
   - Create new notes
   - Move notes between folders
   - Run "Update PARA tags for all files"
4. **Capture data:**
   - Click "Log snapshot now" or run command palette: "Quick PARA: Log profiling snapshot to console"
   - Open Developer Console (Cmd+Option+I on Mac)
   - Copy the profiling summary
5. **Save results:**
   - Paste into a text file (e.g., `benchmark-small-desktop.txt`)

---

### 4. Benchmark Scenarios

#### Scenario A: Plugin Load Time

**Goal:** Measure how long the plugin takes to initialize

```
1. Enable profiling
2. Reset profiling session
3. Disable Quick PARA plugin
4. Enable Quick PARA plugin
5. Check console for "plugin:onload" timing
```

**Metric to capture:** `plugin:onload` (ms)

---

#### Scenario B: Bulk Tagging Performance

**Goal:** Measure bulk update speed across entire vault

```
1. Enable profiling
2. Reset profiling session
3. Run command: "Update PARA tags for all files"
4. Wait for completion
5. Log snapshot
```

**Metrics to capture:**
- `tagging:bulk-update` total time
- `tagging:update` avg/max times
- `tagging:updated` count

---

#### Scenario C: File Creation Performance

**Goal:** Measure tagging speed for new files

```
1. Enable profiling
2. Reset profiling session
3. Create 10 new notes in different PARA folders
   - Use Cmd+N in Obsidian
   - Quickly save and move to next folder
4. Log snapshot
```

**Metrics to capture:**
- `events:create` count
- `events:create:update` avg/max times
- `tagging:update` avg/max times

---

#### Scenario D: File Movement Performance

**Goal:** Measure tagging speed when moving files between folders

```
1. Enable profiling
2. Reset profiling session
3. Move 10 notes from Projects to Archive (drag & drop)
4. Log snapshot
```

**Metrics to capture:**
- `events:rename` count
- `events:rename:update` avg/max times
- `tasks:cancel-file` times (if auto-cancel enabled)

---

### 5. Desktop vs Mobile Comparison

**Desktop (Mac):**
1. Follow all scenarios above
2. Copy console output for each
3. Note any warnings about slow operations (>200ms)

**Mobile (iOS/iPad):**
1. Sync Test Vault to mobile device
2. Open Obsidian mobile app
3. Enable profiling in settings
4. Run same scenarios
5. Use mobile developer console to view logs:
   - Settings → Advanced → Show debug console
6. Note subjective UI lag (typing delay, freezes)

---

### 6. Clean Up Test Notes

**When you're done benchmarking:**

```bash
./benchmark-helper.sh clean
```

This removes all `Test Note *.md` files from Test Vault while preserving:
- PARA folder structure
- Your real notes (if any)
- Plugin settings

---

## Generated Test Note Structure

**Example frontmatter:**
```yaml
---
tags: [all, work]
para: projects
created: 2024-11-15
---
```

**Example content:**
```markdown
## Overview

This is a test note generated for performance benchmarking.

## Tasks

- [ ] Review project documentation
- [x] Update status report
- [ ] Schedule team meeting
```

**File distribution:**
- 10% in Inbox (5 notes for small vault)
- 40% in Projects (20 notes for small vault)
- 20% in Areas (10 notes for small vault)
- 20% in Resources (10 notes for small vault)
- 10% in Archive (5 notes for small vault)

**Subfolders:**
- Half of notes in root PARA folder
- Half distributed across realistic subfolders (work, personal, etc.)

---

## Reporting Template

Copy this template and fill in your measurements:

```markdown
## Benchmark Results: [VAULT_SIZE] - [DEVICE]

**Device:** MacBook Pro M1 / iPhone 15 Pro
**Vault Size:** Small (50 notes) / Medium (500) / Large (1000)
**Date:** 2024-11-23

### Plugin Load Time
- `plugin:onload`: _____ ms

### Bulk Update Performance
- Total duration: _____ ms
- Files updated: _____
- `tagging:update` avg: _____ ms
- `tagging:update` max: _____ ms

### File Creation (10 files)
- `events:create` count: _____
- `events:create:update` avg: _____ ms
- `events:create:update` max: _____ ms

### File Movement (10 files)
- `events:rename` count: _____
- `events:rename:update` avg: _____ ms
- `events:rename:update` max: _____ ms

### Warnings / Slow Operations
- List any operations >200ms threshold

### Subjective Notes
- Any UI lag, freezes, or delays observed
```

---

## Troubleshooting

### "Test Vault not found"
**Solution:** Create "Test Vault" in Obsidian first
1. Open Obsidian
2. Create new vault named "Test Vault"
3. Run Quick PARA setup wizard
4. Re-run the benchmark script

### "Permission denied"
**Solution:** Make scripts executable
```bash
chmod +x benchmark-helper.sh
chmod +x generate-test-notes.py
```

### "python3 not found"
**Solution:** Install Python 3
```bash
brew install python3  # On macOS with Homebrew
```

### Notes not appearing in Obsidian
**Solution:** Wait for iCloud sync or force refresh
1. Close and reopen Obsidian
2. Or: Right-click vault → "Force sync"

### Profiler shows no data
**Solution:** Ensure profiling is enabled
1. Settings → Quick PARA → Diagnostics
2. Toggle "Enable profiling logs"
3. Click "Reset profiling session"
4. Run operations again

---

## Next Steps

After capturing benchmark data:

1. **Share results** with Claude for analysis
2. **Identify bottlenecks** (operations >200ms)
3. **Prioritize optimizations** based on real data
4. **Re-test** after optimizations to measure improvement

See: **[PERFORMANCE-PROFILING.md](./PERFORMANCE-PROFILING.md)** for detailed profiling instructions.

---

## Safety Notes

- ✅ Scripts are restricted to Test Vault only
- ✅ MarkBrain vault is never modified
- ✅ Test notes are clearly named (`Test Note 0001.md`)
- ✅ Real notes in Test Vault are preserved during cleanup
- ⚠️ Always backup before testing new features

---

## Script Reference

**benchmark-helper.sh:**
- `setup <size>` - Generate test vault
- `clean` - Remove test notes
- `status` - Show current state
- `help` - Show usage

**generate-test-notes.py:**
- `--size <small|medium|large>` - Preset sizes
- `--count N` - Custom note count
- `--clean` - Remove test notes
- `--no-tasks` - Generate without tasks

---

**Questions?** See the main README or check console logs for errors.
