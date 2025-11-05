const { Plugin, Notice, Modal, PluginSettingTab, Setting } = require('obsidian');

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS = {
    firstRun: true,
    paraFolders: {
        inbox: "0 - INBOX",
        projects: "1 - Projects",
        areas: "2 - AREAS",
        resources: "3 - RESOURCES",
        archive: "4 - ARCHIVE"
    },
    agendaGeneration: {
        enabled: true,
        kanbanFile: "0 - INBOX/Project Dashboard.md",
        agendaFile: "0 - INBOX/Weekly 1 on 1.md",
        pbswiFolder: "1 - Projects/PBSWI"
    },
    templates: {
        autoDeployOnSetup: true,
        backupBeforeOverwrite: true
    },
    tagging: {
        propertyName: "para",
        persistSubfolderTags: true,
        migrateOldTags: false
    }
};

// ============================================================================
// DEPENDENCY MANAGER
// ============================================================================

class DependencyManager {
    constructor(app) {
        this.app = app;
        this.requiredPlugins = {
            'templater-obsidian': {
                name: 'Templater',
                description: 'Required for template variable substitution',
                url: 'https://github.com/SilentVoid13/Templater'
            },
            'obsidian-tasks-plugin': {
                name: 'Tasks',
                description: 'Required for task management',
                url: 'https://github.com/obsidian-tasks-group/obsidian-tasks'
            }
        };

        this.optionalPlugins = {
            'obsidian-kanban': {
                name: 'Kanban',
                description: 'Recommended for Project Dashboard',
                url: 'https://github.com/mgmeyers/obsidian-kanban'
            }
        };
    }

    async checkDependencies() {
        const missing = [];
        const installed = [];

        for (const [pluginId, info] of Object.entries(this.requiredPlugins)) {
            if (this.isPluginEnabled(pluginId)) {
                installed.push(info.name);
            } else {
                missing.push({ ...info, pluginId, required: true });
            }
        }

        for (const [pluginId, info] of Object.entries(this.optionalPlugins)) {
            if (this.isPluginEnabled(pluginId)) {
                installed.push(info.name);
            } else {
                missing.push({ ...info, pluginId, required: false });
            }
        }

        return {
            allMet: missing.filter(p => p.required).length === 0,
            installed,
            missing
        };
    }

    isPluginInstalled(pluginId) {
        return this.app.plugins.manifests[pluginId] !== undefined;
    }

    isPluginEnabled(pluginId) {
        return this.app.plugins.enabledPlugins.has(pluginId);
    }

    async showDependencyWarning(missing) {
        const modal = new DependencyWarningModal(this.app, missing);
        modal.open();
    }
}

class DependencyWarningModal extends Modal {
    constructor(app, missing) {
        super(app);
        this.missing = missing;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: 'Plugin Dependencies' });

        const required = this.missing.filter(p => p.required);
        const optional = this.missing.filter(p => !p.required);

        if (required.length > 0) {
            contentEl.createEl('h3', { text: 'Required Plugins (Missing)' });
            contentEl.createEl('p', {
                text: 'These plugins are required for Quick PARA to function properly.',
                cls: 'mod-warning'
            });

            const reqList = contentEl.createEl('ul');
            for (const plugin of required) {
                const li = reqList.createEl('li');
                li.createEl('strong', { text: plugin.name });
                li.appendText(`: ${plugin.description}`);
                li.createEl('br');
                li.createEl('a', { text: 'Install', href: plugin.url });
            }
        }

        if (optional.length > 0) {
            contentEl.createEl('h3', { text: 'Optional Plugins (Missing)' });
            contentEl.createEl('p', {
                text: 'These plugins enhance Quick PARA but are not required.'
            });

            const optList = contentEl.createEl('ul');
            for (const plugin of optional) {
                const li = optList.createEl('li');
                li.createEl('strong', { text: plugin.name });
                li.appendText(`: ${plugin.description}`);
                li.createEl('br');
                li.createEl('a', { text: 'Install', href: plugin.url });
            }
        }

        if (this.missing.length === 0) {
            contentEl.createEl('p', { text: 'All dependencies are installed!' });
        }

        const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });
        const closeButton = buttonContainer.createEl('button', { text: 'Close' });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// ============================================================================
// PROVISIONING MANAGER
// ============================================================================

class ProvisioningManager {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;
    }

    async detectExistingStructure() {
        const detected = {};
        const folders = this.app.vault.getAllLoadedFiles()
            .filter(f => f.children !== undefined); // Only folders

        for (const [location, folderName] of Object.entries(this.settings.paraFolders)) {
            const exists = folders.some(f => f.path === folderName);
            detected[location] = { exists, path: folderName };
        }

        return detected;
    }

    async provisionFolders(createMissingOnly = true) {
        const structure = await this.detectExistingStructure();
        const created = [];
        const skipped = [];

        for (const [location, info] of Object.entries(structure)) {
            if (info.exists && createMissingOnly) {
                skipped.push(info.path);
                continue;
            }

            try {
                await this.app.vault.createFolder(info.path);
                created.push(info.path);
            } catch (error) {
                if (error.message.includes('already exists')) {
                    skipped.push(info.path);
                } else {
                    console.error(`Failed to create folder ${info.path}:`, error);
                }
            }
        }

        return { created, skipped };
    }

    async runSetupWizard() {
        const modal = new SetupWizardModal(this.app, this);
        modal.open();
    }
}

class SetupWizardModal extends Modal {
    constructor(app, provisioningManager) {
        super(app);
        this.provisioningManager = provisioningManager;
        this.step = 1;
        this.totalSteps = 3;
    }

    onOpen() {
        this.renderStep();
    }

    renderStep() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', { text: `Quick PARA Setup (Step ${this.step}/${this.totalSteps})` });

        switch (this.step) {
            case 1:
                this.renderWelcomeStep(contentEl);
                break;
            case 2:
                this.renderFolderStep(contentEl);
                break;
            case 3:
                this.renderConfirmStep(contentEl);
                break;
        }
    }

    renderWelcomeStep(contentEl) {
        contentEl.createEl('p', { text: 'Welcome to Quick PARA! This wizard will help you set up your vault with the PARA method.' });

        contentEl.createEl('h3', { text: 'What is PARA?' });
        const list = contentEl.createEl('ul');
        list.createEl('li', { text: 'Projects: Active work with deadlines' });
        list.createEl('li', { text: 'Areas: Ongoing responsibilities' });
        list.createEl('li', { text: 'Resources: Reference materials' });
        list.createEl('li', { text: 'Archive: Completed or inactive items' });

        contentEl.createEl('p', { text: 'This wizard will:' });
        const setupList = contentEl.createEl('ol');
        setupList.createEl('li', { text: 'Create PARA folder structure' });
        setupList.createEl('li', { text: 'Deploy note templates' });
        setupList.createEl('li', { text: 'Configure automatic tagging' });

        this.renderButtons(contentEl, false, true);
    }

    async renderFolderStep(contentEl) {
        contentEl.createEl('p', { text: 'Checking existing folder structure...' });

        const structure = await this.provisioningManager.detectExistingStructure();

        contentEl.createEl('h3', { text: 'PARA Folders' });
        const table = contentEl.createEl('table', { cls: 'para-folders-table' });

        const header = table.createEl('tr');
        header.createEl('th', { text: 'Location' });
        header.createEl('th', { text: 'Folder Path' });
        header.createEl('th', { text: 'Status' });

        for (const [location, info] of Object.entries(structure)) {
            const row = table.createEl('tr');
            row.createEl('td', { text: location.charAt(0).toUpperCase() + location.slice(1) });
            row.createEl('td', { text: info.path });
            const statusCell = row.createEl('td');
            statusCell.createEl('span', {
                text: info.exists ? 'Exists' : 'Will create',
                cls: info.exists ? 'para-exists' : 'para-create'
            });
        }

        contentEl.createEl('p', {
            text: 'Existing folders will not be modified. Only missing folders will be created.',
            cls: 'setting-item-description'
        });

        this.renderButtons(contentEl, true, true);
    }

    async renderConfirmStep(contentEl) {
        contentEl.createEl('p', { text: 'Creating folders...' });

        const result = await this.provisioningManager.provisionFolders(true);

        contentEl.empty();
        contentEl.createEl('h2', { text: 'Setup Complete!' });

        if (result.created.length > 0) {
            contentEl.createEl('h3', { text: 'Created Folders' });
            const createdList = contentEl.createEl('ul');
            for (const folder of result.created) {
                createdList.createEl('li', { text: folder });
            }
        }

        if (result.skipped.length > 0) {
            contentEl.createEl('h3', { text: 'Existing Folders (Skipped)' });
            const skippedList = contentEl.createEl('ul');
            for (const folder of result.skipped) {
                skippedList.createEl('li', { text: folder });
            }
        }

        contentEl.createEl('h3', { text: 'Next Steps' });
        const nextSteps = contentEl.createEl('ol');
        nextSteps.createEl('li', { text: 'Install Templater and Tasks plugins (if not already installed)' });
        nextSteps.createEl('li', { text: 'Deploy templates using the "Deploy PARA templates" command' });
        nextSteps.createEl('li', { text: 'Start creating notes in your PARA folders!' });

        this.renderButtons(contentEl, false, false, true);
    }

    renderButtons(contentEl, showBack, showNext, showClose = false) {
        const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });

        if (showBack) {
            const backButton = buttonContainer.createEl('button', { text: 'Back' });
            backButton.addEventListener('click', () => {
                this.step--;
                this.renderStep();
            });
        }

        if (showNext) {
            const nextButton = buttonContainer.createEl('button', { text: 'Next', cls: 'mod-cta' });
            nextButton.addEventListener('click', () => {
                this.step++;
                this.renderStep();
            });
        }

        if (showClose) {
            const closeButton = buttonContainer.createEl('button', { text: 'Close', cls: 'mod-cta' });
            closeButton.addEventListener('click', () => this.close());
        }

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => this.close());
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}

// ============================================================================
// TAGGING MANAGER
// ============================================================================

class TaggingManager {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;
    }

    /**
     * Determine PARA location and subfolder tag(s) based on file path
     *
     * Logic:
     * - PARA location is stored as a property (e.g., para: "projects")
     * - Subfolder tags are applied separately and persist across moves
     * - Example: "1 - Projects/PBSWI/Some Project.md"
     *   Results in: para property = "projects", tags include "pbswi"
     */
    getTagsFromPath(filePath) {
        let paraLocation = null;
        const subfolderTags = [];

        // Find matching PARA root folder (case-insensitive)
        for (const [location, folderName] of Object.entries(this.settings.paraFolders)) {
            const lowerFilePath = filePath.toLowerCase();
            const lowerFolderName = folderName.toLowerCase();

            if (lowerFilePath.startsWith(lowerFolderName + '/') || lowerFilePath === lowerFolderName) {
                paraLocation = location;

                // Extract subfolder path after the PARA root (use original case for extraction)
                const remainingPath = filePath.substring(folderName.length + 1);
                const pathParts = remainingPath.split('/');

                // If there are subfolders (not just the filename), add them as tags
                if (pathParts.length > 1) {
                    // First subfolder becomes a tag (lowercase, no spaces)
                    const subfolder = pathParts[0];
                    if (subfolder) {
                        // Convert to lowercase kebab-case
                        const subfolderTag = subfolder
                            .toLowerCase()
                            .replace(/\s+/g, '-')
                            .replace(/[^a-z0-9\-]/g, '');

                        if (subfolderTag) {
                            subfolderTags.push(subfolderTag);
                        }
                    }
                }

                break;
            }
        }

        return { paraLocation, subfolderTags };
    }

    async updateParaTags(file) {
        if (!file) return;

        const filePath = file.path;

        // Skip files in TEMPLATES folder - templates shouldn't get PARA properties
        if (filePath.includes('/TEMPLATES/') || filePath.startsWith('TEMPLATES/')) {
            console.log('Quick PARA: Skipping template file:', filePath);
            return;
        }

        // Determine PARA location and subfolder tags
        const { paraLocation, subfolderTags } = this.getTagsFromPath(filePath);

        // If file is not in a PARA folder, skip
        if (!paraLocation) return;

        let createdDate = null;
        try {
            // Use cached stat first; fall back to adapter.stat which is async
            const stat = file.stat ?? await this.app.vault.adapter.stat(file.path);
            if (stat?.ctime) {
                createdDate = new Date(stat.ctime).toISOString().split('T')[0];
            }
        } catch (statError) {
            console.error('Quick PARA: Failed to read file stat data', statError);
        }

        const archiveDate = paraLocation === 'archive'
            ? new Date().toISOString().split('T')[0]
            : null;

        try {
            // Update the frontmatter
            await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                const rawTags = Array.isArray(frontmatter.tags)
                    ? frontmatter.tags.map(tag => tag.toString())
                    : frontmatter.tags
                        ? [frontmatter.tags.toString()]
                        : [];

                // Remove old PARA tags (in case they exist from old plugin version)
                // Keep all other tags (including subfolder tags from previous locations)
                let filteredTags = rawTags.filter(tag => !tag.startsWith('para/'));

                // Remove template-specific tags that shouldn't propagate
                filteredTags = filteredTags.filter(tag => {
                    const tagStr = String(tag).toLowerCase();
                    return tagStr !== 'templates' &&
                           tagStr !== 'template' &&
                           tagStr !== 'resources' &&
                           tagStr !== 'all';  // We'll re-add 'all' later
                });

                // Optionally migrate old tags
                if (this.settings.tagging.migrateOldTags) {
                    // Migration already happens above by removing para/* tags
                    console.log('Quick PARA: Migrated old para/* tags');
                }

                // Build new tag list
                const nextTags = Array.from(new Set(filteredTags));

                // Add subfolder tags (these persist even after moving, if enabled)
                if (this.settings.tagging.persistSubfolderTags) {
                    for (const subfolderTag of subfolderTags) {
                        if (!nextTags.includes(subfolderTag)) {
                            nextTags.push(subfolderTag);
                        }
                    }
                }

                // Always include 'all' tag first
                frontmatter.tags = ['all', ...nextTags];

                // Set PARA location as a property (configurable name)
                const propertyName = this.settings.tagging.propertyName || 'para';
                frontmatter[propertyName] = paraLocation;

                // Add archived date if moving to archive
                if (archiveDate && !frontmatter.archived) {
                    frontmatter.archived = archiveDate;
                }

                // Add created date if missing
                if (!frontmatter.created && createdDate) {
                    frontmatter.created = createdDate;
                }
            });

            console.log(`Quick PARA: Updated tags for ${file.name} - PARA: ${paraLocation}, Subfolders: ${subfolderTags.join(', ')}`);
        } catch (error) {
            console.error('Error updating PARA tags:', error);
        }
    }

    async bulkUpdateTags(preview = true) {
        const files = this.app.vault.getMarkdownFiles();

        if (preview) {
            // TODO: Implement preview mode
            new Notice(`Preview mode not yet implemented. Will update ${files.length} files.`);
        }

        new Notice(`Updating PARA tags for ${files.length} files...`);

        let updated = 0;
        for (const file of files) {
            await this.updateParaTags(file);
            updated++;
        }

        new Notice(`Updated PARA tags for ${updated} files!`);
    }

    async migrateOldTags() {
        // Enable migration setting
        this.settings.tagging.migrateOldTags = true;

        // Run bulk update
        await this.bulkUpdateTags(false);

        // Disable migration setting
        this.settings.tagging.migrateOldTags = false;

        new Notice('Migration complete! Old para/* tags have been converted to properties.');
    }

    async cleanTemplateFiles() {
        // Find all files in TEMPLATES folders
        const files = this.app.vault.getMarkdownFiles().filter(f =>
            f.path.includes('/TEMPLATES/') || f.path.startsWith('TEMPLATES/')
        );

        if (files.length === 0) {
            new Notice('No template files found to clean.');
            return;
        }

        new Notice(`Cleaning ${files.length} template files...`);
        let cleaned = 0;

        for (const file of files) {
            try {
                await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
                    let modified = false;

                    // Remove para property
                    if (frontmatter.para) {
                        delete frontmatter.para;
                        modified = true;
                    }

                    // Remove para/* tags
                    if (frontmatter.tags) {
                        const rawTags = Array.isArray(frontmatter.tags)
                            ? frontmatter.tags
                            : [frontmatter.tags];

                        const cleanedTags = rawTags.filter(tag => !String(tag).startsWith('para/'));

                        if (cleanedTags.length !== rawTags.length) {
                            frontmatter.tags = cleanedTags;
                            modified = true;
                        }
                    }

                    // Remove archived date (templates shouldn't have this)
                    if (frontmatter.archived) {
                        delete frontmatter.archived;
                        modified = true;
                    }

                    if (modified) {
                        cleaned++;
                        console.log(`Quick PARA: Cleaned template file: ${file.path}`);
                    }
                });
            } catch (error) {
                console.error(`Error cleaning template ${file.path}:`, error);
            }
        }

        new Notice(`Cleaned ${cleaned} template files!`);
    }
}

// ============================================================================
// TEMPLATE MANAGER
// ============================================================================

class TemplateManager {
    constructor(app, settings) {
        this.app = app;
        this.settings = settings;

        // Embedded templates - these will be deployed to the vault
        this.templates = {
            'default-template.md': `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

# <% tp.file.title %>

## Notes in this note
\`\`\`tasks
path includes {{query.file.path}}
not done
sort by due
sort by priority

\`\`\`

---

## Notes

`,
            'inbox-template.md': `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

# <% tp.file.title %>

## Quick Capture

## Tasks in this note
\`\`\`tasks
path includes {{query.file.path}}
not done
sort by due
sort by priority

\`\`\`

---

## Processing Notes
*Move to appropriate PARA folder when processed*

`,
            'projects-template.md': `---
tags:
  - all
created: <% tp.file.creation_date() %>
status: active
---

# <% tp.file.title %>

## Project Goal

## Tasks
\`\`\`tasks
path includes {{query.file.path}}
not done
sort by due
sort by priority

\`\`\`

---

## Notes

`,
            'areas-template.md': `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

# <% tp.file.title %>

## Area Overview

## Active Tasks
\`\`\`tasks
path includes {{query.file.path}}
not done
sort by due
sort by priority

\`\`\`

---

## Check-ins

`,
            'resources-template.md': `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

# <% tp.file.title %>

## Resource Information

---

## Notes

`,
            'archive-template.md': `---
tags:
  - all
created: <% tp.file.creation_date() %>
archived: <% tp.file.creation_date() %>
---

# <% tp.file.title %>

## Archive Reason

---

## Original Content

`
        };
    }

    /**
     * List all available templates
     */
    listAvailableTemplates() {
        return Object.keys(this.templates);
    }

    /**
     * Get template content
     */
    getTemplate(templateName) {
        return this.templates[templateName];
    }

    /**
     * Deploy a single template to the vault
     */
    async deployTemplate(templateName, destination) {
        const content = this.getTemplate(templateName);

        if (!content) {
            throw new Error(`Template not found: ${templateName}`);
        }

        // Ensure destination folder exists
        const folderPath = destination.substring(0, destination.lastIndexOf('/'));
        if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
            await this.app.vault.createFolder(folderPath);
        }

        // Check if file already exists
        const existingFile = this.app.vault.getAbstractFileByPath(destination);

        if (existingFile) {
            if (this.settings.templates.backupBeforeOverwrite) {
                await this.backupExistingTemplate(destination);
            }
            await this.app.vault.modify(existingFile, content);
        } else {
            await this.app.vault.create(destination, content);
        }

        return true;
    }

    /**
     * Deploy all templates to default locations
     */
    async deployAllTemplates() {
        try {
            new Notice('Deploying PARA templates...');

            const defaultDestinations = {
                'default-template.md': '3 - RESOURCES/TEMPLATES/default-template.md',
                'inbox-template.md': '3 - RESOURCES/TEMPLATES/inbox-template.md',
                'projects-template.md': '3 - RESOURCES/TEMPLATES/projects-template.md',
                'areas-template.md': '3 - RESOURCES/TEMPLATES/areas-template.md',
                'resources-template.md': '3 - RESOURCES/TEMPLATES/resources-template.md',
                'archive-template.md': '3 - RESOURCES/TEMPLATES/archive-template.md'
            };

            let deployed = 0;
            for (const [templateName, destination] of Object.entries(defaultDestinations)) {
                try {
                    await this.deployTemplate(templateName, destination);
                    deployed++;
                } catch (error) {
                    console.error(`Failed to deploy ${templateName}:`, error);
                }
            }

            new Notice(`Deployed ${deployed} templates successfully!`);
        } catch (error) {
            console.error('Error deploying templates:', error);
            new Notice(`Error deploying templates: ${error.message}`, 5000);
        }
    }

    /**
     * Backup existing template before overwriting
     */
    async backupExistingTemplate(templatePath) {
        const file = this.app.vault.getAbstractFileByPath(templatePath);
        if (!file) return;

        const content = await this.app.vault.read(file);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = templatePath.replace('.md', `-backup-${timestamp}.md`);

        await this.app.vault.create(backupPath, content);
        console.log(`Quick PARA: Backed up template to ${backupPath}`);
    }

    /**
     * Detect if templates have been modified by user
     */
    async detectTemplateChanges(templateName, templatePath) {
        const file = this.app.vault.getAbstractFileByPath(templatePath);
        if (!file) return { exists: false, modified: false };

        const currentContent = await this.app.vault.read(file);
        const originalContent = this.getTemplate(templateName);

        return {
            exists: true,
            modified: currentContent !== originalContent
        };
    }
}

// ============================================================================
// AGENDA MANAGER
// ============================================================================

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

// ============================================================================
// SETTINGS TAB
// ============================================================================

class QuickParaSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Quick PARA Settings' });

        // PARA Folders Section
        containerEl.createEl('h3', { text: 'PARA Folder Mappings' });
        containerEl.createEl('p', {
            text: 'Configure which folders represent each PARA location.',
            cls: 'setting-item-description'
        });

        new Setting(containerEl)
            .setName('Inbox Folder')
            .setDesc('Top-level folder for inbox items')
            .addText(text => text
                .setPlaceholder('0 - INBOX')
                .setValue(this.plugin.settings.paraFolders.inbox)
                .onChange(async (value) => {
                    this.plugin.settings.paraFolders.inbox = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Projects Folder')
            .setDesc('Top-level folder for active projects')
            .addText(text => text
                .setPlaceholder('1 - Projects')
                .setValue(this.plugin.settings.paraFolders.projects)
                .onChange(async (value) => {
                    this.plugin.settings.paraFolders.projects = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Areas Folder')
            .setDesc('Top-level folder for ongoing areas')
            .addText(text => text
                .setPlaceholder('2 - AREAS')
                .setValue(this.plugin.settings.paraFolders.areas)
                .onChange(async (value) => {
                    this.plugin.settings.paraFolders.areas = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Resources Folder')
            .setDesc('Top-level folder for reference materials')
            .addText(text => text
                .setPlaceholder('3 - RESOURCES')
                .setValue(this.plugin.settings.paraFolders.resources)
                .onChange(async (value) => {
                    this.plugin.settings.paraFolders.resources = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Archive Folder')
            .setDesc('Top-level folder for archived items')
            .addText(text => text
                .setPlaceholder('4 - ARCHIVE')
                .setValue(this.plugin.settings.paraFolders.archive)
                .onChange(async (value) => {
                    this.plugin.settings.paraFolders.archive = value.trim();
                    await this.plugin.saveSettings();
                }));

        // Agenda Generation Section
        containerEl.createEl('h3', { text: 'Weekly Agenda Generation' });

        new Setting(containerEl)
            .setName('Enable Agenda Generation')
            .setDesc('Automatically update weekly 1-on-1 agenda from Project Dashboard')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.agendaGeneration.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.agendaGeneration.enabled = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Kanban Board File')
            .setDesc('Path to Project Dashboard kanban board')
            .addText(text => text
                .setPlaceholder('0 - INBOX/Project Dashboard.md')
                .setValue(this.plugin.settings.agendaGeneration.kanbanFile)
                .onChange(async (value) => {
                    this.plugin.settings.agendaGeneration.kanbanFile = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Weekly 1-on-1 File')
            .setDesc('Path to weekly 1-on-1 note')
            .addText(text => text
                .setPlaceholder('0 - INBOX/Weekly 1 on 1.md')
                .setValue(this.plugin.settings.agendaGeneration.agendaFile)
                .onChange(async (value) => {
                    this.plugin.settings.agendaGeneration.agendaFile = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('PBSWI Projects Folder')
            .setDesc('Folder containing PBSWI work projects')
            .addText(text => text
                .setPlaceholder('1 - Projects/PBSWI')
                .setValue(this.plugin.settings.agendaGeneration.pbswiFolder)
                .onChange(async (value) => {
                    this.plugin.settings.agendaGeneration.pbswiFolder = value.trim();
                    await this.plugin.saveSettings();
                }));

        // Tagging Behavior Section
        containerEl.createEl('h3', { text: 'Tagging Behavior' });

        new Setting(containerEl)
            .setName('Property Name')
            .setDesc('Name of the property used to store PARA location')
            .addText(text => text
                .setPlaceholder('para')
                .setValue(this.plugin.settings.tagging.propertyName)
                .onChange(async (value) => {
                    this.plugin.settings.tagging.propertyName = value.trim();
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Persist Subfolder Tags')
            .setDesc('Keep subfolder tags when files are moved (historical breadcrumbs)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.tagging.persistSubfolderTags)
                .onChange(async (value) => {
                    this.plugin.settings.tagging.persistSubfolderTags = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Migrate Old Tags')
            .setDesc('Convert old para/* nested tags to property format')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.tagging.migrateOldTags)
                .onChange(async (value) => {
                    this.plugin.settings.tagging.migrateOldTags = value;
                    await this.plugin.saveSettings();
                }));

        // Template Management Section
        containerEl.createEl('h3', { text: 'Template Management' });

        new Setting(containerEl)
            .setName('Auto-Deploy Templates')
            .setDesc('Automatically deploy templates during setup wizard')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.templates.autoDeployOnSetup)
                .onChange(async (value) => {
                    this.plugin.settings.templates.autoDeployOnSetup = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Backup Before Overwrite')
            .setDesc('Create backup when updating existing templates')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.templates.backupBeforeOverwrite)
                .onChange(async (value) => {
                    this.plugin.settings.templates.backupBeforeOverwrite = value;
                    await this.plugin.saveSettings();
                }));

        // Actions Section
        containerEl.createEl('h3', { text: 'Actions' });

        new Setting(containerEl)
            .setName('Run Setup Wizard')
            .setDesc('Provision PARA folders and deploy templates')
            .addButton(button => button
                .setButtonText('Run Setup')
                .setCta()
                .onClick(async () => {
                    await this.plugin.provisioningManager.runSetupWizard();
                }));

        new Setting(containerEl)
            .setName('Check Dependencies')
            .setDesc('Verify Templater and Tasks plugins are installed')
            .addButton(button => button
                .setButtonText('Check Now')
                .onClick(async () => {
                    await this.plugin.checkDependencies(true);
                }));

        new Setting(containerEl)
            .setName('Reset to Defaults')
            .setDesc('Restore all settings to default values')
            .addButton(button => button
                .setButtonText('Reset')
                .setWarning()
                .onClick(async () => {
                    this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
                    await this.plugin.saveSettings();
                    this.display();
                }));
    }
}

// ============================================================================
// MAIN PLUGIN CLASS
// ============================================================================

module.exports = class QuickParaPlugin extends Plugin {
    async onload() {
        console.log('Loading Quick PARA plugin');

        // Load settings
        await this.loadSettings();

        // Initialize managers
        this.dependencyManager = new DependencyManager(this.app);
        this.provisioningManager = new ProvisioningManager(this.app, this.settings);
        this.taggingManager = new TaggingManager(this.app, this.settings);
        this.agendaManager = new AgendaManager(this.app, this.settings);
        this.templateManager = new TemplateManager(this.app, this.settings);

        // Check dependencies on load
        await this.checkDependencies();

        // Register file event listeners for auto-tagging
        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                if (file.extension !== 'md') return;
                if (oldPath !== file.path) {
                    await this.taggingManager.updateParaTags(file);
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('create', async (file) => {
                if (file.extension !== 'md') return;
                // Longer delay to let Templater finish writing
                setTimeout(async () => {
                    await this.taggingManager.updateParaTags(file);
                }, 500);
            })
        );

        // Also listen for modify events to catch Templater updates
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (file.extension !== 'md') return;

                // Only process recent files (created in last 5 seconds)
                const stat = file.stat ?? await this.app.vault.adapter.stat(file.path);
                const fileAge = Date.now() - stat.ctime;

                if (fileAge < 5000) {  // File created in last 5 seconds
                    await this.taggingManager.updateParaTags(file);
                }
            })
        );

        // Register commands
        this.addCommand({
            id: 'setup-para',
            name: 'Run PARA Setup Wizard',
            callback: async () => {
                await this.provisioningManager.runSetupWizard();
            }
        });

        this.addCommand({
            id: 'update-para-tags',
            name: 'Update PARA tags for current file',
            callback: async () => {
                const file = this.app.workspace.getActiveFile();
                if (file) {
                    await this.taggingManager.updateParaTags(file);
                    new Notice('PARA tags updated!');
                } else {
                    new Notice('No active file');
                }
            }
        });

        this.addCommand({
            id: 'update-all-para-tags',
            name: 'Update PARA tags for all files',
            callback: async () => {
                await this.taggingManager.bulkUpdateTags();
            }
        });

        this.addCommand({
            id: 'update-weekly-agenda',
            name: 'Update weekly 1-on-1 agenda',
            callback: async () => {
                if (!this.settings.agendaGeneration.enabled) {
                    new Notice('Agenda generation is disabled in settings');
                    return;
                }
                await this.agendaManager.updateWeeklyAgenda();
            }
        });

        this.addCommand({
            id: 'deploy-templates',
            name: 'Deploy PARA templates',
            callback: async () => {
                await this.templateManager.deployAllTemplates();
            }
        });

        this.addCommand({
            id: 'clean-template-files',
            name: 'Clean PARA properties from template files',
            callback: async () => {
                await this.taggingManager.cleanTemplateFiles();
            }
        });

        this.addCommand({
            id: 'check-dependencies',
            name: 'Check plugin dependencies',
            callback: async () => {
                await this.checkDependencies(true);
            }
        });

        // Add ribbon icon for quick setup
        this.addRibbonIcon('layout-grid', 'Quick PARA Setup', async () => {
            await this.provisioningManager.runSetupWizard();
        });

        // Add settings tab
        this.addSettingTab(new QuickParaSettingTab(this.app, this));

        // First-run check
        if (this.settings.firstRun) {
            await this.handleFirstRun();
        }

        console.log('Quick PARA plugin loaded successfully');
    }

    async checkDependencies(showNotice = false) {
        const result = await this.dependencyManager.checkDependencies();

        if (!result.allMet) {
            if (showNotice) {
                await this.dependencyManager.showDependencyWarning(result.missing);
            }
            console.warn('Quick PARA: Some dependencies are missing', result.missing);
        } else if (showNotice) {
            new Notice('All dependencies are installed!');
        }

        return result;
    }

    async handleFirstRun() {
        // Wait a bit for Obsidian to fully load
        setTimeout(async () => {
            new Notice('Welcome to Quick PARA! Click the grid icon to run setup.');

            // Mark first run as complete
            this.settings.firstRun = false;
            await this.saveSettings();
        }, 2000);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        console.log('Unloading Quick PARA plugin');
    }
};
