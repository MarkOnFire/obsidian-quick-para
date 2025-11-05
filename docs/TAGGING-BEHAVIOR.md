# PARA Auto-Tagging Behavior - Complete Reference

## Overview

This document describes the complete behavior of the PARA auto-tagging system, including all edge cases, filters, and design decisions made during development.

**Last Updated**: 2025-11-05
**Status**: Production

---

## Core Concepts

### 1. PARA Property
- **Name**: `para` (configurable via settings)
- **Purpose**: Indicates current top-level PARA location
- **Values**: `inbox`, `projects`, `areas`, `resources`, `archive`
- **Behavior**: Always reflects current location, updated on move

### 2. Subfolder Tags
- **Purpose**: Historical breadcrumbs showing project/category context
- **Persistence**: Tags persist when moving between PARA folders
- **Format**: Lowercase kebab-case (e.g., `pbswi`, `home-assistant`)
- **Source**: Generated from folder names between PARA root and file

### 3. Universal Tag
- **Tag**: `all`
- **Purpose**: Universal filter for all notes
- **Behavior**: Always present, always first in tag list

---

## Tagging Logic

### File Creation

**When a new file is created:**

1. **Event Detection**: `vault.on('create')` fires
2. **Delay**: Wait 500ms for Templater to finish
3. **Location Detection**: Parse file path to determine PARA folder
4. **Template Exclusion**: Skip if in `TEMPLATES/` folder
5. **Tag Application**:
   - Set `para` property based on top-level folder
   - Add subfolder tags from path hierarchy
   - Ensure `all` tag is present
   - Remove template-specific tags

**Example:**
```
File: 1 - Projects/PBSWI/Sprint-12/Meeting Notes.md

Result:
---
tags:
  - all
  - pbswi
  - sprint-12
para: projects
created: 2025-11-05
---
```

### File Move

**When a file is moved between folders:**

1. **Event Detection**: `vault.on('rename')` fires
2. **Path Comparison**: Check if path changed (not just rename)
3. **Location Update**: Determine new PARA folder
4. **Tag Updates**:
   - Update `para` property if crossing PARA boundaries
   - Add new subfolder tags
   - **Preserve** old subfolder tags (historical context)
   - Add `archived` date if moving to Archive

**Example:**
```
Move: 1 - Projects/PBSWI/Feature.md
  →   2 - AREAS/Maintenance/Feature.md

Before:
---
tags: [all, pbswi]
para: projects
---

After:
---
tags: [all, pbswi, maintenance]
para: areas
---
```

Note: `pbswi` tag persists as historical context!

### File Modify (Template Catch)

**When a recently created file is modified:**

1. **Event Detection**: `vault.on('modify')` fires
2. **Age Check**: Only process if file < 5 seconds old
3. **Purpose**: Catch late Templater writes
4. **Action**: Re-apply tagging logic to ensure correctness

This handles cases where Templater writes frontmatter after our create event.

---

## Filtering Rules

### Tags That Are ALWAYS Removed

```javascript
// Template-related tags
'templates'
'template'

// Location tags (will be replaced)
'resources'
'para/*' (any nested para tags)

// Universal tag (will be re-added)
'all'
```

### Tags That Are PRESERVED

```javascript
// User-added tags
'#important'
'#review'
'#meeting'

// Historical subfolder tags
'pbswi'
'home-assistant'
'career'

// Any tag not in the removal list
```

### Properties That Are REMOVED (Templates Only)

When cleaning template files:
```javascript
para: <any value>
archived: <any date>
```

### Properties That Are PRESERVED

```javascript
created: <date>        // Always preserved
modified: <date>       // System property
status: <value>        // User property
<any custom property>  // User-defined
```

---

## Special Cases

### Case 1: TEMPLATES Folder

**Behavior**: Files in any `TEMPLATES/` folder are completely skipped.

**Detection**:
```javascript
if (filePath.includes('/TEMPLATES/') || filePath.startsWith('TEMPLATES/'))
```

**Purpose**: Prevent templates from getting PARA properties that would be copied to new files.

**Example:**
```
File: 3 - RESOURCES/TEMPLATES/projects-template.md
Action: SKIP (no tagging applied)
```

### Case 2: Case-Insensitive Matching

**Problem**: Folder matching was case-sensitive, breaking if user typed "2 - areas" instead of "2 - AREAS"

**Solution**: Case-insensitive comparison for folder matching

**Implementation**:
```javascript
const lowerFilePath = filePath.toLowerCase();
const lowerFolderName = folderName.toLowerCase();

if (lowerFilePath.startsWith(lowerFolderName + '/') ||
    lowerFilePath === lowerFolderName)
```

**Examples That Now Work**:
```
Config: "1 - Projects"
File: "1 - projects/Test.md"     ✅ Matches
File: "1 - PROJECTS/Test.md"     ✅ Matches
File: "1 - Projects/Test.md"     ✅ Matches
```

### Case 3: Archive Date

**Behavior**: When moving to Archive folder, add `archived` date.

**Logic**:
```javascript
if (paraLocation === 'archive' && !frontmatter.archived) {
    frontmatter.archived = new Date().toISOString().split('T')[0];
}
```

**Purpose**: Track when items were archived.

**Note**: Date is only added once (if not already present).

### Case 4: Created Date

**Behavior**: Add `created` date if missing.

**Logic**:
```javascript
if (!frontmatter.created && createdDate) {
    frontmatter.created = file.stat.ctime; // File creation time
}
```

**Purpose**: Ensure all notes have creation tracking.

---

## Template Workflow

### Problem Statement

Templates stored in `3 - RESOURCES/TEMPLATES/` were getting:
- `para: resources` property
- `templates` and `resources` tags
- When used with Templater, new files inherited these properties
- New files in `1 - Projects/` had wrong `para: resources`

### Solution: Multi-Layer Protection

**Layer 1: Exclude Template Files**
```javascript
// Templates themselves are never tagged
if (filePath.includes('/TEMPLATES/')) return;
```

**Layer 2: Strip Template Tags**
```javascript
// Remove tags that shouldn't propagate
filteredTags = filteredTags.filter(tag => {
    const tagStr = String(tag).toLowerCase();
    return tagStr !== 'templates' &&
           tagStr !== 'template' &&
           tagStr !== 'resources';
});
```

**Layer 3: Late Catch (Modify Event)**
```javascript
// Catch files modified within 5 seconds of creation
if (fileAge < 5000) {
    await updateParaTags(file);
}
```

### Complete Template Flow

1. **Template Storage**: `3 - RESOURCES/TEMPLATES/projects-template.md`
   - Skipped by auto-tagger
   - Clean frontmatter (no para property)

2. **User Action**: Create note from template via Templater
   - Target: `1 - Projects/PBSWI/New Feature.md`

3. **Templater Writes**: Copies template content to new file
   - May include `tags: [all, templates]` from template

4. **Plugin Detects** (500ms delay):
   - File creation event fires
   - Checks file is not in TEMPLATES folder ✓
   - Strips `templates` tag
   - Adds `para: projects` based on actual location
   - Adds `pbswi` subfolder tag

5. **Late Catch** (if needed):
   - If Templater modifies after 500ms
   - Modify event fires for recent file
   - Re-applies correct tags

6. **Final Result**:
```yaml
---
tags:
  - all
  - pbswi
para: projects
created: 2025-11-05
---
```

---

## Command Reference

### Update PARA tags for current file
- **ID**: `update-para-tags`
- **Behavior**: Manually trigger tagging for active file
- **Use Case**: Fix tags if plugin was disabled when file was created/moved

### Update PARA tags for all files
- **ID**: `update-all-para-tags`
- **Behavior**: Bulk update all markdown files in vault
- **Warning**: Processes all files, may take time for large vaults
- **Use Case**: Initial setup, fixing bulk issues

### Clean PARA properties from template files
- **ID**: `clean-template-files`
- **Behavior**: Strip para properties and tags from TEMPLATES folders
- **What It Removes**: `para` property, `para/*` tags, `archived` date
- **What It Keeps**: `tags: [all]`, `created` date, Templater syntax
- **Use Case**: Clean up templates after initial setup or migration

---

## Settings

### PARA Folder Mappings

**Purpose**: Define which folders represent each PARA location

**Format**:
```javascript
{
    inbox: "0 - INBOX",
    projects: "1 - Projects",
    areas: "2 - AREAS",
    resources: "3 - RESOURCES",
    archive: "4 - ARCHIVE"
}
```

**Notes**:
- Case-insensitive matching
- Can use any folder names
- Must be top-level folders in vault
- Subfolders are automatically detected

### Property Name

**Purpose**: Customize the property name used for PARA location

**Default**: `para`

**Alternatives**: `location`, `category`, `area`

**Usage**:
```yaml
# With default setting:
para: projects

# With custom "location":
location: projects
```

### Persist Subfolder Tags

**Purpose**: Control whether subfolder tags persist across moves

**Default**: `true`

**Behavior**:
- `true`: Tags accumulate over file lifetime (historical context)
- `false`: Only current location's subfolder tags present

**Example** (when true):
```
1 - Projects/PBSWI/Feature.md    → tags: [all, pbswi]
Move to 2 - AREAS/Maintenance/   → tags: [all, pbswi, maintenance]
```

---

## Troubleshooting

### Tags Not Updating

**Symptoms**: File created but no PARA property added

**Possible Causes**:
1. File not in a configured PARA folder
2. Folder name doesn't match settings (check case)
3. Plugin disabled during file creation

**Solutions**:
- Check Settings → Quick PARA → PARA Folder Mappings
- Verify folder names match (case-insensitive)
- Run "Update PARA tags for current file" command manually

### Template Tags Persisting

**Symptoms**: New files from templates have `templates` or `resources` tags

**Possible Causes**:
1. Old plugin version (before tag filtering)
2. Plugin disabled during creation
3. Manual tag addition

**Solutions**:
- Ensure plugin is up to date and enabled
- Run "Update PARA tags for current file" manually
- Run "Clean PARA properties from template files" on templates

### Wrong PARA Property

**Symptoms**: File in Projects folder has `para: resources`

**Possible Causes**:
1. File actually in a different folder (check full path)
2. Folder config wrong in settings
3. File created before plugin was installed

**Solutions**:
- Check actual file path in Obsidian
- Verify settings match your folder structure
- Run manual update command

### Subfolder Tags Not Adding

**Symptoms**: File in `1 - Projects/PBSWI/` doesn't get `pbswi` tag

**Possible Causes**:
1. "Persist Subfolder Tags" setting disabled
2. File at root of PARA folder (no subfolders)
3. Subfolder name has special characters only

**Solutions**:
- Enable "Persist Subfolder Tags" in settings
- Move file into a subfolder
- Rename folder to include alphanumeric characters

---

## Development Notes

### Why Two Event Listeners?

**Create Event** (500ms delay):
- Primary mechanism for new file tagging
- Delay allows Templater to write content first
- Catches most cases

**Modify Event** (5 second window):
- Safety net for late Templater writes
- Only processes very recent files
- Prevents performance impact on edits

### Why Case-Insensitive?

**Problem**: Users naturally type folder names without perfect case consistency
- "1 - projects" vs "1 - Projects"
- "2 - areas" vs "2 - AREAS"

**Solution**: Compare lowercased strings while preserving original case for extraction

**Benefit**: More forgiving, less fragile

### Why Strip Template Tags?

**Problem**: Templates need tags for organization (`templates` tag)
- But these tags shouldn't propagate to new files
- New files should only have location-relevant tags

**Solution**: Aggressive filtering of known template tags
- `templates`, `template`, `resources`
- User can still manually add these if needed

---

## Future Considerations

### Potential Enhancements

1. **Configurable Tag Filters**
   - Let users specify which tags to strip
   - Settings UI for tag exclusion list

2. **Pattern Matching**
   - Support regex for folder detection
   - Match patterns like `*/Projects/*`

3. **Tag History Tracking**
   - Show when tags were added
   - Property like `tag_history: [{tag: 'pbswi', added: '2025-11-05'}]`

4. **Conditional Tagging**
   - Rules: "If in PBSWI folder and filename contains 'meeting', add #meeting"
   - User-defined tagging rules

5. **Tag Cleanup**
   - Command to remove orphaned subfolder tags
   - Detect tags that no longer correspond to any folder

---

## Testing Checklist

When modifying tagging behavior, test:

- [ ] Create file in each PARA folder
- [ ] Create file with Templater in each PARA folder
- [ ] Move file between PARA folders
- [ ] Move file between subfolders in same PARA
- [ ] Bulk update on 100+ files
- [ ] Files with no frontmatter
- [ ] Files with existing para/* tags (migration)
- [ ] Template files (should be skipped)
- [ ] Case variations in folder names
- [ ] Files in TEMPLATES folders (multiple depths)

---

## Version History

### v0.1.0 (2025-11-05)
- Initial implementation
- Property-based PARA tracking
- Subfolder tag persistence
- Template exclusion
- Template tag filtering
- Case-insensitive folder matching
- Modify event catch for late Templater writes

---

**Maintainers**: Refer to this document when modifying tagging logic.

**Users**: Refer to README.md for usage instructions. This document is for technical reference.
