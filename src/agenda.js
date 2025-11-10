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
     * Update the Weekly 1-on-1 agenda with data from kanban board
     */
    async updateWeeklyAgenda() {
        try {
            new Notice('Updating weekly 1-on-1 agenda...');

            // Parse kanban board
            const kanbanData = await this.parseKanbanBoard();

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
            updatedContent = this.updateMondaySection(updatedContent, mondayDate, kanbanData);

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
        const newSection = `### ${mondayDate}

#### Projects
<!-- AUTO-MANAGED -->
*Auto-updated from Project Dashboard*

<!-- END AUTO-MANAGED -->

#### Blocked/feedback needed
<!-- AUTO-MANAGED -->
*Auto-updated from Project Dashboard "Blocked" section*

<!-- END AUTO-MANAGED -->

#### Daily Highlights (This Week)
<!-- AUTO-MANAGED -->
*Completed tasks from Project Dashboard "Done" section*

<!-- END AUTO-MANAGED -->

#### Feedback/updates/notes from Tim
  * *(add Tim's feedback here after the meeting)*

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
    updateMondaySection(content, mondayDate, kanbanData) {
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

        // Update Projects section
        const projectsContent = this.formatProjectsSection(kanbanData);
        sectionBody = this.updateAutoSection(sectionBody, 'Projects', projectsContent);

        // Update Blocked section
        const blockedContent = this.formatBlockedSection(kanbanData);
        sectionBody = this.updateAutoSection(sectionBody, 'Blocked/feedback needed', blockedContent);

        // Update Highlights section
        const highlightsContent = this.formatHighlightsSection(kanbanData);
        sectionBody = this.updateAutoSection(sectionBody, 'Daily Highlights \\(This Week\\)', highlightsContent);

        // Reconstruct content
        return content.slice(0, match.index) + match[1] + sectionBody + content.slice(match.index + match[0].length);
    }

    /**
     * Update an auto-managed section
     */
    updateAutoSection(body, sectionName, newContent) {
        const pattern = new RegExp(
            `(####\\s+${sectionName}\\s*\\n)(.*?)(<!--\\s*AUTO-MANAGED\\s*-->)(.*?)(<!--\\s*END AUTO-MANAGED\\s*-->)`,
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
     * Format the Projects section content
     */
    formatProjectsSection(kanbanData) {
        const lines = ['*Auto-updated from Project Dashboard*', ''];

        // Combine active work sections
        const activeTasks = [
            ...kanbanData.doing,
            ...kanbanData.today,
            ...kanbanData.tomorrow,
            ...kanbanData.this_week
        ];

        // Extract unique PBSWI project wikilinks
        const projectLinks = new Set();
        const pbswiPath = this.settings.agendaGeneration.pbswiFolder;

        for (const task of activeTasks) {
            const wikilinks = task.match(/\[\[([^\]]+)\]\]/g);
            if (wikilinks) {
                for (const link of wikilinks) {
                    const projectName = link.slice(2, -2);
                    // Check if project exists in PBSWI folder
                    const projectFile = this.app.vault.getAbstractFileByPath(`${pbswiPath}/${projectName}.md`);
                    if (projectFile) {
                        projectLinks.add(link);
                    }
                }
            }
        }

        if (projectLinks.size > 0) {
            const sorted = Array.from(projectLinks).sort();
            for (const link of sorted) {
                lines.push(`  * ${link}`);
                // TODO: Extract completed tasks from project note
            }
        } else {
            lines.push('  * *(no PBSWI projects this week)*');
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
     * Format the Highlights section content
     */
    formatHighlightsSection(kanbanData) {
        const lines = ['*Completed tasks from Project Dashboard "Done" section*', ''];

        if (kanbanData.done.length > 0) {
            // Get tasks from last 7 days
            const recentTasks = this.filterRecentTasks(kanbanData.done, 7);
            if (recentTasks.length > 0) {
                lines.push(...recentTasks.slice(0, 10));
            } else {
                lines.push('- *(no completed tasks this week)*');
            }
        } else {
            lines.push('- *(no completed tasks this week)*');
        }

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
