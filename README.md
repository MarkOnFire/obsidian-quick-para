# Quick PARA Plugin for Obsidian

Automate the [PARA method](https://fortelabs.com/blog/para/) in your Obsidian vault. Quick PARA handles folder provisioning, automatic tagging, template management, task cancellation for archived notes, and project update generation.

## Features

### Setup wizard

A guided, three-step wizard creates your PARA folder structure and optionally deploys starter templates. It detects existing folders and never overwrites your vault structure.

### Automatic PARA tagging

- Sets a `para` frontmatter property (`inbox`, `projects`, `areas`, `resources`, `archive`) based on which PARA folder a note lives in.
- Extracts subfolder names as persistent tags (e.g., a note in `1 - PROJECTS/Work/` gets the tag `work`).
- Subfolder tags persist when notes move between PARA locations, preserving historical context.
- Fires automatically on file create, move, and rename.
- Bulk-update command to tag every note in the vault at once.
- Tracks `created` and `archived` dates, and optionally records a `para_history` of location changes.
- Skips files in the TEMPLATES folder to keep templates clean.
- Adds a universal `all` tag to every note for easy filtering.

**Example frontmatter:**
```yaml
---
tags:
  - all
  - work
para: projects
created: 2025-11-05
---
```

### Template management

- Six built-in PARA templates (default, inbox, projects, areas, resources, archive).
- One-click deployment to a TEMPLATES folder.
- Never overwrites user-edited templates; only creates missing ones.
- Optional timestamped backup before overwriting.
- Templater syntax support for dynamic variables.
- Auto-generates a Resource Index `.base` file for the Obsidian Bases plugin.

### Task cancellation

When notes are archived, their open tasks are usually no longer relevant. This feature converts open tasks (`- [ ]`, `* [ ]`, `+ [ ]`) to cancelled (`- [-]`).

- Works on the entire Archive folder or the current file.
- Preview (dry-run) mode shows exactly what would change before modifying anything.
- Optional automatic cancellation when files are moved into Archive.

### Project update generation

- Parses a Project Dashboard kanban board to extract project status.
- Generates weekly sections with active projects, blocked items, recently completed tasks, and priority items.
- Preserves manual notes outside `<!-- AUTO-MANAGED -->` markers.
- Embeds Tasks plugin queries for recent completions, upcoming due dates, recurring tasks, and inactive projects.

### Dependency checking

- Verifies required plugins (Templater, Tasks) and optional plugins (Kanban) are installed and enabled.
- Shows a modal with installation links for any missing dependencies.

## Commands

| Command | Description |
|---------|-------------|
| Run PARA setup wizard | Launch the three-step folder and template setup |
| Update PARA tags for current file | Tag the active note based on its PARA location |
| Update PARA tags for all files | Bulk-tag every markdown file in the vault |
| Deploy PARA templates | Create missing templates in the TEMPLATES folder |
| Clean PARA properties from template files | Strip PARA tags from template files |
| Check plugin dependencies | Verify Templater, Tasks, and Kanban status |
| Cancel all open tasks in Archive folder | Bulk-cancel tasks in all archived notes |
| Cancel all open tasks in current file | Cancel tasks in the active note |
| Preview archive task cancellation (dry run) | See what would change without modifying files |

## Installation

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/MarkOnFire/obsidian-quick-para/releases).
2. Create a folder at `<your-vault>/.obsidian/plugins/quick-para/`.
3. Copy the three files into that folder.
4. Open Obsidian, go to **Settings > Community plugins**, and enable **Quick PARA**.

### From source

```bash
git clone https://github.com/MarkOnFire/obsidian-quick-para.git
cd obsidian-quick-para
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's `.obsidian/plugins/quick-para/` directory, then enable the plugin in Obsidian.

## Getting started

1. Enable the plugin and click the grid icon in the left ribbon (or run **Quick PARA: Run PARA setup wizard**).
2. Walk through the wizard to create folders and deploy templates.
3. Install [Templater](https://github.com/SilentVoid13/Templater) and [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) when prompted — both are required for full functionality.
4. Configure folder names, tagging behavior, and template options in **Settings > Quick PARA**.

## Dependencies

| Plugin | Required | Purpose |
|--------|----------|---------|
| [Templater](https://github.com/SilentVoid13/Templater) | Yes | Template variable substitution |
| [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) | Yes | Task management and queries |
| [Kanban](https://github.com/mgmeyers/obsidian-kanban) | No | Project Dashboard board for project updates |

## Default folder structure

```
0 - INBOX/
1 - PROJECTS/
2 - AREAS/
3 - RESOURCES/
4 - ARCHIVE/
```

All folder names are customizable in settings.

## Troubleshooting

**Tags not updating** — Make sure the file is inside a PARA folder. Check your folder mappings in settings and try running "Update PARA tags for current file" manually.

**Templates not deploying** — Verify the TEMPLATES folder exists and check the Obsidian developer console (**Ctrl+Shift+I** / **Cmd+Option+I**) for errors.

**Project updates not generating** — Confirm the Kanban plugin is installed, and that the Project Dashboard path in settings points to an existing kanban board file.

## Development

```bash
npm install
npm run build    # production build
npm run dev      # watch mode with auto-rebuild
```

### Project structure

```
src/
├── index.js              # Main plugin entry point
├── settings.js           # Settings tab UI
├── tagging.js            # PARA tagging logic
├── provisioning.js       # Setup wizard and folder creation
├── templates.js          # Template management
├── agenda.js             # Project update generation
├── tasks.js              # Task cancellation
├── dependencies.js       # Plugin dependency checking
└── performance-profiler.js  # Diagnostic profiling
```

## Contributing

1. Fork the repository.
2. Create a feature branch.
3. Make your changes and run `npm run build` to verify.
4. Submit a pull request.

## License

[MIT](LICENSE) — Copyright (c) 2026 Mark Riechers
