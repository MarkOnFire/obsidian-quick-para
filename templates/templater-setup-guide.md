---
tags:
  - all
  - templates
created: 2025-10-21
---
Tags:: para/inbox, para/projects, para/archive

# Templater Setup Guide for PARA Folder Auto-Tagging

## Step 1: Install Templater Plugin

1. Open Obsidian Settings
2. Go to Community Plugins → Browse
3. Search for "Templater"
4. Install and Enable it

## Step 2: Configure Templater Settings

### A. Set Template Folder Location
1. Go to Settings → Templater → General Settings
2. Set "Template folder location" to: `templates`

### B. Enable Folder Templates
1. Still in Templater settings, scroll to "Folder Templates"
2. Click "Add New" for each folder and configure:

**Folder Template Mappings:**

| Folder Path | Template File |
|-------------|---------------|
| `0 - INBOX` | `templates/inbox-template.md` |
| `1 - PROJECTS - Action Needed` | `templates/projects-template.md` |
| `2 - AREAS - Tracking and Check-ins` | `templates/areas-template.md` |
| `3 - RESOURCES` | `templates/resources-template.md` |
| `4 - ARCHIVE` | `templates/archive-template.md` |

### C. Enable Automatic Template Application
1. In Templater settings, enable "Trigger Templater on new file creation"
2. This ensures templates apply automatically when creating files in these folders

## Step 3: Test It Out

1. Create a new note in `0 - INBOX` folder
2. Check if the frontmatter automatically includes:
   ```yaml
   ---
   tags:
     - para/inbox
     - all
   created: 2025-10-21
   ---
   ```

## Tags Applied by Each Template

- **INBOX**: `para/inbox`, `all`
- **PROJECTS**: `para/projects`, `all`
- **AREAS**: `para/areas`, `all`
- **RESOURCES**: `para/resources`, `all`
- **ARCHIVE**: `para/archive`, `all` (+ archived date)

## Important Notes

### What Templater DOES:
✓ Automatically applies tags when NEW files are created in folders
✓ Tags appear in Kanban views
✓ Includes creation date automatically
✓ Works reliably

### What Templater DOESN'T DO:
✗ Does NOT automatically update tags when files are MOVED between folders
✗ Does NOT apply to existing files (only new ones)

## Solution for Moving Files Between Folders

Since you mentioned notes need to update tags as they move through PARA, you have two options:

### Option A: Manual Tag Update (Simple)
- Use Tag Wrangler plugin to quickly update tags when moving files
- When you move a file, manually change `para/inbox` → `para/projects`, etc.

### Option B: Automated Tag Update on Move (Advanced)
Create a Templater user script that updates tags based on current folder location.

Would you like me to create the automated script for Option B?

---

## Bonus: Kanban Integration

Your tags will work perfectly in Kanban views. Example Kanban frontmatter:

```yaml
---
kanban-plugin: basic
tags:
---

## Backlog
- [ ] Task 1 para/inbox

## In Progress
- [ ] Task 2 para/projects

## Done
- [x] Task 3 para/archive
```

The `para/*` tags will show up as clickable tags in your Kanban boards!

---

## Next Steps

1. Install Templater plugin
2. Configure folder template mappings (see table above)
3. Test by creating a new note in each PARA folder
4. Let me know if you want the automated tag-update-on-move script!
