const { Notice } = require('obsidian');

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

## 🗒 Tasks in this note
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

## 📥 Quick Capture

## 🗒 Tasks in this note
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

## 🎯 Project Goal

## 🗒 Tasks
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

## 📊 Area Overview

## 🗒 Active Tasks
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

## 📚 Resource Information

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
                'default-template.md': 'TEMPLATES/default-template.md',
                'inbox-template.md': 'TEMPLATES/inbox-template.md',
                'projects-template.md': 'TEMPLATES/projects-template.md',
                'areas-template.md': 'TEMPLATES/areas-template.md',
                'resources-template.md': 'TEMPLATES/resources-template.md',
                'archive-template.md': 'TEMPLATES/archive-template.md'
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

module.exports = { TemplateManager };
