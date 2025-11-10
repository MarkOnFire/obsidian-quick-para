# Quick PARA Plugin - Round 2 Testing Guide

**Plugin Version**: 0.5.0 (Post-Round-1-Fixes)
**Testing Date**: _______________
**Tester**: _______________
**Test Vault**: `/Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/Test Vault`

---

## 📋 How to Use This Guide

1. **Work through each test** in order (they build on each other)
2. **Check the box** next to each test: ✅ Pass / ❌ Fail / ⚠️ Partial
3. **Log bugs immediately** in the Bug Log section at the bottom
4. **Add notes** in the Notes column for anything unusual
5. **Take screenshots** if visual issues occur

**Bug Severity Scale**:
- 🔴 **Critical**: Data loss, crashes, blocks all usage
- 🟠 **High**: Feature doesn't work, major UX issue
- 🟡 **Medium**: Feature works but poorly, minor data issue
- 🟢 **Low**: Cosmetic issue, typo, minor inconvenience

---

## ✅ Pre-Testing Setup

### 1. Clean Test Environment
- [ ] Test Vault exists at path above
- [ ] Test Vault is empty (or backed up)
- [ ] Obsidian version: __________
- [ ] Developer Console open (Cmd+Option+I)

### 2. Plugin Installation
- [ ] Quick PARA plugin installed
- [ ] Plugin enabled in settings
- [ ] No console errors on load

### 3. Dependencies
- [ ] Templater plugin installed
- [ ] Tasks plugin installed
- [ ] Kanban plugin installed (optional)

---

## 🧪 Test Suite

### Test 1: First-Time Setup Wizard
**Goal**: Verify clean setup experience for new users

**Steps**:
1. Click the grid ribbon icon (or run "Quick PARA: Run Setup Wizard")
2. **Welcome Screen**: Click "Next"
3. **Folder Review**:
   - All folders should show "➕ Will create"
   - Click "Next"
4. **Completion**:
   - Verify all 5 folders created
   - Check "Next Steps" message
   - Click "Close"

**Expected Folders Created**:
```
Test Vault/
├── 0 - INBOX/
├── 1 - PROJECTS/
├── 2 - AREAS/
├── 3 - RESOURCES/
└── 4 - ARCHIVE/
```

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 2: Template Deployment (Smart Regeneration)
**Goal**: Verify templates deploy correctly and don't overwrite user edits

**Steps**:
1. Go to Settings → Quick PARA → Actions
2. Click "Deploy PARA Templates"
3. Check `TEMPLATES/` folder
4. Verify these files exist:
   - `default-template.md`
   - `inbox-template.md`
   - `projects-template.md`
   - `areas-template.md`
   - `resources-template.md`
   - `archive-template.md`
   - `Project Dashboard.md` ← NEW in v0.5.0
5. **Edit a template**: Open `inbox-template.md`, add text "CUSTOM EDIT"
6. Click "Deploy PARA Templates" again
7. Verify `inbox-template.md` still has "CUSTOM EDIT" (not overwritten)
8. Delete `projects-template.md`
9. Click "Deploy PARA Templates" again
10. Verify `projects-template.md` was recreated

**Expected**:
- ✅ All 7 templates created on first deploy
- ✅ No `.backup.md` files created (removed in v0.5.0)
- ✅ Existing templates NOT overwritten
- ✅ Missing templates recreated
- ✅ Notice shows how many created/skipped

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 3: Settings UI - Folder Validation
**Goal**: Verify folder path inputs show validation

**Steps**:
1. Go to Settings → Quick PARA
2. **Inbox Folder** field: Change to "0 - INBOX"
3. Look for validation indicator (✅ or ❌)
4. Change to "NONEXISTENT"
5. Check for ❌ invalid indicator
6. Change back to "0 - INBOX"

**Expected**:
- ✅ Valid paths show green checkmark
- ❌ Invalid paths show red X
- 🔄 Validation happens on blur (when you click away)

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 4: Settings UI - Property Name Locked
**Goal**: Verify "para" property is locked (not user-configurable)

**Steps**:
1. In Settings → Quick PARA
2. Look for "Property Name" field

**Expected**:
- ❌ Field should NOT exist (removed in v0.5.0)
- 📝 Property is hardcoded to "para" in documentation

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 5: Settings UI - Action Buttons
**Goal**: Verify all action buttons work

**Steps**:
1. In Settings → Quick PARA → Actions section
2. Click each button and verify:

| Button | Expected Behavior |
|--------|------------------|
| Check Dependencies | Modal shows Templater/Tasks/Kanban status |
| Deploy PARA Templates | Templates created/skipped notice |
| **Update All PARA Tags** | Bulk update notice (NEW button) |
| Clean Template Files | Confirmation → templates cleaned |
| Reset to Defaults | Confirmation → settings reset |

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 6: Auto-Tagging on File Create
**Goal**: Verify PARA tags applied automatically to new files

**Steps**:
1. Create note in `0 - INBOX/` named "Inbox Test"
2. Check frontmatter (should appear within 1-2 seconds)
3. Create note in `1 - PROJECTS/` named "Project Test"
4. Check frontmatter
5. Create subfolder `1 - PROJECTS/TestSubfolder/`
6. Create note "Subfolder Test" inside it
7. Check frontmatter

**Expected Frontmatter**:

**Inbox Test**:
```yaml
---
tags:
  - all
para: inbox
created: 2025-11-07
---
```

**Project Test**:
```yaml
---
tags:
  - all
para: projects
created: 2025-11-07
---
```

**Subfolder Test**:
```yaml
---
tags:
  - all
  - testsubfolder
para: projects
created: 2025-11-07
---
```

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 7: Auto-Tagging on File Move
**Goal**: Verify tags update when files move between folders

**Steps**:
1. Take "Inbox Test" from Test 6
2. Move to `1 - PROJECTS/`
3. Check frontmatter (para should → projects)
4. Move to `2 - AREAS/`
5. Check frontmatter (para should → areas)
6. Move to `4 - ARCHIVE/`
7. Check for `archived` date field

**Expected Changes**:

**After → Projects**:
```yaml
para: projects  # changed from inbox
```

**After → Areas**:
```yaml
para: areas  # changed from projects
```

**After → Archive**:
```yaml
para: archive
archived: 2025-11-07  # NEW field added
```

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 8: Bulk Tag Update (Command & Ribbon)
**Goal**: Verify bulk update works from both command and ribbon button

**Steps**:
1. Create 5-10 notes in various PARA folders
2. Manually corrupt frontmatter (remove para property, wrong tags)
3. **Method A**: Click "tags" ribbon icon (NEW in v0.5.0)
4. Wait for progress notice
5. Verify all files have correct tags
6. Corrupt frontmatter again
7. **Method B**: Run command "Quick PARA: Update PARA tags for all files"
8. Verify again

**Expected**:
- 🔘 Ribbon icon exists and works
- 📢 Notice: "Updating PARA tags for X files..."
- 📢 Notice: "Updated PARA tags for X files!"
- ✅ All files have correct para property
- ✅ All files have correct subfolder tags
- ✅ All files have "all" tag

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 9: Project Updates - Basic Configuration
**Goal**: Verify project update configuration modal works

**Steps**:
1. Create `Project Dashboard.md` in `0 - INBOX/` with this content:

```markdown
---
kanban-plugin: board
---

## Doing
- [ ] [[Active Project 1]]
- [ ] [[Active Project 2]]

## Blocked
- [ ] [[Blocked Project]] - waiting on client

## Done
- [x] [[Completed Project]] ✅ 2025-11-01
```

2. In Settings → Quick PARA → Project Updates
3. Click "+ Add Project Update"
4. Fill in:
   - **Name**: Weekly Team Update
   - **Schedule**: Weekly → Monday
   - **Time**: 09:00
   - **Project Folder**: 1 - PROJECTS
5. Click "Save"
6. Verify config appears in settings with: "Mondays at 09:00 • 1 - PROJECTS"

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 10: Project Updates - Manual Generation
**Goal**: Verify "Generate Now" creates update correctly

**Steps**:
1. With config from Test 9 saved
2. Create update file: `0 - INBOX/Weekly Team Update.md`
3. Add this content:

```markdown
---
tags:
  - all
---

## Notes
Team meetings happen on Mondays.

---
```

4. In Settings → Project Updates → hover over "Weekly Team Update"
5. Click "Generate Now" button
6. Open `Weekly Team Update.md`
7. Check for new Monday section (format: `### MM/DD/YY`)
8. Verify sections:
   - **Projects** (auto-managed)
   - **Blocked/feedback needed** (auto-managed)
   - **Daily Highlights** (auto-managed)
9. Verify "Notes" section preserved

**Expected Format**:
```markdown
---
tags:
  - all
---

## Notes
Team meetings happen on Mondays.

---

### 11/11/25

<!-- AUTO-MANAGED: Do not edit this section manually -->
**Projects:**
- [[Active Project 1]]
- [[Active Project 2]]

**Blocked/feedback needed:**
- [[Blocked Project]] - waiting on client

**Daily Highlights:**
- (empty by default)
<!-- END AUTO-MANAGED -->
```

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 11: Project Updates - Missing Kanban Recovery
**Goal**: Verify plugin recreates missing Project Dashboard

**Steps**:
1. Delete `Project Dashboard.md`
2. In Settings → Project Updates
3. Click "Generate Now" for Weekly Team Update
4. Check for notice: "Project Dashboard not found. Creating from template..."
5. Verify `Project Dashboard.md` was recreated from template
6. Check update file was still generated

**Expected**:
- ✅ Notice explains what happened
- ✅ Dashboard recreated from template
- ✅ Update generation succeeds

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 12: Project Updates - Task Extraction (NEW Feature)
**Goal**: Verify plugin extracts tasks from project folder notes

**Setup**:
1. Create `1 - PROJECTS/Active Task Project.md`:

```markdown
## Tasks
- [ ] Complete feature implementation
- [ ] Write tests
- [x] Initial design ✅ 2025-11-01
```

2. Delete `Project Dashboard.md` (to test folder-only mode)
3. Generate project update

**Expected**:
- ✅ Update includes tasks from project folder notes
- ✅ Active tasks appear in "Projects" section
- ✅ Completed tasks appear in "Daily Highlights" (if recent)

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 13: Settings Persistence
**Goal**: Verify settings survive app restart

**Steps**:
1. Change these settings:
   - Inbox folder: "00-INBOX"
   - Disable auto-tagging
   - Add project update config
2. Close Obsidian completely
3. Reopen Obsidian
4. Go to Settings → Quick PARA
5. Verify all changes persisted

**Expected**:
- ✅ Folder paths preserved
- ✅ Toggle states preserved
- ✅ Project update configs preserved

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 14: Error Handling - Invalid Folder Paths
**Goal**: Verify graceful handling of missing folders

**Steps**:
1. In Settings, change Projects folder to "NONEXISTENT"
2. Try to create a note in root folder
3. Check error message (should be helpful, not technical)
4. Try to run bulk tag update
5. Check error handling

**Expected**:
- ⚠️ Clear error messages
- ⚠️ No crashes
- ⚠️ Plugin continues working after error

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 15: Performance - Bulk Operations
**Goal**: Verify plugin handles large vaults efficiently

**Steps**:
1. Create 100+ markdown files in various PARA folders
   - Use script or manual creation
2. Run bulk tag update
3. Time the operation
4. Check memory usage in Activity Monitor

**Expected Performance**:
- 100 files: < 5 seconds
- 500 files: < 20 seconds
- No UI freezing
- No memory leaks

**Actual Time (100 files)**: __________ seconds

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

### Test 16: Template Reset Confirmation
**Goal**: Verify "Reset Settings" properly warns about template deletion

**Steps**:
1. Edit `inbox-template.md` to add custom content
2. In Settings → Actions, click "Reset to Defaults"
3. Check for confirmation dialog
4. Confirm dialog mentions template deletion
5. Click "Yes"
6. Verify `inbox-template.md` was reset (custom content gone)

**Expected**:
- ⚠️ Clear warning about template deletion
- ⚠️ Requires explicit confirmation
- ✅ All templates regenerated from defaults

**Status**: [ ] ✅ / [ ] ❌ / [ ] ⚠️

**Notes**:
```


```

---

## 📊 Test Results Summary

| # | Test Name | Status | Severity | Notes |
|---|-----------|--------|----------|-------|
| 1 | First-Time Setup | ⏳ | | |
| 2 | Template Deployment | ⏳ | | |
| 3 | Folder Validation | ⏳ | | |
| 4 | Property Locked | ⏳ | | |
| 5 | Action Buttons | ⏳ | | |
| 6 | Auto-Tag Create | ⏳ | | |
| 7 | Auto-Tag Move | ⏳ | | |
| 8 | Bulk Tag Update | ⏳ | | |
| 9 | Project Config | ⏳ | | |
| 10 | Generate Now | ⏳ | | |
| 11 | Missing Kanban | ⏳ | | |
| 12 | Task Extraction | ⏳ | | |
| 13 | Persistence | ⏳ | | |
| 14 | Error Handling | ⏳ | | |
| 15 | Performance | ⏳ | | |
| 16 | Reset Confirmation | ⏳ | | |

**Pass Rate**: ______ / 16 (______%)

**Overall Status**:
- 🟢 All tests pass → Ready for production
- 🟡 Minor issues → Fix and re-test
- 🔴 Critical issues → Major fixes needed

---

## 🐛 Bug Log

### How to Log a Bug
1. Copy the bug template below
2. Fill in all fields
3. Assign severity (🔴🟠🟡🟢)
4. Add to the Bug Log section

---

### Bug Template (Copy This)
```
### Bug #X: [Short Title]

**Test**: Test #__ - [Test Name]
**Severity**: 🔴 / 🟠 / 🟡 / 🟢
**Date Found**: 2025-11-__

**Steps to Reproduce**:
1.
2.
3.

**Expected Behavior**:


**Actual Behavior**:


**Console Errors**:
```
(paste any console errors here)
```

**Screenshots**: (attach or describe)


**Workaround**: (if any)

```
---

## 🐛 Bugs Found During Round 2

*(Add bugs here as you find them)*

---

### Bug #1: Example (Delete this when you log your first bug)

**Test**: Test #2 - Template Deployment
**Severity**: 🟡
**Date Found**: 2025-11-07

**Steps to Reproduce**:
1. Deploy templates
2. Edit inbox-template.md
3. Deploy again

**Expected Behavior**:
Template should not be overwritten

**Actual Behavior**:
Template was overwritten with default

**Console Errors**:
```
None
```

**Screenshots**: N/A

**Workaround**: Don't deploy twice

---

## 📝 Additional Notes

Use this space for observations that aren't bugs but are worth noting:

```





```

---

## ✅ Round 2 Completion Checklist

- [ ] All 16 tests completed
- [ ] All bugs logged with severity
- [ ] Screenshots attached for visual bugs
- [ ] Console errors captured
- [ ] Performance benchmarks recorded
- [ ] Notes added for unclear behaviors
- [ ] This document saved and shared with developer

---

## 🚀 Next Steps

### If Tests Pass (🟢)
1. Document any minor issues
2. Deploy to production vault (MarkBrain)
3. Monitor for 1 week
4. Disable Python automation scripts
5. Archive this test vault

### If Minor Issues (🟡)
1. Prioritize bugs by severity
2. Fix high/medium issues
3. Re-test affected features only
4. Proceed to production

### If Critical Issues (🔴)
1. Stop testing
2. Review bug log with developer
3. Wait for critical fixes
4. Schedule Round 3 testing

---

**Testing Completed**: _______________
**Duration**: ________ hours
**Ready for Production**: YES / NO / CONDITIONAL

**Tester Signature**: _______________
