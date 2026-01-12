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

            // Also deploy Resource Index .base file
            const baseResult = await this.deployResourceIndexBase();
            const baseMessage = baseResult.deployed
                ? ' Resource Index created.'
                : '';

            new Notice(`Deployed ${deployed} templates successfully!${baseMessage}`);
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

    /**
     * Generate Resource Index .base file content
     * Uses the configured resources folder path for filters
     */
    getResourceIndexBaseContent(resourcesFolder) {
        return `# Resource Index - Auto-generated by Quick PARA
# Install the Bases core plugin to use this database view

filters:
  and:
    - file.inFolder("${resourcesFolder}")
    - not:
      - file.inFolder("${resourcesFolder}/TEMPLATES")
    - 'file.ext = "md"'

properties:
  description:
    displayName: Description
  tags:
    displayName: Tags

views:
  - type: table
    name: "All Resources"
    order:
      - file.name
      - note.description
      - note.tags
      - file.cday
  - type: table
    name: "Needs Description"
    filters:
      or:
        - 'note.description = ""'
        - 'note.description = null'
    order:
      - file.name
      - note.tags
      - file.cday
  - type: table
    name: "By Folder"
    group_by: "file.folder"
    order:
      - file.name
      - note.description
`;
    }

    /**
     * Deploy Resource Index .base file to Resources folder
     * Skips if file already exists (preserves user customizations)
     */
    async deployResourceIndexBase() {
        const resourcesFolder = this.settings.paraFolders.resources;
        const basePath = `${resourcesFolder}/Resource Index.base`;

        // Check if file already exists - skip to preserve customizations
        const existingFile = this.app.vault.getAbstractFileByPath(basePath);
        if (existingFile) {
            console.log(`Quick PARA: Resource Index.base already exists, skipping`);
            return { deployed: false, path: basePath, reason: 'exists' };
        }

        // Ensure resources folder exists
        if (!this.app.vault.getAbstractFileByPath(resourcesFolder)) {
            await this.app.vault.createFolder(resourcesFolder);
        }

        try {
            const content = this.getResourceIndexBaseContent(resourcesFolder);
            await this.app.vault.create(basePath, content);
            console.log(`Quick PARA: Created Resource Index.base at ${basePath}`);
            return { deployed: true, path: basePath };
        } catch (error) {
            console.error(`Quick PARA: Failed to create Resource Index.base:`, error);
            return { deployed: false, path: basePath, reason: 'error', error: error.message };
        }
    }
}

module.exports = { TemplateManager };
