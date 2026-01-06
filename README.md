# Quick PARA Plugin for Obsidian

[![Build](https://github.com/MarkOnFire/obsidian-quick-para/actions/workflows/build.yml/badge.svg)](https://github.com/MarkOnFire/obsidian-quick-para/actions/workflows/build.yml)

Comprehensive PARA (Projects, Areas, Resources, Archive) method support for Obsidian. This plugin combines folder provisioning, automatic tagging, weekly agenda generation, and template management into a single, cohesive experience.

## Features

### Quick Setup Wizard
- One-click PARA folder structure provisioning
- Guided setup for first-time users
- Respects existing vault structure (never overwrites)

### Automatic Tagging
- Property-based PARA location tracking (`para: projects`)
- Persistent subfolder tags (historical breadcrumbs)
- Auto-updates on file create/move
- Bulk update command for existing files

### Weekly Agenda Generation
- Parse Project Dashboard kanban board
- Auto-populate weekly 1-on-1 meetings
- Extract project tasks by folder
- Preserve manual notes and feedback

### Template Management
- Embedded PARA templates
- One-click deployment
- Automatic backup before overwrite
- Templater integration

### Task Management
- Cancel open tasks in Archive folder
- Preview mode to see affected tasks
- Works on current file or entire Archive
- Converts `[ ]` to `[-]` (cancelled status)

### Dependency Checking
- Verify required plugins (Templater, Tasks)
- User-friendly warnings
- Installation guidance

## Installation

### From Obsidian Community Plugins (Coming Soon)
1. Open Settings → Community Plugins
2. Search for "Quick PARA"
3. Click Install, then Enable

### Manual Installation
1. Download the latest release from [Releases](https://github.com/MarkOnFire/obsidian-quick-para/releases)
2. Extract to your vault's `.obsidian/plugins/quick-para/` folder
3. Reload Obsidian
4. Enable the plugin in Settings → Community Plugins

### From Source
```bash
git clone https://github.com/MarkOnFire/obsidian-quick-para.git
cd obsidian-quick-para
npm install
npm run build
# Copy main.js, manifest.json, styles.css to your vault's .obsidian/plugins/quick-para/
```

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

| Command | Description |
|---------|-------------|
| Run PARA Setup Wizard | Initial setup and folder provisioning |
| Update PARA tags for current file | Manually update tags for active note |
| Update PARA tags for all files | Bulk update all notes in vault |
| Update weekly 1-on-1 agenda | Generate agenda from Project Dashboard |
| Deploy PARA templates | Install templates to TEMPLATES folder |
| Check plugin dependencies | Verify Templater and Tasks are installed |
| Cancel all open tasks in Archive | Bulk cancel tasks in archived notes |
| Cancel all open tasks in current file | Cancel tasks in active note |
| Preview archive task cancellation | Dry-run to see affected tasks |

## How It Works

### Automatic Tagging

When you create or move a note:

1. Plugin detects the PARA folder (`0 - INBOX`, `1 - Projects`, etc.)
2. Sets `para` property to location (`inbox`, `projects`, `areas`, `resources`, `archive`)
3. Adds subfolder tags (e.g., `work` from `1 - Projects/Work/`)
4. Tags persist across moves (historical context)
5. Always includes `all` tag for universal filtering

**Example frontmatter**:
```yaml
---
tags:
  - all
  - work
para: projects
created: 2025-11-05
---
```

### Weekly Agenda Generation

The plugin can automatically update your weekly 1-on-1 note:

1. Parses Project Dashboard kanban board sections
2. Extracts project wikilinks from configured folders
3. Populates upcoming meeting section with:
   - Active projects
   - Blocked items
   - Recently completed tasks
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

When notes are archived, they often contain open tasks that are no longer relevant. The task cancellation feature helps clean these up:

- Finds all open tasks (`- [ ]`, `* [ ]`, or `+ [ ]`)
- Converts them to cancelled format: `- [-]`
- Works on entire Archive folder or current file
- Preview mode available to see what would change

## Dependencies

### Required
- **Templater**: Template variable substitution
- **Tasks**: Task management and queries

### Optional
- **Kanban**: For Project Dashboard board (recommended)

## Default PARA Folder Structure

```
0 - INBOX/          # Unsorted incoming information
1 - Projects/       # Active work with deadlines
2 - AREAS/          # Ongoing responsibilities
3 - RESOURCES/      # Reference materials
4 - ARCHIVE/        # Completed or inactive items
```

All folder names are customizable in settings.

## Development

### Building from Source

```bash
git clone https://github.com/MarkOnFire/obsidian-quick-para.git
cd obsidian-quick-para
npm install
npm run build    # Production build
npm run dev      # Watch mode for development
```

### Project Structure

```
obsidian-quick-para/
├── src/
│   ├── index.js         # Main plugin entry point
│   ├── tagging.js       # PARA tagging logic
│   ├── settings.js      # Settings UI
│   ├── agenda.js        # Weekly agenda generation
│   ├── provisioning.js  # Folder setup wizard
│   ├── templates.js     # Template management
│   └── dependencies.js  # Plugin dependency checking
├── main.js              # Compiled bundle (generated)
├── manifest.json        # Plugin metadata
├── styles.css           # Plugin styles
├── package.json
└── esbuild.config.mjs   # Build configuration
```

### Testing in Obsidian

1. Build: `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css` to your test vault's `.obsidian/plugins/quick-para/`
3. Reload Obsidian or toggle the plugin off/on

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
- Review Obsidian console for errors (Cmd+Option+I / Ctrl+Shift+I)

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `npm run build` to ensure it compiles
5. Submit a pull request

## License

MIT License

Copyright (c) 2026 Mark Riechers

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

---

**Version**: 0.1.0
**Author**: [Mark Riechers](https://github.com/MarkOnFire)
**Status**: Beta - Testing before community plugin submission
