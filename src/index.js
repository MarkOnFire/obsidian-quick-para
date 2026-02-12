const { Plugin, Notice, Modal, PluginSettingTab, Setting } = require('obsidian');
const { PerformanceProfiler } = require('./performance-profiler');

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
    templates: {
        autoDeployOnSetup: true,
        backupBeforeOverwrite: true
    },
    tagging: {
        propertyName: "para",  // Locked - not user-configurable
        persistSubfolderTags: true
    },
    tasks: {
        autoCancelOnArchive: false,  // Default: disabled for safety
        showCancellationNotices: true  // Show feedback when auto-cancelling
    },
    diagnostics: {
        profilingEnabled: false,
        slowOperationThresholdMs: 200,
        logSummaryOnUnload: true
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
    constructor(app, settings, profiler) {
        this.app = app;
        this.settings = settings;
        this.profiler = profiler;
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
        const timer = this.profiler?.start('tagging:update');
        const context = { path: filePath };

        // Skip files in TEMPLATES folder - templates shouldn't get PARA properties
        if (filePath.includes('/TEMPLATES/') || filePath.startsWith('TEMPLATES/')) {
            if (this.settings.diagnostics.profilingEnabled) { console.log('Quick PARA: Skipping template file:', filePath); }
            this.profiler?.increment('tagging:skip:templates');
            this.profiler?.end(timer, { ...context, reason: 'template' });
            return;
        }

        // Determine PARA location and subfolder tags
        const { paraLocation, subfolderTags } = this.getTagsFromPath(filePath);

        // If file is not in a PARA folder, skip
        if (!paraLocation) {
            this.profiler?.increment('tagging:skip:non-para');
            this.profiler?.end(timer, { ...context, reason: 'outside-para' });
            return;
        }

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
                    if (this.settings.diagnostics.profilingEnabled) { console.log('Quick PARA: Migrated old para/* tags'); }
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

            // Only log in verbose mode or when profiling
            if (this.profiler?.isEnabled() || this.settings.debug?.verboseLogging) {
                console.log(`Quick PARA: Updated tags for ${file.name} - PARA: ${paraLocation}, Subfolders: ${subfolderTags.join(', ')}`);
            }
            this.profiler?.increment('tagging:updated');
        } catch (error) {
            console.error('Error updating PARA tags:', error);
            this.profiler?.increment('tagging:errors');
        } finally {
            this.profiler?.end(timer, { ...context, paraLocation });
        }
    }

    async bulkUpdateTags(preview = true) {
        const files = this.app.vault.getMarkdownFiles();
        const timer = this.profiler?.start('tagging:bulk-update');
        let updated = 0;
        let skipped = 0;
        const errors = [];

        try {
            if (preview) {
                // TODO: Implement preview mode
                new Notice(`Preview mode not yet implemented. Will update ${files.length} files.`);
            }

            new Notice(`Updating PARA tags for ${files.length} files...`);

            // Process files in batches for better performance
            const BATCH_SIZE = 50; // Process 50 files concurrently
            const batches = [];

            for (let i = 0; i < files.length; i += BATCH_SIZE) {
                batches.push(files.slice(i, i + BATCH_SIZE));
            }

            // Process each batch
            for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
                const batch = batches[batchIndex];

                // Show progress for large operations
                if (files.length > 100 && batchIndex % 5 === 0) {
                    const progress = Math.round((batchIndex / batches.length) * 100);
                    new Notice(`Progress: ${progress}% (${batchIndex * BATCH_SIZE}/${files.length} files)`, 2000);
                }

                // Process batch in parallel
                const results = await Promise.allSettled(
                    batch.map(async (file) => {
                        try {
                            await this.updateParaTags(file);
                            return { success: true, file: file.name };
                        } catch (error) {
                            return {
                                success: false,
                                file: file.name,
                                error: error.message
                            };
                        }
                    })
                );

                // Count results
                for (const result of results) {
                    if (result.status === 'fulfilled' && result.value.success) {
                        updated++;
                    } else if (result.status === 'fulfilled' && !result.value.success) {
                        errors.push(result.value);
                    } else if (result.status === 'rejected') {
                        errors.push({ file: 'unknown', error: result.reason });
                    }
                }
            }

            // Show final summary
            let message = `Updated PARA tags for ${updated} files!`;
            if (errors.length > 0) {
                message += ` (${errors.length} errors)`;
                console.error('Quick PARA: Bulk update errors:', errors);
            }
            new Notice(message);

        } finally {
            this.profiler?.end(timer, {
                totalFiles: files.length,
                updated,
                skipped,
                errors: errors.length
            });
        }
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
                        if (this.settings.diagnostics.profilingEnabled) { console.log(`Quick PARA: Cleaned template file: ${file.path}`); }
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
    constructor(app, settings, profiler) {
        this.app = app;
        this.settings = settings;
        this.profiler = profiler;

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
        const timer = this.profiler?.start('templates:deploy');
        const context = { templateName, destination };
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

        let result = { status: 'skipped', reason: 'exists' };
        try {
            if (existingFile) {
                // File exists - skip to preserve user customizations
                result = { status: 'skipped', reason: 'exists' };
            } else {
                // File doesn't exist - create from template
                await this.app.vault.create(destination, content);
                result = { status: 'created' };
            }
            return result;
        } finally {
            this.profiler?.end(timer, { ...context, status: result.status });
        }
    }

    /**
     * Deploy all templates to default locations
     * Uses smart regeneration: only creates missing templates
     */
    async deployAllTemplates() {
        const timer = this.profiler?.start('templates:deploy-all');
        let created = 0;
        let skipped = 0;
        let errors = 0;

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
        } finally {
            this.profiler?.end(timer, { created, skipped, errors });
        }
    }

    /**
     * Force regenerate all templates (called by Reset Settings)
     * This is the ONLY method that overwrites existing templates
     */
    async forceRegenerateAllTemplates() {
        const timer = this.profiler?.start('templates:force-regenerate');
        let regenerated = 0;

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
        } finally {
            this.profiler?.end(timer, { regenerated });
        }
    }
}

// ============================================================================
// AGENDA MANAGER
// ============================================================================

class AgendaManager {
    constructor(app, settings, profiler) {
        this.app = app;
        this.settings = settings;
        this.profiler = profiler;
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
        const timer = this.profiler?.start('agenda:parse-kanban');
        const context = { boardPath };
        let file = this.app.vault.getAbstractFileByPath(boardPath);
        let sections = null;

        try {
            if (!file) {
                // Try to recreate from template
                new Notice('Project Dashboard not found. Creating from template...');
                const templateManager = new TemplateManager(this.app, this.settings, this.profiler);

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

            sections = {
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
        } finally {
            const sectionCount = sections ? Object.keys(sections).length : 0;
            this.profiler?.end(timer, { ...context, sectionCount });
        }
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
        const timer = this.profiler?.start('agenda:update');
        const context = {
            agendaPath,
            kanbanPath: kanbanPath || this.settings.projectUpdates?.kanbanFile,
            projectFolder
        };
        let success = false;

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
            success = true;
        } catch (error) {
            console.error('Error updating project agenda:', error);
            new Notice(`Error updating agenda: ${error.message}`, 5000);
        } finally {
            this.profiler?.end(timer, { ...context, success });
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
            if (this.settings.diagnostics.profilingEnabled) { console.warn(`Could not find Monday section for ${mondayDate}`); }
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
        const timer = this.profiler?.start('agenda:format-projects');
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

        const result = lines.join('\n');
        this.profiler?.end(timer, { projectFolder, projectCount: projectMap.size });
        return result;
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
// TASK MANAGER
// ============================================================================

class TaskManager {
    constructor(app, settings, profiler) {
        this.app = app;
        this.settings = settings;
        this.profiler = profiler;
    }

    /**
     * Cancel all open tasks in a file by replacing checkboxes
     * Converts: - [ ] task -> - [-] task
     * Also handles: * [ ] task and + [ ] task
     */
    async cancelTasksInFile(file) {
        if (!file) return { modified: false, taskCount: 0 };

        const handle = this.profiler?.start('tasks:cancel-file');

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
                // (.*)        - Capture everything after checkbox (including empty)
                const taskMatch = line.match(/^(\s*)([-*+])\s+\[\s\](.*)/);

                if (taskMatch) {
                    taskCount++;
                    modified = true;
                    const [, indent, marker, taskText] = taskMatch;
                    // Return cancelled task format
                    // taskText already includes any leading/trailing spaces
                    return `${indent}${marker} [-]${taskText}`;
                }

                return line;
            });

            if (modified) {
                await this.app.vault.modify(file, newLines.join('\n'));
            }

            this.profiler?.end(handle, { file: file.name, taskCount, modified });

            return { modified, taskCount };
        } catch (error) {
            console.error(`Quick PARA: Error cancelling tasks in ${file.name}:`, error);
            this.profiler?.end(handle);
            return { modified: false, taskCount: 0, error };
        }
    }

    /**
     * Cancel all open tasks in Archive folder
     */
    async cancelArchiveTasks() {
        const handle = this.profiler?.start('tasks:cancel-archive');
        const archiveFolderPath = this.settings.paraFolders?.archive || '4 - ARCHIVE';

        // Get all markdown files in the archive folder
        const allFiles = this.app.vault.getMarkdownFiles();
        const archiveFiles = allFiles.filter(file =>
            file.path.startsWith(archiveFolderPath + '/') || file.path === archiveFolderPath
        );

        if (archiveFiles.length === 0) {
            new Notice(`No files found in ${archiveFolderPath}`);
            this.profiler?.end(handle);
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

        this.profiler?.end(handle, {
            archiveFiles: archiveFiles.length,
            filesModified,
            totalTasksCancelled,
            errors: errors.length
        });

        if (this.settings.diagnostics.profilingEnabled) { console.log(`Quick PARA: Archive task cancellation complete - ${filesModified} files, ${totalTasksCancelled} tasks`); }
    }

    /**
     * Cancel all open tasks in current file
     */
    async cancelCurrentFileTasks() {
        const handle = this.profiler?.start('tasks:cancel-current');
        const file = this.app.workspace.getActiveFile();

        if (!file) {
            new Notice('No active file');
            this.profiler?.end(handle);
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

        this.profiler?.end(handle);
    }

    /**
     * Preview which tasks would be cancelled (dry run)
     */
    async previewArchiveTaskCancellation() {
        const handle = this.profiler?.start('tasks:preview-archive');
        const archiveFolderPath = this.settings.paraFolders?.archive || '4 - ARCHIVE';

        const allFiles = this.app.vault.getMarkdownFiles();
        const archiveFiles = allFiles.filter(file =>
            file.path.startsWith(archiveFolderPath + '/') || file.path === archiveFolderPath
        );

        if (archiveFiles.length === 0) {
            new Notice(`No files found in ${archiveFolderPath}`);
            this.profiler?.end(handle);
            return;
        }

        let totalTasks = 0;
        const filesWithTasks = [];

        for (const file of archiveFiles) {
            const content = await this.app.vault.read(file);
            const taskMatches = content.match(/^(\s*)([-*+])\s+\[\s\](.*)/gm);

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
            if (this.settings.diagnostics.profilingEnabled) {
                console.log('Quick PARA: Archive task preview:', {
                    totalFiles: archiveFiles.length,
                    filesWithTasks: filesWithTasks.length,
                    totalOpenTasks: totalTasks,
                    files: filesWithTasks
                });
            }

            new Notice(
                `Preview: ${totalTasks} open tasks found in ${filesWithTasks.length} files. ` +
                `Check console for details.`
            );
        }

        this.profiler?.end(handle, {
            totalTasks,
            filesWithTasks: filesWithTasks.length
        });
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
            text: 'Quick PARA helps you organize your Obsidian vault using the PARA method (Projects, Areas, Resources, Archive). This plugin automates folder setup, template deployment, and task management for archived notes.',
            cls: 'setting-item-description'
        });

        containerEl.createEl('p', {
            text: 'Learn more about PARA: See the "PARA Method Overview" note in your Resources folder.',
            cls: 'setting-item-description'
        });

        containerEl.createEl('hr');

        // Actions Section - AT THE TOP
        new Setting(containerEl).setName('Quick Actions').setHeading();

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
            .setDesc('Verify that required plugins (Templater, Tasks) are installed. Make sure each plugin is also active after installation.')
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
            .setDesc('Install default templates for notes in each PARA folder (inbox, projects, areas, resources, archive), plus the PARA Method Overview guide. These are starting points you can customize to your liking. Set these templates in Templater plugin settings to use them when creating new notes. Only creates missing templates, will not overwrite your customizations.')
            .addButton(button => button
                .setButtonText('Deploy Templates')
                .onClick(async () => {
                    await this.plugin.templateManager.deployAllTemplates();
                }));

        new Setting(containerEl)
            .setName('❌ Cancel Archive Tasks')
            .setDesc('Cancel all open tasks in your Archive folder. Useful for cleaning up tasks from cancelled or completed projects.')
            .addButton(button => button
                .setButtonText('Cancel Archive Tasks')
                .setWarning()
                .onClick(async () => {
                    if (confirm('This will cancel all open tasks in your Archive folder by converting [ ] to [-]. This cannot be undone except through undo history.\n\nContinue?')) {
                        await this.plugin.taskManager.cancelArchiveTasks();
                    }
                }));

        // Dependency links
        new Setting(containerEl).setName('Required Dependencies').setHeading();

        const templaterLink = containerEl.createEl('div', { cls: 'setting-item-description' });
        templaterLink.appendText('\u2022 ');
        templaterLink.createEl('strong', { text: 'Templater' });
        templaterLink.appendText(': Required for template variable substitution. ');
        templaterLink.createEl('a', { text: 'Install from Community Plugins', href: 'obsidian://show-plugin?id=templater-obsidian' });

        const tasksLink = containerEl.createEl('div', { cls: 'setting-item-description' });
        tasksLink.appendText('\u2022 ');
        tasksLink.createEl('strong', { text: 'Tasks' });
        tasksLink.appendText(': Required for task management features. ');
        tasksLink.createEl('a', { text: 'Install from Community Plugins', href: 'obsidian://show-plugin?id=obsidian-tasks-plugin' });

        containerEl.createEl('hr');

        // PARA Folders Section
        new Setting(containerEl).setName('PARA Folder Configuration').setHeading();
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

        // Tagging Behavior Section
        new Setting(containerEl).setName('Automatic Tagging Behavior').setHeading();

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
        new Setting(containerEl).setName('PARA Templates').setHeading();

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

        // Diagnostics Section
        new Setting(containerEl).setName('Diagnostics & Profiling').setHeading();
        containerEl.createEl('p', {
            text: 'Use these options while working on Issue B (mobile optimization) to capture performance timings and event counts. Disable profiling when not actively benchmarking.',
            cls: 'setting-item-description'
        });

        new Setting(containerEl)
            .setName('Enable profiling logs')
            .setDesc('Records timing data for key operations and warns when a call exceeds the configured threshold.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.diagnostics.profilingEnabled)
                .onChange(async (value) => {
                    this.plugin.settings.diagnostics.profilingEnabled = value;
                    await this.plugin.saveSettings();

                    if (!value && this.plugin.settings.diagnostics.logSummaryOnUnload) {
                        this.plugin.logPerformanceSnapshot('profiling-disabled');
                    }

                    this.plugin.applyProfilerSettings();
                }));

        new Setting(containerEl)
            .setName('Slow operation threshold (ms)')
            .setDesc('Operations taking longer than this will trigger a console warning.')
            .addText(text => text
                .setPlaceholder('200')
                .setValue(String(this.plugin.settings.diagnostics.slowOperationThresholdMs))
                .onChange(async (value) => {
                    const parsed = Number(value);
                    if (!Number.isNaN(parsed) && parsed > 0) {
                        this.plugin.settings.diagnostics.slowOperationThresholdMs = parsed;
                        await this.plugin.saveSettings();
                        this.plugin.applyProfilerSettings();
                    }
                }));

        new Setting(containerEl)
            .setName('Log summary on unload')
            .setDesc('Automatically logs a profiling summary when the plugin unloads or profiling is turned off.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.diagnostics.logSummaryOnUnload)
                .onChange(async (value) => {
                    this.plugin.settings.diagnostics.logSummaryOnUnload = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Log snapshot now')
            .setDesc('Writes the current counters and timings to the developer console.')
            .addButton(button => button
                .setButtonText('Log Snapshot')
                .onClick(() => {
                    if (!this.plugin.settings.diagnostics.profilingEnabled) {
                        new Notice('Enable profiling before logging a snapshot.');
                        return;
                    }
                    this.plugin.logPerformanceSnapshot('settings-panel');
                }));

        new Setting(containerEl)
            .setName('Reset profiling session')
            .setDesc('Clears accumulated counters/timings and restarts the profiling clock.')
            .addButton(button => button
                .setButtonText('Reset Counters')
                .onClick(() => {
                    if (this.plugin.profiler) {
                        this.plugin.profiler.reset();
                        new Notice('Profiling session reset.');
                    }
                }));

        containerEl.createEl('hr');

        // Task Management Section
        new Setting(containerEl).setName('Task Management').setHeading();
        containerEl.createEl('p', {
            text: 'When notes are moved to Archive, they often contain open tasks that are no longer relevant. Use these tools to automatically cancel those tasks.',
            cls: 'setting-item-description'
        });

        new Setting(containerEl)
            .setName('Automatically cancel tasks when archiving')
            .setDesc('When a note is moved to Archive, automatically cancel all open tasks [ ] → [-]. Disabled by default for safety.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.tasks.autoCancelOnArchive)
                .onChange(async (value) => {
                    this.plugin.settings.tasks.autoCancelOnArchive = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Show notices for auto-cancelled tasks')
            .setDesc('Display a notification when tasks are automatically cancelled during archiving')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.tasks.showCancellationNotices)
                .onChange(async (value) => {
                    this.plugin.settings.tasks.showCancellationNotices = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl).setName('Manual Task Operations').setHeading();

        new Setting(containerEl)
            .setName('🔍 Preview Archive Tasks')
            .setDesc('See how many open tasks exist in your Archive folder without making any changes')
            .addButton(button => button
                .setButtonText('Preview')
                .onClick(async () => {
                    await this.plugin.taskManager.previewArchiveTaskCancellation();
                }));

        new Setting(containerEl)
            .setName('❌ Cancel Archive Tasks')
            .setDesc('Cancel all open tasks in Archive folder (converts [ ] to [-]). This is useful for cleaning up duplicative or cancelled tasks.')
            .addButton(button => button
                .setButtonText('Cancel Archive Tasks')
                .setWarning()
                .onClick(async () => {
                    if (confirm('This will cancel all open tasks in your Archive folder by converting [ ] to [-]. This cannot be undone except through undo history.\n\nContinue?')) {
                        await this.plugin.taskManager.cancelArchiveTasks();
                    }
                }));

        new Setting(containerEl)
            .setName('❌ Cancel Current File Tasks')
            .setDesc('Cancel all open tasks in the currently active file')
            .addButton(button => button
                .setButtonText('Cancel Current File')
                .onClick(async () => {
                    await this.plugin.taskManager.cancelCurrentFileTasks();
                }));

        containerEl.createEl('p', {
            text: 'Tip: You can also access these commands from the Command Palette (Ctrl/Cmd+P).',
            cls: 'setting-item-description'
        });

        containerEl.createEl('hr');

        // Advanced Section
        new Setting(containerEl).setName('Advanced Settings').setHeading();

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
        // Load settings
        await this.loadSettings();
        this.initializeProfiler();
        const onloadTimer = this.profiler?.start('plugin:onload');

        // Initialize managers (order matters: taskManager must exist before taggingManager)
        this.dependencyManager = new DependencyManager(this.app);
        this.provisioningManager = new ProvisioningManager(this.app, this.settings);
        this.taskManager = new TaskManager(this.app, this.settings, this.profiler);
        this.taggingManager = new TaggingManager(this.app, this.settings, this.profiler, this.taskManager);
        this.agendaManager = new AgendaManager(this.app, this.settings, this.profiler);
        this.templateManager = new TemplateManager(this.app, this.settings, this.profiler);

        // Check dependencies on load
        await this.checkDependencies();

        // Register file event listeners for auto-tagging
        this.registerEvent(
            this.app.vault.on('rename', async (file, oldPath) => {
                if (file.extension !== 'md') return;
                if (oldPath !== file.path) {
                    this.profiler?.increment('events:rename');
                    const handle = this.profiler?.start('events:rename:update');
                    try {
                        await this.taggingManager.updateParaTags(file);
                    } finally {
                        this.profiler?.end(handle, { path: file.path });
                    }
                }
            })
        );

        this.registerEvent(
            this.app.vault.on('create', async (file) => {
                if (file.extension !== 'md') return;
                this.profiler?.increment('events:create');
                // Longer delay to let Templater finish writing
                setTimeout(async () => {
                    const handle = this.profiler?.start('events:create:update');
                    try {
                        await this.taggingManager.updateParaTags(file);
                    } finally {
                        this.profiler?.end(handle, { path: file.path });
                    }
                }, 500);
            })
        );

        // Also listen for modify events to catch Templater updates
        this.registerEvent(
            this.app.vault.on('modify', async (file) => {
                if (file.extension !== 'md') return;
                this.profiler?.increment('events:modify');

                // Only process recent files (created in last 5 seconds)
                const stat = file.stat ?? await this.app.vault.adapter.stat(file.path);
                const fileAge = Date.now() - stat.ctime;

                if (fileAge < 5000) {  // File created in last 5 seconds
                    const handle = this.profiler?.start('events:modify:update');
                    try {
                        await this.taggingManager.updateParaTags(file);
                    } finally {
                        this.profiler?.end(handle, { path: file.path, fileAge });
                    }
                } else {
                    this.profiler?.increment('events:modify:skipped-age');
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
            id: 'log-performance-snapshot',
            name: 'Log profiling snapshot to console',
            callback: () => {
                if (!this.settings.diagnostics?.profilingEnabled) {
                    new Notice('Enable profiling in settings before logging a snapshot.');
                    return;
                }
                this.logPerformanceSnapshot('command');
            }
        });

        this.addCommand({
            id: 'check-dependencies',
            name: 'Check plugin dependencies',
            callback: async () => {
                await this.checkDependencies(true);
            }
        });

        this.addCommand({
            id: 'cancel-archive-tasks',
            name: 'Cancel all open tasks in Archive folder',
            callback: async () => {
                await this.taskManager.cancelArchiveTasks();
            }
        });

        this.addCommand({
            id: 'cancel-current-file-tasks',
            name: 'Cancel all open tasks in current file',
            callback: async () => {
                await this.taskManager.cancelCurrentFileTasks();
            }
        });

        this.addCommand({
            id: 'preview-archive-task-cancellation',
            name: 'Preview archive task cancellation (dry run)',
            callback: async () => {
                await this.taskManager.previewArchiveTaskCancellation();
            }
        });

        // Add settings tab
        this.addSettingTab(new QuickParaSettingTab(this.app, this));

        // First-run check
        if (this.settings.firstRun) {
            await this.handleFirstRun();
        }

        this.profiler?.end(onloadTimer, { status: 'loaded' });
    }

    initializeProfiler() {
        this.profiler = new PerformanceProfiler({
            enabled: this.settings?.diagnostics?.profilingEnabled,
            slowThreshold: this.settings?.diagnostics?.slowOperationThresholdMs
        });
    }

    applyProfilerSettings() {
        if (!this.profiler) {
            this.initializeProfiler();
            return;
        }

        this.profiler.configure({
            slowThreshold: this.settings?.diagnostics?.slowOperationThresholdMs
        });
        this.profiler.setEnabled(this.settings?.diagnostics?.profilingEnabled);
    }

    logPerformanceSnapshot(reason = 'manual') {
        if (!this.profiler) {
            console.info('Quick PARA: Profiler not initialized');
            return;
        }

        this.profiler.logSummary(reason);
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

        // Migration: Convert old agendaGeneration settings to new projectUpdates if needed
        if (this.settings.agendaGeneration && !this.settings.projectUpdates) {
            if (this.settings.diagnostics?.profilingEnabled) { console.log('Migrating old agendaGeneration settings to projectUpdates'); }
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

        if (!this.settings.diagnostics) {
            this.settings.diagnostics = { ...DEFAULT_SETTINGS.diagnostics };
        } else {
            this.settings.diagnostics = Object.assign({}, DEFAULT_SETTINGS.diagnostics, this.settings.diagnostics);
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    onunload() {
        if (this.settings?.diagnostics?.profilingEnabled && this.settings.diagnostics.logSummaryOnUnload) {
            this.logPerformanceSnapshot('plugin-unload');
        }
    }
};
