# Quick PARA Plugin - Design Document

## Overview

Quick PARA is a consolidated Obsidian plugin that provides comprehensive PARA (Projects, Areas, Resources, Archive) method support. It combines folder provisioning, automatic tagging, weekly agenda generation, and template management into a single, cohesive user experience.

## Goals

1. **Seamless Onboarding**: Provision PARA folders and templates with one click
2. **Automatic Organization**: Auto-tag notes based on location with property-based tracking
3. **Workflow Integration**: Generate weekly 1-on-1 agendas from Project Dashboard
4. **Respect User Data**: Never overwrite existing content without explicit permission
5. **Dependency Awareness**: Check for required plugins (Templater, Tasks) and guide users

## Core Modules

### 1. Provisioning Manager
**Purpose**: Initialize PARA folder structure and templates

**Features**:
- Detect existing PARA folders or create new ones
- Configurable folder names (default: `0 - INBOX`, `1 - Projects`, `2 - AREAS`, `3 - RESOURCES`, `4 - ARCHIVE`)
- Deploy templates from embedded resources
- "Create missing only" mode - never overwrites existing folders
- First-run wizard for guided setup

**Implementation**:
```javascript
class ProvisioningManager {
  async detectExistingStructure()
  async provisionFolders(config, createMissingOnly = true)
  async deployTemplates(templateConfig)
  async runSetupWizard()
}
```

### 2. Tagging Manager
**Purpose**: Automatic PARA location tracking and subfolder tagging

**Features**:
- Property-based location tracking (`para: projects`)
- Persistent subfolder tags (e.g., `pbswi`, `career`)
- Automatic updates on file move/create
- Manual bulk update command
- Settings UI for folder mappings

**Implementation**:
```javascript
class TaggingManager {
  async updateParaTags(file)
  async bulkUpdateTags(files, preview = true)
  getTagsFromPath(filePath)
  async migrateOldTags() // Convert para/* nested tags
}
```

**Tag Philosophy** (from your notes):
- `para` property: Current PARA location (inbox, projects, areas, resources, archive)
- Subfolder tags: Historical breadcrumbs that persist across moves
- `all` tag: Universal tag for filtering
- No nested tags: Each element is independent (not `pbswi/blocked`, just `pbswi` + `blocked`)

### 3. Agenda Manager
**Purpose**: Generate weekly 1-on-1 meeting agendas from Project Dashboard

**Features**:
- Parse Project Dashboard kanban board (Done, Doing, Today, Tomorrow, This Week, Blocked)
- Extract PBSWI project tasks and wikilinks
- Populate upcoming Monday section with auto-managed content
- Preserve manual notes and feedback sections
- Detect changes to avoid redundant updates

**Implementation**:
```javascript
class AgendaManager {
  async parseKanbanBoard(boardFile)
  async updateWeeklyAgenda(mondayDate, kanbanData)
  async extractCompletedTasks(projectNote)
  getNextMondayDate()
}
```

**Integration with Python Scripts**:
- Port logic from `update-1on1-agenda.py` (PRIMARY)
- Port logic from `sync-notes.py` (SECONDARY - bidirectional sync)
- Maintain identical output format for compatibility
- Test against Python script output before deployment

### 4. Template Manager
**Purpose**: Deploy and maintain PARA templates

**Features**:
- Embedded templates (bundled with plugin)
- Template validation (check for Templater syntax)
- Update detection (hash-based change tracking)
- Backup before overwrite
- Template preview before deployment

**Implementation**:
```javascript
class TemplateManager {
  async listAvailableTemplates()
  async deployTemplate(templateName, destination)
  async detectTemplateChanges(templateName)
  async backupExistingTemplate(templatePath)
}
```

**Template Requirements** (from CLAUDE.md):
- YAML frontmatter with `tags: [all]` and `created` field
- Templater syntax support (e.g., `<% tp.file.creation_date() %>`)
- Tasks plugin code blocks for task management
- PARA-specific templates: inbox, projects, areas, resources, archive

### 5. Dependency Manager
**Purpose**: Check for required plugins and guide installation

**Features**:
- Detect installed plugins (Templater, Tasks, Kanban)
- Version compatibility checks
- User-friendly warnings with installation links
- Graceful degradation (work without optional dependencies)

**Implementation**:
```javascript
class DependencyManager {
  async checkDependencies()
  isPluginInstalled(pluginId)
  isPluginEnabled(pluginId)
  async showDependencyWarning(missingPlugins)
}
```

**Required Dependencies**:
- **Templater**: Template variable substitution (critical)
- **Tasks**: Task management and queries (critical)
- **Kanban**: For Project Dashboard parsing (optional but recommended)

### 6. Settings Manager
**Purpose**: Centralized configuration UI

**Features**:
- PARA folder name configuration
- Template deployment options
- Agenda generation settings (enable/disable, target file)
- Tagging behavior (property name, subfolder persistence)
- Dependency status display

**Implementation**:
```javascript
class QuickParaSettings {
  paraFolders: {
    inbox: "0 - INBOX",
    projects: "1 - Projects",
    areas: "2 - AREAS",
    resources: "3 - RESOURCES",
    archive: "4 - ARCHIVE"
  },
  agendaGeneration: {
    enabled: true,
    kanbanFile: "0 - INBOX/Project Dashboard.md",
    agendaFile: "0 - INBOX/Weekly 1 on 1.md",
    pbswiFolder: "1 - Projects/PBSWI"
  },
  templates: {
    autoDeployOnSetup: true,
    backupBeforeOverwrite: true
  },
  tagging: {
    propertyName: "para",
    persistSubfolderTags: true,
    migrateOldTags: false
  }
}
```

## Plugin Architecture

```
QuickParaPlugin (main.js)
├── ProvisioningManager (src/provisioning.js)
├── TaggingManager (src/tagging.js)
├── AgendaManager (src/agenda.js)
├── TemplateManager (src/templates.js)
├── DependencyManager (src/dependencies.js)
└── SettingsTab (src/settings.js)
```

## User Workflows

### First-Time Setup (New Vault)

1. Install Quick PARA plugin
2. Plugin detects no PARA structure → Shows setup wizard
3. Wizard steps:
   - Welcome & explanation
   - Dependency check (Templater, Tasks)
   - Folder configuration (use defaults or customize)
   - Template deployment (preview, confirm)
   - Success confirmation with "What's Next" guide

**Result**: Fully provisioned PARA vault with templates ready to use

### Existing Vault Migration

1. Install Quick PARA plugin
2. Plugin detects existing folders → Offers migration
3. Migration wizard:
   - Detect existing PARA folders
   - Map to PARA categories (auto-suggest based on names)
   - Offer to migrate old `para/*` tags to properties
   - Deploy missing templates only
   - Confirm before any changes

**Result**: Existing vault enhanced with PARA features, no data loss

### Weekly 1-on-1 Automation

1. User works on tasks in Project Dashboard (kanban board)
2. Plugin monitors changes (or manual trigger via command)
3. On Monday morning (or scheduled time):
   - Parse Project Dashboard sections
   - Extract PBSWI project links and completed tasks
   - Update Weekly 1-on-1 note's Monday section
   - Preserve manual notes and feedback
4. User reviews agenda before meeting

**Result**: Agenda automatically prepared, no manual copying

### File Organization

1. User creates note in INBOX
2. Plugin auto-tags: `tags: [all]`, `para: inbox`
3. User moves note to `1 - Projects/PBSWI/`
4. Plugin updates: `para: projects`, adds `pbswi` tag
5. User later archives to `4 - ARCHIVE/Old Projects/PBSWI/`
6. Plugin updates: `para: archive`, keeps `pbswi` + adds `old-projects` tag

**Result**: Location tracked automatically, project history preserved

## Testing Strategy

### Unit Tests
- Tag generation from paths (various edge cases)
- Kanban parsing (empty sections, malformed tasks)
- Template validation (missing frontmatter, invalid syntax)
- Folder detection (similar names, nested structures)

### Integration Tests
- Full provisioning workflow in test vault
- Tag updates across file moves
- Agenda generation with real kanban data
- Template deployment with existing files

### Regression Tests (Critical!)
- **Output Compatibility**: Compare agenda output with Python script
- **Tag Migration**: Verify old `para/*` tags convert correctly
- **No Data Loss**: Ensure manual content never gets overwritten

### Test Vaults
1. **Empty Vault**: Test first-time setup
2. **Partially Provisioned**: Test "create missing only" mode
3. **Existing PARA**: Test migration from current setup
4. **Large Vault**: Performance test with 1000+ files

## Comparison with Python Scripts

| Feature | Python Scripts | Quick PARA Plugin |
|---------|---------------|-------------------|
| **Agenda Generation** | ✅ Full support | ✅ Port exact logic |
| **Tag Management** | ❌ Manual (Templater script) | ✅ Automatic |
| **Template Deployment** | ❌ Manual rsync | ✅ One-click |
| **Dependency Checks** | ❌ Assume installed | ✅ Validate & warn |
| **User Experience** | ⚠️ Requires Python, LaunchAgent | ✅ Native Obsidian |
| **Maintenance** | ⚠️ External scripts | ✅ Self-contained |

**Migration Path**:
1. Build plugin with feature parity
2. Test extensively against Python output
3. Run both systems in parallel for 1-2 weeks
4. Disable Python scripts once confident
5. Keep Python scripts as backup/reference

## Preservation of Auto PARA Tagger

The original `auto-para-tagger` plugin is preserved in `custom-extensions/plugins/auto-para-tagger-legacy/` as:
- **Backup**: In case Quick PARA has issues
- **Reference**: Simple implementation for community release
- **Modularity**: Can be used standalone if user doesn't want full suite

Quick PARA's `TaggingManager` is based on this code but enhanced with:
- Settings UI for folder configuration
- Preview mode for bulk operations
- Migration wizard for old tags
- Better error handling and logging

## Implementation Plan

### Phase 1: Core Infrastructure (Week 1)
- [ ] Plugin scaffolding (manifest, main.js, settings)
- [ ] Dependency Manager implementation
- [ ] Settings UI with folder configuration
- [ ] Basic file system utilities

### Phase 2: Tagging & Provisioning (Week 2)
- [ ] TaggingManager (port from auto-para-tagger)
- [ ] ProvisioningManager (folder creation)
- [ ] TemplateManager (embed templates)
- [ ] First-time setup wizard

### Phase 3: Agenda Generation (Week 3)
- [ ] AgendaManager (port from Python)
- [ ] Kanban board parser
- [ ] Project task extraction
- [ ] Weekly note updater
- [ ] Compare output with Python script

### Phase 4: Testing & Refinement (Week 4)
- [ ] Unit tests for all managers
- [ ] Integration tests in test vaults
- [ ] User acceptance testing
- [ ] Documentation and README
- [ ] Migration guide from Python scripts

### Phase 5: Deployment (Week 5)
- [ ] Deploy to production vault
- [ ] Run in parallel with Python scripts
- [ ] Monitor for issues
- [ ] Disable Python scripts
- [ ] Community release preparation

## Success Criteria

1. **Functional Parity**: Agenda output matches Python script 100%
2. **No Data Loss**: All manual content preserved during updates
3. **User Satisfaction**: Setup takes <5 minutes, automation "just works"
4. **Performance**: Bulk tag update of 1000+ files completes in <30 seconds
5. **Reliability**: No breaking changes to existing workflows

## Future Enhancements (Post-V1)

- Auto-detection of PARA folders (smart suggestions)
- Preview mode for all bulk operations
- Rollback/undo functionality
- Integration with Dataview queries
- Graph view filtering by PARA location
- Mobile support optimization
- Community plugin store submission

## Notes

- Keep implementation in JavaScript for now (TypeScript migration later)
- Maintain compatibility with existing PARA structure (no breaking changes)
- Document every design decision (future maintainers will thank you)
- Test extensively before disabling Python scripts
- Preserve the simplicity of auto-para-tagger as a reference

---

**Last Updated**: 2025-11-05
**Status**: Design Phase
**Next Step**: Begin Phase 1 implementation
