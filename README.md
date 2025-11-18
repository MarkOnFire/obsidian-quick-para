# Quick PARA Plugin

Comprehensive PARA (Projects, Areas, Resources, Archive) method support for Obsidian. This plugin combines folder provisioning, automatic tagging, weekly agenda generation, and template management into a single, cohesive experience.

## Features

### 🚀 Quick Setup Wizard
- One-click PARA folder structure provisioning
- Guided setup for first-time users
- Respects existing vault structure (never overwrites)

### 🏷️ Automatic Tagging
- Property-based PARA location tracking (`para: projects`)
- Persistent subfolder tags (historical breadcrumbs)
- Auto-updates on file create/move
- Bulk update command for existing files

### 📅 Weekly Agenda Generation
- Parse Project Dashboard kanban board
- Auto-populate weekly 1-on-1 meetings
- Extract PBSWI project tasks
- Preserve manual notes and feedback

### 📝 Template Management
- Embedded PARA templates
- One-click deployment
- Automatic backup before overwrite
- Templater integration

### ❌ Task Management
- Cancel open tasks in Archive folder
- Preview mode to see affected tasks
- Works on current file or entire Archive
- Converts `[ ]` to `[-]` (cancelled status)

### ✅ Dependency Checking
- Verify required plugins (Templater, Tasks)
- User-friendly warnings
- Installation guidance

## Installation

### Manual Installation
1. Download the plugin files to `.obsidian/plugins/quick-para/`
2. Reload Obsidian
3. Enable the plugin in Settings → Community Plugins

## Usage

### First-Time Setup

1. Click the grid icon in the left ribbon, or run "Quick PARA: Run Setup Wizard"
2. Follow the wizard steps:
   - Review PARA folder configuration
   - Create missing folders
   - Deploy templates (optional)
3. Install Templater and Tasks plugins if prompted

### Configure Settings

Go to Settings → Quick PARA to configure:

- **PARA Folder Mappings**: Customize folder names for your vault
- **Agenda Generation**: Configure Project Dashboard and Weekly 1-on-1 paths
- **Tagging Behavior**: Property name, subfolder persistence
- **Template Management**: Auto-deploy, backup options

### Commands

- **Run PARA Setup Wizard**: Initial setup and folder provisioning
- **Update PARA tags for current file**: Manually update tags for active note
- **Update PARA tags for all files**: Bulk update all notes in vault
- **Update weekly 1-on-1 agenda**: Generate agenda from Project Dashboard
- **Deploy PARA templates**: Install templates to TEMPLATES folder
- **Check plugin dependencies**: Verify Templater and Tasks are installed
- **Cancel all open tasks in Archive folder**: Bulk cancel tasks in archived notes
- **Cancel all open tasks in current file**: Cancel tasks in active note
- **Preview archive task cancellation**: Dry-run to see affected tasks

## How It Works

### Automatic Tagging

When you create or move a note:

1. Plugin detects the PARA folder (`0 - INBOX`, `1 - Projects`, etc.)
2. Sets `para` property to location (`inbox`, `projects`, `areas`, `resources`, `archive`)
3. Adds subfolder tags (e.g., `pbswi` from `1 - Projects/PBSWI/`)
4. Tags persist across moves (historical context)
5. Always includes `all` tag for universal filtering

**Example**:
```yaml
---
tags:
  - all
  - pbswi
para: projects
created: 2025-11-05
---
```

### Weekly Agenda Generation

The plugin can automatically update your weekly 1-on-1 note:

1. Parses Project Dashboard kanban board sections:
   - Done, Doing, Today, Tomorrow, This Week, Blocked
2. Extracts PBSWI project wikilinks
3. Populates upcoming Monday section with:
   - Active projects
   - Blocked items
   - Completed tasks (last 7 days)
4. Preserves manual notes and feedback sections

**Auto-Managed Sections**:
```markdown
#### Projects
<!-- AUTO-MANAGED -->
*Auto-updated from Project Dashboard*
  * [[Project A]]
  * [[Project B]]
<!-- END AUTO-MANAGED -->
```

Content between `<!-- AUTO-MANAGED -->` tags is updated automatically. Content outside these tags is never touched.

### Task Cancellation

When notes are archived, they often contain open tasks that are no longer relevant (cancelled projects, duplicative checklists, etc.). The task cancellation feature helps clean these up:

**What it does**:
- Finds all open tasks (lines with `- [ ]`, `* [ ]`, or `+ [ ]`)
- Converts them to cancelled format: `- [-]`
- Works on entire Archive folder or current file
- Preview mode available to see what would change

**Example transformation**:
```markdown
Before:
- [ ] Complete project proposal
- [ ] Schedule kickoff meeting
- [x] Research competitors

After:
- [-] Complete project proposal
- [-] Schedule kickoff meeting
- [x] Research competitors
```

**Usage**:
1. Use "Preview archive task cancellation" to see affected tasks (check console for details)
2. Run "Cancel all open tasks in Archive folder" to execute
3. Or use "Cancel all open tasks in current file" for single-file cleanup

## Dependencies

### Required
- **Templater**: Template variable substitution
- **Tasks**: Task management and queries

### Optional
- **Kanban**: For Project Dashboard board (recommended)

## Development & Deployment

### Project Structure

Source code lives under `src/` and is bundled with esbuild before deploying to vaults:

```
custom-extensions/plugins/quick-para/
├── src/
│   └── index.js           # Source code (edit this)
├── main.js                # Compiled bundle (generated)
├── manifest.json          # Plugin metadata
├── README.md
├── package.json
└── esbuild.config.mjs
```

### Development Workflow

**CRITICAL**: Obsidian loads `main.js`, NOT `src/index.js`. You must rebuild after editing source files.

#### 1. Edit Source Code

Edit files in `src/index.js` (or other source files).

#### 2. Build the Plugin

**Every time you change source code**, run:

```bash
cd /Users/mriechers/Developer/obsidian-config/custom-extensions/plugins/quick-para
npm run build
```

This bundles `src/index.js` → `main.js` (the file Obsidian actually loads).

#### 3. Deploy to Vaults

After building, deploy to all vaults:

```bash
# Deploy to MarkBrain
rsync -av main.js manifest.json README.md \
  "/Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/MarkBrain/.obsidian/plugins/quick-para/"

# Deploy to Test Vault
rsync -av main.js manifest.json README.md \
  "/Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/Test Vault/.obsidian/plugins/quick-para/"
```

**Or use the full sync** (includes node_modules, takes longer):

```bash
rsync -av --delete \
  "/Users/mriechers/Developer/obsidian-config/custom-extensions/plugins/quick-para/" \
  "/Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/MarkBrain/.obsidian/plugins/quick-para/"
```

#### 4. Reload Plugin in Obsidian

After deployment, reload the plugin:
- **Option A**: Quit and restart Obsidian (safest)
- **Option B**: Settings → Community Plugins → Toggle "Quick PARA" off then on

### Common Mistakes

❌ **Editing source but forgetting to rebuild**
- Changes to `src/index.js` won't appear until you run `npm run build`
- Obsidian loads `main.js`, not the source files

❌ **Deploying without rebuilding**
- Running `rsync` copies old `main.js` to vaults
- Always run `npm run build` first

❌ **Not reloading plugin in Obsidian**
- Even after deploying new files, Obsidian uses the cached version
- Must reload plugin or restart Obsidian to see changes

### Quick Reference

**Full deployment process (after editing source):**

```bash
# 1. Build
cd /Users/mriechers/Developer/obsidian-config/custom-extensions/plugins/quick-para
npm run build

# 2. Deploy to all vaults
rsync -av main.js manifest.json README.md \
  "/Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/MarkBrain/.obsidian/plugins/quick-para/"
rsync -av main.js manifest.json README.md \
  "/Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/Test Vault/.obsidian/plugins/quick-para/"

# 3. Reload Obsidian or toggle plugin off/on in each vault
```

### Development Mode (Optional)

For rapid iteration during development:

```bash
npm run dev  # Watch mode - rebuilds on file changes
```

The checked-in `main.js` is just a stub (`module.exports = require("./src/index.js")`) in source control. `npm run build` replaces it with the distributable single-file bundle expected by Obsidian's plugin loader.

## Configuration

### Default PARA Folder Structure

```
0 - INBOX/          # Unsorted incoming information
1 - Projects/       # Active work with deadlines
  ├── ME/           # Personal projects
  ├── PBSWI/        # Work projects
  └── PD/           # Professional development
2 - AREAS/          # Ongoing responsibilities
3 - RESOURCES/      # Reference materials
4 - ARCHIVE/        # Completed or inactive items
```

All folder names are customizable in settings.

### Template Locations

Templates are deployed to `3 - RESOURCES/TEMPLATES/` by default:
- `default-template.md` - Base template
- `inbox-template.md` - Inbox items
- `projects-template.md` - Project notes
- `areas-template.md` - Area notes
- `resources-template.md` - Resource notes
- `archive-template.md` - Archived notes

**Note**: Files in the TEMPLATES folder are automatically excluded from PARA tagging to prevent templates from inheriting properties and tags.

## Migration from Python Scripts

If you're using the Python-based weekly 1-on-1 automation:

1. Install Quick PARA plugin
2. Configure paths in settings (match your Python config)
3. Test agenda generation with "Update weekly 1-on-1 agenda" command
4. Compare output with Python script
5. Once confident, disable Python LaunchAgent

The plugin produces identical output to the Python scripts but runs natively in Obsidian.

## Comparison with Auto PARA Tagger

This plugin includes enhanced tagging functionality based on the standalone Auto PARA Tagger plugin, with additional features:

| Feature | Auto PARA Tagger | Quick PARA |
|---------|-----------------|------------|
| Auto-tagging | ✅ | ✅ |
| Property-based location | ✅ | ✅ |
| Folder provisioning | ❌ | ✅ |
| Weekly agenda generation | ❌ | ✅ |
| Template management | ❌ | ✅ |
| Dependency checking | ❌ | ✅ |
| Setup wizard | ❌ | ✅ |

Auto PARA Tagger remains available as a lightweight alternative if you only need tagging functionality.

## Troubleshooting

### Tags not updating
- Ensure file is in a PARA folder
- Check folder mappings in settings
- Run "Update PARA tags for current file" manually

### Agenda generation fails
- Verify Project Dashboard path in settings
- Check kanban board format (## sections)
- Ensure Weekly 1-on-1 file exists

### Templates not deploying
- Verify TEMPLATES folder exists
- Check for file permission issues
- Review Obsidian console for errors

## Support

- **Issues**: Report bugs in the repository
- **Documentation**: See `/docs/DESIGN.md` for technical details
- **Legacy Plugin**: Auto PARA Tagger preserved in `auto-para-tagger-legacy/`

## License

MIT License

---

**Version**: 0.1.0 (Alpha)
**Author**: Mark Riechers
**Status**: Active Development

🚧 This plugin is in active development. Test thoroughly before using in production vaults.
