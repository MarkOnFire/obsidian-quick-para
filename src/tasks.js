const { Notice } = require('obsidian');

class TaskManager {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * Cancel all open tasks in a file by replacing checkboxes
     * Converts: - [ ] task -> - [-] task
     * Also handles: * [ ] task and + [ ] task
     */
    async cancelTasksInFile(file) {
        if (!file) return { modified: false, taskCount: 0 };

        try {
            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            let modified = false;
            let taskCount = 0;

            const newLines = lines.map(line => {
                // Match task lines with open checkboxes: - [ ], * [ ], or + [ ]
                // Regex explanation:
                // ^(\s*)      - Start of line, capture leading whitespace
                // ([-*+])     - Capture list marker
                // \s+         - One or more spaces after marker
                // \[          - Opening bracket (escaped)
                // \s          - Space inside checkbox
                // \]          - Closing bracket (escaped)
                // \s+         - One or more spaces after checkbox
                // (.+)        - Capture the rest of the task text
                const taskMatch = line.match(/^(\s*)([-*+])\s+\[\s\]\s+(.+)/);

                if (taskMatch) {
                    taskCount++;
                    modified = true;
                    const [, indent, marker, taskText] = taskMatch;
                    // Return cancelled task format
                    return `${indent}${marker} [-] ${taskText}`;
                }

                return line;
            });

            if (modified) {
                await this.app.vault.modify(file, newLines.join('\n'));
            }

            return { modified, taskCount };
        } catch (error) {
            console.error(`Quick PARA: Error cancelling tasks in ${file.name}:`, error);
            return { modified: false, taskCount: 0, error };
        }
    }

    /**
     * Cancel all open tasks in Archive folder
     */
    async cancelArchiveTasks() {
        const archiveFolderPath = this.settings.paraFolders?.archive || '4 - ARCHIVE';

        // Get all markdown files in the archive folder
        const allFiles = this.app.vault.getMarkdownFiles();
        const archiveFiles = allFiles.filter(file =>
            file.path.startsWith(archiveFolderPath + '/') || file.path === archiveFolderPath
        );

        if (archiveFiles.length === 0) {
            new Notice(`No files found in ${archiveFolderPath}`);
            return;
        }

        new Notice(`Scanning ${archiveFiles.length} files in Archive...`);

        let filesModified = 0;
        let totalTasksCancelled = 0;
        const errors = [];

        for (const file of archiveFiles) {
            const result = await this.cancelTasksInFile(file);

            if (result.error) {
                errors.push({ file: file.name, error: result.error });
            } else if (result.modified) {
                filesModified++;
                totalTasksCancelled += result.taskCount;
            }
        }

        // Show summary
        if (errors.length > 0) {
            new Notice(
                `Completed with errors: ${filesModified} files updated, ` +
                `${totalTasksCancelled} tasks cancelled, ${errors.length} errors`
            );
            console.error('Quick PARA: Errors during task cancellation:', errors);
        } else {
            new Notice(
                `Archive tasks cancelled: ${totalTasksCancelled} tasks in ${filesModified} files`
            );
        }

        console.log(`Quick PARA: Archive task cancellation complete - ${filesModified} files, ${totalTasksCancelled} tasks`);
    }

    /**
     * Cancel all open tasks in current file
     */
    async cancelCurrentFileTasks() {
        const file = this.app.workspace.getActiveFile();

        if (!file) {
            new Notice('No active file');
            return;
        }

        const result = await this.cancelTasksInFile(file);

        if (result.error) {
            new Notice(`Error cancelling tasks: ${result.error.message}`);
        } else if (result.modified) {
            new Notice(`Cancelled ${result.taskCount} tasks in ${file.name}`);
        } else {
            new Notice('No open tasks found in current file');
        }
    }

    /**
     * Preview which tasks would be cancelled (dry run)
     */
    async previewArchiveTaskCancellation() {
        const archiveFolderPath = this.settings.paraFolders?.archive || '4 - ARCHIVE';

        const allFiles = this.app.vault.getMarkdownFiles();
        const archiveFiles = allFiles.filter(file =>
            file.path.startsWith(archiveFolderPath + '/') || file.path === archiveFolderPath
        );

        if (archiveFiles.length === 0) {
            new Notice(`No files found in ${archiveFolderPath}`);
            return;
        }

        let totalTasks = 0;
        const filesWithTasks = [];

        for (const file of archiveFiles) {
            const content = await this.app.vault.read(file);
            const taskMatches = content.match(/^(\s*)([-*+])\s+\[\s\]\s+(.+)/gm);

            if (taskMatches && taskMatches.length > 0) {
                totalTasks += taskMatches.length;
                filesWithTasks.push({
                    path: file.path,
                    name: file.name,
                    taskCount: taskMatches.length
                });
            }
        }

        if (totalTasks === 0) {
            new Notice('No open tasks found in Archive folder');
        } else {
            console.log('Quick PARA: Archive task preview:', {
                totalFiles: archiveFiles.length,
                filesWithTasks: filesWithTasks.length,
                totalOpenTasks: totalTasks,
                files: filesWithTasks
            });

            new Notice(
                `Preview: ${totalTasks} open tasks found in ${filesWithTasks.length} files. ` +
                `Check console for details.`
            );
        }
    }
}

module.exports = { TaskManager };
