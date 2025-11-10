# Quick PARA Plugin - Testing Checklist

**Deployment Date**: 2025-11-05
**Version**: 0.2.0
**Vault**: MarkBrain (Production)

---

## Quick Test Steps

### 1. Reload Plugin

**In Obsidian**:
1. Go to Settings → Community Plugins
2. Find "Quick PARA" in the list
3. Toggle it OFF, then ON
4. Check console for any errors (`Ctrl+Shift+I` / `Cmd+Option+I`)

**Expected**:
- ✅ Plugin reloads without errors
- ✅ Console shows "Loading Quick PARA plugin"
- ✅ No error messages

---

### 2. Check Settings UI

**Steps**:
1. Settings → Quick PARA
2. Scroll through entire settings page

**Expected Changes**:
- ✅ "Quick Actions" section at the top
- ✅ "🚀 Run Setup Wizard" and "🔍 Check Dependencies" buttons visible first
- ✅ Clickable links for Templater, Tasks, Kanban
- ✅ "PARA Folder Configuration" section shows all-caps `1 - PROJECTS`
- ✅ "Project Update Generation" section (not "Weekly Agenda Generation")
- ✅ "PARA Property Name" field is **disabled** and shows "para"
- ✅ NO "Migrate Old Tags" toggle visible
- ✅ Help text appears throughout

---

### 3. Test PARA Property Lock

**Steps**:
1. Settings → Quick PARA → Automatic Tagging Behavior
2. Try to click in the "PARA Property Name" field

**Expected**:
- ✅ Field is grayed out / disabled
- ✅ Cannot edit the value
- ✅ Shows "para"

---

### 4. Test Dependency Links

**Steps**:
1. Settings → Quick PARA → Quick Actions section
2. Click on "Install from Community Plugins" links

**Expected**:
- ✅ Clicking Templater link opens Community Plugins to Templater
- ✅ Clicking Tasks link opens Community Plugins to Tasks
- ✅ Clicking Kanban link opens Community Plugins to Kanban

---

### 5. Deploy Templates

**Steps**:
1. Settings → Quick PARA → PARA Templates section
2. Click "Deploy Templates" button
3. Wait for notice

**Expected**:
- ✅ Notice: "Deploying PARA templates..."
- ✅ Notice: "Deployed 8 templates successfully!" (was 6, now 8)
- ✅ New files created:
  - `0 - INBOX/Project Dashboard.md`
  - `3 - RESOURCES/PARA Method Overview.md`
- ✅ Existing templates updated in `3 - RESOURCES/TEMPLATES/`

---

### 6. Verify New Templates

#### Project Dashboard

**Steps**:
1. Open `0 - INBOX/Project Dashboard.md`
2. Check if Kanban plugin recognizes it

**Expected**:
- ✅ File has frontmatter with `kanban-plugin: board`
- ✅ Kanban plugin shows board view option
- ✅ Columns: INBOX, BACKBURNER, NEXT WEEK, THIS WEEK, Blocked, TOMORROW, TODAY, Doing, Done
- ✅ TODAY column has Daily Tasks query block
- ✅ No cards present (clean template)

#### PARA Method Overview

**Steps**:
1. Open `3 - RESOURCES/PARA Method Overview.md`
2. Read through the content

**Expected**:
- ✅ File renders as markdown with all sections
- ✅ Four PARA categories explained
- ✅ Links to Forte Labs work
- ✅ Explains how Quick PARA implements PARA
- ✅ Has `para: resources` property

---

### 7. Test Auto-Tagging Still Works

**Steps**:
1. Create new note in `1 - PROJECTS/` folder
2. Check frontmatter

**Expected**:
- ✅ Note gets `para: projects` property
- ✅ Note gets `all` tag
- ✅ No `para/projects` tag (property-based now)

---

### 8. Test Settings Migration

**Steps**:
1. Check console for migration messages
2. Look at plugin data file (if accessible)

**Expected**:
- ✅ If you had old `agendaGeneration` settings, console shows: "Migrating old agendaGeneration settings to projectUpdates"
- ✅ `projectUpdates.enabled` reflects old `agendaGeneration.enabled` value
- ✅ No errors

---

### 9. Project Updates Section

**Steps**:
1. Settings → Quick PARA → Project Update Generation
2. Check toggle state

**Expected**:
- ✅ "Enable Project Updates" toggle is OFF by default (for new installs)
- ✅ Text says "No project updates configured"
- ✅ "+ Add Project Update" button present (may show TODO placeholder message)
- ✅ Help text mentions Kanban requirement

**Note**: Full project updates functionality not yet implemented. This is expected.

---

### 10. Verify Folder Defaults

**Steps**:
1. Settings → Quick PARA → PARA Folder Configuration
2. Check placeholder text in each field

**Expected Placeholders**:
- ✅ Inbox: `0 - INBOX`
- ✅ Projects: `1 - PROJECTS` (all caps)
- ✅ Areas: `2 - AREAS`
- ✅ Resources: `3 - RESOURCES`
- ✅ Archive: `4 - ARCHIVE`

---

## Known Issues / Expected Behavior

### Project Updates Not Fully Functional
- **Status**: Settings UI complete, core functionality not implemented
- **Expected**: Clicking "+ Add Project Update" may show console message or do nothing
- **Not a Bug**: Full implementation planned for future work

### Old Agenda Generation Still in Code
- **Status**: Old code preserved for backward compatibility
- **Expected**: Old settings structure may still exist in data file
- **Not a Bug**: Migration handles this gracefully

---

## Rollback Plan (If Needed)

If you encounter critical issues:

```bash
# Restore from git
cd /Users/mriechers/Developer/obsidian-config
git checkout HEAD -- custom-extensions/plugins/quick-para/

# Redeploy old version
rsync -av custom-extensions/plugins/quick-para/ "/Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/MarkBrain/.obsidian/plugins/quick-para/"

# Reload plugin in Obsidian
```

---

## Success Criteria

**Minimum Viable**:
- [ ] Plugin loads without errors
- [ ] Settings display correctly
- [ ] Templates deploy successfully
- [ ] Auto-tagging still works
- [ ] PARA property locked

**Full Success**:
- [ ] All 10 test steps pass
- [ ] New templates work as expected
- [ ] Settings migration succeeds
- [ ] No regressions in existing features

---

## After Testing

### If Successful ✅
1. Test for a few days with normal usage
2. Verify no unexpected behavior
3. Commit changes to git
4. Consider implementing full project updates functionality

### If Issues Found ❌
1. Document the issue
2. Check console for errors
3. Rollback if critical
4. Report findings for fixes

---

**Tested By**: _____________
**Date**: _____________
**Result**: ⬜ Pass | ⬜ Pass with Notes | ⬜ Fail
**Notes**:

