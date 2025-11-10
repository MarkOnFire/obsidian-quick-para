const { Notice, Modal } = require('obsidian');

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
            contentEl.createEl('p', { text: '✅ All dependencies are installed!' });
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

module.exports = { DependencyManager };
