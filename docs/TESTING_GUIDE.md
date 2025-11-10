# Quick PARA Plugin - Testing Guide

## Test Vault Setup

**Location**: `/Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/Test Vault`

The plugin has been deployed to the test vault and is ready for testing.

## Pre-Testing Checklist

### 1. Enable the Plugin
1. Open Test Vault in Obsidian
2. Go to Settings → Community Plugins
3. Click "Turn on community plugins" (if needed)
4. Find "Quick PARA" in the list
5. Toggle it ON
6. Check for any console errors (Cmd+Option+I)

### 2. Install Dependencies
Before testing, ensure these plugins are installed:
- **Templater** (required)
- **Tasks** (required)
- **Kanban** (optional, for agenda generation testing)

## Test Scenarios

### Test 1: Plugin Loads Successfully ✅

**Steps**:
1. Enable Quick PARA plugin
2. Check for ribbon icon (grid icon) on left sidebar
3. Open Command Palette (Cmd+P)
4. Search for "Quick PARA" - should see 6 commands
5. Check Settings → Quick PARA exists

**Expected Result**:
- No console errors
- Ribbon icon appears
- Commands are registered
- Settings tab loads

**Status**: [ X ] Pass [ ] Fail

---

### Test 2: Dependency Checker 🔍

**Steps**:
1. Run command: "Quick PARA: Check plugin dependencies"
2. Review modal showing dependency status
3. If Templater/Tasks missing, modal should warn
4. Click links to verify they're correct

**Expected Result**:
- Modal appears
- Shows installed/missing plugins
- Links work correctly
- Close button functions

**Status**: [ X ] Pass [ ] Fail

---

### Test 3: Setup Wizard 🚀

**Steps**:
1. Click grid ribbon icon OR run "Quick PARA: Run Setup Wizard"
2. **Step 1 (Welcome)**:
   - Read welcome message
   - Click "Next"
3. **Step 2 (Folders)**:
   - Review PARA folder status table
   - Check which folders already exist
   - Note which will be created
   - Click "Next"
4. **Step 3 (Confirm)**:
   - Wait for folders to be created
   - Review created/skipped lists
   - Read "Next Steps"
   - Click "Close"

**Expected Result**:
- Wizard progresses through 3 steps
- Existing folders show ✅ Exists
- New folders show ➕ Will create
- Folders actually get created
- No errors during creation
- Existing folders not modified

**Verify Folders**:
```bash
ls -la "/Users/mriechers/Library/Mobile Documents/iCloud~md~obsidian/Documents/Test Vault/"
```

Should see:
- `0 - INBOX/`
- `1 - Projects/`
- `2 - AREAS/`
- `3 - RESOURCES/`
- `4 - ARCHIVE/`

**Status**: [ X ] Pass [ ] Fail

---

### Test 4: Settings UI ⚙️

**Steps**:
1. Go to Settings → Quick PARA
2. **PARA Folder Mappings**:
   - Change "Inbox Folder" to "00 - INBOX"
   - Save and close settings
   - Reopen settings
   - Verify change persisted
   - Change back to "0 - INBOX"
3. **Agenda Generation**:
   - Toggle "Enable Agenda Generation" OFF
   - Toggle back ON
   - Verify state persists
4. **Tagging Behavior**:
   - Change "Property Name" to "location"
   - Change back to "para"
5. **Actions**:
   - Click "Check Dependencies" button
   - Click "Reset to Defaults" button (verify prompt)

**Expected Result**:
- All settings save correctly — YES
- Changes persist across sessions — YES
- Toggle switches work — YES
- Text inputs validate
	- Text inputs in fields are not auto-populating and validating as valid paths within the vault. 
- Tagging behavior 
	- field for property appears un-editable. Recommend just removing as a user config option entirely. 
- Action buttons trigger commands— tagging button appears to be missing. 
- Reset restores defaults — YES

**Status**: [ ] Pass [ X ] Fail


---

### Test 5: Auto-Tagging on Create 🏷️

**Steps**:
1. Create new note in `0 - INBOX/`
   - Name: "Test Inbox Note"
   - Check frontmatter after 1-2 seconds
2. Create new note in `1 - Projects/`
   - Name: "Test Project"
   - Check frontmatter
3. Create new note in `1 - Projects/TEST-SUBFOLDER/`
   - First create subfolder
   - Then create note: "Test Subfolder Note"
   - Check frontmatter

**Expected Frontmatter**:

**Inbox Note**:
```yaml
---
tags:
  - all
para: inbox
created: YYYY-MM-DD
---
```

**Project Note**:
```yaml
---
tags:
  - all
para: projects
created: YYYY-MM-DD
---
```

**Subfolder Note**:
```yaml
---
tags:
  - all
  - test-subfolder
para: projects
created: YYYY-MM-DD
---
```

**Status**: [ X ] Pass [ ] Fail

---

### Test 6: Auto-Tagging on Move 📦

**Steps**:
1. Take "Test Inbox Note" from Test 5
2. Move it to `1 - Projects/`
3. Check frontmatter updates
4. Move it to `2 - AREAS/`
5. Check frontmatter again
6. Move it to `4 - ARCHIVE/`
7. Check for `archived` date

**Expected Changes**:

**After move to Projects**:
```yaml
---
tags:
  - all
para: projects  # Changed from inbox
created: YYYY-MM-DD
---
```

**After move to Archive**:
```yaml
---
tags:
  - all
para: archive  # Changed from projects
created: YYYY-MM-DD
archived: YYYY-MM-DD  # NEW field
---
```

**Status**: [ X ] Pass [ ] Fail

---

### Test 7: Manual Tag Update 🔄

**Steps**:
1. Open any note in a PARA folder
2. Run command: "Quick PARA: Update PARA tags for current file"
3. Check for success notice
4. Verify frontmatter updated correctly

**Expected Result**:
- Notice: "PARA tags updated!"
- Frontmatter matches file location
- No console errors

**Status**: [ X ] Pass [ ] Fail

---

### Test 8: Bulk Tag Update 🔢

**Steps**:
1. Create 5-10 test notes in various PARA folders
2. Manually remove their frontmatter (or set incorrect para property)
3. Run command: "Quick PARA: Update PARA tags for all files"
4. Check progress notice
5. Verify all notes now have correct tags

**Expected Result**:
- Notice: "Updating PARA tags for X files..."
- Notice: "Updated PARA tags for X files!"
- All notes have correct para property
- All notes have correct subfolder tags
- All notes have "all" tag

**Status**: [ ] Pass [X] Fail
- No ribbon button for bulk tag update. 

---

### Test 9: Template Deployment 📝

**Steps**:
1. Run command: "Quick PARA: Deploy PARA templates"
2. Wait for completion notice
3. Check `TEMPLATES/` folder exists
4. Verify 6 template files present

**Expected Files**:
- `TEMPLATES/default-template.md`
- `TEMPLATES/inbox-template.md`
- `TEMPLATES/projects-template.md`
- `TEMPLATES/areas-template.md`
- `TEMPLATES/resources-template.md`
- `TEMPLATES/archive-template.md`

**Verify Content**:
- Each template has YAML frontmatter
- Contains Templater syntax (`<% tp.file.creation_date() %>`)
- Contains Tasks code block

**Status**: [ ] Pass [ X ] Fail
- Need to check for /TEMPLATES/kanban-template.md as well
- Model templates need to be editable, so I've added models to the templates folder within the plug-in repo. Please use those as the defaults. 
- Template validation and backup files are confusing and junk up the templates folder. Preferred behavior would be checking to see if each of the needed templates exists, and if the file is missing, regenerate it based on the default. "Reset Settings" could trigger erasing and resetting all the templates as that would be expected by a user. 
- I think we need more explanation for what "Clean Template Properties" does. ("Use this button if when you create new notes, they are being pre-assigned odd tags or PARA properties that don't match the folder you place them in.)
---

### Test 10: Agenda Generation (Basic) 📅

**Setup**:
1. Create `0 - INBOX/Project Dashboard.md` with kanban structure:
```markdown
## Done
- [x] Completed task 1 ✅ 2025-11-01
- [x] Completed task 2 ✅ 2025-11-04

## Doing
- [ ] [[Test Project A]]
- [ ] [[Test Project B]]

## Blocked
- [ ] [[Blocked Project]] - waiting for approval
```

2. Create `0 - INBOX/Weekly 1 on 1.md`:
```markdown
---
tags:
  - all
created: 2025-11-05
---

## Notes
*1:1 meetings take place on Monday afternoons.*

---
```

3. Create `1 - Projects/PBSWI/` folder (empty for now)

**Steps**:
1. Run command: "Quick PARA: Update weekly 1-on-1 agenda"
2. Wait for success notice
3. Open `Weekly 1 on 1.md`
4. Check for new Monday section

**Expected Result**:
- Notice: "Weekly agenda updated successfully!"
- New section with format: `### MM/DD/YY`
- Contains "Projects" section (auto-managed)
- Contains "Blocked/feedback needed" section
- Contains "Daily Highlights" section
- Manual content preserved

**Status**: [ X ] Pass [ ] Fail
- Needs further testing, particularly an exploration of using both the kanban board and tasks within notes from the directory that is the subject of a regular update. 

---

### Test 11: Settings Persistence 💾

**Steps**:
1. Change several settings:
   - Inbox folder: "00-INBOX"
   - Property name: "location"
   - Disable agenda generation
2. Close Obsidian completely
3. Reopen Obsidian
4. Go to Settings → Quick PARA
5. Verify all changes persisted

**Expected Result**:
- All setting changes preserved
- Plugin loads with custom settings
- Tagging uses new property name
- Agenda generation disabled

**Status**: [ X ] Pass [ ] Fail

---

### Test 12: Error Handling 🚨

**Steps**:
1. **Missing Kanban Board**:
   - Delete `Project Dashboard.md`
   - Run agenda update command
   - Check for helpful error message

2. **Missing Agenda File**:
   - Delete `Weekly 1 on 1.md`
   - Run agenda update command
   - Check for helpful error message

3. **Invalid Folder Path**:
   - Set "Inbox Folder" to "NONEXISTENT"
   - Try to create note in root
   - Check behavior

**Expected Result**:
- Clear error messages (not technical gibberish)
- No crashes or data loss
- Console errors are descriptive
- Plugin continues to function

**Status**: [ ] Pass [ X ] Fail
- Not clear what to do if you delete the kanban projects dashboard. It should be re-created from the template when the project update tickbox is checked. 
- Update re-generated the update file successfully but it contains no content and the dashboard was not re-created. 
- Can we add logic that also adds items to updates based on tasks within the assigned project folder? That way the kanban board isn't a dependency, just an additional source of information for updates. 
---

## Performance Testing

### Bulk Operations

**Test with 100+ Files**:
1. Create 100+ markdown files in various folders
2. Run bulk tag update
3. Time the operation
4. Check memory usage

**Acceptable Performance**:
- 100 files: < 5 seconds
- 500 files: < 20 seconds
- 1000 files: < 60 seconds
- No memory leaks
- No UI freezing

**Status**: [ ] Pass [ X ] Fail
- Functionality works, but ribbon button for this is missing.
---

## Regression Testing

### Compare with Python Script

**Setup**:
1. Create identical kanban board content
2. Run Python script: `./custom-extensions/scripts/weekly-1on1-automation/update-1on1-agenda.py --dry-run`
3. Save output
4. Run Quick PARA agenda update
5. Compare outputs

**Expected Result**:
- Monday section format identical
- Project lists match
- Blocked items match
- Highlights format matches
- Auto-managed markers consistent

**Status**: [ ] Pass [ X ] Fail
- I don't know how to perform this test, can you do it? 
---

## Bug Report Template

If you find issues, document them here:

### Bug #1
**Title**:
**Severity**: Critical / High / Medium / Low
**Steps to Reproduce**:
1.
2.
3.

**Expected Behavior**:

**Actual Behavior**:

**Console Errors**:
```
(paste console errors here)
```

**Screenshots**: (if applicable)

---

## Test Results Summary

| Test | Status | Notes |
|------|--------|-------|
| 1. Plugin Loads | ⏳ | |
| 2. Dependency Checker | ⏳ | |
| 3. Setup Wizard | ⏳ | |
| 4. Settings UI | ⏳ | |
| 5. Auto-Tag Create | ⏳ | |
| 6. Auto-Tag Move | ⏳ | |
| 7. Manual Tag Update | ⏳ | |
| 8. Bulk Tag Update | ⏳ | |
| 9. Template Deployment | ⏳ | |
| 10. Agenda Generation | ⏳ | |
| 11. Settings Persistence | ⏳ | |
| 12. Error Handling | ⏳ | |
| Performance | ⏳ | |
| Regression (Python) | ⏳ | |

**Overall Status**: 🟡 Testing In Progress

---

## Next Steps After Testing

### If Tests Pass ✅
1. Document any minor issues
2. Deploy to production vault (MarkBrain)
3. Run in parallel with Python scripts
4. Monitor for 1-2 weeks
5. Disable Python scripts if satisfied

### If Tests Fail ❌
1. Document all bugs in detail
2. Prioritize by severity
3. Fix critical issues first
4. Re-test after fixes
5. Consider rollback if needed

---

**Testing Date**:
**Tested By**:
**Obsidian Version**:
**Plugin Version**: 0.1.0
