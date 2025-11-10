# Project Updates - Generalized Design

## Overview

Replace the hardcoded weekly 1-on-1 agenda generation with a flexible project update system that:
- Works for ANY subfolder under Projects
- Supports daily, weekly, or monthly schedules
- Creates/appends to reports in Inbox
- User-configurable per project subfolder

## Use Cases

### Use Case 1: Weekly Team Updates (PBSWI)
- **Folder**: `1 - Projects/PBSWI/`
- **Schedule**: Weekly, Mondays at 9:00 AM
- **Report Name**: `PBSWI Weekly Update - [Date]`
- **Location**: `0 - INBOX/PBSWI Weekly Update - 11-11-25.md`

### Use Case 2: Daily Standup Notes (Personal)
- **Folder**: `1 - Projects/ME/`
- **Schedule**: Daily, 8:00 AM weekdays
- **Report Name**: `Daily Standup - [Date]`
- **Location**: `0 - INBOX/Daily Standup - 11-05-25.md`

### Use Case 3: Monthly Review (Professional Development)
- **Folder**: `1 - Projects/PD/`
- **Schedule**: Monthly, 1st of month
- **Report Name**: `PD Monthly Review - [Month Year]`
- **Location**: `0 - INBOX/PD Monthly Review - Nov 2025.md`

## Settings Structure

### New Settings Object

```javascript
DEFAULT_SETTINGS = {
    // ... existing settings ...

    projectUpdates: {
        enabled: true,
        configs: [
            {
                id: "pbswi-weekly",           // Unique identifier
                name: "PBSWI Weekly Update",  // Display name
                projectFolder: "1 - Projects/PBSWI",
                schedule: "weekly",           // daily, weekly, monthly
                dayOfWeek: 1,                 // 0=Sunday, 1=Monday, etc.
                dayOfMonth: null,             // For monthly: 1-31
                time: "09:00",                // HH:MM format
                reportNameFormat: "PBSWI Weekly Update - {{date}}", // Template
                includeCompleted: true,       // Show completed tasks
                includeBlocked: true,         // Show blocked items
                includeActive: true,          // Show active projects
                lookbackDays: 7,              // How far back to look for completed tasks
                sourceBoard: null             // Optional: specific kanban board path
            }
        ]
    }
}
```

## Report Generation Logic

### 1. Scheduled Checks

**Plugin runs checks**:
- On plugin load
- Every hour (interval timer)
- Manual trigger via command

**Check logic**:
```javascript
for (const config of settings.projectUpdates.configs) {
    if (shouldGenerateReport(config)) {
        await generateProjectUpdate(config);
    }
}
```

### 2. shouldGenerateReport()

```javascript
function shouldGenerateReport(config) {
    const now = new Date();
    const lastGenerated = getLastGeneratedDate(config.id);

    switch(config.schedule) {
        case 'daily':
            // Check if today's report already generated
            return !lastGenerated || !isSameDay(lastGenerated, now);

        case 'weekly':
            // Check if it's the right day of week and not generated this week
            return now.getDay() === config.dayOfWeek &&
                   (!lastGenerated || !isSameWeek(lastGenerated, now));

        case 'monthly':
            // Check if it's the right day of month and not generated this month
            return now.getDate() === config.dayOfMonth &&
                   (!lastGenerated || !isSameMonth(lastGenerated, now));
    }

    return false;
}
```

### 3. generateProjectUpdate()

```javascript
async function generateProjectUpdate(config) {
    // 1. Scan project folder for tasks/updates
    const projectData = await scanProjectFolder(config.projectFolder);

    // 2. Format report content
    const reportContent = formatProjectReport(config, projectData);

    // 3. Get or create report file
    const reportFile = await getOrCreateReportFile(config);

    // 4. Append or update content
    await updateReportFile(reportFile, reportContent);

    // 5. Track generation
    saveLastGeneratedDate(config.id, new Date());
}
```

## Report Structure

### Daily Report Template
```markdown
---
tags:
  - all
  - project-update
  - daily
created: 2025-11-05
project: pbswi
---

# Daily Standup - 11/05/25

## Yesterday's Progress
<!-- AUTO-MANAGED: completed -->
- [x] Task 1 ✅ 2025-11-04
- [x] Task 2 ✅ 2025-11-04
<!-- END AUTO-MANAGED -->

## Today's Plan
<!-- AUTO-MANAGED: active -->
- [ ] [[Project A]]
- [ ] [[Project B]]
<!-- END AUTO-MANAGED -->

## Blockers
<!-- AUTO-MANAGED: blocked -->
- [ ] Waiting on approval for [[Blocked Project]]
<!-- END AUTO-MANAGED -->

---

## Notes
*(Add your notes here)*
```

### Weekly Report Template
```markdown
---
tags:
  - all
  - project-update
  - weekly
created: 2025-11-05
project: pbswi
week: 2025-W45
---

# PBSWI Weekly Update - 11/04/25

## Week Highlights
<!-- AUTO-MANAGED: completed -->
### Completed This Week (11/04 - 11/08)
- [x] Task 1 ✅ 2025-11-04
- [x] Task 2 ✅ 2025-11-06
<!-- END AUTO-MANAGED -->

## Active Projects
<!-- AUTO-MANAGED: active -->
  * [[Project A]]
    * Status: In Progress
    * Next Steps: ...
  * [[Project B]]
    * Status: Planning
<!-- END AUTO-MANAGED -->

## Blockers & Risks
<!-- AUTO-MANAGED: blocked -->
- [ ] [[Blocked Item]] - Waiting for approval
<!-- END AUTO-MANAGED -->

## Looking Ahead
<!-- AUTO-MANAGED: upcoming -->
- [ ] Task planned for next week
<!-- END AUTO-MANAGED -->

---

## Additional Notes
*(Add context, decisions, discussions here)*
```

### Monthly Report Template
```markdown
---
tags:
  - all
  - project-update
  - monthly
created: 2025-11-01
project: pd
month: 2025-11
---

# PD Monthly Review - November 2025

## Month in Review

### Accomplishments
<!-- AUTO-MANAGED: completed -->
*(Completed items from past 30 days)*
<!-- END AUTO-MANAGED -->

### Active Initiatives
<!-- AUTO-MANAGED: active -->
*(Current projects and their status)*
<!-- END AUTO-MANAGED -->

### Metrics & Progress
<!-- AUTO-MANAGED: metrics -->
- Total tasks completed: X
- Projects advanced: Y
- Blockers resolved: Z
<!-- END AUTO-MANAGED -->

## Next Month Goals
*(Manually added)*

---

## Reflections
*(Manually added)*
```

## Settings UI

### Project Updates Tab

```
┌─────────────────────────────────────────────────┐
│ Project Updates Configuration                    │
├─────────────────────────────────────────────────┤
│                                                  │
│ ☑ Enable Project Updates                        │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ PBSWI Weekly Update                    [✏️] │ │
│ │ Schedule: Weekly (Mondays 9:00 AM)          │ │
│ │ Folder: 1 - Projects/PBSWI                  │ │
│ │ Last generated: 11/04/25 9:00 AM            │ │
│ │                                [Generate Now]│ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ Daily Standup                          [✏️] │ │
│ │ Schedule: Daily (Weekdays 8:00 AM)          │ │
│ │ Folder: 1 - Projects/ME                     │ │
│ │ Last generated: 11/05/25 8:00 AM            │ │
│ │                                [Generate Now]│ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│                        [+ Add Project Update]    │
│                                                  │
└─────────────────────────────────────────────────┘
```

### Add/Edit Modal

```
┌─────────────────────────────────────────────────┐
│ Configure Project Update                        │
├─────────────────────────────────────────────────┤
│                                                  │
│ Name: [PBSWI Weekly Update              ]       │
│                                                  │
│ Project Folder: [1 - Projects/PBSWI     ] [📁]  │
│                                                  │
│ Schedule:                                        │
│   ⦿ Daily   ○ Weekly   ○ Monthly                │
│                                                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ Weekly Options                               │ │
│ │                                              │ │
│ │ Day of Week: [Monday        ▼]              │ │
│ │ Time:        [09:00         ]               │ │
│ └─────────────────────────────────────────────┘ │
│                                                  │
│ Report Name Format:                             │
│ [PBSWI Weekly Update - {{date}}        ]        │
│                                                  │
│ Include:                                         │
│   ☑ Completed tasks                             │
│   ☑ Active projects                             │
│   ☑ Blocked items                               │
│                                                  │
│ Lookback Period: [7         ] days              │
│                                                  │
│                      [Cancel]  [Save]           │
└─────────────────────────────────────────────────┘
```

## Commands

### New Commands

1. **"Generate project update: [Name]"** (one per config)
   - Manually trigger specific update
   - Bypasses schedule check

2. **"Generate all project updates"**
   - Trigger all configured updates
   - Useful for testing

3. **"Configure project updates"**
   - Opens settings directly to project updates section

## Data Scanning

### scanProjectFolder()

```javascript
async function scanProjectFolder(folderPath) {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) return null;

    const data = {
        completed: [],
        active: [],
        blocked: [],
        projects: []
    };

    // Recursively scan all markdown files in folder
    const files = this.app.vault.getMarkdownFiles()
        .filter(f => f.path.startsWith(folderPath));

    for (const file of files) {
        const content = await this.app.vault.read(file);

        // Extract completed tasks (with dates)
        const completed = extractCompletedTasks(content);
        data.completed.push(...completed);

        // Extract active tasks
        const active = extractActiveTasks(content);
        data.active.push(...active);

        // Extract blocked tasks
        const blocked = extractBlockedTasks(content);
        data.blocked.push(...blocked);

        // If file represents a project, extract metadata
        if (isProjectFile(file)) {
            data.projects.push({
                name: file.basename,
                status: getProjectStatus(content),
                link: `[[${file.basename}]]`
            });
        }
    }

    return data;
}
```

### Task Extraction

```javascript
function extractCompletedTasks(content) {
    const tasks = [];
    const lines = content.split('\n');

    for (const line of lines) {
        // Match: - [x] Task text ✅ YYYY-MM-DD
        const match = line.match(/^-\s+\[x\]\s+(.*?)✅\s+(\d{4}-\d{2}-\d{2})/i);
        if (match) {
            tasks.push({
                text: match[1].trim(),
                completedDate: match[2],
                line: line.trim()
            });
        }
    }

    return tasks;
}

function extractActiveTasks(content) {
    const tasks = [];
    const lines = content.split('\n');

    for (const line of lines) {
        // Match: - [ ] Task text (not completed)
        if (/^-\s+\[ \]/.test(line)) {
            // Skip if it has tags that indicate blocked
            if (!line.includes('#blocked') && !line.includes('waiting')) {
                tasks.push(line.trim());
            }
        }
    }

    return tasks;
}
```

## Migration from Current System

### Backward Compatibility

The old 1-on-1 specific settings remain for compatibility:
```javascript
agendaGeneration: {
    enabled: false,  // Deprecated, set to false
    // ... other old settings
}
```

### Migration Path

1. **Automatically convert** existing 1-on-1 config to new system on first load:
```javascript
if (settings.agendaGeneration.enabled) {
    // Create equivalent project update config
    settings.projectUpdates.configs.push({
        id: "weekly-1on1",
        name: "Weekly 1-on-1",
        projectFolder: settings.agendaGeneration.pbswiFolder,
        schedule: "weekly",
        dayOfWeek: 1,
        // ... map other settings
    });

    // Disable old system
    settings.agendaGeneration.enabled = false;
    await this.saveSettings();
}
```

2. **Show migration notice**:
```
Notice: "Your weekly 1-on-1 has been migrated to the new Project Updates system.
Check Settings → Quick PARA → Project Updates to configure."
```

## Implementation Plan

### Phase 1: Core Infrastructure
- [ ] Update settings structure with projectUpdates
- [ ] Create ProjectUpdateConfig class
- [ ] Implement schedule checking logic
- [ ] Add state tracking (last generated dates)

### Phase 2: Data Scanning
- [ ] Implement scanProjectFolder()
- [ ] Add task extraction functions
- [ ] Add project detection logic
- [ ] Filter by date ranges

### Phase 3: Report Generation
- [ ] Create report templates
- [ ] Implement formatProjectReport()
- [ ] Add getOrCreateReportFile()
- [ ] Implement append/update logic

### Phase 4: Settings UI
- [ ] Build project updates settings section
- [ ] Add config list view
- [ ] Create add/edit modal
- [ ] Add manual trigger buttons

### Phase 5: Commands & Automation
- [ ] Register dynamic commands (one per config)
- [ ] Add interval checking
- [ ] Implement manual triggers
- [ ] Add migration from old system

### Phase 6: Testing
- [ ] Test daily schedule
- [ ] Test weekly schedule
- [ ] Test monthly schedule
- [ ] Test multiple configs
- [ ] Test edge cases (missing folders, etc.)

## Benefits

### Flexibility ✨
- Configure updates for any project folder
- Choose schedule that fits workflow
- Customize report format

### Scalability 📈
- Add unlimited project update configs
- Each config independent
- Easy to enable/disable

### Automation ⚡
- Hands-free report generation
- Consistent format
- No manual copy-paste

### Organization 📁
- All reports in Inbox for processing
- Auto-managed sections preserve manual notes
- Clear separation of auto vs. manual content

## Future Enhancements

1. **Email Integration**: Send reports via email
2. **Slack/Discord**: Post to team channels
3. **Custom Templates**: User-defined report formats
4. **AI Summaries**: GPT-generated summaries
5. **Metrics Tracking**: Charts and graphs
6. **Export Options**: PDF, Markdown, HTML
7. **Team Collaboration**: Share configs across team

---

**Status**: Design Phase
**Next Step**: Begin Phase 1 implementation
