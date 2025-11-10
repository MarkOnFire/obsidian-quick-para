# Quick PARA Settings Help Text

This file contains all help text and descriptions that appear in the plugin settings UI. Edit this file to customize the help text, and the plugin will automatically load the updated content.

---

## Header Description

Quick PARA helps you organize your Obsidian vault using the PARA method (Projects, Areas, Resources, Archive). This plugin automates folder setup, template deployment, and project update generation.

**Learn more about PARA**: See the "PARA Method Overview" note in your Resources folder, or visit [Forte Labs](https://fortelabs.com/blog/para/).

---

## Action Buttons

### Setup Wizard Button
**Text**: Run Setup Wizard

**Description**: Launch the step-by-step setup wizard to create your PARA folder structure, deploy templates, and configure basic settings.

### Check Dependencies Button
**Text**: Check Dependencies

**Description**: Verify that required plugins (Templater, Tasks) and optional plugins (Kanban) are installed and enabled.

---

## Required Dependencies

### Templater
**Description**: Required for template variable substitution (dates, file names, etc.). Templates won't work without this plugin.

**Install**: [Open in Community Plugins](obsidian://show-plugin?id=templater-obsidian)

### Tasks
**Description**: Required for task management features in templates and project updates. Provides checkbox syntax and date formatting.

**Install**: [Open in Community Plugins](obsidian://show-plugin?id=obsidian-tasks-plugin)

---

## Optional Dependencies

### Kanban
**Description**: Recommended for project tracking. Required if you want to use the Project Dashboard template for visual task management.

**Install**: [Open in Community Plugins](obsidian://show-plugin?id=obsidian-kanban)

---

## PARA Folders Section

**Section Header**: PARA Folder Configuration

**Description**: Configure the names of your five core PARA folders. These folders will be created automatically during setup if they don't exist. The plugin uses these paths to determine where notes belong and what properties to assign.

**Note**: Folder names are case-insensitive. The plugin will match "1 - projects", "1 - Projects", or "1 - PROJECTS" equally.

### Individual Folder Settings

#### Inbox
**Label**: Inbox Folder
**Description**: Temporary storage for unsorted notes and incoming information. New project updates are created here.
**Default**: `0 - INBOX`

#### Projects
**Label**: Projects Folder
**Description**: Active work with deadlines and defined endpoints. Projects should have clear completion criteria.
**Default**: `1 - PROJECTS`

#### Areas
**Label**: Areas Folder
**Description**: Ongoing responsibilities that require regular attention but have no end date (e.g., health, finances, relationships).
**Default**: `2 - AREAS`

#### Resources
**Label**: Resources Folder
**Description**: Reference materials, documentation, templates, and information you want to keep but aren't actively working on.
**Default**: `3 - RESOURCES`

#### Archive
**Label**: Archive Folder
**Description**: Completed projects and inactive items. Notes moved here automatically get an "archived" date property.
**Default**: `4 - ARCHIVE`

---

## Auto-Tagging Section

**Section Header**: Automatic Tagging Behavior

**Description**: Control how the plugin automatically assigns properties and tags when you create or move notes. The `para` property always reflects a note's current PARA location, while subfolder tags provide historical context.

### PARA Property Name
**Label**: PARA Property Name
**Description**: The frontmatter property that stores PARA location. This is always set to `para` and cannot be changed.
**Value**: `para` (locked)

### Subfolder Tag Persistence
**Label**: Preserve subfolder tags when moving notes
**Description**: When enabled, tags from subfolder names persist even when you move notes between PARA folders. This preserves project context over time.

**Example**: A note tagged `pbswi` in `1 - PROJECTS/PBSWI` keeps that tag even if moved to Archive.

**Default**: Enabled

---

## Project Updates Section

**Section Header**: Project Update Generation

**Description**: Automatically generate recurring status reports for any project folder. Each project can have its own schedule (daily, weekly, or monthly). Reports are created in your Inbox folder as `UPDATE — [PROJECT NAME].md`.

**Important**: The Kanban plugin is required for project updates to work. Updates pull from your Project Dashboard kanban board.

### Enable Project Updates
**Label**: Enable automatic project updates
**Description**: Turn on scheduled project update generation. When disabled, no automatic updates will be created, but you can still trigger them manually.
**Default**: Disabled

### Project Update Configurations
**Description**: Configure which project folders should generate automatic updates. You can add multiple configurations for different projects with different schedules.

**Add Button Text**: + Add Project Update

**Empty State Text**: No project updates configured. Click "Add Project Update" to create your first automated status report.

---

## Project Update Configuration Modal

**Modal Title**: Configure Project Update

### Project Name
**Label**: Display Name
**Description**: A friendly name for this project update (e.g., "PBSWI Weekly Status", "Personal Daily Standup")
**Placeholder**: PBSWI Weekly Update

### Project Folder
**Label**: Project Folder Path
**Description**: Which project subfolder to track (e.g., `1 - PROJECTS/PBSWI`). Updates will scan all notes in this folder and its subfolders.
**Placeholder**: 1 - PROJECTS/PBSWI
**Button**: Browse...

### Schedule Type
**Label**: Update Frequency
**Options**:
- Daily
- Weekly
- Monthly

### Schedule Details (Weekly)
**Day of Week Label**: Day of Week
**Options**: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday
**Default**: Monday

**Time Label**: Time
**Description**: What time to generate the update (24-hour format)
**Default**: 09:00

### Schedule Details (Monthly)
**Day of Month Label**: Day of Month
**Description**: Which day of the month to generate updates (1-31)
**Default**: 1

### Report Options
**Section Label**: Include in Report

**Completed Tasks**:
- **Label**: Show completed tasks
- **Description**: Include recently completed tasks in the update
- **Default**: Enabled

**Active Projects**:
- **Label**: Show active projects
- **Description**: List current projects in progress
- **Default**: Enabled

**Blocked Items**:
- **Label**: Show blocked items
- **Description**: Highlight tasks waiting on external dependencies
- **Default**: Enabled

### Lookback Period
**Label**: Lookback Period (days)
**Description**: How many days back to search for completed tasks
**Default**: 7
**Range**: 1-30

---

## Template Management Section

**Section Header**: PARA Templates

**Description**: Manage the default templates that get deployed to your vault. Templates are stored in `3 - RESOURCES/TEMPLATES/` and use Templater syntax for dynamic content.

**Note**: Template files themselves never receive PARA properties - they remain "clean" so new notes created from them start fresh.

### Deploy Templates Button
**Text**: Deploy PARA Templates
**Description**: Install or update all six default templates (default, inbox, projects, areas, resources, archive) plus the Project Dashboard template.

### Clean Template Files Button
**Text**: Clean Template Properties
**Description**: Remove any PARA properties or tags from files in your TEMPLATES folders. Use this if templates accidentally got tagged.

---

## Advanced Section

**Section Header**: Advanced Settings

**Description**: Additional configuration options for power users.

### Reset Settings Button
**Text**: Reset to Defaults
**Description**: Restore all settings to their default values. This will not delete your folders or notes, only reset plugin configuration.
**Confirm**: "Are you sure you want to reset all settings to defaults? This cannot be undone."

---

## Notices and Messages

### Success Messages
- "Setup wizard completed successfully!"
- "PARA templates deployed successfully"
- "Template files cleaned"
- "Project update generated: UPDATE — [PROJECT].md"
- "Settings reset to defaults"

### Error Messages
- "Templater plugin is required but not installed"
- "Tasks plugin is required but not installed"
- "Kanban plugin is required for project updates"
- "Failed to deploy template: [template name]"
- "Could not find project folder: [path]"

### Warning Messages
- "Project updates are currently disabled. Enable them in settings to generate automatic updates."
- "No project configurations found. Add at least one project to generate updates."
- "Template file [name] already exists. Overwrite?"

---

## Footer

**Help Resources**:
- **Documentation**: See the README.md file in the plugin folder
- **PARA Method**: Read "PARA Method Overview" in Resources folder
- **Support**: Report issues at [GitHub repository URL]

---

**Last Updated**: 2025-11-05
**Version**: 0.2.0
