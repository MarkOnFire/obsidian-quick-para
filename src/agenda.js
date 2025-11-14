const { Notice } = require('obsidian');

class AgendaManager {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * Get the date of the upcoming Monday in MM/DD/YY format
     * If today is Monday, returns today's date
     */
    getNextMondayDate() {
        const today = new Date();
        const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.

        let daysUntilMonday;
        if (dayOfWeek === 1) {
            // Today is Monday
            daysUntilMonday = 0;
        } else if (dayOfWeek === 0) {
            // Today is Sunday, next Monday is 1 day away
            daysUntilMonday = 1;
        } else {
            // Calculate days until next Monday
            daysUntilMonday = 8 - dayOfWeek;
        }

        const monday = new Date(today);
        monday.setDate(today.getDate() + daysUntilMonday);

        const month = String(monday.getMonth() + 1).padStart(2, '0');
        const day = String(monday.getDate()).padStart(2, '0');
        const year = String(monday.getFullYear()).slice(-2);

        return `${month}/${day}/${year}`;
    }

    /**
     * Format a date as YYYY-MM-DD
     */
    formatDateISO(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Get a date N days ago in YYYY-MM-DD format
     */
    getDateDaysAgo(days) {
        const date = new Date();
        date.setDate(date.getDate() - days);
        return this.formatDateISO(date);
    }

    /**
     * Get a date N days from now in YYYY-MM-DD format
     */
    getDateDaysAhead(days) {
        const date = new Date();
        date.setDate(date.getDate() + days);
        return this.formatDateISO(date);
    }

    /**
     * Parse the Project Dashboard kanban board
     * Returns sections: done, doing, today, tomorrow, this_week, blocked
     */
    async parseKanbanBoard() {
        const kanbanPath = this.settings.agendaGeneration.kanbanFile;
        const file = this.app.vault.getAbstractFileByPath(kanbanPath);

        if (!file) {
            throw new Error(`Kanban board not found: ${kanbanPath}`);
        }

        const content = await this.app.vault.read(file);

        const sections = {
            done: [],
            doing: [],
            today: [],
            tomorrow: [],
            this_week: [],
            blocked: []
        };

        // Extract sections using regex
        // Pattern: ## SECTION_NAME followed by content until next ## or end
        const sectionRegex = /^##\s+(.+?)$\n(.*?)(?=^##|\Z)/gms;
        const matches = [...content.matchAll(sectionRegex)];

        for (const match of matches) {
            const sectionName = match[1].trim().toLowerCase();
            const sectionContent = match[2];

            // Map section names to our keys
            let key = null;
            if (sectionName === 'done') key = 'done';
            else if (sectionName === 'doing') key = 'doing';
            else if (sectionName === 'today') key = 'today';
            else if (sectionName === 'tomorrow') key = 'tomorrow';
            else if (sectionName === 'this week') key = 'this_week';
            else if (sectionName === 'blocked') key = 'blocked';

            if (key) {
                sections[key] = this.extractTasks(sectionContent);
            }
        }

        return sections;
    }

    /**
     * Extract task items from section content
     */
    extractTasks(sectionContent) {
        const tasks = [];
        const lines = sectionContent.split('\n');

        for (const line of lines) {
            // Match checkbox items: - [ ] or - [x]
            if (/^\s*-\s+\[[ x]\]/i.test(line)) {
                tasks.push(line.trim());
            }
        }

        return tasks;
    }

    /**
     * Scan project folder to analyze activity
     * Returns project activity data
     */
    async analyzeProjectActivity() {
        const pbswiPath = this.settings.agendaGeneration.pbswiFolder;
        const projectData = {
            byPrefix: {
                lead: [],
                digital: [],
                edu: [],
                archive: [],
                other: []
            },
            activity: new Map() // projectName -> { completed: count, active: count }
        };

        // Get all markdown files in PBSWI folder
        const files = this.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(pbswiPath + '/') && !f.path.includes('/'));

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        for (const file of files) {
            const projectName = file.basename;
            const content = await this.app.vault.read(file);

            // Count completed tasks in last 7 days
            let completedCount = 0;
            let activeCount = 0;

            const lines = content.split('\n');
            for (const line of lines) {
                // Completed tasks with date
                const completedMatch = line.match(/^-\s+\[x\].*?✅\s+(\d{4})-(\d{2})-(\d{2})/i);
                if (completedMatch) {
                    const taskDate = new Date(completedMatch[1], completedMatch[2] - 1, completedMatch[3]);
                    if (taskDate >= sevenDaysAgo) {
                        completedCount++;
                    }
                }

                // Active (not done) tasks
                if (/^-\s+\[ \]/i.test(line)) {
                    activeCount++;
                }
            }

            projectData.activity.set(projectName, { completed: completedCount, active: activeCount });

            // Categorize by prefix
            const upperName = projectName.toUpperCase();
            if (upperName.startsWith('LEAD —') || upperName.startsWith('LEAD —')) {
                projectData.byPrefix.lead.push(projectName);
            } else if (upperName.startsWith('DIGITAL —')) {
                projectData.byPrefix.digital.push(projectName);
            } else if (upperName.startsWith('EDU —')) {
                projectData.byPrefix.edu.push(projectName);
            } else if (upperName.startsWith('ARCHIVE —')) {
                projectData.byPrefix.archive.push(projectName);
            } else {
                projectData.byPrefix.other.push(projectName);
            }
        }

        return projectData;
    }

    /**
     * Extract project names from kanban tasks
     */
    extractProjectNames(tasks) {
        const projects = new Set();
        for (const task of tasks) {
            const wikilinks = task.match(/\[\[([^\]]+)\]\]/g);
            if (wikilinks) {
                for (const link of wikilinks) {
                    const projectName = link.slice(2, -2);
                    projects.add(projectName);
                }
            }
        }
        return Array.from(projects);
    }

    /**
     * Get kanban status for a project
     */
    getProjectStatus(projectName, kanbanData) {
        const projectLink = `[[${projectName}]]`;

        if (kanbanData.doing.some(t => t.includes(projectLink))) return 'Doing';
        if (kanbanData.today.some(t => t.includes(projectLink))) return 'Today';
        if (kanbanData.tomorrow.some(t => t.includes(projectLink))) return 'Tomorrow';
        if (kanbanData.this_week.some(t => t.includes(projectLink))) return 'This Week';

        return null;
    }

    /**
     * Update the Weekly 1-on-1 agenda with data from kanban board
     */
    async updateWeeklyAgenda() {
        try {
            new Notice('Updating weekly 1-on-1 agenda...');

            // Parse kanban board
            const kanbanData = await this.parseKanbanBoard();

            // Analyze project activity
            const projectData = await this.analyzeProjectActivity();

            // Get next Monday date
            const mondayDate = this.getNextMondayDate();

            // Get agenda file
            const agendaPath = this.settings.agendaGeneration.agendaFile;
            const file = this.app.vault.getAbstractFileByPath(agendaPath);

            if (!file) {
                new Notice(`Agenda file not found: ${agendaPath}`, 5000);
                return;
            }

            const content = await this.app.vault.read(file);

            // Check if Monday section exists
            const mondayPattern = new RegExp(`### ${this.escapeRegex(mondayDate)}`);
            const hasMondaySection = mondayPattern.test(content);

            let updatedContent = content;

            if (!hasMondaySection) {
                // Create new Monday section
                updatedContent = this.createMondaySection(content, mondayDate);
            }

            // Update the Monday section with kanban data
            updatedContent = this.updateMondaySection(updatedContent, mondayDate, kanbanData, projectData);

            // Write back to file
            await this.app.vault.modify(file, updatedContent);

            new Notice('Weekly agenda updated successfully!');
        } catch (error) {
            console.error('Error updating weekly agenda:', error);
            new Notice(`Error updating agenda: ${error.message}`, 5000);
        }
    }

    /**
     * Create a new Monday section in the agenda
     */
    createMondaySection(content, mondayDate) {
        const pbswiPath = this.settings.agendaGeneration.pbswiFolder;
        const sevenDaysAgo = this.getDateDaysAgo(7);
        const sevenDaysAhead = this.getDateDaysAhead(7);
        const thirtyDaysAgo = this.getDateDaysAgo(30);

        const newSection = `### ${mondayDate}

#### 🎯 Active Projects
<!-- AUTO-MANAGED -->
*Auto-updated from Project Dashboard kanban board*

<!-- END AUTO-MANAGED -->

#### 📈 This Week's Progress
<!-- AUTO-MANAGED -->
*Recently completed tasks (last 7 days)*

\`\`\`tasks
path includes ${pbswiPath}
done after ${sevenDaysAgo}
sort by done reverse
limit 15
hide edit button
\`\`\`

<!-- END AUTO-MANAGED -->

#### ⚡ Priority Tasks This Week
<!-- AUTO-MANAGED -->
*High-priority and due-soon tasks*

\`\`\`tasks
path includes ${pbswiPath}
not done
((priority is above medium) OR (due before ${sevenDaysAhead}))
NOT (path includes ARCHIVE)
sort by priority, due
limit 20
hide edit button
\`\`\`

<!-- END AUTO-MANAGED -->

#### 🚧 Blocked & Questions
<!-- AUTO-MANAGED -->
*Auto-updated from Project Dashboard "Blocked" section*

<!-- END AUTO-MANAGED -->

#### 📅 Regular Recurring Tasks
<!-- AUTO-MANAGED -->
*Daily/weekly routine tasks due in next 7 days*

\`\`\`tasks
path includes ${pbswiPath}/Daily Duties
not done
due before ${sevenDaysAhead}
sort by due
hide edit button
\`\`\`

<!-- END AUTO-MANAGED -->

#### 📊 Project Activity Summary
<!-- AUTO-MANAGED -->
*Projects sorted by recent activity*

<!-- END AUTO-MANAGED -->

#### 💤 Inactive Projects (30+ days)
<!-- AUTO-MANAGED -->
*Projects with no activity for 30+ days - review for archive*

\`\`\`tasks
path includes ${pbswiPath}/ARCHIVE
OR (path includes ${pbswiPath}) AND (done before ${thirtyDaysAgo})
group by filename
limit groups 5
limit 3
hide edit button
\`\`\`

**Note**: Full project list available in [[Project Dashboard]]. Projects shown above have had no completed tasks since ${thirtyDaysAgo}.

<!-- END AUTO-MANAGED -->

#### 🗓️ Check-In Topics
<!-- AUTO-MANAGED -->
*Meeting notes and discussion topics*

<!-- END AUTO-MANAGED -->

#### 💬 Feedback/updates/notes from meeting
  * *(add any notes and action items here after the meeting)*

---

`;

        // Insert after "## Notes" section
        const notesPattern = /(## Notes.*?\n.*?\n)/s;
        const match = content.match(notesPattern);

        if (match) {
            const insertPos = match.index + match[0].length;
            return content.slice(0, insertPos) + '\n' + newSection + content.slice(insertPos);
        }

        // Fallback: append at end
        return content + '\n\n' + newSection;
    }

    /**
     * Update the Monday section with kanban data
     */
    updateMondaySection(content, mondayDate, kanbanData, projectData) {
        // Find the Monday section
        const sectionPattern = new RegExp(
            `(### ${this.escapeRegex(mondayDate)}\\s*\\n)(.*?)(?=\\n### |\\n---|\\Z)`,
            's'
        );
        const match = content.match(sectionPattern);

        if (!match) {
            console.warn(`Could not find Monday section for ${mondayDate}`);
            return content;
        }

        let sectionBody = match[2];

        // Update Active Projects section
        const activeProjectsContent = this.formatActiveProjectsSection(kanbanData, projectData);
        sectionBody = this.updateAutoSection(sectionBody, '🎯 Active Projects', activeProjectsContent);

        // Update Blocked section
        const blockedContent = this.formatBlockedSection(kanbanData);
        sectionBody = this.updateAutoSection(sectionBody, '🚧 Blocked & Questions', blockedContent);

        // Update Project Activity Summary
        const activityContent = this.formatActivitySummarySection(projectData);
        sectionBody = this.updateAutoSection(sectionBody, '📊 Project Activity Summary', activityContent);

        // Update Check-In Topics (extract from kanban if available)
        const checkInContent = this.formatCheckInTopicsSection(kanbanData);
        sectionBody = this.updateAutoSection(sectionBody, '🗓️ Check-In Topics', checkInContent);

        // Note: Tasks query sections (Progress, Priority Tasks, Recurring, Inactive)
        // are embedded in the template and auto-update via Tasks plugin

        // Reconstruct content
        return content.slice(0, match.index) + match[1] + sectionBody + content.slice(match.index + match[0].length);
    }

    /**
     * Update an auto-managed section
     */
    updateAutoSection(body, sectionName, newContent) {
        const pattern = new RegExp(
            `(####\\s+${this.escapeRegex(sectionName)}\\s*\\n)(.*?)(<!--\\s*AUTO-MANAGED\\s*-->)(.*?)(<!--\\s*END AUTO-MANAGED\\s*-->)`,
            's'
        );
        const match = body.match(pattern);

        if (match) {
            const header = match[1];
            const preAuto = match[2];
            const autoStart = match[3];
            const autoEnd = match[5];

            return body.slice(0, match.index) +
                   header + preAuto + autoStart + '\n' + newContent + '\n' + autoEnd +
                   body.slice(match.index + match[0].length);
        }

        return body;
    }

    /**
     * Format the Active Projects section with priority grouping
     */
    formatActiveProjectsSection(kanbanData, projectData) {
        const lines = ['*Auto-updated from Project Dashboard kanban board*', ''];

        // Combine active work sections
        const activeTasks = [
            ...kanbanData.doing,
            ...kanbanData.today,
            ...kanbanData.tomorrow,
            ...kanbanData.this_week
        ];

        // Extract all active project names
        const activeProjectNames = this.extractProjectNames(activeTasks);

        // Group by priority prefix
        const groups = {
            lead: [],
            digital: [],
            edu: [],
            other: []
        };

        for (const projectName of activeProjectNames) {
            const upperName = projectName.toUpperCase();
            const status = this.getProjectStatus(projectName, kanbanData);
            const entry = `- [[${projectName}]] (${status})`;

            if (upperName.startsWith('LEAD —')) {
                groups.lead.push(entry);
            } else if (upperName.startsWith('DIGITAL —')) {
                groups.digital.push(entry);
            } else if (upperName.startsWith('EDU —')) {
                groups.edu.push(entry);
            } else {
                groups.other.push(entry);
            }
        }

        // Output grouped projects
        if (groups.lead.length > 0) {
            lines.push('**Lead Priority**');
            lines.push(...groups.lead);
            lines.push('');
        }

        if (groups.digital.length > 0) {
            lines.push('**Digital Priority**');
            lines.push(...groups.digital);
            lines.push('');
        }

        if (groups.edu.length > 0) {
            lines.push('**Education Priority**');
            lines.push(...groups.edu);
            lines.push('');
        }

        if (groups.other.length > 0) {
            lines.push('**Other Projects**');
            lines.push(...groups.other);
            lines.push('');
        }

        if (activeProjectNames.length === 0) {
            lines.push('*(no active projects this week)*');
        }

        return lines.join('\n');
    }

    /**
     * Format the Blocked section content
     */
    formatBlockedSection(kanbanData) {
        const lines = ['*Auto-updated from Project Dashboard "Blocked" section*', ''];

        if (kanbanData.blocked.length > 0) {
            for (const task of kanbanData.blocked) {
                // Remove checkbox and format
                const text = task.replace(/^-\s+\[[ x]\]\s+/i, '');
                lines.push(`- ${text}`);
            }
        } else {
            lines.push('- *(none)*');
        }

        return lines.join('\n');
    }

    /**
     * Format the Project Activity Summary section
     */
    formatActivitySummarySection(projectData) {
        const lines = ['*Projects sorted by recent activity*', ''];

        // Group projects by activity level
        const high = [];    // 5+ completions
        const moderate = []; // 1-4 completions
        const low = [];      // 0 completions

        for (const [projectName, stats] of projectData.activity) {
            const activity = stats.completed;
            const active = stats.active;

            const entry = `- [[${projectName}]] - ${stats.completed} tasks completed, ${stats.active} active`;

            if (activity >= 5) {
                high.push(entry);
            } else if (activity >= 1) {
                moderate.push(entry);
            } else if (active > 0) {
                low.push(entry);
            }
        }

        // Output grouped by activity
        if (high.length > 0) {
            lines.push('**High Activity** (5+ tasks completed this week)');
            lines.push(...high);
            lines.push('');
        }

        if (moderate.length > 0) {
            lines.push('**Moderate Activity** (1-4 tasks completed)');
            lines.push(...moderate);
            lines.push('');
        }

        if (low.length > 0) {
            lines.push('**Low Activity** (no completions this week)');
            lines.push(...low.slice(0, 5)); // Limit low activity to 5
            lines.push('');
        }

        if (high.length === 0 && moderate.length === 0 && low.length === 0) {
            lines.push('*(no project activity tracked)*');
        }

        return lines.join('\n');
    }

    /**
     * Format the Check-In Topics section
     */
    formatCheckInTopicsSection(kanbanData) {
        const lines = ['*Meeting notes and discussion topics*', ''];

        // This section is primarily manual, but we can extract some topics
        // from project names or kanban items if needed

        // For now, leave it mostly empty for manual entry
        lines.push('*(Add discussion topics here before the meeting)*');

        return lines.join('\n');
    }

    /**
     * Filter tasks completed in the last N days
     */
    filterRecentTasks(tasks, days) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        return tasks.filter(task => {
            const dateMatch = task.match(/✅\s+(\d{4})-(\d{2})-(\d{2})/);
            if (dateMatch) {
                const taskDate = new Date(dateMatch[1], dateMatch[2] - 1, dateMatch[3]);
                return taskDate >= cutoffDate;
            }
            return true; // Include tasks without dates
        });
    }

    /**
     * Escape special regex characters
     */
    escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

module.exports = { AgendaManager };
