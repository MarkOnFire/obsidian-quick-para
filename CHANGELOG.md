# Changelog - Quick PARA Plugin

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Planned for 1.0.0
- Automatic scheduling for project updates (currently manual only)
- Day-of-month picker for monthly updates

---

## [0.5.0] - 2025-11-07

### Added
- **Bulk Tag Update Ribbon Button** 🎉
  - New "tags" ribbon icon for quick access to bulk PARA tag updates
  - Complements existing command palette option

- **Task Extraction from Project Folders** 🎉
  - Project updates now extract tasks directly from notes in project folders
  - No longer depends solely on Kanban board
  - Shows both Kanban-tracked projects AND tasks from individual project notes

- **Smart Template Recovery** 🎉
  - Missing Project Dashboard automatically recreates from template
  - Graceful handling when Kanban board is deleted

- **Enhanced Settings UI**
  - "Update All PARA Tags" button added to Quick Actions section
  - "Deploy PARA Templates" button added to Quick Actions section
  - All critical actions now accessible from top of settings

### Changed
- **Template System Overhaul** 🎉
  - Templates now use smart regeneration (only creates missing files)
  - Existing templates NEVER overwritten (preserves user customizations)
  - Removed backup file system entirely (no more `.backup.md` clutter)
  - Deploy shows clear report: "X created, Y skipped, Z errors"

- **PARA Property Locked**
  - Property name field removed from settings (always "para")
  - Updated description to clarify property name is locked

- **Better Template Descriptions**
  - "Clean Template Files" now explains when to use it
  - Updated templates to match canonical versions in templates/

- **Reset Settings Behavior**
  - Now includes confirmation dialog warning about template deletion
  - Explicitly regenerates ALL templates from defaults
  - Clear two-step warning about consequences

### Removed
- "Backup Before Overwrite" toggle (templates no longer overwritten)
- "PARA Property Name" field (locked to "para")
- Backup file creation logic entirely
- Template validation warnings

### Fixed
- Missing ribbon button for bulk tag updates
- Template deployment no longer creates backup clutter
- Project updates handle missing Kanban board gracefully
- `formatProjectsSection()` now async to support task extraction
- Settings UI shows all critical actions in Quick Actions

---

## [0.4.0] - 2025-11-06

### Added
- **Project Update Generation System**
  - Modal for configuring automated project updates
  - Folder autocomplete in project folder path field
  - Time picker for scheduling updates (HH:MM format)
  - "Generate Now" button in settings for manual generation
  - Calendar-check ribbon icon for quick access to update generation
  - Support for daily/weekly/monthly schedules with day-of-week selection

- **UI Improvements**
  - H1 header for settings page title
  - Horizontal rules between settings sections
  - Enhanced config display showing schedule details (e.g., "Mondays at 09:00 • folder")

- **Dependency Management**
  - Moved Kanban to required dependencies (was optional)
  - Updated help text to explain Kanban's role in project updates

### Changed
- Removed all hardcoded PBSWI references from AgendaManager
- `updateWeeklyAgenda()` renamed to `updateProjectAgenda()` with flexible parameters
- `formatProjectsSection()` now accepts optional project folder filter
- Settings description now includes time in schedule display

### Fixed
- `cleanTemplateFiles()` button now correctly calls `taggingManager.cleanTemplateFiles()`
- Module loading issue by consolidating QuickParaSettingTab into main.js

---

## [0.3.0] - 2025-11-05

### Added
- Project Update configuration modal
- Settings structure for `projectUpdates` with configs array
- Methods for generating project updates (`generateAllProjectUpdates`, `generateProjectUpdate`)
- Command for manual project update generation

### Changed
- Replaced `agendaGeneration` settings with `projectUpdates` structure
- Settings migration for backward compatibility

---

## [0.2.0] - 2025-11-05

### Added
- Settings overhaul with actions moved to top
- Clickable obsidian:// links for dependency installation
- Project Dashboard template
- PARA Method Overview template
- SETTINGS-HELP.md for editable help text
- PARA methodology documentation in knowledge base

### Changed
- Updated default Projects folder to "1 - PROJECTS" (all caps)
- Locked PARA property to "para" (not user-configurable)
- Renamed "Weekly 1-on-1" to "Project Updates" throughout
- Project updates disabled by default

### Removed
- "Migrate old tags" setting (legacy-only feature)

---

## [0.1.0] - 2025-10-15

### Added
- Initial implementation
- Auto-tagging based on PARA folder location
- Template deployment system
- Setup wizard
- Dependency checking
- Basic PARA folder configuration

---

## Development Notes

### Version Guidelines

**0.x.x** = Pre-release, features still being added
**1.0.0** = Production ready, stable API
**1.x.x** = New features, backward compatible
**2.x.x** = Breaking changes

### Contributing

When updating this changelog:
1. Add unreleased changes under `[Unreleased]`
2. When releasing, move unreleased changes to new version section
3. Follow format: Added/Changed/Deprecated/Removed/Fixed/Security
4. Include date in YYYY-MM-DD format
