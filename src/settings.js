const { PluginSettingTab, Setting } = require('obsidian');

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
        configs: []      // User configures specific project folders
    },
    templates: {
        autoDeployOnSetup: true,
        backupBeforeOverwrite: true
    },
    tagging: {
        propertyName: "para",  // Locked - not user-configurable
        persistSubfolderTags: true
    }
};

class QuickParaSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Quick PARA Settings' });

        // Header description
        containerEl.createEl('p', {
            text: 'Quick PARA helps you organize your Obsidian vault using the PARA method (Projects, Areas, Resources, Archive). This plugin automates folder setup, template deployment, and project update generation.',
            cls: 'setting-item-description'
        });

        containerEl.createEl('p', {
            text: 'Learn more about PARA: See the "PARA Method Overview" note in your Resources folder.',
            cls: 'setting-item-description'
        });

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
            .setDesc('Verify that required plugins (Templater, Tasks) and optional plugins (Kanban) are installed. Make sure each plugin is also active after installation.')
            .addButton(button => button
                .setButtonText('Check Dependencies')
                .onClick(async () => {
                    await this.plugin.checkDependencies(true);
                }));

        // Dependency links
        containerEl.createEl('h4', { text: 'Required Dependencies' });

        const templaterLink = containerEl.createEl('div', { cls: 'setting-item-description' });
        templaterLink.innerHTML = '• <strong>Templater</strong>: Required for template variable substitution. <a href="obsidian://show-plugin?id=templater-obsidian">Install from Community Plugins</a>';

        const tasksLink = containerEl.createEl('div', { cls: 'setting-item-description' });
        tasksLink.innerHTML = '• <strong>Tasks</strong>: Required for task management features. <a href="obsidian://show-plugin?id=obsidian-tasks-plugin">Install from Community Plugins</a>';

        containerEl.createEl('h4', { text: 'Optional Dependencies' });

        const kanbanLink = containerEl.createEl('div', { cls: 'setting-item-description' });
        kanbanLink.innerHTML = '• <strong>Kanban</strong>: Recommended for project tracking. Required for project updates. <a href="obsidian://show-plugin?id=obsidian-kanban">Install from Community Plugins</a>';

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
                .setPlaceholder('1 - PROJECTS')
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

        // Project Updates Section
        containerEl.createEl('h3', { text: 'Project Update Generation' });

        containerEl.createEl('p', {
            text: 'Automatically generate recurring status reports for any project folder. Each project can have its own schedule (daily, weekly, or monthly). All update notes are created in your Inbox folder with names like "UPDATE — [PROJECT NAME].md".',
            cls: 'setting-item-description'
        });

        containerEl.createEl('p', {
            text: 'Kanban Board Requirement: The Kanban plugin is required for project updates. If a Kanban board doesn\'t exist at the path below, one will be created automatically in your Inbox when you enable Project Updates. You can change the board path if needed.',
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

        new Setting(containerEl)
            .setName('Kanban Board File')
            .setDesc('Path to your Project Dashboard kanban board. If this file doesn\'t exist, it will be created in your Inbox when you enable Project Updates.')
            .addText(text => text
                .setPlaceholder('0 - INBOX/Project Dashboard.md')
                .setValue(this.plugin.settings.projectUpdates.kanbanFile || '0 - INBOX/Project Dashboard.md')
                .onChange(async (value) => {
                    this.plugin.settings.projectUpdates.kanbanFile = value.trim();
                    await this.plugin.saveSettings();
                }));

        // Project update configurations list
        if (this.plugin.settings.projectUpdates.configs.length === 0) {
            containerEl.createEl('p', {
                text: 'No project updates configured. Click "Add Project Update" to create your first automated status report.',
                cls: 'setting-item-description'
            });
        } else {
            this.plugin.settings.projectUpdates.configs.forEach((config, index) => {
                new Setting(containerEl)
                    .setName(config.name || 'Unnamed Project Update')
                    .setDesc(`${config.schedule} - ${config.projectFolder}${config.enabled ? '' : ' (disabled)'}`)
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

        // Tagging Behavior Section
        containerEl.createEl('h3', { text: 'Automatic Tagging Behavior' });

        containerEl.createEl('p', {
            text: 'Control how the plugin automatically assigns properties and tags when you create or move notes. The "para" property always reflects a note\'s current PARA location, while subfolder tags provide historical context.',
            cls: 'setting-item-description'
        });

        new Setting(containerEl)
            .setName('PARA Property Name')
            .setDesc('The frontmatter property that stores PARA location (always "para", cannot be changed)')
            .addText(text => text
                .setPlaceholder('para')
                .setValue('para')
                .setDisabled(true));

        new Setting(containerEl)
            .setName('Preserve Subfolder Tags')
            .setDesc('When enabled, tags from subfolder names persist even when you move notes between PARA folders. This preserves project context over time.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.tagging.persistSubfolderTags)
                .onChange(async (value) => {
                    this.plugin.settings.tagging.persistSubfolderTags = value;
                    await this.plugin.saveSettings();
                }));

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
            .setName('Backup Before Overwrite')
            .setDesc('Create backup when updating existing templates')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.templates.backupBeforeOverwrite)
                .onChange(async (value) => {
                    this.plugin.settings.templates.backupBeforeOverwrite = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('Deploy PARA Templates')
            .setDesc('Install or update all default templates (default, inbox, projects, areas, resources, archive) plus the Project Dashboard template')
            .addButton(button => button
                .setButtonText('Deploy Templates')
                .onClick(async () => {
                    await this.plugin.templateManager.deployAllTemplates();
                }));

        new Setting(containerEl)
            .setName('Clean Template Properties')
            .setDesc('Remove any PARA properties or tags from files in your TEMPLATES folders')
            .addButton(button => button
                .setButtonText('Clean Templates')
                .onClick(async () => {
                    await this.plugin.cleanTemplateFiles();
                }));

        // Advanced Section
        containerEl.createEl('h3', { text: 'Advanced Settings' });

        new Setting(containerEl)
            .setName('Reset to Defaults')
            .setDesc('Restore all settings to their default values. This will not delete your folders or notes, only reset plugin configuration.')
            .addButton(button => button
                .setButtonText('Reset Settings')
                .setWarning()
                .onClick(async () => {
                    if (confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
                        this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
                        await this.plugin.saveSettings();
                        this.display();
                    }
                }));
    }
}

module.exports = { QuickParaSettingTab, DEFAULT_SETTINGS };
