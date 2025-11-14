const { Notice } = require('obsidian');

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

        // Find matching PARA root folder
        for (const [location, folderName] of Object.entries(this.settings.paraFolders)) {
            if (filePath.startsWith(folderName + '/') || filePath === folderName) {
                paraLocation = location;

                // Extract subfolder path after the PARA root
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

                // Optionally migrate old tags
                if (this.settings.tagging.migrateOldTags) {
                    // Migration already happens above by removing para/* tags
                    console.log('Quick PARA: Migrated old para/* tags');
                }

                // Remove 'all' tag (we'll re-add it)
                filteredTags = filteredTags.filter(tag => tag !== 'all');

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
                const oldParaLocation = frontmatter[propertyName];
                frontmatter[propertyName] = paraLocation;

                // Track PARA location history
                // Only log if location actually changed
                if (oldParaLocation && oldParaLocation !== paraLocation) {
                    if (!frontmatter.para_history) {
                        frontmatter.para_history = [];
                    }

                    // Add history entry
                    const historyEntry = {
                        from: oldParaLocation,
                        to: paraLocation,
                        date: new Date().toISOString().split('T')[0],
                        timestamp: Date.now()
                    };

                    frontmatter.para_history.push(historyEntry);

                    console.log(`Quick PARA: Logged history for ${file.name}: ${oldParaLocation} → ${paraLocation}`);
                }

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
}

module.exports = { TaggingManager };
