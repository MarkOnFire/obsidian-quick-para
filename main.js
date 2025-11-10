const { Plugin, Notice, Modal, PluginSettingTab, Setting } = require('obsidian');

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

const DEFAULT_SETTINGS = {
    firstRun: true,
    paraFolders: {
        inbox: "0 - INBOX",
        projects: "1 - PROJECTS",
        areas: "2 - AREAS",
        resources: "3 - RESOURCES",
        archive: "4 - ARCHIVE"
    },
    projectUpdates: {
        enabled: false,  // Disabled by default
        kanbanFile: "0 - INBOX/Project Dashboard.md",
        configs: []      // User configures specific project folders
    },
    templates: {
        autoDeployOnSetup: true
    },
    tagging: {
        propertyName: "para",  // Locked - not user-configurable
        persistSubfolderTags: true
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
            },
            'obsidian-kanban': {
                name: 'Kanban',
                description: 'Required for Project Dashboard and project updates',
                url: 'https://github.com/mgmeyers/obsidian-kanban'
            }
        };

        this.optionalPlugins = {};
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
// PROJECT UPDATE CONFIGURATION MODAL
// ============================================================================

class ProjectUpdateConfigModal extends Modal {
    constructor(app, plugin, existingConfig = null, onSave) {
        super(app);
        this.plugin = plugin;
        this.existingConfig = existingConfig;
        this.onSave = onSave;

        // Initialize with existing config or defaults
        this.config = existingConfig ? { ...existingConfig } : {
            name: '',
            projectFolder: '',
            schedule: 'weekly',
            dayOfWeek: 'Monday',
            timeOfDay: '09:00',
            enabled: true
        };
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();

        contentEl.createEl('h2', {
            text: this.existingConfig ? 'Edit Project Update' : 'Add Project Update'
        });

        contentEl.createEl('p', {
            text: 'Configure automatic status report generation for a project folder. Reports will be created in your Inbox with the format "UPDATE — [Project Name].md".',
            cls: 'setting-item-description'
        });

        // Project Name
        new Setting(contentEl)
            .setName('Project Name')
            .setDesc('Display name for this project update (e.g., "PBSWI", "Personal Projects")')
            .addText(text => text
                .setPlaceholder('Project Name')
                .setValue(this.config.name)
                .onChange(value => {
                    this.config.name = value.trim();
                }));

        // Project Folder
        const folderSetting = new Setting(contentEl)
            .setName('Project Folder Path')
            .setDesc('Path to the project folder to track (e.g., "1 - PROJECTS/PBSWI")');

        // Create text input with folder suggestions
        const folderInput = folderSetting.controlEl.createEl('input', {
            type: 'text',
            placeholder: '1 - PROJECTS/Subfolder',
            value: this.config.projectFolder
        });
        folderInput.addClass('folder-suggest-input');
        folderInput.style.width = '100%';

        // Get all folders in vault
        const folders = this.app.vault.getAllLoadedFiles()
            .filter(f => f.children !== undefined)
            .map(f => f.path)
            .sort();

        // Add datalist for autocomplete
        const datalistId = 'folder-suggest-' + Math.random().toString(36).substr(2, 9);
        const datalist = contentEl.createEl('datalist', { attr: { id: datalistId } });
        folders.forEach(folder => {
            datalist.createEl('option', { value: folder });
        });
        folderInput.setAttribute('list', datalistId);

        // Update config on change
        folderInput.addEventListener('input', (e) => {
            this.config.projectFolder = e.target.value.trim();
        });

        // Schedule Frequency
        new Setting(contentEl)
            .setName('Update Frequency')
            .setDesc('How often to generate project updates')
            .addDropdown(dropdown => dropdown
                .addOption('daily', 'Daily')
                .addOption('weekly', 'Weekly')
                .addOption('monthly', 'Monthly')
                .setValue(this.config.schedule)
                .onChange(value => {
                    this.config.schedule = value;
                }));

        // Day of Week (only for weekly)
        const dayOfWeekSetting = new Setting(contentEl)
            .setName('Day of Week')
            .setDesc('Which day to generate the weekly update')
            .addDropdown(dropdown => dropdown
                .addOption('Monday', 'Monday')
                .addOption('Tuesday', 'Tuesday')
                .addOption('Wednesday', 'Wednesday')
                .addOption('Thursday', 'Thursday')
                .addOption('Friday', 'Friday')
                .addOption('Saturday', 'Saturday')
                .addOption('Sunday', 'Sunday')
                .setValue(this.config.dayOfWeek || 'Monday')
                .onChange(value => {
                    this.config.dayOfWeek = value;
                }));

        // Show/hide day of week based on schedule
        dayOfWeekSetting.settingEl.style.display = this.config.schedule === 'weekly' ? '' : 'none';

        // Time of Day
        new Setting(contentEl)
            .setName('Time of Day')
            .setDesc('What time to generate the update (24-hour format)')
            .addText(text => text
                .setPlaceholder('09:00')
                .setValue(this.config.timeOfDay || '09:00')
                .onChange(value => {
                    this.config.timeOfDay = value.trim();
                })
                .inputEl.setAttribute('type', 'time'));

        // Enable/Disable
        new Setting(contentEl)
            .setName('Enabled')
            .setDesc('Turn this project update on or off')
            .addToggle(toggle => toggle
                .setValue(this.config.enabled)
                .onChange(value => {
                    this.config.enabled = value;
                }));

        // Buttons
        const buttonContainer = contentEl.createEl('div', { cls: 'modal-button-container' });

        const saveButton = buttonContainer.createEl('button', {
            text: 'Save',
            cls: 'mod-cta'
        });
        saveButton.addEventListener('click', () => {
            if (this.validateConfig()) {
                this.onSave(this.config);
                this.close();
            }
        });

        const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
        cancelButton.addEventListener('click', () => this.close());
    }

    validateConfig() {
        if (!this.config.name) {
            new Notice('Please enter a project name');
            return false;
        }

        if (!this.config.projectFolder) {
            new Notice('Please enter a project folder path');
            return false;
        }

        // Check if folder exists
        const folder = this.app.vault.getAbstractFileByPath(this.config.projectFolder);
        if (!folder) {
            new Notice(`Folder not found: ${this.config.projectFolder}. Please create it first or check the path.`, 5000);
            return false;
        }

        // Validate time format
        if (this.config.timeOfDay && !/^\d{2}:\d{2}$/.test(this.config.timeOfDay)) {
            new Notice('Please enter a valid time in HH:MM format (e.g., 09:00)');
            return false;
        }

        return true;
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

## 🗒 Tasks in this note
\`\`\`tasks
path includes {{query.file.path}}
not done
sort by due
sort by priority


\`\`\`

---
## Resources
*Add links to frequent reference or working documents*




---
## Notes
*To do items will all be collected at the top of the note.*
- [ ] Start notes
- [ ]


`,
            'inbox-template.md': `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

## 🗒 Tasks in this note
\`\`\`tasks
path includes {{query.file.path}}
not done
sort by due
sort by priority


\`\`\`

---
## Resources
*Add links to frequent reference or working documents*




---
## Notes
*To do items will all be collected at the top of the note.*
- [ ] Start notes
- [ ]
`,
            'projects-template.md': `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

## 🗒 Tasks in this note
\`\`\`tasks
path includes {{query.file.path}}
not done
sort by due
sort by priority


\`\`\`

---
## Resources
*Add links to frequent reference or working documents*




---
## Notes
*To do items will all be collected at the top of the note.*
- [ ] Start notes
- [ ]
`,
            'areas-template.md': `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

## 🗒 Tasks in this note
\`\`\`tasks
path includes {{query.file.path}}
not done
sort by due
sort by priority


\`\`\`

---
## Resources
*Add links to frequent reference or working documents*




---
## Notes
*To do items will all be collected at the top of the note.*
- [ ] Start notes
- [ ]
`,
            'resources-template.md': `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

## 🗒 Tasks in this note
\`\`\`tasks
path includes {{query.file.path}}
not done
sort by due
sort by priority


\`\`\`

---
## Resources
*Add links to frequent reference or working documents*




---
## Notes
*To do items will all be collected at the top of the note.*
- [ ] Start notes
- [ ]
`,
            'archive-template.md': `---
tags:
  - all
created: <% tp.file.creation_date() %>
archived: <% tp.file.creation_date() %>
---

## 🗒 Tasks in this note
\`\`\`tasks
path includes {{query.file.path}}
not done
sort by due
sort by priority


\`\`\`

---
## Resources
*Add links to frequent reference or working documents*




---
## Notes
*To do items will all be collected at the top of the note.*
- [ ] Start notes
- [ ]

`,
            'Project Dashboard.md': `---
kanban-plugin: board
tags:
  - all
created: <% tp.file.creation_date() %>
---

## INBOX



## BACKBURNER



## NEXT WEEK



## THIS WEEK



## Blocked



## TOMORROW



## TODAY

- [ ] ### [[Daily and Weekly Tasks]] — do these TODAY!

\`\`\`tasks
path includes Daily and Weekly Tasks
not done
(due today) OR (due before tomorrow)
hide recurrence rule
hide edit button
sort by description
\`\`\`


## Doing



## Done

**Complete**

`,
            'PARA Method Overview.md': `---
tags:
  - all
  - para-methodology
created: <% tp.file.creation_date() %>
para: resources
---

# PARA Method Overview

Welcome to your PARA-organized vault! This note explains the PARA method and how the Quick PARA plugin implements it.

## What is PARA?

PARA is an organizational system created by Tiago Forte that divides all information into four categories based on **actionability** and **time horizon**.

### The Four Categories

#### 📥 **Projects** (\`1 - PROJECTS\`)
**Definition**: Short-term efforts with a specific goal and deadline.

**Characteristics**:
- Has a clear end state or deliverable
- Time-bound (deadline or target date)
- Requires multiple steps to complete
- Active work in progress

**Examples**:
- Plan Q4 marketing campaign
- Write annual report
- Organize team offsite
- Launch new website feature

**Quick PARA Behavior**:
- Notes in Projects get \`para: projects\` property
- Subfolder names become persistent tags (e.g., \`pbswi\`, \`personal\`)
- When moved to Archive, projects get \`archived\` date property

---

#### 🎯 **Areas** (\`2 - AREAS\`)
**Definition**: Ongoing responsibilities that require regular attention but have no end date.

**Characteristics**:
- No defined endpoint - continues indefinitely
- Standards to maintain rather than goals to achieve
- Requires consistent, recurring attention
- Success = maintaining a standard over time

**Examples**:
- Health & fitness
- Professional development
- Team management
- Financial planning
- Relationships

**Quick PARA Behavior**:
- Notes in Areas get \`para: areas\` property
- Areas represent long-term commitments
- Moving between Projects and Areas changes the property but preserves context tags

---

#### 📚 **Resources** (\`3 - RESOURCES\`)
**Definition**: Reference materials and information you want to keep for future use.

**Characteristics**:
- Not currently actionable
- Valuable for reference or inspiration
- Could become relevant to Projects or Areas later
- Organized by topic or theme

**Examples**:
- Research articles
- Templates
- How-to guides
- Meeting notes archive
- Documentation
- Learning materials

**Quick PARA Behavior**:
- Notes in Resources get \`para: resources\` property
- Templates stored in \`TEMPLATES/\` subfolder are excluded from auto-tagging
- This is where you keep reusable assets

---

#### 📦 **Archive** (\`4 - ARCHIVE\`)
**Definition**: Completed projects and inactive items from other categories.

**Characteristics**:
- No longer active or relevant
- Kept for historical reference
- Out of sight but retrievable if needed
- Organized by original category

**Examples**:
- Completed projects
- Old areas you're no longer responsible for
- Outdated resources
- Past meeting notes

**Quick PARA Behavior**:
- Notes moved to Archive get \`para: archive\` property
- Automatically adds \`archived: YYYY-MM-DD\` date property
- Previous context tags persist for searchability

---

## How Quick PARA Implements This

### Automatic Properties

The plugin automatically maintains a \`para\` property in every note's frontmatter that reflects its current PARA location.

**Values**: \`inbox\`, \`projects\`, \`areas\`, \`resources\`, \`archive\`

### Persistent Context Tags

As notes move deeper into subfolders, the plugin creates **persistent tags** from folder names.

**When you move this note to Archive**, it becomes:
- Property: \`para: archive\` (updated)
- Tags preserve project context

This preserves project context even after archiving.

### The Inbox

The \`0 - INBOX\` folder is a special staging area:

**Purpose**: Capture ideas quickly without deciding where they belong

**Workflow**:
1. Create new notes in Inbox
2. Process regularly (daily/weekly)
3. Move to appropriate PARA category once you know what it is

**Project Updates**: Automatic project status reports are created here for processing.

---

## PARA Workflow

### Daily/Weekly Processing

**Review your Inbox**:
1. Identify which category each item belongs to
2. Move notes to Projects, Areas, Resources, or Archive
3. Keep Inbox as close to empty as possible

**Use the Project Dashboard**:
- Kanban board in Inbox for tracking active work
- Visualize what's TODAY, TOMORROW, THIS WEEK
- See BLOCKED items that need attention

---

## Learning More

### Official PARA Resources

**Tiago Forte's Original Article**:
https://fortelabs.com/blog/para/

**Building a Second Brain**:
Book by Tiago Forte covering PARA and personal knowledge management
https://www.buildingasecondbrain.com/

**Forte Labs Blog**:
https://fortelabs.com/blog/

### Within Your Vault

**Templates**: See \`3 - RESOURCES/TEMPLATES/\` for all available templates

**Project Dashboard**: Example kanban board in \`0 - INBOX/Project Dashboard.md\`

**Plugin Documentation**: Check the Quick PARA plugin README for technical details

---

**Last Updated**: 2025-11-05
**Plugin Version**: 0.2.0
**Method Source**: Forte Labs PARA System
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
     * Smart regeneration: Only creates missing files, never overwrites existing templates
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
            // File exists - skip to preserve user customizations
            return { status: 'skipped', reason: 'exists' };
        } else {
            // File doesn't exist - create from template
            await this.app.vault.create(destination, content);
            return { status: 'created' };
        }
    }

    /**
     * Deploy all templates to default locations
     * Uses smart regeneration: only creates missing templates
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
                'archive-template.md': '3 - RESOURCES/TEMPLATES/archive-template.md',
                'Project Dashboard.md': '0 - INBOX/Project Dashboard.md',
                'PARA Method Overview.md': '3 - RESOURCES/PARA Method Overview.md'
            };

            let created = 0;
            let skipped = 0;
            let errors = 0;

            for (const [templateName, destination] of Object.entries(defaultDestinations)) {
                try {
                    const result = await this.deployTemplate(templateName, destination);
                    if (result.status === 'created') {
                        created++;
                    } else if (result.status === 'skipped') {
                        skipped++;
                    }
                } catch (error) {
                    console.error(`Failed to deploy ${templateName}:`, error);
                    errors++;
                }
            }

            // Report results
            const parts = [];
            if (created > 0) parts.push(`${created} created`);
            if (skipped > 0) parts.push(`${skipped} skipped`);
            if (errors > 0) parts.push(`${errors} errors`);

            new Notice(`Templates: ${parts.join(', ')}`);
        } catch (error) {
            console.error('Error deploying templates:', error);
            new Notice(`Error deploying templates: ${error.message}`, 5000);
        }
    }

    /**
     * Force regenerate all templates (called by Reset Settings)
     * This is the ONLY method that overwrites existing templates
     */
    async forceRegenerateAllTemplates() {
        try {
            new Notice('Regenerating all templates from defaults...');

            const defaultDestinations = {
                'default-template.md': '3 - RESOURCES/TEMPLATES/default-template.md',
                'inbox-template.md': '3 - RESOURCES/TEMPLATES/inbox-template.md',
                'projects-template.md': '3 - RESOURCES/TEMPLATES/projects-template.md',
                'areas-template.md': '3 - RESOURCES/TEMPLATES/areas-template.md',
                'resources-template.md': '3 - RESOURCES/TEMPLATES/resources-template.md',
                'archive-template.md': '3 - RESOURCES/TEMPLATES/archive-template.md',
                'Project Dashboard.md': '0 - INBOX/Project Dashboard.md',
                'PARA Method Overview.md': '3 - RESOURCES/PARA Method Overview.md'
            };

            let regenerated = 0;
            for (const [templateName, destination] of Object.entries(defaultDestinations)) {
                try {
                    const content = this.getTemplate(templateName);

                    // Ensure folder exists
                    const folderPath = destination.substring(0, destination.lastIndexOf('/'));
                    if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
                        await this.app.vault.createFolder(folderPath);
                    }

                    const existingFile = this.app.vault.getAbstractFileByPath(destination);

                    if (existingFile) {
                        // Overwrite existing
                        await this.app.vault.modify(existingFile, content);
                    } else {
                        // Create new
                        await this.app.vault.create(destination, content);
                    }
                    regenerated++;
                } catch (error) {
                    console.error(`Failed to regenerate ${templateName}:`, error);
                }
            }

            new Notice(`Regenerated ${regenerated} templates from defaults!`);
        } catch (error) {
            console.error('Error regenerating templates:', error);
            new Notice(`Error regenerating templates: ${error.message}`, 5000);
        }
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
    async parseKanbanBoard(kanbanPath) {
        // Use provided path or fall back to settings
        const boardPath = kanbanPath || this.settings.projectUpdates?.kanbanFile || '0 - INBOX/Project Dashboard.md';
        let file = this.app.vault.getAbstractFileByPath(boardPath);

        if (!file) {
            // Try to recreate from template
            new Notice('Project Dashboard not found. Creating from template...');
            const templateManager = new TemplateManager(this.app, this.settings);

            try {
                await templateManager.deployTemplate('Project Dashboard.md', boardPath);
                file = this.app.vault.getAbstractFileByPath(boardPath);

                if (!file) {
                    throw new Error(`Failed to create kanban board at: ${boardPath}`);
                }

                new Notice('Project Dashboard created successfully!');
            } catch (error) {
                console.error('Error creating Project Dashboard:', error);
                throw new Error(`Kanban board not found and could not be created: ${boardPath}`);
            }
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
     * Update a project update agenda with data from kanban board
     *
     * @param {string} agendaPath - Path to the agenda file (e.g., "0 - INBOX/UPDATE — Project Name.md")
     * @param {string} kanbanPath - Optional path to kanban board (defaults to settings)
     * @param {string} projectFolder - Optional project folder to filter tasks (defaults to all projects)
     */
    async updateProjectAgenda(agendaPath, kanbanPath = null, projectFolder = null) {
        try {
            new Notice('Updating project agenda...');

            // Parse kanban board
            const kanbanData = await this.parseKanbanBoard(kanbanPath);

            // Get next Monday date
            const mondayDate = this.getNextMondayDate();

            // Get agenda file
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

            // Update the Monday section with kanban data (now async)
            updatedContent = await this.updateMondaySection(updatedContent, mondayDate, kanbanData, projectFolder);

            // Write back to file
            await this.app.vault.modify(file, updatedContent);

            new Notice('Project agenda updated successfully!');
        } catch (error) {
            console.error('Error updating project agenda:', error);
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

#### Feedback/updates/notes from meeting
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
     *
     * @param {string} content - Full agenda file content
     * @param {string} mondayDate - Formatted Monday date
     * @param {Object} kanbanData - Parsed kanban board data
     * @param {string} projectFolder - Optional project folder to filter tasks
     */
    async updateMondaySection(content, mondayDate, kanbanData, projectFolder = null) {
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

        // Update Projects section with optional folder filter (now async)
        // Projects section now includes both open and completed tasks grouped by project
        const projectsContent = await this.formatProjectsSection(kanbanData, projectFolder);
        sectionBody = this.updateAutoSection(sectionBody, 'Projects', projectsContent);

        // Update Blocked section
        const blockedContent = this.formatBlockedSection(kanbanData);
        sectionBody = this.updateAutoSection(sectionBody, 'Blocked/feedback needed', blockedContent);

        // Note: Daily Highlights section removed - completed tasks now integrated under their projects

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
     *
     * @param {Object} kanbanData - Parsed kanban board data
     * @param {string} projectFolder - Optional project folder path to filter tasks
     */
    async formatProjectsSection(kanbanData, projectFolder = null) {
        const lines = ['*Auto-updated from Project Dashboard and project folder tasks*', ''];

        // Combine active work sections from kanban
        const activeTasks = [
            ...kanbanData.doing,
            ...kanbanData.today,
            ...kanbanData.tomorrow,
            ...kanbanData.this_week
        ];

        // Get completed tasks from kanban "Done" section
        const completedTasks = this.filterRecentTasks(kanbanData.done, 7);

        // Build map of project notes with their tasks
        const projectMap = new Map(); // project wikilink -> {open: [], completed: []}

        // Process active tasks from kanban
        for (const task of activeTasks) {
            const wikilinks = task.match(/\[\[([^\]]+)\]\]/g);
            if (wikilinks) {
                for (const link of wikilinks) {
                    const projectName = link.slice(2, -2);

                    // Check if project exists in folder
                    if (projectFolder) {
                        const projectFile = this.app.vault.getAbstractFileByPath(`${projectFolder}/${projectName}.md`);
                        if (!projectFile) continue;
                    }

                    if (!projectMap.has(link)) {
                        projectMap.set(link, { open: [], completed: [] });
                    }
                    projectMap.get(link).open.push(task);
                }
            }
        }

        // Process completed tasks from kanban
        for (const task of completedTasks) {
            const wikilinks = task.match(/\[\[([^\]]+)\]\]/g);
            if (wikilinks) {
                for (const link of wikilinks) {
                    const projectName = link.slice(2, -2);

                    // Check if project exists in folder
                    if (projectFolder) {
                        const projectFile = this.app.vault.getAbstractFileByPath(`${projectFolder}/${projectName}.md`);
                        if (!projectFile) continue;
                    }

                    if (!projectMap.has(link)) {
                        projectMap.set(link, { open: [], completed: [] });
                    }
                    projectMap.get(link).completed.push(task);
                }
            }
        }

        // If projectFolder specified, also extract tasks directly from project notes
        if (projectFolder) {
            const files = this.app.vault.getMarkdownFiles()
                .filter(file => file.path.startsWith(projectFolder + '/'));

            for (const file of files) {
                const content = await this.app.vault.read(file);
                const link = `[[${file.basename}]]`;

                if (!projectMap.has(link)) {
                    projectMap.set(link, { open: [], completed: [] });
                }

                // Extract tasks from note
                const taskRegex = /^[\s-]*\[[ xX]\]\s+(.+)$/gm;
                const matches = [...content.matchAll(taskRegex)];

                for (const match of matches) {
                    const fullLine = match[0];
                    const isCompleted = /\[x\]/i.test(fullLine);

                    if (isCompleted) {
                        // Check if completed recently
                        const dateMatch = fullLine.match(/✅\s+(\d{4})-(\d{2})-(\d{2})/);
                        if (dateMatch) {
                            const taskDate = new Date(dateMatch[1], dateMatch[2] - 1, dateMatch[3]);
                            const cutoffDate = new Date();
                            cutoffDate.setDate(cutoffDate.getDate() - 7);

                            if (taskDate >= cutoffDate) {
                                projectMap.get(link).completed.push(fullLine);
                            }
                        }
                    } else {
                        projectMap.get(link).open.push(fullLine);
                    }
                }
            }
        }

        // Format output grouped by project
        if (projectMap.size > 0) {
            const sortedProjects = Array.from(projectMap.keys()).sort();

            for (const projectLink of sortedProjects) {
                const tasks = projectMap.get(projectLink);

                // Only show projects with tasks
                if (tasks.open.length > 0 || tasks.completed.length > 0) {
                    lines.push('');
                    lines.push(`**${projectLink}**`);

                    // Show open tasks
                    for (const task of tasks.open) {
                        lines.push(task);
                    }

                    // Show completed tasks
                    for (const task of tasks.completed) {
                        lines.push(task);
                    }
                }
            }

            // Catch-all section for orphaned completed tasks
            const orphanedCompleted = [];
            for (const task of completedTasks) {
                const wikilinks = task.match(/\[\[([^\]]+)\]\]/g);
                if (!wikilinks || wikilinks.length === 0) {
                    orphanedCompleted.push(task);
                }
            }

            if (orphanedCompleted.length > 0) {
                lines.push('');
                lines.push('*Other completed items (not linked to specific project notes):*');
                for (const task of orphanedCompleted) {
                    lines.push(task);
                }
            }
        } else {
            lines.push('- *(no active projects this week)*');
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
     * Extract tasks from notes in a project folder
     * Returns an object with active and completed tasks
     */
    async extractTasksFromProjectFolder(projectFolder) {
        const activeTasks = [];
        const completedTasks = [];

        try {
            // Get all markdown files in the project folder
            const files = this.app.vault.getMarkdownFiles()
                .filter(file => file.path.startsWith(projectFolder + '/'));

            for (const file of files) {
                const content = await this.app.vault.read(file);

                // Extract task lines (both completed and incomplete)
                const taskRegex = /^[\s-]*\[[ xX]\]\s+(.+)$/gm;
                const matches = [...content.matchAll(taskRegex)];

                for (const match of matches) {
                    const fullLine = match[0];
                    const isCompleted = /\[x\]/i.test(fullLine);

                    if (isCompleted) {
                        completedTasks.push(fullLine);
                    } else {
                        activeTasks.push(fullLine);
                    }
                }
            }
        } catch (error) {
            console.error(`Error extracting tasks from ${projectFolder}:`, error);
        }

        return { activeTasks, completedTasks };
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

        containerEl.createEl('h1', { text: 'Quick PARA Settings' });

        // Header description
        containerEl.createEl('p', {
            text: 'Quick PARA helps you organize your Obsidian vault using the PARA method (Projects, Areas, Resources, Archive). This plugin automates folder setup, template deployment, and project update generation.',
            cls: 'setting-item-description'
        });

        containerEl.createEl('p', {
            text: 'Learn more about PARA: See the "PARA Method Overview" note in your Resources folder.',
            cls: 'setting-item-description'
        });

        containerEl.createEl('hr');

        // Actions Section - AT THE TOP
        containerEl.createEl('h3', { text: 'Quick Actions' });

        new Setting(containerEl)
            .setName('🚀 Run Setup Wizard')
            .setDesc('Launch the step-by-step setup wizard to create your PARA folder structure and deploy templates')
            .addButton(button => button
                .setButtonText('Run Setup Wizard')
                .setCta()
                .onClick(async () => {
                    await this.plugin.provisioningManager.runSetupWizard();
                }));

        new Setting(containerEl)
            .setName('🔍 Check Dependencies')
            .setDesc('Verify that required plugins (Templater, Tasks, Kanban) are installed. Make sure each plugin is also active after installation.')
            .addButton(button => button
                .setButtonText('Check Dependencies')
                .onClick(async () => {
                    await this.plugin.checkDependencies(true);
                }));

        new Setting(containerEl)
            .setName('🏷️ Update All PARA Tags')
            .setDesc('Bulk update PARA tags for all files in your vault to match their current folder locations')
            .addButton(button => button
                .setButtonText('Update All Tags')
                .onClick(async () => {
                    await this.plugin.taggingManager.bulkUpdateTags();
                }));

        new Setting(containerEl)
            .setName('📝 Deploy PARA Templates')
            .setDesc('Install default templates for notes in each PARA folder (inbox, projects, areas, resources, archive), plus the Project Dashboard and PARA Method Overview guide. These are starting points you can customize to your liking. Set these templates in Templater plugin settings to use them when creating new notes. Only creates missing templates, will not overwrite your customizations.')
            .addButton(button => button
                .setButtonText('Deploy Templates')
                .onClick(async () => {
                    await this.plugin.templateManager.deployAllTemplates();
                }));

        // Dependency links
        containerEl.createEl('h4', { text: 'Required Dependencies' });

        const templaterLink = containerEl.createEl('div', { cls: 'setting-item-description' });
        templaterLink.innerHTML = '• <strong>Templater</strong>: Required for template variable substitution. <a href="obsidian://show-plugin?id=templater-obsidian">Install from Community Plugins</a>';

        const tasksLink = containerEl.createEl('div', { cls: 'setting-item-description' });
        tasksLink.innerHTML = '• <strong>Tasks</strong>: Required for task management features. <a href="obsidian://show-plugin?id=obsidian-tasks-plugin">Install from Community Plugins</a>';

        const kanbanLink = containerEl.createEl('div', { cls: 'setting-item-description' });
        kanbanLink.innerHTML = '• <strong>Kanban</strong>: Required for Project Dashboard and project update generation. This plugin visualizes your active work and enables the automated update workflow. <a href="obsidian://show-plugin?id=obsidian-kanban">Install from Community Plugins</a>';

        containerEl.createEl('hr');

        // PARA Folders Section
        containerEl.createEl('h3', { text: 'PARA Folder Configuration' });
        containerEl.createEl('p', {
            text: 'Configure the names of your five core PARA folders. These folders will be created automatically during setup if they don\'t exist. The plugin uses these paths to determine where notes belong and what properties to assign.',
            cls: 'setting-item-description'
        });

        containerEl.createEl('p', {
            text: 'Note: Folder names are case-insensitive. The plugin will match "1 - projects", "1 - Projects", or "1 - PROJECTS" equally.',
            cls: 'setting-item-description'
        });

        // Create folder suggestions datalist (shared by all folder inputs)
        const folders = this.app.vault.getAllLoadedFiles()
            .filter(f => f.children !== undefined)
            .map(f => f.path)
            .sort();
        const datalistId = 'para-folder-suggest';
        const datalist = containerEl.createEl('datalist', { attr: { id: datalistId } });
        folders.forEach(folder => {
            datalist.createEl('option', { value: folder });
        });

        const inboxSetting = new Setting(containerEl)
            .setName('Inbox Folder')
            .setDesc('Top-level folder for inbox items');
        const inboxInput = inboxSetting.controlEl.createEl('input', {
            type: 'text',
            placeholder: '0 - INBOX',
            value: this.plugin.settings.paraFolders.inbox,
            attr: { list: datalistId }
        });
        inboxInput.style.width = '100%';
        inboxInput.addEventListener('input', async (e) => {
            this.plugin.settings.paraFolders.inbox = e.target.value.trim();
            await this.plugin.saveSettings();
        });

        const projectsSetting = new Setting(containerEl)
            .setName('Projects Folder')
            .setDesc('Top-level folder for active projects');
        const projectsInput = projectsSetting.controlEl.createEl('input', {
            type: 'text',
            placeholder: '1 - PROJECTS',
            value: this.plugin.settings.paraFolders.projects,
            attr: { list: datalistId }
        });
        projectsInput.style.width = '100%';
        projectsInput.addEventListener('input', async (e) => {
            this.plugin.settings.paraFolders.projects = e.target.value.trim();
            await this.plugin.saveSettings();
        });

        const areasSetting = new Setting(containerEl)
            .setName('Areas Folder')
            .setDesc('Top-level folder for ongoing areas');
        const areasInput = areasSetting.controlEl.createEl('input', {
            type: 'text',
            placeholder: '2 - AREAS',
            value: this.plugin.settings.paraFolders.areas,
            attr: { list: datalistId }
        });
        areasInput.style.width = '100%';
        areasInput.addEventListener('input', async (e) => {
            this.plugin.settings.paraFolders.areas = e.target.value.trim();
            await this.plugin.saveSettings();
        });

        const resourcesSetting = new Setting(containerEl)
            .setName('Resources Folder')
            .setDesc('Top-level folder for reference materials');
        const resourcesInput = resourcesSetting.controlEl.createEl('input', {
            type: 'text',
            placeholder: '3 - RESOURCES',
            value: this.plugin.settings.paraFolders.resources,
            attr: { list: datalistId }
        });
        resourcesInput.style.width = '100%';
        resourcesInput.addEventListener('input', async (e) => {
            this.plugin.settings.paraFolders.resources = e.target.value.trim();
            await this.plugin.saveSettings();
        });

        const archiveSetting = new Setting(containerEl)
            .setName('Archive Folder')
            .setDesc('Top-level folder for archived items');
        const archiveInput = archiveSetting.controlEl.createEl('input', {
            type: 'text',
            placeholder: '4 - ARCHIVE',
            value: this.plugin.settings.paraFolders.archive,
            attr: { list: datalistId }
        });
        archiveInput.style.width = '100%';
        archiveInput.addEventListener('input', async (e) => {
            this.plugin.settings.paraFolders.archive = e.target.value.trim();
            await this.plugin.saveSettings();
        });

        containerEl.createEl('hr');

        // Project Updates Section
        containerEl.createEl('h3', { text: 'Project Update Generation' });

        containerEl.createEl('p', {
            text: 'Automatically generate recurring status reports for any project folder. Each project can have its own schedule (daily, weekly, or monthly). All update notes are created in your Inbox folder with names like "UPDATE — [PROJECT NAME].md".',
            cls: 'setting-item-description'
        });

        containerEl.createEl('p', {
            text: 'The Kanban plugin (required dependency) provides the Project Dashboard that tracks your active work. If a Kanban board doesn\'t exist at the path below, deploy the Project Dashboard template using the "Deploy PARA Templates" button. You can change the board path if needed.',
            cls: 'setting-item-description'
        });

        new Setting(containerEl)
            .setName('Enable Project Updates')
            .setDesc('Turn on scheduled project update generation. When disabled, no automatic updates will be created.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.projectUpdates.enabled)
                .onChange(async (value) => {
                    this.plugin.settings.projectUpdates.enabled = value;
                    await this.plugin.saveSettings();
                }));

        // Kanban Board File with autocomplete
        const kanbanSetting = new Setting(containerEl)
            .setName('Kanban Board File')
            .setDesc('Path to your Project Dashboard kanban board. If this file doesn\'t exist, it will be created in your Inbox when you enable Project Updates.');

        // Create datalist for markdown files
        const files = this.app.vault.getMarkdownFiles().map(f => f.path).sort();
        const filesDatalistId = 'kanban-file-suggest';
        const filesDatalist = containerEl.createEl('datalist', { attr: { id: filesDatalistId } });
        files.forEach(file => {
            filesDatalist.createEl('option', { value: file });
        });

        const kanbanInput = kanbanSetting.controlEl.createEl('input', {
            type: 'text',
            placeholder: '0 - INBOX/Project Dashboard.md',
            value: this.plugin.settings.projectUpdates.kanbanFile || '0 - INBOX/Project Dashboard.md',
            attr: { list: filesDatalistId }
        });
        kanbanInput.style.width = '100%';
        kanbanInput.addEventListener('input', async (e) => {
            this.plugin.settings.projectUpdates.kanbanFile = e.target.value.trim();
            await this.plugin.saveSettings();
        });

        // Project update configurations list
        if (this.plugin.settings.projectUpdates.configs.length === 0) {
            containerEl.createEl('p', {
                text: 'No project updates configured. Click "Add Project Update" to create your first automated status report.',
                cls: 'setting-item-description'
            });
        } else {
            this.plugin.settings.projectUpdates.configs.forEach((config, index) => {
                // Build description with schedule details
                let scheduleDesc = config.schedule;
                if (config.schedule === 'weekly' && config.dayOfWeek) {
                    scheduleDesc = `${config.dayOfWeek}s`;
                }
                if (config.timeOfDay) {
                    scheduleDesc += ` at ${config.timeOfDay}`;
                }
                const fullDesc = `${scheduleDesc} • ${config.projectFolder}${config.enabled ? '' : ' (disabled)'}`;

                new Setting(containerEl)
                    .setName(config.name || 'Unnamed Project Update')
                    .setDesc(fullDesc)
                    .addButton(button => button
                        .setButtonText('Edit')
                        .onClick(() => {
                            this.plugin.openProjectUpdateConfigModal(config, index);
                        }))
                    .addButton(button => button
                        .setButtonText('Delete')
                        .setWarning()
                        .onClick(async () => {
                            this.plugin.settings.projectUpdates.configs.splice(index, 1);
                            await this.plugin.saveSettings();
                            this.display();
                        }));
            });
        }

        new Setting(containerEl)
            .setName('Add Project Update')
            .setDesc('Configure a new automated project update')
            .addButton(button => button
                .setButtonText('+ Add Project Update')
                .onClick(() => {
                    this.plugin.openProjectUpdateConfigModal();
                }));

        new Setting(containerEl)
            .setName('Generate Updates Now')
            .setDesc('Manually generate project updates for all enabled configurations right now')
            .addButton(button => button
                .setButtonText('Generate Now')
                .setCta()
                .onClick(async () => {
                    await this.plugin.generateAllProjectUpdates();
                }));

        containerEl.createEl('hr');

        // Tagging Behavior Section
        containerEl.createEl('h3', { text: 'Automatic Tagging Behavior' });

        containerEl.createEl('p', {
            text: 'Control how the plugin automatically assigns properties and tags when you create or move notes. The "para" property (locked to this name) always reflects a note\'s current PARA location, while subfolder tags provide historical context.',
            cls: 'setting-item-description'
        });

        new Setting(containerEl)
            .setName('Preserve Subfolder Tags')
            .setDesc('When enabled, tags from subfolder names persist even when you move notes between PARA folders. This preserves project context over time.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.tagging.persistSubfolderTags)
                .onChange(async (value) => {
                    this.plugin.settings.tagging.persistSubfolderTags = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('hr');

        // Template Management Section
        containerEl.createEl('h3', { text: 'PARA Templates' });

        containerEl.createEl('p', {
            text: 'Manage the default templates that get deployed to your vault. Templates are stored in "3 - RESOURCES/TEMPLATES/" and use Templater syntax for dynamic content.',
            cls: 'setting-item-description'
        });

        containerEl.createEl('p', {
            text: 'Note: Template files themselves never receive PARA properties - they remain "clean" so new notes created from them start fresh.',
            cls: 'setting-item-description'
        });

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
            .setName('Clean Template Files')
            .setDesc('Use this if when you create new notes, they are being pre-assigned odd tags or PARA properties that don\'t match the folder you place them in. This resets template files to remove any accidentally saved frontmatter.')
            .addButton(button => button
                .setButtonText('Clean Templates')
                .onClick(async () => {
                    await this.plugin.taggingManager.cleanTemplateFiles();
                }));

        containerEl.createEl('hr');

        // Advanced Section
        containerEl.createEl('h3', { text: 'Advanced Settings' });

        new Setting(containerEl)
            .setName('Reset to Defaults')
            .setDesc('⚠️ WARNING: This will restore all settings to defaults AND regenerate all templates from defaults, overwriting any customizations you made. Your folders and notes will not be affected.')
            .addButton(button => button
                .setButtonText('Reset All Settings')
                .setWarning()
                .onClick(async () => {
                    if (confirm('⚠️ WARNING: This will:\n\n1. Reset ALL plugin settings to defaults\n2. OVERWRITE all templates with defaults (your custom template changes will be lost)\n\nYour folders and notes will NOT be affected.\n\nAre you sure you want to continue?')) {
                        // Reset settings
                        this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
                        await this.plugin.saveSettings();

                        // Force regenerate all templates
                        await this.plugin.templateManager.forceRegenerateAllTemplates();

                        // Refresh settings UI
                        this.display();
                    }
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
            id: 'generate-project-updates',
            name: 'Generate all project updates now',
            callback: async () => {
                if (!this.settings.projectUpdates?.enabled) {
                    new Notice('Project updates are disabled in settings. Enable them first.');
                    return;
                }

                if (!this.settings.projectUpdates?.configs || this.settings.projectUpdates.configs.length === 0) {
                    new Notice('No project updates configured. Add one in settings first.');
                    return;
                }

                // Generate updates for all enabled configs
                await this.generateAllProjectUpdates();
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

        // Add ribbon icon for generating project updates
        this.addRibbonIcon('calendar-check', 'Generate Project Updates', async () => {
            if (!this.settings.projectUpdates?.enabled) {
                new Notice('Project updates are disabled. Enable them in settings first.');
                return;
            }

            if (!this.settings.projectUpdates?.configs || this.settings.projectUpdates.configs.length === 0) {
                new Notice('No project updates configured. Add one in settings first.');
                return;
            }

            await this.generateAllProjectUpdates();
        });

        // Add ribbon icon for bulk tag update
        this.addRibbonIcon('tags', 'Update PARA tags for all files', async () => {
            await this.taggingManager.bulkUpdateTags();
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

    /**
     * Open the project update configuration modal
     * @param {Object} existingConfig - Existing config to edit (null for new)
     * @param {number} configIndex - Index of config in array (for editing)
     */
    openProjectUpdateConfigModal(existingConfig = null, configIndex = null) {
        const modal = new ProjectUpdateConfigModal(
            this.app,
            this,
            existingConfig,
            async (config) => {
                if (configIndex !== null) {
                    // Edit existing config
                    this.settings.projectUpdates.configs[configIndex] = config;
                } else {
                    // Add new config
                    this.settings.projectUpdates.configs.push(config);
                }

                await this.saveSettings();

                // Refresh settings tab
                const settingsTab = this.app.setting.pluginTabs.find(tab => tab instanceof QuickParaSettingTab);
                if (settingsTab) {
                    settingsTab.display();
                }

                new Notice(`Project update "${config.name}" saved!`);
            }
        );
        modal.open();
    }

    /**
     * Generate all project updates for enabled configurations
     */
    async generateAllProjectUpdates() {
        const enabledConfigs = this.settings.projectUpdates.configs.filter(c => c.enabled);

        if (enabledConfigs.length === 0) {
            new Notice('No enabled project updates found.');
            return;
        }

        new Notice(`Generating ${enabledConfigs.length} project update(s)...`);

        let successCount = 0;
        for (const config of enabledConfigs) {
            try {
                await this.generateProjectUpdate(config);
                successCount++;
            } catch (error) {
                console.error(`Failed to generate update for ${config.name}:`, error);
                new Notice(`Error generating update for ${config.name}: ${error.message}`, 5000);
            }
        }

        new Notice(`Generated ${successCount} of ${enabledConfigs.length} project update(s) successfully!`);
    }

    /**
     * Generate a single project update
     * @param {Object} config - Project update configuration
     */
    async generateProjectUpdate(config) {
        const inboxFolder = this.settings.paraFolders.inbox || '0 - INBOX';
        const updateFileName = `UPDATE — ${config.name}.md`;
        const updatePath = `${inboxFolder}/${updateFileName}`;

        // Check if update file already exists
        let updateFile = this.app.vault.getAbstractFileByPath(updatePath);

        if (!updateFile) {
            // Create new update file
            const initialContent = `---
tags:
  - all
  - project-updates
para: inbox
created: ${new Date().toISOString().split('T')[0]}
project_folder: ${config.projectFolder}
---

# ${updateFileName.replace('.md', '')}

## Notes

`;
            updateFile = await this.app.vault.create(updatePath, initialContent);
            console.log(`Quick PARA: Created new project update file: ${updatePath}`);
        }

        // Update the agenda with kanban data
        const kanbanPath = this.settings.projectUpdates.kanbanFile;
        await this.agendaManager.updateProjectAgenda(updatePath, kanbanPath, config.projectFolder);

        console.log(`Quick PARA: Updated project agenda for ${config.name}`);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // Migration: Convert old agendaGeneration settings to new projectUpdates if needed
        if (this.settings.agendaGeneration && !this.settings.projectUpdates) {
            console.log('Migrating old agendaGeneration settings to projectUpdates');
            this.settings.projectUpdates = {
                enabled: this.settings.agendaGeneration.enabled || false,
                kanbanFile: this.settings.agendaGeneration.kanbanFile || '0 - INBOX/Project Dashboard.md',
                configs: []
            };
            // Old settings are preserved for backward compatibility but not actively used
        }

        // Ensure new settings structure exists
        if (!this.settings.projectUpdates) {
            this.settings.projectUpdates = DEFAULT_SETTINGS.projectUpdates;
        }

        // Ensure kanbanFile exists in projectUpdates
        if (!this.settings.projectUpdates.kanbanFile) {
            this.settings.projectUpdates.kanbanFile = '0 - INBOX/Project Dashboard.md';
        }

        // Remove migrateOldTags if it exists (no longer relevant for new users)
        if (this.settings.tagging && this.settings.tagging.migrateOldTags !== undefined) {
            delete this.settings.tagging.migrateOldTags;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        console.log('Unloading Quick PARA plugin');
    }
};
