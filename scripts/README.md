# Quick PARA Benchmark Scripts

Automated test vault generation for performance profiling.

## Quick Start

```bash
# Generate test vault
./benchmark-helper.sh setup small

# Check status
./benchmark-helper.sh status

# Clean up
./benchmark-helper.sh clean
```

## Files

- **benchmark-helper.sh** - Convenience wrapper for benchmarking workflow
- **generate-test-notes.py** - Python script that generates test notes

## Usage

### Benchmark Helper (Recommended)

```bash
# Setup test vaults
./benchmark-helper.sh setup small    # 50 notes
./benchmark-helper.sh setup medium   # 500 notes
./benchmark-helper.sh setup large    # 1000 notes
./benchmark-helper.sh setup 250      # Custom count

# Check current state
./benchmark-helper.sh status

# Remove all test notes
./benchmark-helper.sh clean

# Show help
./benchmark-helper.sh help
```

### Python Script (Advanced)

```bash
# Preset sizes
python3 generate-test-notes.py --size small
python3 generate-test-notes.py --size medium
python3 generate-test-notes.py --size large

# Custom count
python3 generate-test-notes.py --count 250

# Without tasks (faster generation)
python3 generate-test-notes.py --size small --no-tasks

# Clean only
python3 generate-test-notes.py --clean
```

## Safety

- ✅ Restricted to Test Vault only
- ✅ MarkBrain vault never touched
- ✅ Validates vault path before operations
- ✅ Test notes clearly named (`Test Note 0001.md`)

## Workflow

1. **Generate:** `./benchmark-helper.sh setup small`
2. **Open Test Vault** in Obsidian
3. **Enable profiling** in Quick PARA settings
4. **Run benchmarks** (see [BENCHMARK-TESTING-GUIDE.md](../docs/BENCHMARK-TESTING-GUIDE.md))
5. **Clean up:** `./benchmark-helper.sh clean`

## Documentation

- **[BENCHMARK-TESTING-GUIDE.md](../docs/BENCHMARK-TESTING-GUIDE.md)** - Complete testing workflow
- **[PERFORMANCE-PROFILING.md](../docs/PERFORMANCE-PROFILING.md)** - Profiling instrumentation guide

## Troubleshooting

### Permission denied
```bash
chmod +x benchmark-helper.sh generate-test-notes.py
```

### Python not found
```bash
brew install python3  # macOS with Homebrew
```

### Test Vault not found
Create "Test Vault" in Obsidian first, then re-run scripts.

---

**For complete documentation, see:** [BENCHMARK-TESTING-GUIDE.md](../docs/BENCHMARK-TESTING-GUIDE.md)
