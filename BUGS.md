# Bug Tracking - Quick PARA Plugin

**Current Version:** 0.4.0
**Testing Phase:** Week of Nov 6-13, 2025
**Tester:** Mark Riechers

This document tracks bugs discovered during the pre-1.0 testing phase.

---

## How to Report Bugs

When you find a bug, add it to the "Active Bugs" section below with:
- **Clear title** describing the issue
- **Steps to reproduce** (what you did)
- **Expected behavior** (what should happen)
- **Actual behavior** (what actually happened)
- **Severity** (Critical/High/Medium/Low)
- **Date found**

---

## Active Bugs

### Example Bug (delete this when you add your first real bug)

**Title:** Example - Modal doesn't save when clicking outside

**Steps to reproduce:**
1. Click "+ Add Project Update"
2. Fill in project name and folder
3. Click outside the modal to close it

**Expected:** Modal should ask if I want to save changes

**Actual:** Modal closes without saving, changes lost

**Severity:** Medium

**Date found:** 2025-11-06

---

## Fixed Bugs

*(Bugs that have been resolved will be moved here with fix date and version)*

### Example Fixed Bug (delete this)

**Title:** Example - Plugin won't load

**Fix:** Consolidated settings.js into main.js to fix module loading

**Fixed in:** 0.4.0

**Date fixed:** 2025-11-06

---

## Known Limitations (Not Bugs)

These are features that don't exist yet, not bugs:

1. **Automatic scheduling** - Project updates don't generate automatically on schedule (manual generation works)
2. **Completed task extraction** - The TODO comment in formatProjectsSection for extracting completed tasks from project notes
3. **Day of Month picker** - Monthly updates don't have a day-of-month selector (would need UI enhancement)

---

## Testing Focus Areas

During this testing phase, pay special attention to:

- ✅ **Project Update Generation** (new feature)
  - Modal saves configs correctly
  - Folder autocomplete works
  - Time picker validates
  - "Generate Now" creates correct files
  - Kanban board parsing works
  - Monday sections populate correctly

- ✅ **Auto-tagging**
  - Files get correct `para` property
  - Subfolder tags persist
  - Moving files updates properties

- ✅ **Template Deployment**
  - All templates deploy correctly
  - Project Dashboard template works with Kanban

- ✅ **Settings UI**
  - All buttons work
  - Dependency links open correctly
  - Settings save/load properly

---

## Notes

- This is a **living document** - update it as you test!
- If you're unsure if something is a bug or expected behavior, log it anyway
- Small UI annoyances count too - we want this polished before 1.0
