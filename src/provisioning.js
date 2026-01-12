const { Notice, Modal } = require('obsidian');

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
                text: info.exists ? '✅ Exists' : '➕ Will create',
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

        contentEl.createEl('h4', { text: 'Optional Enhancement' });
        contentEl.createEl('p', {
            text: 'When you deploy templates, a Resource Index database view is created. Enable the Bases core plugin (Settings > Core plugins > Bases) to use it.',
            cls: 'setting-item-description'
        });

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

module.exports = { ProvisioningManager };
