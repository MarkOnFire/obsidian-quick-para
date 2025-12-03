var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// src/performance-profiler.js
var require_performance_profiler = __commonJS({
  "src/performance-profiler.js"(exports2, module2) {
    var PerformanceProfiler2 = class {
      constructor(options = {}) {
        var _a, _b;
        this.enabled = (_a = options.enabled) != null ? _a : false;
        this.slowThreshold = (_b = options.slowThreshold) != null ? _b : 200;
        this.reset();
      }
      reset() {
        this.timers = /* @__PURE__ */ new Map();
        this.stats = /* @__PURE__ */ new Map();
        this.counters = /* @__PURE__ */ new Map();
        this.sessionStart = Date.now();
        this.timerCounter = 0;
      }
      now() {
        if (typeof performance !== "undefined" && typeof performance.now === "function") {
          return performance.now();
        }
        return Date.now();
      }
      setEnabled(enabled) {
        if (this.enabled === enabled) {
          return;
        }
        this.enabled = enabled;
        if (enabled) {
          this.reset();
          console.info("[Quick PARA][Perf] Profiling enabled");
        } else {
          console.info("[Quick PARA][Perf] Profiling disabled");
        }
      }
      configure(options = {}) {
        if (typeof options.slowThreshold === "number" && !Number.isNaN(options.slowThreshold)) {
          this.slowThreshold = options.slowThreshold;
        }
      }
      start(label) {
        if (!this.enabled || !label) {
          return null;
        }
        const handle = `${label}:${this.timerCounter++}`;
        this.timers.set(handle, {
          label,
          start: this.now()
        });
        return handle;
      }
      end(handle, context = {}) {
        if (!this.enabled || !handle) {
          return null;
        }
        const timer = this.timers.get(handle);
        if (!timer) {
          return null;
        }
        const duration = this.now() - timer.start;
        this.timers.delete(handle);
        this.recordDuration(timer.label, duration, context);
        return duration;
      }
      async time(label, fn, contextBuilder) {
        if (typeof fn !== "function") {
          return null;
        }
        if (!this.enabled) {
          return fn();
        }
        const handle = this.start(label);
        try {
          return await fn();
        } finally {
          const context = typeof contextBuilder === "function" ? contextBuilder() : contextBuilder || {};
          this.end(handle, context);
        }
      }
      recordDuration(label, duration, context = {}) {
        if (!this.enabled || typeof duration !== "number") {
          return;
        }
        const stats = this.stats.get(label) || {
          count: 0,
          totalMs: 0,
          maxMs: 0,
          minMs: null,
          lastContext: null
        };
        stats.count += 1;
        stats.totalMs += duration;
        stats.maxMs = Math.max(stats.maxMs, duration);
        stats.minMs = stats.minMs === null ? duration : Math.min(stats.minMs, duration);
        stats.lastContext = context;
        this.stats.set(label, stats);
        const durationLabel = duration.toFixed(2);
        if (duration >= this.slowThreshold) {
          console.warn(`[Quick PARA][Perf] ${label} took ${durationLabel}ms`, context);
        } else {
          console.debug(`[Quick PARA][Perf] ${label}: ${durationLabel}ms`, context);
        }
      }
      increment(label) {
        if (!this.enabled || !label) {
          return;
        }
        const count = (this.counters.get(label) || 0) + 1;
        this.counters.set(label, count);
        return count;
      }
      summarize() {
        const stats = {};
        for (const [label, entry] of this.stats.entries()) {
          stats[label] = {
            count: entry.count,
            totalMs: Number(entry.totalMs.toFixed(2)),
            avgMs: entry.count ? Number((entry.totalMs / entry.count).toFixed(2)) : 0,
            maxMs: Number(entry.maxMs.toFixed(2)),
            minMs: entry.minMs === null ? null : Number(entry.minMs.toFixed(2))
          };
        }
        const counters = {};
        for (const [label, count] of this.counters.entries()) {
          counters[label] = count;
        }
        return {
          enabled: this.enabled,
          slowThreshold: this.slowThreshold,
          sessionStart: this.sessionStart,
          sessionDurationMs: Date.now() - this.sessionStart,
          stats,
          counters
        };
      }
      logSummary(reason = "manual") {
        if (!this.enabled) {
          console.info("[Quick PARA][Perf] Profiling disabled; no summary to log.");
          return null;
        }
        const summary = this.summarize();
        console.group(`[Quick PARA][Perf] Summary (${reason})`);
        console.info("Session duration (ms):", summary.sessionDurationMs);
        console.info("Slow threshold (ms):", summary.slowThreshold);
        console.info("Event counters:", summary.counters);
        console.info("Timing stats:", summary.stats);
        console.groupEnd();
        return summary;
      }
    };
    module2.exports = { PerformanceProfiler: PerformanceProfiler2 };
  }
});

// src/index.js
var { Plugin, Notice, Modal, PluginSettingTab, Setting } = require("obsidian");
var { PerformanceProfiler } = require_performance_profiler();
var DEFAULT_SETTINGS = {
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
    propertyName: "para",
    // Locked - not user-configurable
    persistSubfolderTags: true
  },
  tasks: {
    autoCancelOnArchive: false,
    // Default: disabled for safety
    showCancellationNotices: true
    // Show feedback when auto-cancelling
  },
  diagnostics: {
    profilingEnabled: false,
    slowOperationThresholdMs: 200,
    logSummaryOnUnload: true
  }
};
var DependencyManager = class {
  constructor(app) {
    this.app = app;
    this.requiredPlugins = {
      "templater-obsidian": {
        name: "Templater",
        description: "Required for template variable substitution",
        url: "https://github.com/SilentVoid13/Templater"
      },
      "obsidian-tasks-plugin": {
        name: "Tasks",
        description: "Required for task management",
        url: "https://github.com/obsidian-tasks-group/obsidian-tasks"
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
      allMet: missing.filter((p) => p.required).length === 0,
      installed,
      missing
    };
  }
  isPluginInstalled(pluginId) {
    return this.app.plugins.manifests[pluginId] !== void 0;
  }
  isPluginEnabled(pluginId) {
    return this.app.plugins.enabledPlugins.has(pluginId);
  }
  async showDependencyWarning(missing) {
    const modal = new DependencyWarningModal(this.app, missing);
    modal.open();
  }
};
var DependencyWarningModal = class extends Modal {
  constructor(app, missing) {
    super(app);
    this.missing = missing;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: "Plugin Dependencies" });
    const required = this.missing.filter((p) => p.required);
    const optional = this.missing.filter((p) => !p.required);
    if (required.length > 0) {
      contentEl.createEl("h3", { text: "Required Plugins (Missing)" });
      contentEl.createEl("p", {
        text: "These plugins are required for Quick PARA to function properly.",
        cls: "mod-warning"
      });
      const reqList = contentEl.createEl("ul");
      for (const plugin of required) {
        const li = reqList.createEl("li");
        li.createEl("strong", { text: plugin.name });
        li.appendText(`: ${plugin.description}`);
        li.createEl("br");
        li.createEl("a", { text: "Install", href: plugin.url });
      }
    }
    if (optional.length > 0) {
      contentEl.createEl("h3", { text: "Optional Plugins (Missing)" });
      contentEl.createEl("p", {
        text: "These plugins enhance Quick PARA but are not required."
      });
      const optList = contentEl.createEl("ul");
      for (const plugin of optional) {
        const li = optList.createEl("li");
        li.createEl("strong", { text: plugin.name });
        li.appendText(`: ${plugin.description}`);
        li.createEl("br");
        li.createEl("a", { text: "Install", href: plugin.url });
      }
    }
    if (this.missing.length === 0) {
      contentEl.createEl("p", { text: "All dependencies are installed!" });
    }
    const buttonContainer = contentEl.createEl("div", { cls: "modal-button-container" });
    const closeButton = buttonContainer.createEl("button", { text: "Close" });
    closeButton.addEventListener("click", () => this.close());
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
var ProvisioningManager = class {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
  }
  async detectExistingStructure() {
    const detected = {};
    const folders = this.app.vault.getAllLoadedFiles().filter((f) => f.children !== void 0);
    for (const [location, folderName] of Object.entries(this.settings.paraFolders)) {
      const exists = folders.some((f) => f.path === folderName);
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
        if (error.message.includes("already exists")) {
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
};
var SetupWizardModal = class extends Modal {
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
    contentEl.createEl("h2", { text: `Quick PARA Setup (Step ${this.step}/${this.totalSteps})` });
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
    contentEl.createEl("p", { text: "Welcome to Quick PARA! This wizard will help you set up your vault with the PARA method." });
    contentEl.createEl("h3", { text: "What is PARA?" });
    const list = contentEl.createEl("ul");
    list.createEl("li", { text: "Projects: Active work with deadlines" });
    list.createEl("li", { text: "Areas: Ongoing responsibilities" });
    list.createEl("li", { text: "Resources: Reference materials" });
    list.createEl("li", { text: "Archive: Completed or inactive items" });
    contentEl.createEl("p", { text: "This wizard will:" });
    const setupList = contentEl.createEl("ol");
    setupList.createEl("li", { text: "Create PARA folder structure" });
    setupList.createEl("li", { text: "Deploy note templates" });
    setupList.createEl("li", { text: "Configure automatic tagging" });
    this.renderButtons(contentEl, false, true);
  }
  async renderFolderStep(contentEl) {
    contentEl.createEl("p", { text: "Checking existing folder structure..." });
    const structure = await this.provisioningManager.detectExistingStructure();
    contentEl.createEl("h3", { text: "PARA Folders" });
    const table = contentEl.createEl("table", { cls: "para-folders-table" });
    const header = table.createEl("tr");
    header.createEl("th", { text: "Location" });
    header.createEl("th", { text: "Folder Path" });
    header.createEl("th", { text: "Status" });
    for (const [location, info] of Object.entries(structure)) {
      const row = table.createEl("tr");
      row.createEl("td", { text: location.charAt(0).toUpperCase() + location.slice(1) });
      row.createEl("td", { text: info.path });
      const statusCell = row.createEl("td");
      statusCell.createEl("span", {
        text: info.exists ? "Exists" : "Will create",
        cls: info.exists ? "para-exists" : "para-create"
      });
    }
    contentEl.createEl("p", {
      text: "Existing folders will not be modified. Only missing folders will be created.",
      cls: "setting-item-description"
    });
    this.renderButtons(contentEl, true, true);
  }
  async renderConfirmStep(contentEl) {
    contentEl.createEl("p", { text: "Creating folders..." });
    const result = await this.provisioningManager.provisionFolders(true);
    contentEl.empty();
    contentEl.createEl("h2", { text: "Setup Complete!" });
    if (result.created.length > 0) {
      contentEl.createEl("h3", { text: "Created Folders" });
      const createdList = contentEl.createEl("ul");
      for (const folder of result.created) {
        createdList.createEl("li", { text: folder });
      }
    }
    if (result.skipped.length > 0) {
      contentEl.createEl("h3", { text: "Existing Folders (Skipped)" });
      const skippedList = contentEl.createEl("ul");
      for (const folder of result.skipped) {
        skippedList.createEl("li", { text: folder });
      }
    }
    contentEl.createEl("h3", { text: "Next Steps" });
    const nextSteps = contentEl.createEl("ol");
    nextSteps.createEl("li", { text: "Install Templater and Tasks plugins (if not already installed)" });
    nextSteps.createEl("li", { text: 'Deploy templates using the "Deploy PARA templates" command' });
    nextSteps.createEl("li", { text: "Start creating notes in your PARA folders!" });
    this.renderButtons(contentEl, false, false, true);
  }
  renderButtons(contentEl, showBack, showNext, showClose = false) {
    const buttonContainer = contentEl.createEl("div", { cls: "modal-button-container" });
    if (showBack) {
      const backButton = buttonContainer.createEl("button", { text: "Back" });
      backButton.addEventListener("click", () => {
        this.step--;
        this.renderStep();
      });
    }
    if (showNext) {
      const nextButton = buttonContainer.createEl("button", { text: "Next", cls: "mod-cta" });
      nextButton.addEventListener("click", () => {
        this.step++;
        this.renderStep();
      });
    }
    if (showClose) {
      const closeButton = buttonContainer.createEl("button", { text: "Close", cls: "mod-cta" });
      closeButton.addEventListener("click", () => this.close());
    }
    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.close());
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
var TaggingManager = class {
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
    for (const [location, folderName] of Object.entries(this.settings.paraFolders)) {
      const lowerFilePath = filePath.toLowerCase();
      const lowerFolderName = folderName.toLowerCase();
      if (lowerFilePath.startsWith(lowerFolderName + "/") || lowerFilePath === lowerFolderName) {
        paraLocation = location;
        const remainingPath = filePath.substring(folderName.length + 1);
        const pathParts = remainingPath.split("/");
        if (pathParts.length > 1) {
          const subfolder = pathParts[0];
          if (subfolder) {
            const subfolderTag = subfolder.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-]/g, "");
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    if (!file)
      return;
    const filePath = file.path;
    const timer = (_a = this.profiler) == null ? void 0 : _a.start("tagging:update");
    const context = { path: filePath };
    if (filePath.includes("/TEMPLATES/") || filePath.startsWith("TEMPLATES/")) {
      console.log("Quick PARA: Skipping template file:", filePath);
      (_b = this.profiler) == null ? void 0 : _b.increment("tagging:skip:templates");
      (_c = this.profiler) == null ? void 0 : _c.end(timer, { ...context, reason: "template" });
      return;
    }
    const { paraLocation, subfolderTags } = this.getTagsFromPath(filePath);
    if (!paraLocation) {
      (_d = this.profiler) == null ? void 0 : _d.increment("tagging:skip:non-para");
      (_e = this.profiler) == null ? void 0 : _e.end(timer, { ...context, reason: "outside-para" });
      return;
    }
    let createdDate = null;
    try {
      const stat = (_f = file.stat) != null ? _f : await this.app.vault.adapter.stat(file.path);
      if (stat == null ? void 0 : stat.ctime) {
        createdDate = new Date(stat.ctime).toISOString().split("T")[0];
      }
    } catch (statError) {
      console.error("Quick PARA: Failed to read file stat data", statError);
    }
    const archiveDate = paraLocation === "archive" ? (/* @__PURE__ */ new Date()).toISOString().split("T")[0] : null;
    try {
      await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
        const rawTags = Array.isArray(frontmatter.tags) ? frontmatter.tags.map((tag) => tag.toString()) : frontmatter.tags ? [frontmatter.tags.toString()] : [];
        let filteredTags = rawTags.filter((tag) => !tag.startsWith("para/"));
        filteredTags = filteredTags.filter((tag) => {
          const tagStr = String(tag).toLowerCase();
          return tagStr !== "templates" && tagStr !== "template" && tagStr !== "resources" && tagStr !== "all";
        });
        if (this.settings.tagging.migrateOldTags) {
          console.log("Quick PARA: Migrated old para/* tags");
        }
        const nextTags = Array.from(new Set(filteredTags));
        if (this.settings.tagging.persistSubfolderTags) {
          for (const subfolderTag of subfolderTags) {
            if (!nextTags.includes(subfolderTag)) {
              nextTags.push(subfolderTag);
            }
          }
        }
        frontmatter.tags = ["all", ...nextTags];
        const propertyName = this.settings.tagging.propertyName || "para";
        frontmatter[propertyName] = paraLocation;
        if (archiveDate && !frontmatter.archived) {
          frontmatter.archived = archiveDate;
        }
        if (!frontmatter.created && createdDate) {
          frontmatter.created = createdDate;
        }
      });
      if (((_g = this.profiler) == null ? void 0 : _g.isEnabled()) || ((_h = this.settings.debug) == null ? void 0 : _h.verboseLogging)) {
        console.log(`Quick PARA: Updated tags for ${file.name} - PARA: ${paraLocation}, Subfolders: ${subfolderTags.join(", ")}`);
      }
      (_i = this.profiler) == null ? void 0 : _i.increment("tagging:updated");
    } catch (error) {
      console.error("Error updating PARA tags:", error);
      (_j = this.profiler) == null ? void 0 : _j.increment("tagging:errors");
    } finally {
      (_k = this.profiler) == null ? void 0 : _k.end(timer, { ...context, paraLocation });
    }
  }
  async bulkUpdateTags(preview = true) {
    var _a, _b;
    const files = this.app.vault.getMarkdownFiles();
    const timer = (_a = this.profiler) == null ? void 0 : _a.start("tagging:bulk-update");
    let updated = 0;
    let skipped = 0;
    const errors = [];
    try {
      if (preview) {
        new Notice(`Preview mode not yet implemented. Will update ${files.length} files.`);
      }
      new Notice(`Updating PARA tags for ${files.length} files...`);
      const BATCH_SIZE = 50;
      const batches = [];
      for (let i = 0; i < files.length; i += BATCH_SIZE) {
        batches.push(files.slice(i, i + BATCH_SIZE));
      }
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        if (files.length > 100 && batchIndex % 5 === 0) {
          const progress = Math.round(batchIndex / batches.length * 100);
          new Notice(`Progress: ${progress}% (${batchIndex * BATCH_SIZE}/${files.length} files)`, 2e3);
        }
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
        for (const result of results) {
          if (result.status === "fulfilled" && result.value.success) {
            updated++;
          } else if (result.status === "fulfilled" && !result.value.success) {
            errors.push(result.value);
          } else if (result.status === "rejected") {
            errors.push({ file: "unknown", error: result.reason });
          }
        }
      }
      let message = `Updated PARA tags for ${updated} files!`;
      if (errors.length > 0) {
        message += ` (${errors.length} errors)`;
        console.error("Quick PARA: Bulk update errors:", errors);
      }
      new Notice(message);
    } finally {
      (_b = this.profiler) == null ? void 0 : _b.end(timer, {
        totalFiles: files.length,
        updated,
        skipped,
        errors: errors.length
      });
    }
  }
  async migrateOldTags() {
    this.settings.tagging.migrateOldTags = true;
    await this.bulkUpdateTags(false);
    this.settings.tagging.migrateOldTags = false;
    new Notice("Migration complete! Old para/* tags have been converted to properties.");
  }
  async cleanTemplateFiles() {
    const files = this.app.vault.getMarkdownFiles().filter(
      (f) => f.path.includes("/TEMPLATES/") || f.path.startsWith("TEMPLATES/")
    );
    if (files.length === 0) {
      new Notice("No template files found to clean.");
      return;
    }
    new Notice(`Cleaning ${files.length} template files...`);
    let cleaned = 0;
    for (const file of files) {
      try {
        await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
          let modified = false;
          if (frontmatter.para) {
            delete frontmatter.para;
            modified = true;
          }
          if (frontmatter.tags) {
            const rawTags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [frontmatter.tags];
            const cleanedTags = rawTags.filter((tag) => !String(tag).startsWith("para/"));
            if (cleanedTags.length !== rawTags.length) {
              frontmatter.tags = cleanedTags;
              modified = true;
            }
          }
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
};
var TemplateManager = class {
  constructor(app, settings, profiler) {
    this.app = app;
    this.settings = settings;
    this.profiler = profiler;
    this.templates = {
      "default-template.md": `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

## \u{1F5D2} Tasks in this note
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
      "inbox-template.md": `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

## \u{1F5D2} Tasks in this note
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
      "projects-template.md": `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

## \u{1F5D2} Tasks in this note
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
      "areas-template.md": `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

## \u{1F5D2} Tasks in this note
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
      "resources-template.md": `---
tags:
  - all
created: <% tp.file.creation_date() %>
---

## \u{1F5D2} Tasks in this note
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
      "archive-template.md": `---
tags:
  - all
created: <% tp.file.creation_date() %>
archived: <% tp.file.creation_date() %>
---

## \u{1F5D2} Tasks in this note
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
      "Project Dashboard.md": `---
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

- [ ] ### [[Daily and Weekly Tasks]] \u2014 do these TODAY!

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
      "PARA Method Overview.md": `---
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

#### \u{1F4E5} **Projects** (\`1 - PROJECTS\`)
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

#### \u{1F3AF} **Areas** (\`2 - AREAS\`)
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

#### \u{1F4DA} **Resources** (\`3 - RESOURCES\`)
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

#### \u{1F4E6} **Archive** (\`4 - ARCHIVE\`)
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
    var _a, _b;
    const timer = (_a = this.profiler) == null ? void 0 : _a.start("templates:deploy");
    const context = { templateName, destination };
    const content = this.getTemplate(templateName);
    if (!content) {
      throw new Error(`Template not found: ${templateName}`);
    }
    const folderPath = destination.substring(0, destination.lastIndexOf("/"));
    if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
      await this.app.vault.createFolder(folderPath);
    }
    const existingFile = this.app.vault.getAbstractFileByPath(destination);
    let result = { status: "skipped", reason: "exists" };
    try {
      if (existingFile) {
        result = { status: "skipped", reason: "exists" };
      } else {
        await this.app.vault.create(destination, content);
        result = { status: "created" };
      }
      return result;
    } finally {
      (_b = this.profiler) == null ? void 0 : _b.end(timer, { ...context, status: result.status });
    }
  }
  /**
   * Deploy all templates to default locations
   * Uses smart regeneration: only creates missing templates
   */
  async deployAllTemplates() {
    var _a, _b;
    const timer = (_a = this.profiler) == null ? void 0 : _a.start("templates:deploy-all");
    let created = 0;
    let skipped = 0;
    let errors = 0;
    try {
      new Notice("Deploying PARA templates...");
      const defaultDestinations = {
        "default-template.md": "3 - RESOURCES/TEMPLATES/default-template.md",
        "inbox-template.md": "3 - RESOURCES/TEMPLATES/inbox-template.md",
        "projects-template.md": "3 - RESOURCES/TEMPLATES/projects-template.md",
        "areas-template.md": "3 - RESOURCES/TEMPLATES/areas-template.md",
        "resources-template.md": "3 - RESOURCES/TEMPLATES/resources-template.md",
        "archive-template.md": "3 - RESOURCES/TEMPLATES/archive-template.md",
        "Project Dashboard.md": "0 - INBOX/Project Dashboard.md",
        "PARA Method Overview.md": "3 - RESOURCES/PARA Method Overview.md"
      };
      for (const [templateName, destination] of Object.entries(defaultDestinations)) {
        try {
          const result = await this.deployTemplate(templateName, destination);
          if (result.status === "created") {
            created++;
          } else if (result.status === "skipped") {
            skipped++;
          }
        } catch (error) {
          console.error(`Failed to deploy ${templateName}:`, error);
          errors++;
        }
      }
      const parts = [];
      if (created > 0)
        parts.push(`${created} created`);
      if (skipped > 0)
        parts.push(`${skipped} skipped`);
      if (errors > 0)
        parts.push(`${errors} errors`);
      new Notice(`Templates: ${parts.join(", ")}`);
    } catch (error) {
      console.error("Error deploying templates:", error);
      new Notice(`Error deploying templates: ${error.message}`, 5e3);
    } finally {
      (_b = this.profiler) == null ? void 0 : _b.end(timer, { created, skipped, errors });
    }
  }
  /**
   * Force regenerate all templates (called by Reset Settings)
   * This is the ONLY method that overwrites existing templates
   */
  async forceRegenerateAllTemplates() {
    var _a, _b;
    const timer = (_a = this.profiler) == null ? void 0 : _a.start("templates:force-regenerate");
    let regenerated = 0;
    try {
      new Notice("Regenerating all templates from defaults...");
      const defaultDestinations = {
        "default-template.md": "3 - RESOURCES/TEMPLATES/default-template.md",
        "inbox-template.md": "3 - RESOURCES/TEMPLATES/inbox-template.md",
        "projects-template.md": "3 - RESOURCES/TEMPLATES/projects-template.md",
        "areas-template.md": "3 - RESOURCES/TEMPLATES/areas-template.md",
        "resources-template.md": "3 - RESOURCES/TEMPLATES/resources-template.md",
        "archive-template.md": "3 - RESOURCES/TEMPLATES/archive-template.md",
        "Project Dashboard.md": "0 - INBOX/Project Dashboard.md",
        "PARA Method Overview.md": "3 - RESOURCES/PARA Method Overview.md"
      };
      for (const [templateName, destination] of Object.entries(defaultDestinations)) {
        try {
          const content = this.getTemplate(templateName);
          const folderPath = destination.substring(0, destination.lastIndexOf("/"));
          if (folderPath && !this.app.vault.getAbstractFileByPath(folderPath)) {
            await this.app.vault.createFolder(folderPath);
          }
          const existingFile = this.app.vault.getAbstractFileByPath(destination);
          if (existingFile) {
            await this.app.vault.modify(existingFile, content);
          } else {
            await this.app.vault.create(destination, content);
          }
          regenerated++;
        } catch (error) {
          console.error(`Failed to regenerate ${templateName}:`, error);
        }
      }
      new Notice(`Regenerated ${regenerated} templates from defaults!`);
    } catch (error) {
      console.error("Error regenerating templates:", error);
      new Notice(`Error regenerating templates: ${error.message}`, 5e3);
    } finally {
      (_b = this.profiler) == null ? void 0 : _b.end(timer, { regenerated });
    }
  }
};
var AgendaManager = class {
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
    const today = /* @__PURE__ */ new Date();
    const dayOfWeek = today.getDay();
    let daysUntilMonday;
    if (dayOfWeek === 1) {
      daysUntilMonday = 0;
    } else if (dayOfWeek === 0) {
      daysUntilMonday = 1;
    } else {
      daysUntilMonday = 8 - dayOfWeek;
    }
    const monday = new Date(today);
    monday.setDate(today.getDate() + daysUntilMonday);
    const month = String(monday.getMonth() + 1).padStart(2, "0");
    const day = String(monday.getDate()).padStart(2, "0");
    const year = String(monday.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  }
  /**
   * Parse the Project Dashboard kanban board
   * Returns sections: done, doing, today, tomorrow, this_week, blocked
   */
  async parseKanbanBoard(kanbanPath) {
    var _a, _b, _c;
    const boardPath = kanbanPath || ((_a = this.settings.projectUpdates) == null ? void 0 : _a.kanbanFile) || "0 - INBOX/Project Dashboard.md";
    const timer = (_b = this.profiler) == null ? void 0 : _b.start("agenda:parse-kanban");
    const context = { boardPath };
    let file = this.app.vault.getAbstractFileByPath(boardPath);
    let sections = null;
    try {
      if (!file) {
        new Notice("Project Dashboard not found. Creating from template...");
        const templateManager = new TemplateManager(this.app, this.settings, this.profiler);
        try {
          await templateManager.deployTemplate("Project Dashboard.md", boardPath);
          file = this.app.vault.getAbstractFileByPath(boardPath);
          if (!file) {
            throw new Error(`Failed to create kanban board at: ${boardPath}`);
          }
          new Notice("Project Dashboard created successfully!");
        } catch (error) {
          console.error("Error creating Project Dashboard:", error);
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
      const sectionRegex = /^##\s+(.+?)$\n(.*?)(?=^##|\Z)/gms;
      const matches = [...content.matchAll(sectionRegex)];
      for (const match of matches) {
        const sectionName = match[1].trim().toLowerCase();
        const sectionContent = match[2];
        let key = null;
        if (sectionName === "done")
          key = "done";
        else if (sectionName === "doing")
          key = "doing";
        else if (sectionName === "today")
          key = "today";
        else if (sectionName === "tomorrow")
          key = "tomorrow";
        else if (sectionName === "this week")
          key = "this_week";
        else if (sectionName === "blocked")
          key = "blocked";
        if (key) {
          sections[key] = this.extractTasks(sectionContent);
        }
      }
      return sections;
    } finally {
      const sectionCount = sections ? Object.keys(sections).length : 0;
      (_c = this.profiler) == null ? void 0 : _c.end(timer, { ...context, sectionCount });
    }
  }
  /**
   * Extract task items from section content
   */
  extractTasks(sectionContent) {
    const tasks = [];
    const lines = sectionContent.split("\n");
    for (const line of lines) {
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
    var _a, _b, _c;
    const timer = (_a = this.profiler) == null ? void 0 : _a.start("agenda:update");
    const context = {
      agendaPath,
      kanbanPath: kanbanPath || ((_b = this.settings.projectUpdates) == null ? void 0 : _b.kanbanFile),
      projectFolder
    };
    let success = false;
    try {
      new Notice("Updating project agenda...");
      const kanbanData = await this.parseKanbanBoard(kanbanPath);
      const mondayDate = this.getNextMondayDate();
      const file = this.app.vault.getAbstractFileByPath(agendaPath);
      if (!file) {
        new Notice(`Agenda file not found: ${agendaPath}`, 5e3);
        return;
      }
      const content = await this.app.vault.read(file);
      const mondayPattern = new RegExp(`### ${this.escapeRegex(mondayDate)}`);
      const hasMondaySection = mondayPattern.test(content);
      let updatedContent = content;
      if (!hasMondaySection) {
        updatedContent = this.createMondaySection(content, mondayDate);
      }
      updatedContent = await this.updateMondaySection(updatedContent, mondayDate, kanbanData, projectFolder);
      await this.app.vault.modify(file, updatedContent);
      new Notice("Project agenda updated successfully!");
      success = true;
    } catch (error) {
      console.error("Error updating project agenda:", error);
      new Notice(`Error updating agenda: ${error.message}`, 5e3);
    } finally {
      (_c = this.profiler) == null ? void 0 : _c.end(timer, { ...context, success });
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
    const notesPattern = /(## Notes.*?\n.*?\n)/s;
    const match = content.match(notesPattern);
    if (match) {
      const insertPos = match.index + match[0].length;
      return content.slice(0, insertPos) + "\n" + newSection + content.slice(insertPos);
    }
    return content + "\n\n" + newSection;
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
    const sectionPattern = new RegExp(
      `(### ${this.escapeRegex(mondayDate)}\\s*\\n)(.*?)(?=\\n### |\\n---|\\Z)`,
      "s"
    );
    const match = content.match(sectionPattern);
    if (!match) {
      console.warn(`Could not find Monday section for ${mondayDate}`);
      return content;
    }
    let sectionBody = match[2];
    const projectsContent = await this.formatProjectsSection(kanbanData, projectFolder);
    sectionBody = this.updateAutoSection(sectionBody, "Projects", projectsContent);
    const blockedContent = this.formatBlockedSection(kanbanData);
    sectionBody = this.updateAutoSection(sectionBody, "Blocked/feedback needed", blockedContent);
    return content.slice(0, match.index) + match[1] + sectionBody + content.slice(match.index + match[0].length);
  }
  /**
   * Update an auto-managed section
   */
  updateAutoSection(body, sectionName, newContent) {
    const pattern = new RegExp(
      `(####\\s+${sectionName}\\s*\\n)(.*?)(<!--\\s*AUTO-MANAGED\\s*-->)(.*?)(<!--\\s*END AUTO-MANAGED\\s*-->)`,
      "s"
    );
    const match = body.match(pattern);
    if (match) {
      const header = match[1];
      const preAuto = match[2];
      const autoStart = match[3];
      const autoEnd = match[5];
      return body.slice(0, match.index) + header + preAuto + autoStart + "\n" + newContent + "\n" + autoEnd + body.slice(match.index + match[0].length);
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
    var _a, _b;
    const timer = (_a = this.profiler) == null ? void 0 : _a.start("agenda:format-projects");
    const lines = ["*Auto-updated from Project Dashboard and project folder tasks*", ""];
    const activeTasks = [
      ...kanbanData.doing,
      ...kanbanData.today,
      ...kanbanData.tomorrow,
      ...kanbanData.this_week
    ];
    const completedTasks = this.filterRecentTasks(kanbanData.done, 7);
    const projectMap = /* @__PURE__ */ new Map();
    for (const task of activeTasks) {
      const wikilinks = task.match(/\[\[([^\]]+)\]\]/g);
      if (wikilinks) {
        for (const link of wikilinks) {
          const projectName = link.slice(2, -2);
          if (projectFolder) {
            const projectFile = this.app.vault.getAbstractFileByPath(`${projectFolder}/${projectName}.md`);
            if (!projectFile)
              continue;
          }
          if (!projectMap.has(link)) {
            projectMap.set(link, { open: [], completed: [] });
          }
          projectMap.get(link).open.push(task);
        }
      }
    }
    for (const task of completedTasks) {
      const wikilinks = task.match(/\[\[([^\]]+)\]\]/g);
      if (wikilinks) {
        for (const link of wikilinks) {
          const projectName = link.slice(2, -2);
          if (projectFolder) {
            const projectFile = this.app.vault.getAbstractFileByPath(`${projectFolder}/${projectName}.md`);
            if (!projectFile)
              continue;
          }
          if (!projectMap.has(link)) {
            projectMap.set(link, { open: [], completed: [] });
          }
          projectMap.get(link).completed.push(task);
        }
      }
    }
    if (projectFolder) {
      const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(projectFolder + "/"));
      for (const file of files) {
        const content = await this.app.vault.read(file);
        const link = `[[${file.basename}]]`;
        if (!projectMap.has(link)) {
          projectMap.set(link, { open: [], completed: [] });
        }
        const taskRegex = /^[\s-]*\[[ xX]\]\s+(.+)$/gm;
        const matches = [...content.matchAll(taskRegex)];
        for (const match of matches) {
          const fullLine = match[0];
          const isCompleted = /\[x\]/i.test(fullLine);
          if (isCompleted) {
            const dateMatch = fullLine.match(/✅\s+(\d{4})-(\d{2})-(\d{2})/);
            if (dateMatch) {
              const taskDate = new Date(dateMatch[1], dateMatch[2] - 1, dateMatch[3]);
              const cutoffDate = /* @__PURE__ */ new Date();
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
    if (projectMap.size > 0) {
      const sortedProjects = Array.from(projectMap.keys()).sort();
      for (const projectLink of sortedProjects) {
        const tasks = projectMap.get(projectLink);
        if (tasks.open.length > 0 || tasks.completed.length > 0) {
          lines.push("");
          lines.push(`**${projectLink}**`);
          for (const task of tasks.open) {
            lines.push(task);
          }
          for (const task of tasks.completed) {
            lines.push(task);
          }
        }
      }
      const orphanedCompleted = [];
      for (const task of completedTasks) {
        const wikilinks = task.match(/\[\[([^\]]+)\]\]/g);
        if (!wikilinks || wikilinks.length === 0) {
          orphanedCompleted.push(task);
        }
      }
      if (orphanedCompleted.length > 0) {
        lines.push("");
        lines.push("*Other completed items (not linked to specific project notes):*");
        for (const task of orphanedCompleted) {
          lines.push(task);
        }
      }
    } else {
      lines.push("- *(no active projects this week)*");
    }
    const result = lines.join("\n");
    (_b = this.profiler) == null ? void 0 : _b.end(timer, { projectFolder, projectCount: projectMap.size });
    return result;
  }
  /**
   * Format the Blocked section content
   */
  formatBlockedSection(kanbanData) {
    const lines = ['*Auto-updated from Project Dashboard "Blocked" section*', ""];
    if (kanbanData.blocked.length > 0) {
      for (const task of kanbanData.blocked) {
        const text = task.replace(/^-\s+\[[ x]\]\s+/i, "");
        lines.push(`- ${text}`);
      }
    } else {
      lines.push("- *(none)*");
    }
    return lines.join("\n");
  }
  /**
   * Format the Highlights section content
   */
  formatHighlightsSection(kanbanData) {
    const lines = ['*Completed tasks from Project Dashboard "Done" section*', ""];
    if (kanbanData.done.length > 0) {
      const recentTasks = this.filterRecentTasks(kanbanData.done, 7);
      if (recentTasks.length > 0) {
        lines.push(...recentTasks.slice(0, 10));
      } else {
        lines.push("- *(no completed tasks this week)*");
      }
    } else {
      lines.push("- *(no completed tasks this week)*");
    }
    return lines.join("\n");
  }
  /**
   * Filter tasks completed in the last N days
   */
  filterRecentTasks(tasks, days) {
    const cutoffDate = /* @__PURE__ */ new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return tasks.filter((task) => {
      const dateMatch = task.match(/✅\s+(\d{4})-(\d{2})-(\d{2})/);
      if (dateMatch) {
        const taskDate = new Date(dateMatch[1], dateMatch[2] - 1, dateMatch[3]);
        return taskDate >= cutoffDate;
      }
      return true;
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
      const files = this.app.vault.getMarkdownFiles().filter((file) => file.path.startsWith(projectFolder + "/"));
      for (const file of files) {
        const content = await this.app.vault.read(file);
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
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
};
var TaskManager = class {
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
    var _a, _b, _c;
    if (!file)
      return { modified: false, taskCount: 0 };
    const handle = (_a = this.profiler) == null ? void 0 : _a.start("tasks:cancel-file");
    try {
      const content = await this.app.vault.read(file);
      const lines = content.split("\n");
      let modified = false;
      let taskCount = 0;
      const newLines = lines.map((line) => {
        const taskMatch = line.match(/^(\s*)([-*+])\s+\[\s\](.*)/);
        if (taskMatch) {
          taskCount++;
          modified = true;
          const [, indent, marker, taskText] = taskMatch;
          return `${indent}${marker} [-]${taskText}`;
        }
        return line;
      });
      if (modified) {
        await this.app.vault.modify(file, newLines.join("\n"));
      }
      (_b = this.profiler) == null ? void 0 : _b.end(handle, { file: file.name, taskCount, modified });
      return { modified, taskCount };
    } catch (error) {
      console.error(`Quick PARA: Error cancelling tasks in ${file.name}:`, error);
      (_c = this.profiler) == null ? void 0 : _c.end(handle);
      return { modified: false, taskCount: 0, error };
    }
  }
  /**
   * Cancel all open tasks in Archive folder
   */
  async cancelArchiveTasks() {
    var _a, _b, _c, _d;
    const handle = (_a = this.profiler) == null ? void 0 : _a.start("tasks:cancel-archive");
    const archiveFolderPath = ((_b = this.settings.paraFolders) == null ? void 0 : _b.archive) || "4 - ARCHIVE";
    const allFiles = this.app.vault.getMarkdownFiles();
    const archiveFiles = allFiles.filter(
      (file) => file.path.startsWith(archiveFolderPath + "/") || file.path === archiveFolderPath
    );
    if (archiveFiles.length === 0) {
      new Notice(`No files found in ${archiveFolderPath}`);
      (_c = this.profiler) == null ? void 0 : _c.end(handle);
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
    if (errors.length > 0) {
      new Notice(
        `Completed with errors: ${filesModified} files updated, ${totalTasksCancelled} tasks cancelled, ${errors.length} errors`
      );
      console.error("Quick PARA: Errors during task cancellation:", errors);
    } else {
      new Notice(
        `Archive tasks cancelled: ${totalTasksCancelled} tasks in ${filesModified} files`
      );
    }
    (_d = this.profiler) == null ? void 0 : _d.end(handle, {
      archiveFiles: archiveFiles.length,
      filesModified,
      totalTasksCancelled,
      errors: errors.length
    });
    console.log(`Quick PARA: Archive task cancellation complete - ${filesModified} files, ${totalTasksCancelled} tasks`);
  }
  /**
   * Cancel all open tasks in current file
   */
  async cancelCurrentFileTasks() {
    var _a, _b, _c;
    const handle = (_a = this.profiler) == null ? void 0 : _a.start("tasks:cancel-current");
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("No active file");
      (_b = this.profiler) == null ? void 0 : _b.end(handle);
      return;
    }
    const result = await this.cancelTasksInFile(file);
    if (result.error) {
      new Notice(`Error cancelling tasks: ${result.error.message}`);
    } else if (result.modified) {
      new Notice(`Cancelled ${result.taskCount} tasks in ${file.name}`);
    } else {
      new Notice("No open tasks found in current file");
    }
    (_c = this.profiler) == null ? void 0 : _c.end(handle);
  }
  /**
   * Preview which tasks would be cancelled (dry run)
   */
  async previewArchiveTaskCancellation() {
    var _a, _b, _c, _d;
    const handle = (_a = this.profiler) == null ? void 0 : _a.start("tasks:preview-archive");
    const archiveFolderPath = ((_b = this.settings.paraFolders) == null ? void 0 : _b.archive) || "4 - ARCHIVE";
    const allFiles = this.app.vault.getMarkdownFiles();
    const archiveFiles = allFiles.filter(
      (file) => file.path.startsWith(archiveFolderPath + "/") || file.path === archiveFolderPath
    );
    if (archiveFiles.length === 0) {
      new Notice(`No files found in ${archiveFolderPath}`);
      (_c = this.profiler) == null ? void 0 : _c.end(handle);
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
      new Notice("No open tasks found in Archive folder");
    } else {
      console.log("Quick PARA: Archive task preview:", {
        totalFiles: archiveFiles.length,
        filesWithTasks: filesWithTasks.length,
        totalOpenTasks: totalTasks,
        files: filesWithTasks
      });
      new Notice(
        `Preview: ${totalTasks} open tasks found in ${filesWithTasks.length} files. Check console for details.`
      );
    }
    (_d = this.profiler) == null ? void 0 : _d.end(handle, {
      totalTasks,
      filesWithTasks: filesWithTasks.length
    });
  }
};
var QuickParaSettingTab = class extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h1", { text: "Quick PARA Settings" });
    containerEl.createEl("p", {
      text: "Quick PARA helps you organize your Obsidian vault using the PARA method (Projects, Areas, Resources, Archive). This plugin automates folder setup, template deployment, and task management for archived notes.",
      cls: "setting-item-description"
    });
    containerEl.createEl("p", {
      text: 'Learn more about PARA: See the "PARA Method Overview" note in your Resources folder.',
      cls: "setting-item-description"
    });
    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "Quick Actions" });
    new Setting(containerEl).setName("\u{1F680} Run Setup Wizard").setDesc("Launch the step-by-step setup wizard to create your PARA folder structure and deploy templates").addButton((button) => button.setButtonText("Run Setup Wizard").setCta().onClick(async () => {
      await this.plugin.provisioningManager.runSetupWizard();
    }));
    new Setting(containerEl).setName("\u{1F50D} Check Dependencies").setDesc("Verify that required plugins (Templater, Tasks) are installed. Make sure each plugin is also active after installation.").addButton((button) => button.setButtonText("Check Dependencies").onClick(async () => {
      await this.plugin.checkDependencies(true);
    }));
    new Setting(containerEl).setName("\u{1F3F7}\uFE0F Update All PARA Tags").setDesc("Bulk update PARA tags for all files in your vault to match their current folder locations").addButton((button) => button.setButtonText("Update All Tags").onClick(async () => {
      await this.plugin.taggingManager.bulkUpdateTags();
    }));
    new Setting(containerEl).setName("\u{1F4DD} Deploy PARA Templates").setDesc("Install default templates for notes in each PARA folder (inbox, projects, areas, resources, archive), plus the PARA Method Overview guide. These are starting points you can customize to your liking. Set these templates in Templater plugin settings to use them when creating new notes. Only creates missing templates, will not overwrite your customizations.").addButton((button) => button.setButtonText("Deploy Templates").onClick(async () => {
      await this.plugin.templateManager.deployAllTemplates();
    }));
    new Setting(containerEl).setName("\u274C Cancel Archive Tasks").setDesc("Cancel all open tasks in your Archive folder. Useful for cleaning up tasks from cancelled or completed projects.").addButton((button) => button.setButtonText("Cancel Archive Tasks").setWarning().onClick(async () => {
      if (confirm("This will cancel all open tasks in your Archive folder by converting [ ] to [-]. This cannot be undone except through undo history.\n\nContinue?")) {
        await this.plugin.taskManager.cancelArchiveTasks();
      }
    }));
    containerEl.createEl("h4", { text: "Required Dependencies" });
    const templaterLink = containerEl.createEl("div", { cls: "setting-item-description" });
    templaterLink.innerHTML = '\u2022 <strong>Templater</strong>: Required for template variable substitution. <a href="obsidian://show-plugin?id=templater-obsidian">Install from Community Plugins</a>';
    const tasksLink = containerEl.createEl("div", { cls: "setting-item-description" });
    tasksLink.innerHTML = '\u2022 <strong>Tasks</strong>: Required for task management features. <a href="obsidian://show-plugin?id=obsidian-tasks-plugin">Install from Community Plugins</a>';
    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "PARA Folder Configuration" });
    containerEl.createEl("p", {
      text: "Configure the names of your five core PARA folders. These folders will be created automatically during setup if they don't exist. The plugin uses these paths to determine where notes belong and what properties to assign.",
      cls: "setting-item-description"
    });
    containerEl.createEl("p", {
      text: 'Note: Folder names are case-insensitive. The plugin will match "1 - projects", "1 - Projects", or "1 - PROJECTS" equally.',
      cls: "setting-item-description"
    });
    const folders = this.app.vault.getAllLoadedFiles().filter((f) => f.children !== void 0).map((f) => f.path).sort();
    const datalistId = "para-folder-suggest";
    const datalist = containerEl.createEl("datalist", { attr: { id: datalistId } });
    folders.forEach((folder) => {
      datalist.createEl("option", { value: folder });
    });
    const inboxSetting = new Setting(containerEl).setName("Inbox Folder").setDesc("Top-level folder for inbox items");
    const inboxInput = inboxSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: "0 - INBOX",
      value: this.plugin.settings.paraFolders.inbox,
      attr: { list: datalistId }
    });
    inboxInput.style.width = "100%";
    inboxInput.addEventListener("input", async (e) => {
      this.plugin.settings.paraFolders.inbox = e.target.value.trim();
      await this.plugin.saveSettings();
    });
    const projectsSetting = new Setting(containerEl).setName("Projects Folder").setDesc("Top-level folder for active projects");
    const projectsInput = projectsSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: "1 - PROJECTS",
      value: this.plugin.settings.paraFolders.projects,
      attr: { list: datalistId }
    });
    projectsInput.style.width = "100%";
    projectsInput.addEventListener("input", async (e) => {
      this.plugin.settings.paraFolders.projects = e.target.value.trim();
      await this.plugin.saveSettings();
    });
    const areasSetting = new Setting(containerEl).setName("Areas Folder").setDesc("Top-level folder for ongoing areas");
    const areasInput = areasSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: "2 - AREAS",
      value: this.plugin.settings.paraFolders.areas,
      attr: { list: datalistId }
    });
    areasInput.style.width = "100%";
    areasInput.addEventListener("input", async (e) => {
      this.plugin.settings.paraFolders.areas = e.target.value.trim();
      await this.plugin.saveSettings();
    });
    const resourcesSetting = new Setting(containerEl).setName("Resources Folder").setDesc("Top-level folder for reference materials");
    const resourcesInput = resourcesSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: "3 - RESOURCES",
      value: this.plugin.settings.paraFolders.resources,
      attr: { list: datalistId }
    });
    resourcesInput.style.width = "100%";
    resourcesInput.addEventListener("input", async (e) => {
      this.plugin.settings.paraFolders.resources = e.target.value.trim();
      await this.plugin.saveSettings();
    });
    const archiveSetting = new Setting(containerEl).setName("Archive Folder").setDesc("Top-level folder for archived items");
    const archiveInput = archiveSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: "4 - ARCHIVE",
      value: this.plugin.settings.paraFolders.archive,
      attr: { list: datalistId }
    });
    archiveInput.style.width = "100%";
    archiveInput.addEventListener("input", async (e) => {
      this.plugin.settings.paraFolders.archive = e.target.value.trim();
      await this.plugin.saveSettings();
    });
    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "Automatic Tagging Behavior" });
    containerEl.createEl("p", {
      text: `Control how the plugin automatically assigns properties and tags when you create or move notes. The "para" property (locked to this name) always reflects a note's current PARA location, while subfolder tags provide historical context.`,
      cls: "setting-item-description"
    });
    new Setting(containerEl).setName("Preserve Subfolder Tags").setDesc("When enabled, tags from subfolder names persist even when you move notes between PARA folders. This preserves project context over time.").addToggle((toggle) => toggle.setValue(this.plugin.settings.tagging.persistSubfolderTags).onChange(async (value) => {
      this.plugin.settings.tagging.persistSubfolderTags = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "PARA Templates" });
    containerEl.createEl("p", {
      text: 'Manage the default templates that get deployed to your vault. Templates are stored in "3 - RESOURCES/TEMPLATES/" and use Templater syntax for dynamic content.',
      cls: "setting-item-description"
    });
    containerEl.createEl("p", {
      text: 'Note: Template files themselves never receive PARA properties - they remain "clean" so new notes created from them start fresh.',
      cls: "setting-item-description"
    });
    new Setting(containerEl).setName("Auto-Deploy Templates").setDesc("Automatically deploy templates during setup wizard").addToggle((toggle) => toggle.setValue(this.plugin.settings.templates.autoDeployOnSetup).onChange(async (value) => {
      this.plugin.settings.templates.autoDeployOnSetup = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName("Clean Template Files").setDesc("Use this if when you create new notes, they are being pre-assigned odd tags or PARA properties that don't match the folder you place them in. This resets template files to remove any accidentally saved frontmatter.").addButton((button) => button.setButtonText("Clean Templates").onClick(async () => {
      await this.plugin.taggingManager.cleanTemplateFiles();
    }));
    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "Diagnostics & Profiling" });
    containerEl.createEl("p", {
      text: "Use these options while working on Issue B (mobile optimization) to capture performance timings and event counts. Disable profiling when not actively benchmarking.",
      cls: "setting-item-description"
    });
    new Setting(containerEl).setName("Enable profiling logs").setDesc("Records timing data for key operations and warns when a call exceeds the configured threshold.").addToggle((toggle) => toggle.setValue(this.plugin.settings.diagnostics.profilingEnabled).onChange(async (value) => {
      this.plugin.settings.diagnostics.profilingEnabled = value;
      await this.plugin.saveSettings();
      if (!value && this.plugin.settings.diagnostics.logSummaryOnUnload) {
        this.plugin.logPerformanceSnapshot("profiling-disabled");
      }
      this.plugin.applyProfilerSettings();
    }));
    new Setting(containerEl).setName("Slow operation threshold (ms)").setDesc("Operations taking longer than this will trigger a console warning.").addText((text) => text.setPlaceholder("200").setValue(String(this.plugin.settings.diagnostics.slowOperationThresholdMs)).onChange(async (value) => {
      const parsed = Number(value);
      if (!Number.isNaN(parsed) && parsed > 0) {
        this.plugin.settings.diagnostics.slowOperationThresholdMs = parsed;
        await this.plugin.saveSettings();
        this.plugin.applyProfilerSettings();
      }
    }));
    new Setting(containerEl).setName("Log summary on unload").setDesc("Automatically logs a profiling summary when the plugin unloads or profiling is turned off.").addToggle((toggle) => toggle.setValue(this.plugin.settings.diagnostics.logSummaryOnUnload).onChange(async (value) => {
      this.plugin.settings.diagnostics.logSummaryOnUnload = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName("Log snapshot now").setDesc("Writes the current counters and timings to the developer console.").addButton((button) => button.setButtonText("Log Snapshot").onClick(() => {
      if (!this.plugin.settings.diagnostics.profilingEnabled) {
        new Notice("Enable profiling before logging a snapshot.");
        return;
      }
      this.plugin.logPerformanceSnapshot("settings-panel");
    }));
    new Setting(containerEl).setName("Reset profiling session").setDesc("Clears accumulated counters/timings and restarts the profiling clock.").addButton((button) => button.setButtonText("Reset Counters").onClick(() => {
      if (this.plugin.profiler) {
        this.plugin.profiler.reset();
        new Notice("Profiling session reset.");
      }
    }));
    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "Task Management" });
    containerEl.createEl("p", {
      text: "When notes are moved to Archive, they often contain open tasks that are no longer relevant. Use these tools to automatically cancel those tasks.",
      cls: "setting-item-description"
    });
    new Setting(containerEl).setName("Automatically cancel tasks when archiving").setDesc("When a note is moved to Archive, automatically cancel all open tasks [ ] \u2192 [-]. Disabled by default for safety.").addToggle((toggle) => toggle.setValue(this.plugin.settings.tasks.autoCancelOnArchive).onChange(async (value) => {
      this.plugin.settings.tasks.autoCancelOnArchive = value;
      await this.plugin.saveSettings();
    }));
    new Setting(containerEl).setName("Show notices for auto-cancelled tasks").setDesc("Display a notification when tasks are automatically cancelled during archiving").addToggle((toggle) => toggle.setValue(this.plugin.settings.tasks.showCancellationNotices).onChange(async (value) => {
      this.plugin.settings.tasks.showCancellationNotices = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h4", { text: "Manual Task Operations" });
    new Setting(containerEl).setName("\u{1F50D} Preview Archive Tasks").setDesc("See how many open tasks exist in your Archive folder without making any changes").addButton((button) => button.setButtonText("Preview").onClick(async () => {
      await this.plugin.taskManager.previewArchiveTaskCancellation();
    }));
    new Setting(containerEl).setName("\u274C Cancel Archive Tasks").setDesc("Cancel all open tasks in Archive folder (converts [ ] to [-]). This is useful for cleaning up duplicative or cancelled tasks.").addButton((button) => button.setButtonText("Cancel Archive Tasks").setWarning().onClick(async () => {
      if (confirm("This will cancel all open tasks in your Archive folder by converting [ ] to [-]. This cannot be undone except through undo history.\n\nContinue?")) {
        await this.plugin.taskManager.cancelArchiveTasks();
      }
    }));
    new Setting(containerEl).setName("\u274C Cancel Current File Tasks").setDesc("Cancel all open tasks in the currently active file").addButton((button) => button.setButtonText("Cancel Current File").onClick(async () => {
      await this.plugin.taskManager.cancelCurrentFileTasks();
    }));
    containerEl.createEl("p", {
      text: "Tip: You can also access these commands from the Command Palette (Ctrl/Cmd+P).",
      cls: "setting-item-description"
    });
    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "Advanced Settings" });
    new Setting(containerEl).setName("Reset to Defaults").setDesc("\u26A0\uFE0F WARNING: This will restore all settings to defaults AND regenerate all templates from defaults, overwriting any customizations you made. Your folders and notes will not be affected.").addButton((button) => button.setButtonText("Reset All Settings").setWarning().onClick(async () => {
      if (confirm("\u26A0\uFE0F WARNING: This will:\n\n1. Reset ALL plugin settings to defaults\n2. OVERWRITE all templates with defaults (your custom template changes will be lost)\n\nYour folders and notes will NOT be affected.\n\nAre you sure you want to continue?")) {
        this.plugin.settings = Object.assign({}, DEFAULT_SETTINGS);
        await this.plugin.saveSettings();
        await this.plugin.templateManager.forceRegenerateAllTemplates();
        this.display();
      }
    }));
  }
};
module.exports = class QuickParaPlugin extends Plugin {
  async onload() {
    var _a, _b;
    console.log("Loading Quick PARA plugin");
    await this.loadSettings();
    this.initializeProfiler();
    const onloadTimer = (_a = this.profiler) == null ? void 0 : _a.start("plugin:onload");
    this.dependencyManager = new DependencyManager(this.app);
    this.provisioningManager = new ProvisioningManager(this.app, this.settings);
    this.taskManager = new TaskManager(this.app, this.settings, this.profiler);
    this.taggingManager = new TaggingManager(this.app, this.settings, this.profiler, this.taskManager);
    this.agendaManager = new AgendaManager(this.app, this.settings, this.profiler);
    this.templateManager = new TemplateManager(this.app, this.settings, this.profiler);
    await this.checkDependencies();
    this.registerEvent(
      this.app.vault.on("rename", async (file, oldPath) => {
        var _a2, _b2, _c;
        if (file.extension !== "md")
          return;
        if (oldPath !== file.path) {
          (_a2 = this.profiler) == null ? void 0 : _a2.increment("events:rename");
          const handle = (_b2 = this.profiler) == null ? void 0 : _b2.start("events:rename:update");
          try {
            await this.taggingManager.updateParaTags(file);
          } finally {
            (_c = this.profiler) == null ? void 0 : _c.end(handle, { path: file.path });
          }
        }
      })
    );
    this.registerEvent(
      this.app.vault.on("create", async (file) => {
        var _a2;
        if (file.extension !== "md")
          return;
        (_a2 = this.profiler) == null ? void 0 : _a2.increment("events:create");
        setTimeout(async () => {
          var _a3, _b2;
          const handle = (_a3 = this.profiler) == null ? void 0 : _a3.start("events:create:update");
          try {
            await this.taggingManager.updateParaTags(file);
          } finally {
            (_b2 = this.profiler) == null ? void 0 : _b2.end(handle, { path: file.path });
          }
        }, 500);
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", async (file) => {
        var _a2, _b2, _c, _d, _e;
        if (file.extension !== "md")
          return;
        (_a2 = this.profiler) == null ? void 0 : _a2.increment("events:modify");
        const stat = (_b2 = file.stat) != null ? _b2 : await this.app.vault.adapter.stat(file.path);
        const fileAge = Date.now() - stat.ctime;
        if (fileAge < 5e3) {
          const handle = (_c = this.profiler) == null ? void 0 : _c.start("events:modify:update");
          try {
            await this.taggingManager.updateParaTags(file);
          } finally {
            (_d = this.profiler) == null ? void 0 : _d.end(handle, { path: file.path, fileAge });
          }
        } else {
          (_e = this.profiler) == null ? void 0 : _e.increment("events:modify:skipped-age");
        }
      })
    );
    this.addCommand({
      id: "setup-para",
      name: "Run PARA Setup Wizard",
      callback: async () => {
        await this.provisioningManager.runSetupWizard();
      }
    });
    this.addCommand({
      id: "update-para-tags",
      name: "Update PARA tags for current file",
      callback: async () => {
        const file = this.app.workspace.getActiveFile();
        if (file) {
          await this.taggingManager.updateParaTags(file);
          new Notice("PARA tags updated!");
        } else {
          new Notice("No active file");
        }
      }
    });
    this.addCommand({
      id: "update-all-para-tags",
      name: "Update PARA tags for all files",
      callback: async () => {
        await this.taggingManager.bulkUpdateTags();
      }
    });
    this.addCommand({
      id: "deploy-templates",
      name: "Deploy PARA templates",
      callback: async () => {
        await this.templateManager.deployAllTemplates();
      }
    });
    this.addCommand({
      id: "clean-template-files",
      name: "Clean PARA properties from template files",
      callback: async () => {
        await this.taggingManager.cleanTemplateFiles();
      }
    });
    this.addCommand({
      id: "log-performance-snapshot",
      name: "Log profiling snapshot to console",
      callback: () => {
        var _a2;
        if (!((_a2 = this.settings.diagnostics) == null ? void 0 : _a2.profilingEnabled)) {
          new Notice("Enable profiling in settings before logging a snapshot.");
          return;
        }
        this.logPerformanceSnapshot("command");
      }
    });
    this.addCommand({
      id: "check-dependencies",
      name: "Check plugin dependencies",
      callback: async () => {
        await this.checkDependencies(true);
      }
    });
    this.addCommand({
      id: "cancel-archive-tasks",
      name: "Cancel all open tasks in Archive folder",
      callback: async () => {
        await this.taskManager.cancelArchiveTasks();
      }
    });
    this.addCommand({
      id: "cancel-current-file-tasks",
      name: "Cancel all open tasks in current file",
      callback: async () => {
        await this.taskManager.cancelCurrentFileTasks();
      }
    });
    this.addCommand({
      id: "preview-archive-task-cancellation",
      name: "Preview archive task cancellation (dry run)",
      callback: async () => {
        await this.taskManager.previewArchiveTaskCancellation();
      }
    });
    this.addSettingTab(new QuickParaSettingTab(this.app, this));
    if (this.settings.firstRun) {
      await this.handleFirstRun();
    }
    console.log("Quick PARA plugin loaded successfully");
    (_b = this.profiler) == null ? void 0 : _b.end(onloadTimer, { status: "loaded" });
  }
  initializeProfiler() {
    var _a, _b, _c, _d;
    this.profiler = new PerformanceProfiler({
      enabled: (_b = (_a = this.settings) == null ? void 0 : _a.diagnostics) == null ? void 0 : _b.profilingEnabled,
      slowThreshold: (_d = (_c = this.settings) == null ? void 0 : _c.diagnostics) == null ? void 0 : _d.slowOperationThresholdMs
    });
  }
  applyProfilerSettings() {
    var _a, _b, _c, _d;
    if (!this.profiler) {
      this.initializeProfiler();
      return;
    }
    this.profiler.configure({
      slowThreshold: (_b = (_a = this.settings) == null ? void 0 : _a.diagnostics) == null ? void 0 : _b.slowOperationThresholdMs
    });
    this.profiler.setEnabled((_d = (_c = this.settings) == null ? void 0 : _c.diagnostics) == null ? void 0 : _d.profilingEnabled);
  }
  logPerformanceSnapshot(reason = "manual") {
    if (!this.profiler) {
      console.info("Quick PARA: Profiler not initialized");
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
      console.warn("Quick PARA: Some dependencies are missing", result.missing);
    } else if (showNotice) {
      new Notice("All dependencies are installed!");
    }
    return result;
  }
  async handleFirstRun() {
    setTimeout(async () => {
      new Notice("Welcome to Quick PARA! Click the grid icon to run setup.");
      this.settings.firstRun = false;
      await this.saveSettings();
    }, 2e3);
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (this.settings.agendaGeneration && !this.settings.projectUpdates) {
      console.log("Migrating old agendaGeneration settings to projectUpdates");
      this.settings.projectUpdates = {
        enabled: this.settings.agendaGeneration.enabled || false,
        kanbanFile: this.settings.agendaGeneration.kanbanFile || "0 - INBOX/Project Dashboard.md",
        configs: []
      };
    }
    if (!this.settings.projectUpdates) {
      this.settings.projectUpdates = DEFAULT_SETTINGS.projectUpdates;
    }
    if (!this.settings.projectUpdates.kanbanFile) {
      this.settings.projectUpdates.kanbanFile = "0 - INBOX/Project Dashboard.md";
    }
    if (this.settings.tagging && this.settings.tagging.migrateOldTags !== void 0) {
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
    var _a, _b;
    if (((_b = (_a = this.settings) == null ? void 0 : _a.diagnostics) == null ? void 0 : _b.profilingEnabled) && this.settings.diagnostics.logSummaryOnUnload) {
      this.logPerformanceSnapshot("plugin-unload");
    }
    console.log("Unloading Quick PARA plugin");
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL3BlcmZvcm1hbmNlLXByb2ZpbGVyLmpzIiwgInNyYy9pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY2xhc3MgUGVyZm9ybWFuY2VQcm9maWxlciB7XG4gICAgY29uc3RydWN0b3Iob3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIHRoaXMuZW5hYmxlZCA9IG9wdGlvbnMuZW5hYmxlZCA/PyBmYWxzZTtcbiAgICAgICAgdGhpcy5zbG93VGhyZXNob2xkID0gb3B0aW9ucy5zbG93VGhyZXNob2xkID8/IDIwMDtcbiAgICAgICAgdGhpcy5yZXNldCgpO1xuICAgIH1cblxuICAgIHJlc2V0KCkge1xuICAgICAgICB0aGlzLnRpbWVycyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5zdGF0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5jb3VudGVycyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uU3RhcnQgPSBEYXRlLm5vdygpO1xuICAgICAgICB0aGlzLnRpbWVyQ291bnRlciA9IDA7XG4gICAgfVxuXG4gICAgbm93KCkge1xuICAgICAgICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcGVyZm9ybWFuY2Uubm93ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIERhdGUubm93KCk7XG4gICAgfVxuXG4gICAgc2V0RW5hYmxlZChlbmFibGVkKSB7XG4gICAgICAgIGlmICh0aGlzLmVuYWJsZWQgPT09IGVuYWJsZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQ7XG4gICAgICAgIGlmIChlbmFibGVkKSB7XG4gICAgICAgICAgICB0aGlzLnJlc2V0KCk7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ1tRdWljayBQQVJBXVtQZXJmXSBQcm9maWxpbmcgZW5hYmxlZCcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdbUXVpY2sgUEFSQV1bUGVyZl0gUHJvZmlsaW5nIGRpc2FibGVkJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25maWd1cmUob3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5zbG93VGhyZXNob2xkID09PSAnbnVtYmVyJyAmJiAhTnVtYmVyLmlzTmFOKG9wdGlvbnMuc2xvd1RocmVzaG9sZCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2xvd1RocmVzaG9sZCA9IG9wdGlvbnMuc2xvd1RocmVzaG9sZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0KGxhYmVsKSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8ICFsYWJlbCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBoYW5kbGUgPSBgJHtsYWJlbH06JHt0aGlzLnRpbWVyQ291bnRlcisrfWA7XG4gICAgICAgIHRoaXMudGltZXJzLnNldChoYW5kbGUsIHtcbiAgICAgICAgICAgIGxhYmVsLFxuICAgICAgICAgICAgc3RhcnQ6IHRoaXMubm93KClcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBoYW5kbGU7XG4gICAgfVxuXG4gICAgZW5kKGhhbmRsZSwgY29udGV4dCA9IHt9KSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8ICFoYW5kbGUpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnRpbWVycy5nZXQoaGFuZGxlKTtcbiAgICAgICAgaWYgKCF0aW1lcikge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBkdXJhdGlvbiA9IHRoaXMubm93KCkgLSB0aW1lci5zdGFydDtcbiAgICAgICAgdGhpcy50aW1lcnMuZGVsZXRlKGhhbmRsZSk7XG4gICAgICAgIHRoaXMucmVjb3JkRHVyYXRpb24odGltZXIubGFiZWwsIGR1cmF0aW9uLCBjb250ZXh0KTtcbiAgICAgICAgcmV0dXJuIGR1cmF0aW9uO1xuICAgIH1cblxuICAgIGFzeW5jIHRpbWUobGFiZWwsIGZuLCBjb250ZXh0QnVpbGRlcikge1xuICAgICAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkKSB7XG4gICAgICAgICAgICByZXR1cm4gZm4oKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGhhbmRsZSA9IHRoaXMuc3RhcnQobGFiZWwpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IGZuKCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZXh0ID0gdHlwZW9mIGNvbnRleHRCdWlsZGVyID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICAgICAgPyBjb250ZXh0QnVpbGRlcigpXG4gICAgICAgICAgICAgICAgOiAoY29udGV4dEJ1aWxkZXIgfHwge30pO1xuICAgICAgICAgICAgdGhpcy5lbmQoaGFuZGxlLCBjb250ZXh0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlY29yZER1cmF0aW9uKGxhYmVsLCBkdXJhdGlvbiwgY29udGV4dCA9IHt9KSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8IHR5cGVvZiBkdXJhdGlvbiAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHN0YXRzID0gdGhpcy5zdGF0cy5nZXQobGFiZWwpIHx8IHtcbiAgICAgICAgICAgIGNvdW50OiAwLFxuICAgICAgICAgICAgdG90YWxNczogMCxcbiAgICAgICAgICAgIG1heE1zOiAwLFxuICAgICAgICAgICAgbWluTXM6IG51bGwsXG4gICAgICAgICAgICBsYXN0Q29udGV4dDogbnVsbFxuICAgICAgICB9O1xuXG4gICAgICAgIHN0YXRzLmNvdW50ICs9IDE7XG4gICAgICAgIHN0YXRzLnRvdGFsTXMgKz0gZHVyYXRpb247XG4gICAgICAgIHN0YXRzLm1heE1zID0gTWF0aC5tYXgoc3RhdHMubWF4TXMsIGR1cmF0aW9uKTtcbiAgICAgICAgc3RhdHMubWluTXMgPSBzdGF0cy5taW5NcyA9PT0gbnVsbCA/IGR1cmF0aW9uIDogTWF0aC5taW4oc3RhdHMubWluTXMsIGR1cmF0aW9uKTtcbiAgICAgICAgc3RhdHMubGFzdENvbnRleHQgPSBjb250ZXh0O1xuXG4gICAgICAgIHRoaXMuc3RhdHMuc2V0KGxhYmVsLCBzdGF0cyk7XG5cbiAgICAgICAgY29uc3QgZHVyYXRpb25MYWJlbCA9IGR1cmF0aW9uLnRvRml4ZWQoMik7XG4gICAgICAgIGlmIChkdXJhdGlvbiA+PSB0aGlzLnNsb3dUaHJlc2hvbGQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgW1F1aWNrIFBBUkFdW1BlcmZdICR7bGFiZWx9IHRvb2sgJHtkdXJhdGlvbkxhYmVsfW1zYCwgY29udGV4dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKGBbUXVpY2sgUEFSQV1bUGVyZl0gJHtsYWJlbH06ICR7ZHVyYXRpb25MYWJlbH1tc2AsIGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaW5jcmVtZW50KGxhYmVsKSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8ICFsYWJlbCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY291bnQgPSAodGhpcy5jb3VudGVycy5nZXQobGFiZWwpIHx8IDApICsgMTtcbiAgICAgICAgdGhpcy5jb3VudGVycy5zZXQobGFiZWwsIGNvdW50KTtcbiAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgIH1cblxuICAgIHN1bW1hcml6ZSgpIHtcbiAgICAgICAgY29uc3Qgc3RhdHMgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbbGFiZWwsIGVudHJ5XSBvZiB0aGlzLnN0YXRzLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgc3RhdHNbbGFiZWxdID0ge1xuICAgICAgICAgICAgICAgIGNvdW50OiBlbnRyeS5jb3VudCxcbiAgICAgICAgICAgICAgICB0b3RhbE1zOiBOdW1iZXIoZW50cnkudG90YWxNcy50b0ZpeGVkKDIpKSxcbiAgICAgICAgICAgICAgICBhdmdNczogZW50cnkuY291bnQgPyBOdW1iZXIoKGVudHJ5LnRvdGFsTXMgLyBlbnRyeS5jb3VudCkudG9GaXhlZCgyKSkgOiAwLFxuICAgICAgICAgICAgICAgIG1heE1zOiBOdW1iZXIoZW50cnkubWF4TXMudG9GaXhlZCgyKSksXG4gICAgICAgICAgICAgICAgbWluTXM6IGVudHJ5Lm1pbk1zID09PSBudWxsID8gbnVsbCA6IE51bWJlcihlbnRyeS5taW5Ncy50b0ZpeGVkKDIpKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvdW50ZXJzID0ge307XG4gICAgICAgIGZvciAoY29uc3QgW2xhYmVsLCBjb3VudF0gb2YgdGhpcy5jb3VudGVycy5lbnRyaWVzKCkpIHtcbiAgICAgICAgICAgIGNvdW50ZXJzW2xhYmVsXSA9IGNvdW50O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRoaXMuZW5hYmxlZCxcbiAgICAgICAgICAgIHNsb3dUaHJlc2hvbGQ6IHRoaXMuc2xvd1RocmVzaG9sZCxcbiAgICAgICAgICAgIHNlc3Npb25TdGFydDogdGhpcy5zZXNzaW9uU3RhcnQsXG4gICAgICAgICAgICBzZXNzaW9uRHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHRoaXMuc2Vzc2lvblN0YXJ0LFxuICAgICAgICAgICAgc3RhdHMsXG4gICAgICAgICAgICBjb3VudGVyc1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGxvZ1N1bW1hcnkocmVhc29uID0gJ21hbnVhbCcpIHtcbiAgICAgICAgaWYgKCF0aGlzLmVuYWJsZWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnW1F1aWNrIFBBUkFdW1BlcmZdIFByb2ZpbGluZyBkaXNhYmxlZDsgbm8gc3VtbWFyeSB0byBsb2cuJyk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHN1bW1hcnkgPSB0aGlzLnN1bW1hcml6ZSgpO1xuICAgICAgICBjb25zb2xlLmdyb3VwKGBbUXVpY2sgUEFSQV1bUGVyZl0gU3VtbWFyeSAoJHtyZWFzb259KWApO1xuICAgICAgICBjb25zb2xlLmluZm8oJ1Nlc3Npb24gZHVyYXRpb24gKG1zKTonLCBzdW1tYXJ5LnNlc3Npb25EdXJhdGlvbk1zKTtcbiAgICAgICAgY29uc29sZS5pbmZvKCdTbG93IHRocmVzaG9sZCAobXMpOicsIHN1bW1hcnkuc2xvd1RocmVzaG9sZCk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnRXZlbnQgY291bnRlcnM6Jywgc3VtbWFyeS5jb3VudGVycyk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnVGltaW5nIHN0YXRzOicsIHN1bW1hcnkuc3RhdHMpO1xuICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XG4gICAgICAgIHJldHVybiBzdW1tYXJ5O1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7IFBlcmZvcm1hbmNlUHJvZmlsZXIgfTtcbiIsICJjb25zdCB7IFBsdWdpbiwgTm90aWNlLCBNb2RhbCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9ID0gcmVxdWlyZSgnb2JzaWRpYW4nKTtcbmNvbnN0IHsgUGVyZm9ybWFuY2VQcm9maWxlciB9ID0gcmVxdWlyZSgnLi9wZXJmb3JtYW5jZS1wcm9maWxlcicpO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBERUZBVUxUIFNFVFRJTkdTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1MgPSB7XG4gICAgZmlyc3RSdW46IHRydWUsXG4gICAgcGFyYUZvbGRlcnM6IHtcbiAgICAgICAgaW5ib3g6IFwiMCAtIElOQk9YXCIsXG4gICAgICAgIHByb2plY3RzOiBcIjEgLSBQUk9KRUNUU1wiLFxuICAgICAgICBhcmVhczogXCIyIC0gQVJFQVNcIixcbiAgICAgICAgcmVzb3VyY2VzOiBcIjMgLSBSRVNPVVJDRVNcIixcbiAgICAgICAgYXJjaGl2ZTogXCI0IC0gQVJDSElWRVwiXG4gICAgfSxcbiAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgYXV0b0RlcGxveU9uU2V0dXA6IHRydWUsXG4gICAgICAgIGJhY2t1cEJlZm9yZU92ZXJ3cml0ZTogdHJ1ZVxuICAgIH0sXG4gICAgdGFnZ2luZzoge1xuICAgICAgICBwcm9wZXJ0eU5hbWU6IFwicGFyYVwiLCAgLy8gTG9ja2VkIC0gbm90IHVzZXItY29uZmlndXJhYmxlXG4gICAgICAgIHBlcnNpc3RTdWJmb2xkZXJUYWdzOiB0cnVlXG4gICAgfSxcbiAgICB0YXNrczoge1xuICAgICAgICBhdXRvQ2FuY2VsT25BcmNoaXZlOiBmYWxzZSwgIC8vIERlZmF1bHQ6IGRpc2FibGVkIGZvciBzYWZldHlcbiAgICAgICAgc2hvd0NhbmNlbGxhdGlvbk5vdGljZXM6IHRydWUgIC8vIFNob3cgZmVlZGJhY2sgd2hlbiBhdXRvLWNhbmNlbGxpbmdcbiAgICB9LFxuICAgIGRpYWdub3N0aWNzOiB7XG4gICAgICAgIHByb2ZpbGluZ0VuYWJsZWQ6IGZhbHNlLFxuICAgICAgICBzbG93T3BlcmF0aW9uVGhyZXNob2xkTXM6IDIwMCxcbiAgICAgICAgbG9nU3VtbWFyeU9uVW5sb2FkOiB0cnVlXG4gICAgfVxufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gREVQRU5ERU5DWSBNQU5BR0VSXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNsYXNzIERlcGVuZGVuY3lNYW5hZ2VyIHtcbiAgICBjb25zdHJ1Y3RvcihhcHApIHtcbiAgICAgICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgICAgIHRoaXMucmVxdWlyZWRQbHVnaW5zID0ge1xuICAgICAgICAgICAgJ3RlbXBsYXRlci1vYnNpZGlhbic6IHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnVGVtcGxhdGVyJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlcXVpcmVkIGZvciB0ZW1wbGF0ZSB2YXJpYWJsZSBzdWJzdGl0dXRpb24nLFxuICAgICAgICAgICAgICAgIHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9TaWxlbnRWb2lkMTMvVGVtcGxhdGVyJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdvYnNpZGlhbi10YXNrcy1wbHVnaW4nOiB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ1Rhc2tzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlcXVpcmVkIGZvciB0YXNrIG1hbmFnZW1lbnQnLFxuICAgICAgICAgICAgICAgIHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vYnNpZGlhbi10YXNrcy1ncm91cC9vYnNpZGlhbi10YXNrcydcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLm9wdGlvbmFsUGx1Z2lucyA9IHt9O1xuICAgIH1cblxuICAgIGFzeW5jIGNoZWNrRGVwZW5kZW5jaWVzKCkge1xuICAgICAgICBjb25zdCBtaXNzaW5nID0gW107XG4gICAgICAgIGNvbnN0IGluc3RhbGxlZCA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgW3BsdWdpbklkLCBpbmZvXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLnJlcXVpcmVkUGx1Z2lucykpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmlzUGx1Z2luRW5hYmxlZChwbHVnaW5JZCkpIHtcbiAgICAgICAgICAgICAgICBpbnN0YWxsZWQucHVzaChpbmZvLm5hbWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtaXNzaW5nLnB1c2goeyAuLi5pbmZvLCBwbHVnaW5JZCwgcmVxdWlyZWQ6IHRydWUgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IFtwbHVnaW5JZCwgaW5mb10gb2YgT2JqZWN0LmVudHJpZXModGhpcy5vcHRpb25hbFBsdWdpbnMpKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5pc1BsdWdpbkVuYWJsZWQocGx1Z2luSWQpKSB7XG4gICAgICAgICAgICAgICAgaW5zdGFsbGVkLnB1c2goaW5mby5uYW1lKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbWlzc2luZy5wdXNoKHsgLi4uaW5mbywgcGx1Z2luSWQsIHJlcXVpcmVkOiBmYWxzZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBhbGxNZXQ6IG1pc3NpbmcuZmlsdGVyKHAgPT4gcC5yZXF1aXJlZCkubGVuZ3RoID09PSAwLFxuICAgICAgICAgICAgaW5zdGFsbGVkLFxuICAgICAgICAgICAgbWlzc2luZ1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGlzUGx1Z2luSW5zdGFsbGVkKHBsdWdpbklkKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmFwcC5wbHVnaW5zLm1hbmlmZXN0c1twbHVnaW5JZF0gIT09IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBpc1BsdWdpbkVuYWJsZWQocGx1Z2luSWQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXBwLnBsdWdpbnMuZW5hYmxlZFBsdWdpbnMuaGFzKHBsdWdpbklkKTtcbiAgICB9XG5cbiAgICBhc3luYyBzaG93RGVwZW5kZW5jeVdhcm5pbmcobWlzc2luZykge1xuICAgICAgICBjb25zdCBtb2RhbCA9IG5ldyBEZXBlbmRlbmN5V2FybmluZ01vZGFsKHRoaXMuYXBwLCBtaXNzaW5nKTtcbiAgICAgICAgbW9kYWwub3BlbigpO1xuICAgIH1cbn1cblxuY2xhc3MgRGVwZW5kZW5jeVdhcm5pbmdNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgICBjb25zdHJ1Y3RvcihhcHAsIG1pc3NpbmcpIHtcbiAgICAgICAgc3VwZXIoYXBwKTtcbiAgICAgICAgdGhpcy5taXNzaW5nID0gbWlzc2luZztcbiAgICB9XG5cbiAgICBvbk9wZW4oKSB7XG4gICAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgICAgICBjb250ZW50RWwuZW1wdHkoKTtcblxuICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnUGx1Z2luIERlcGVuZGVuY2llcycgfSk7XG5cbiAgICAgICAgY29uc3QgcmVxdWlyZWQgPSB0aGlzLm1pc3NpbmcuZmlsdGVyKHAgPT4gcC5yZXF1aXJlZCk7XG4gICAgICAgIGNvbnN0IG9wdGlvbmFsID0gdGhpcy5taXNzaW5nLmZpbHRlcihwID0+ICFwLnJlcXVpcmVkKTtcblxuICAgICAgICBpZiAocmVxdWlyZWQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ1JlcXVpcmVkIFBsdWdpbnMgKE1pc3NpbmcpJyB9KTtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgICAgICB0ZXh0OiAnVGhlc2UgcGx1Z2lucyBhcmUgcmVxdWlyZWQgZm9yIFF1aWNrIFBBUkEgdG8gZnVuY3Rpb24gcHJvcGVybHkuJyxcbiAgICAgICAgICAgICAgICBjbHM6ICdtb2Qtd2FybmluZydcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCByZXFMaXN0ID0gY29udGVudEVsLmNyZWF0ZUVsKCd1bCcpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBwbHVnaW4gb2YgcmVxdWlyZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaSA9IHJlcUxpc3QuY3JlYXRlRWwoJ2xpJyk7XG4gICAgICAgICAgICAgICAgbGkuY3JlYXRlRWwoJ3N0cm9uZycsIHsgdGV4dDogcGx1Z2luLm5hbWUgfSk7XG4gICAgICAgICAgICAgICAgbGkuYXBwZW5kVGV4dChgOiAke3BsdWdpbi5kZXNjcmlwdGlvbn1gKTtcbiAgICAgICAgICAgICAgICBsaS5jcmVhdGVFbCgnYnInKTtcbiAgICAgICAgICAgICAgICBsaS5jcmVhdGVFbCgnYScsIHsgdGV4dDogJ0luc3RhbGwnLCBocmVmOiBwbHVnaW4udXJsIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9wdGlvbmFsLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdPcHRpb25hbCBQbHVnaW5zIChNaXNzaW5nKScgfSk7XG4gICAgICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICAgICAgdGV4dDogJ1RoZXNlIHBsdWdpbnMgZW5oYW5jZSBRdWljayBQQVJBIGJ1dCBhcmUgbm90IHJlcXVpcmVkLidcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBvcHRMaXN0ID0gY29udGVudEVsLmNyZWF0ZUVsKCd1bCcpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBwbHVnaW4gb2Ygb3B0aW9uYWwpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaSA9IG9wdExpc3QuY3JlYXRlRWwoJ2xpJyk7XG4gICAgICAgICAgICAgICAgbGkuY3JlYXRlRWwoJ3N0cm9uZycsIHsgdGV4dDogcGx1Z2luLm5hbWUgfSk7XG4gICAgICAgICAgICAgICAgbGkuYXBwZW5kVGV4dChgOiAke3BsdWdpbi5kZXNjcmlwdGlvbn1gKTtcbiAgICAgICAgICAgICAgICBsaS5jcmVhdGVFbCgnYnInKTtcbiAgICAgICAgICAgICAgICBsaS5jcmVhdGVFbCgnYScsIHsgdGV4dDogJ0luc3RhbGwnLCBocmVmOiBwbHVnaW4udXJsIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMubWlzc2luZy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ0FsbCBkZXBlbmRlbmNpZXMgYXJlIGluc3RhbGxlZCEnIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYnV0dG9uQ29udGFpbmVyID0gY29udGVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21vZGFsLWJ1dHRvbi1jb250YWluZXInIH0pO1xuICAgICAgICBjb25zdCBjbG9zZUJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnQ2xvc2UnIH0pO1xuICAgICAgICBjbG9zZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuY2xvc2UoKSk7XG4gICAgfVxuXG4gICAgb25DbG9zZSgpIHtcbiAgICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUFJPVklTSU9OSU5HIE1BTkFHRVJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY2xhc3MgUHJvdmlzaW9uaW5nTWFuYWdlciB7XG4gICAgY29uc3RydWN0b3IoYXBwLCBzZXR0aW5ncykge1xuICAgICAgICB0aGlzLmFwcCA9IGFwcDtcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHNldHRpbmdzO1xuICAgIH1cblxuICAgIGFzeW5jIGRldGVjdEV4aXN0aW5nU3RydWN0dXJlKCkge1xuICAgICAgICBjb25zdCBkZXRlY3RlZCA9IHt9O1xuICAgICAgICBjb25zdCBmb2xkZXJzID0gdGhpcy5hcHAudmF1bHQuZ2V0QWxsTG9hZGVkRmlsZXMoKVxuICAgICAgICAgICAgLmZpbHRlcihmID0+IGYuY2hpbGRyZW4gIT09IHVuZGVmaW5lZCk7IC8vIE9ubHkgZm9sZGVyc1xuXG4gICAgICAgIGZvciAoY29uc3QgW2xvY2F0aW9uLCBmb2xkZXJOYW1lXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLnNldHRpbmdzLnBhcmFGb2xkZXJzKSkge1xuICAgICAgICAgICAgY29uc3QgZXhpc3RzID0gZm9sZGVycy5zb21lKGYgPT4gZi5wYXRoID09PSBmb2xkZXJOYW1lKTtcbiAgICAgICAgICAgIGRldGVjdGVkW2xvY2F0aW9uXSA9IHsgZXhpc3RzLCBwYXRoOiBmb2xkZXJOYW1lIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZGV0ZWN0ZWQ7XG4gICAgfVxuXG4gICAgYXN5bmMgcHJvdmlzaW9uRm9sZGVycyhjcmVhdGVNaXNzaW5nT25seSA9IHRydWUpIHtcbiAgICAgICAgY29uc3Qgc3RydWN0dXJlID0gYXdhaXQgdGhpcy5kZXRlY3RFeGlzdGluZ1N0cnVjdHVyZSgpO1xuICAgICAgICBjb25zdCBjcmVhdGVkID0gW107XG4gICAgICAgIGNvbnN0IHNraXBwZWQgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IFtsb2NhdGlvbiwgaW5mb10gb2YgT2JqZWN0LmVudHJpZXMoc3RydWN0dXJlKSkge1xuICAgICAgICAgICAgaWYgKGluZm8uZXhpc3RzICYmIGNyZWF0ZU1pc3NpbmdPbmx5KSB7XG4gICAgICAgICAgICAgICAgc2tpcHBlZC5wdXNoKGluZm8ucGF0aCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKGluZm8ucGF0aCk7XG4gICAgICAgICAgICAgICAgY3JlYXRlZC5wdXNoKGluZm8ucGF0aCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdhbHJlYWR5IGV4aXN0cycpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNraXBwZWQucHVzaChpbmZvLnBhdGgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBjcmVhdGUgZm9sZGVyICR7aW5mby5wYXRofTpgLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHsgY3JlYXRlZCwgc2tpcHBlZCB9O1xuICAgIH1cblxuICAgIGFzeW5jIHJ1blNldHVwV2l6YXJkKCkge1xuICAgICAgICBjb25zdCBtb2RhbCA9IG5ldyBTZXR1cFdpemFyZE1vZGFsKHRoaXMuYXBwLCB0aGlzKTtcbiAgICAgICAgbW9kYWwub3BlbigpO1xuICAgIH1cbn1cblxuY2xhc3MgU2V0dXBXaXphcmRNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgICBjb25zdHJ1Y3RvcihhcHAsIHByb3Zpc2lvbmluZ01hbmFnZXIpIHtcbiAgICAgICAgc3VwZXIoYXBwKTtcbiAgICAgICAgdGhpcy5wcm92aXNpb25pbmdNYW5hZ2VyID0gcHJvdmlzaW9uaW5nTWFuYWdlcjtcbiAgICAgICAgdGhpcy5zdGVwID0gMTtcbiAgICAgICAgdGhpcy50b3RhbFN0ZXBzID0gMztcbiAgICB9XG5cbiAgICBvbk9wZW4oKSB7XG4gICAgICAgIHRoaXMucmVuZGVyU3RlcCgpO1xuICAgIH1cblxuICAgIHJlbmRlclN0ZXAoKSB7XG4gICAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgICAgICBjb250ZW50RWwuZW1wdHkoKTtcblxuICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiBgUXVpY2sgUEFSQSBTZXR1cCAoU3RlcCAke3RoaXMuc3RlcH0vJHt0aGlzLnRvdGFsU3RlcHN9KWAgfSk7XG5cbiAgICAgICAgc3dpdGNoICh0aGlzLnN0ZXApIHtcbiAgICAgICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcldlbGNvbWVTdGVwKGNvbnRlbnRFbCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJGb2xkZXJTdGVwKGNvbnRlbnRFbCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJDb25maXJtU3RlcChjb250ZW50RWwpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVuZGVyV2VsY29tZVN0ZXAoY29udGVudEVsKSB7XG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ1dlbGNvbWUgdG8gUXVpY2sgUEFSQSEgVGhpcyB3aXphcmQgd2lsbCBoZWxwIHlvdSBzZXQgdXAgeW91ciB2YXVsdCB3aXRoIHRoZSBQQVJBIG1ldGhvZC4nIH0pO1xuXG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdXaGF0IGlzIFBBUkE/JyB9KTtcbiAgICAgICAgY29uc3QgbGlzdCA9IGNvbnRlbnRFbC5jcmVhdGVFbCgndWwnKTtcbiAgICAgICAgbGlzdC5jcmVhdGVFbCgnbGknLCB7IHRleHQ6ICdQcm9qZWN0czogQWN0aXZlIHdvcmsgd2l0aCBkZWFkbGluZXMnIH0pO1xuICAgICAgICBsaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ0FyZWFzOiBPbmdvaW5nIHJlc3BvbnNpYmlsaXRpZXMnIH0pO1xuICAgICAgICBsaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ1Jlc291cmNlczogUmVmZXJlbmNlIG1hdGVyaWFscycgfSk7XG4gICAgICAgIGxpc3QuY3JlYXRlRWwoJ2xpJywgeyB0ZXh0OiAnQXJjaGl2ZTogQ29tcGxldGVkIG9yIGluYWN0aXZlIGl0ZW1zJyB9KTtcblxuICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICdUaGlzIHdpemFyZCB3aWxsOicgfSk7XG4gICAgICAgIGNvbnN0IHNldHVwTGlzdCA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnb2wnKTtcbiAgICAgICAgc2V0dXBMaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ0NyZWF0ZSBQQVJBIGZvbGRlciBzdHJ1Y3R1cmUnIH0pO1xuICAgICAgICBzZXR1cExpc3QuY3JlYXRlRWwoJ2xpJywgeyB0ZXh0OiAnRGVwbG95IG5vdGUgdGVtcGxhdGVzJyB9KTtcbiAgICAgICAgc2V0dXBMaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ0NvbmZpZ3VyZSBhdXRvbWF0aWMgdGFnZ2luZycgfSk7XG5cbiAgICAgICAgdGhpcy5yZW5kZXJCdXR0b25zKGNvbnRlbnRFbCwgZmFsc2UsIHRydWUpO1xuICAgIH1cblxuICAgIGFzeW5jIHJlbmRlckZvbGRlclN0ZXAoY29udGVudEVsKSB7XG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ0NoZWNraW5nIGV4aXN0aW5nIGZvbGRlciBzdHJ1Y3R1cmUuLi4nIH0pO1xuXG4gICAgICAgIGNvbnN0IHN0cnVjdHVyZSA9IGF3YWl0IHRoaXMucHJvdmlzaW9uaW5nTWFuYWdlci5kZXRlY3RFeGlzdGluZ1N0cnVjdHVyZSgpO1xuXG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdQQVJBIEZvbGRlcnMnIH0pO1xuICAgICAgICBjb25zdCB0YWJsZSA9IGNvbnRlbnRFbC5jcmVhdGVFbCgndGFibGUnLCB7IGNsczogJ3BhcmEtZm9sZGVycy10YWJsZScgfSk7XG5cbiAgICAgICAgY29uc3QgaGVhZGVyID0gdGFibGUuY3JlYXRlRWwoJ3RyJyk7XG4gICAgICAgIGhlYWRlci5jcmVhdGVFbCgndGgnLCB7IHRleHQ6ICdMb2NhdGlvbicgfSk7XG4gICAgICAgIGhlYWRlci5jcmVhdGVFbCgndGgnLCB7IHRleHQ6ICdGb2xkZXIgUGF0aCcgfSk7XG4gICAgICAgIGhlYWRlci5jcmVhdGVFbCgndGgnLCB7IHRleHQ6ICdTdGF0dXMnIH0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgW2xvY2F0aW9uLCBpbmZvXSBvZiBPYmplY3QuZW50cmllcyhzdHJ1Y3R1cmUpKSB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSB0YWJsZS5jcmVhdGVFbCgndHInKTtcbiAgICAgICAgICAgIHJvdy5jcmVhdGVFbCgndGQnLCB7IHRleHQ6IGxvY2F0aW9uLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbG9jYXRpb24uc2xpY2UoMSkgfSk7XG4gICAgICAgICAgICByb3cuY3JlYXRlRWwoJ3RkJywgeyB0ZXh0OiBpbmZvLnBhdGggfSk7XG4gICAgICAgICAgICBjb25zdCBzdGF0dXNDZWxsID0gcm93LmNyZWF0ZUVsKCd0ZCcpO1xuICAgICAgICAgICAgc3RhdHVzQ2VsbC5jcmVhdGVFbCgnc3BhbicsIHtcbiAgICAgICAgICAgICAgICB0ZXh0OiBpbmZvLmV4aXN0cyA/ICdFeGlzdHMnIDogJ1dpbGwgY3JlYXRlJyxcbiAgICAgICAgICAgICAgICBjbHM6IGluZm8uZXhpc3RzID8gJ3BhcmEtZXhpc3RzJyA6ICdwYXJhLWNyZWF0ZSdcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgdGV4dDogJ0V4aXN0aW5nIGZvbGRlcnMgd2lsbCBub3QgYmUgbW9kaWZpZWQuIE9ubHkgbWlzc2luZyBmb2xkZXJzIHdpbGwgYmUgY3JlYXRlZC4nLFxuICAgICAgICAgICAgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJ1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnJlbmRlckJ1dHRvbnMoY29udGVudEVsLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBhc3luYyByZW5kZXJDb25maXJtU3RlcChjb250ZW50RWwpIHtcbiAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiAnQ3JlYXRpbmcgZm9sZGVycy4uLicgfSk7XG5cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wcm92aXNpb25pbmdNYW5hZ2VyLnByb3Zpc2lvbkZvbGRlcnModHJ1ZSk7XG5cbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdTZXR1cCBDb21wbGV0ZSEnIH0pO1xuXG4gICAgICAgIGlmIChyZXN1bHQuY3JlYXRlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnQ3JlYXRlZCBGb2xkZXJzJyB9KTtcbiAgICAgICAgICAgIGNvbnN0IGNyZWF0ZWRMaXN0ID0gY29udGVudEVsLmNyZWF0ZUVsKCd1bCcpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBmb2xkZXIgb2YgcmVzdWx0LmNyZWF0ZWQpIHtcbiAgICAgICAgICAgICAgICBjcmVhdGVkTGlzdC5jcmVhdGVFbCgnbGknLCB7IHRleHQ6IGZvbGRlciB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZXN1bHQuc2tpcHBlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnRXhpc3RpbmcgRm9sZGVycyAoU2tpcHBlZCknIH0pO1xuICAgICAgICAgICAgY29uc3Qgc2tpcHBlZExpc3QgPSBjb250ZW50RWwuY3JlYXRlRWwoJ3VsJyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZvbGRlciBvZiByZXN1bHQuc2tpcHBlZCkge1xuICAgICAgICAgICAgICAgIHNraXBwZWRMaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogZm9sZGVyIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ05leHQgU3RlcHMnIH0pO1xuICAgICAgICBjb25zdCBuZXh0U3RlcHMgPSBjb250ZW50RWwuY3JlYXRlRWwoJ29sJyk7XG4gICAgICAgIG5leHRTdGVwcy5jcmVhdGVFbCgnbGknLCB7IHRleHQ6ICdJbnN0YWxsIFRlbXBsYXRlciBhbmQgVGFza3MgcGx1Z2lucyAoaWYgbm90IGFscmVhZHkgaW5zdGFsbGVkKScgfSk7XG4gICAgICAgIG5leHRTdGVwcy5jcmVhdGVFbCgnbGknLCB7IHRleHQ6ICdEZXBsb3kgdGVtcGxhdGVzIHVzaW5nIHRoZSBcIkRlcGxveSBQQVJBIHRlbXBsYXRlc1wiIGNvbW1hbmQnIH0pO1xuICAgICAgICBuZXh0U3RlcHMuY3JlYXRlRWwoJ2xpJywgeyB0ZXh0OiAnU3RhcnQgY3JlYXRpbmcgbm90ZXMgaW4geW91ciBQQVJBIGZvbGRlcnMhJyB9KTtcblxuICAgICAgICB0aGlzLnJlbmRlckJ1dHRvbnMoY29udGVudEVsLCBmYWxzZSwgZmFsc2UsIHRydWUpO1xuICAgIH1cblxuICAgIHJlbmRlckJ1dHRvbnMoY29udGVudEVsLCBzaG93QmFjaywgc2hvd05leHQsIHNob3dDbG9zZSA9IGZhbHNlKSB7XG4gICAgICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdtb2RhbC1idXR0b24tY29udGFpbmVyJyB9KTtcblxuICAgICAgICBpZiAoc2hvd0JhY2spIHtcbiAgICAgICAgICAgIGNvbnN0IGJhY2tCdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ0JhY2snIH0pO1xuICAgICAgICAgICAgYmFja0J1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnN0ZXAtLTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclN0ZXAoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3dOZXh0KSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0QnV0dG9uID0gYnV0dG9uQ29udGFpbmVyLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdOZXh0JywgY2xzOiAnbW9kLWN0YScgfSk7XG4gICAgICAgICAgICBuZXh0QnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RlcCsrO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyU3RlcCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2hvd0Nsb3NlKSB7XG4gICAgICAgICAgICBjb25zdCBjbG9zZUJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnQ2xvc2UnLCBjbHM6ICdtb2QtY3RhJyB9KTtcbiAgICAgICAgICAgIGNsb3NlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5jbG9zZSgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNhbmNlbEJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnQ2FuY2VsJyB9KTtcbiAgICAgICAgY2FuY2VsQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5jbG9zZSgpKTtcbiAgICB9XG5cbiAgICBvbkNsb3NlKCkge1xuICAgICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUQUdHSU5HIE1BTkFHRVJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY2xhc3MgVGFnZ2luZ01hbmFnZXIge1xuICAgIGNvbnN0cnVjdG9yKGFwcCwgc2V0dGluZ3MsIHByb2ZpbGVyKSB7XG4gICAgICAgIHRoaXMuYXBwID0gYXBwO1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgIHRoaXMucHJvZmlsZXIgPSBwcm9maWxlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmUgUEFSQSBsb2NhdGlvbiBhbmQgc3ViZm9sZGVyIHRhZyhzKSBiYXNlZCBvbiBmaWxlIHBhdGhcbiAgICAgKlxuICAgICAqIExvZ2ljOlxuICAgICAqIC0gUEFSQSBsb2NhdGlvbiBpcyBzdG9yZWQgYXMgYSBwcm9wZXJ0eSAoZS5nLiwgcGFyYTogXCJwcm9qZWN0c1wiKVxuICAgICAqIC0gU3ViZm9sZGVyIHRhZ3MgYXJlIGFwcGxpZWQgc2VwYXJhdGVseSBhbmQgcGVyc2lzdCBhY3Jvc3MgbW92ZXNcbiAgICAgKiAtIEV4YW1wbGU6IFwiMSAtIFByb2plY3RzL1BCU1dJL1NvbWUgUHJvamVjdC5tZFwiXG4gICAgICogICBSZXN1bHRzIGluOiBwYXJhIHByb3BlcnR5ID0gXCJwcm9qZWN0c1wiLCB0YWdzIGluY2x1ZGUgXCJwYnN3aVwiXG4gICAgICovXG4gICAgZ2V0VGFnc0Zyb21QYXRoKGZpbGVQYXRoKSB7XG4gICAgICAgIGxldCBwYXJhTG9jYXRpb24gPSBudWxsO1xuICAgICAgICBjb25zdCBzdWJmb2xkZXJUYWdzID0gW107XG5cbiAgICAgICAgLy8gRmluZCBtYXRjaGluZyBQQVJBIHJvb3QgZm9sZGVyIChjYXNlLWluc2Vuc2l0aXZlKVxuICAgICAgICBmb3IgKGNvbnN0IFtsb2NhdGlvbiwgZm9sZGVyTmFtZV0gb2YgT2JqZWN0LmVudHJpZXModGhpcy5zZXR0aW5ncy5wYXJhRm9sZGVycykpIHtcbiAgICAgICAgICAgIGNvbnN0IGxvd2VyRmlsZVBhdGggPSBmaWxlUGF0aC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgY29uc3QgbG93ZXJGb2xkZXJOYW1lID0gZm9sZGVyTmFtZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgICAgICAgICBpZiAobG93ZXJGaWxlUGF0aC5zdGFydHNXaXRoKGxvd2VyRm9sZGVyTmFtZSArICcvJykgfHwgbG93ZXJGaWxlUGF0aCA9PT0gbG93ZXJGb2xkZXJOYW1lKSB7XG4gICAgICAgICAgICAgICAgcGFyYUxvY2F0aW9uID0gbG9jYXRpb247XG5cbiAgICAgICAgICAgICAgICAvLyBFeHRyYWN0IHN1YmZvbGRlciBwYXRoIGFmdGVyIHRoZSBQQVJBIHJvb3QgKHVzZSBvcmlnaW5hbCBjYXNlIGZvciBleHRyYWN0aW9uKVxuICAgICAgICAgICAgICAgIGNvbnN0IHJlbWFpbmluZ1BhdGggPSBmaWxlUGF0aC5zdWJzdHJpbmcoZm9sZGVyTmFtZS5sZW5ndGggKyAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXRoUGFydHMgPSByZW1haW5pbmdQYXRoLnNwbGl0KCcvJyk7XG5cbiAgICAgICAgICAgICAgICAvLyBJZiB0aGVyZSBhcmUgc3ViZm9sZGVycyAobm90IGp1c3QgdGhlIGZpbGVuYW1lKSwgYWRkIHRoZW0gYXMgdGFnc1xuICAgICAgICAgICAgICAgIGlmIChwYXRoUGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaXJzdCBzdWJmb2xkZXIgYmVjb21lcyBhIHRhZyAobG93ZXJjYXNlLCBubyBzcGFjZXMpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1YmZvbGRlciA9IHBhdGhQYXJ0c1swXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN1YmZvbGRlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ29udmVydCB0byBsb3dlcmNhc2Uga2ViYWItY2FzZVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ViZm9sZGVyVGFnID0gc3ViZm9sZGVyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxzKy9nLCAnLScpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1teYS16MC05XFwtXS9nLCAnJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdWJmb2xkZXJUYWcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJmb2xkZXJUYWdzLnB1c2goc3ViZm9sZGVyVGFnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHsgcGFyYUxvY2F0aW9uLCBzdWJmb2xkZXJUYWdzIH07XG4gICAgfVxuXG4gICAgYXN5bmMgdXBkYXRlUGFyYVRhZ3MoZmlsZSkge1xuICAgICAgICBpZiAoIWZpbGUpIHJldHVybjtcblxuICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGZpbGUucGF0aDtcbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgndGFnZ2luZzp1cGRhdGUnKTtcbiAgICAgICAgY29uc3QgY29udGV4dCA9IHsgcGF0aDogZmlsZVBhdGggfTtcblxuICAgICAgICAvLyBTa2lwIGZpbGVzIGluIFRFTVBMQVRFUyBmb2xkZXIgLSB0ZW1wbGF0ZXMgc2hvdWxkbid0IGdldCBQQVJBIHByb3BlcnRpZXNcbiAgICAgICAgaWYgKGZpbGVQYXRoLmluY2x1ZGVzKCcvVEVNUExBVEVTLycpIHx8IGZpbGVQYXRoLnN0YXJ0c1dpdGgoJ1RFTVBMQVRFUy8nKSkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ1F1aWNrIFBBUkE6IFNraXBwaW5nIHRlbXBsYXRlIGZpbGU6JywgZmlsZVBhdGgpO1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uaW5jcmVtZW50KCd0YWdnaW5nOnNraXA6dGVtcGxhdGVzJyk7XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQodGltZXIsIHsgLi4uY29udGV4dCwgcmVhc29uOiAndGVtcGxhdGUnIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIFBBUkEgbG9jYXRpb24gYW5kIHN1YmZvbGRlciB0YWdzXG4gICAgICAgIGNvbnN0IHsgcGFyYUxvY2F0aW9uLCBzdWJmb2xkZXJUYWdzIH0gPSB0aGlzLmdldFRhZ3NGcm9tUGF0aChmaWxlUGF0aCk7XG5cbiAgICAgICAgLy8gSWYgZmlsZSBpcyBub3QgaW4gYSBQQVJBIGZvbGRlciwgc2tpcFxuICAgICAgICBpZiAoIXBhcmFMb2NhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uaW5jcmVtZW50KCd0YWdnaW5nOnNraXA6bm9uLXBhcmEnKTtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyAuLi5jb250ZXh0LCByZWFzb246ICdvdXRzaWRlLXBhcmEnIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGNyZWF0ZWREYXRlID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFVzZSBjYWNoZWQgc3RhdCBmaXJzdDsgZmFsbCBiYWNrIHRvIGFkYXB0ZXIuc3RhdCB3aGljaCBpcyBhc3luY1xuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZpbGUuc3RhdCA/PyBhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLnN0YXQoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIGlmIChzdGF0Py5jdGltZSkge1xuICAgICAgICAgICAgICAgIGNyZWF0ZWREYXRlID0gbmV3IERhdGUoc3RhdC5jdGltZSkudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChzdGF0RXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1F1aWNrIFBBUkE6IEZhaWxlZCB0byByZWFkIGZpbGUgc3RhdCBkYXRhJywgc3RhdEVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGFyY2hpdmVEYXRlID0gcGFyYUxvY2F0aW9uID09PSAnYXJjaGl2ZSdcbiAgICAgICAgICAgID8gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF1cbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBmcm9udG1hdHRlclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvY2Vzc0Zyb250TWF0dGVyKGZpbGUsIChmcm9udG1hdHRlcikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJhd1RhZ3MgPSBBcnJheS5pc0FycmF5KGZyb250bWF0dGVyLnRhZ3MpXG4gICAgICAgICAgICAgICAgICAgID8gZnJvbnRtYXR0ZXIudGFncy5tYXAodGFnID0+IHRhZy50b1N0cmluZygpKVxuICAgICAgICAgICAgICAgICAgICA6IGZyb250bWF0dGVyLnRhZ3NcbiAgICAgICAgICAgICAgICAgICAgICAgID8gW2Zyb250bWF0dGVyLnRhZ3MudG9TdHJpbmcoKV1cbiAgICAgICAgICAgICAgICAgICAgICAgIDogW107XG5cbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgb2xkIFBBUkEgdGFncyAoaW4gY2FzZSB0aGV5IGV4aXN0IGZyb20gb2xkIHBsdWdpbiB2ZXJzaW9uKVxuICAgICAgICAgICAgICAgIC8vIEtlZXAgYWxsIG90aGVyIHRhZ3MgKGluY2x1ZGluZyBzdWJmb2xkZXIgdGFncyBmcm9tIHByZXZpb3VzIGxvY2F0aW9ucylcbiAgICAgICAgICAgICAgICBsZXQgZmlsdGVyZWRUYWdzID0gcmF3VGFncy5maWx0ZXIodGFnID0+ICF0YWcuc3RhcnRzV2l0aCgncGFyYS8nKSk7XG5cbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgdGVtcGxhdGUtc3BlY2lmaWMgdGFncyB0aGF0IHNob3VsZG4ndCBwcm9wYWdhdGVcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZFRhZ3MgPSBmaWx0ZXJlZFRhZ3MuZmlsdGVyKHRhZyA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhZ1N0ciA9IFN0cmluZyh0YWcpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0YWdTdHIgIT09ICd0ZW1wbGF0ZXMnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB0YWdTdHIgIT09ICd0ZW1wbGF0ZScgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhZ1N0ciAhPT0gJ3Jlc291cmNlcycgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhZ1N0ciAhPT0gJ2FsbCc7ICAvLyBXZSdsbCByZS1hZGQgJ2FsbCcgbGF0ZXJcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vIE9wdGlvbmFsbHkgbWlncmF0ZSBvbGQgdGFnc1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNldHRpbmdzLnRhZ2dpbmcubWlncmF0ZU9sZFRhZ3MpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTWlncmF0aW9uIGFscmVhZHkgaGFwcGVucyBhYm92ZSBieSByZW1vdmluZyBwYXJhLyogdGFnc1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnUXVpY2sgUEFSQTogTWlncmF0ZWQgb2xkIHBhcmEvKiB0YWdzJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQnVpbGQgbmV3IHRhZyBsaXN0XG4gICAgICAgICAgICAgICAgY29uc3QgbmV4dFRhZ3MgPSBBcnJheS5mcm9tKG5ldyBTZXQoZmlsdGVyZWRUYWdzKSk7XG5cbiAgICAgICAgICAgICAgICAvLyBBZGQgc3ViZm9sZGVyIHRhZ3MgKHRoZXNlIHBlcnNpc3QgZXZlbiBhZnRlciBtb3ZpbmcsIGlmIGVuYWJsZWQpXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MudGFnZ2luZy5wZXJzaXN0U3ViZm9sZGVyVGFncykge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHN1YmZvbGRlclRhZyBvZiBzdWJmb2xkZXJUYWdzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5leHRUYWdzLmluY2x1ZGVzKHN1YmZvbGRlclRhZykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXh0VGFncy5wdXNoKHN1YmZvbGRlclRhZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBbHdheXMgaW5jbHVkZSAnYWxsJyB0YWcgZmlyc3RcbiAgICAgICAgICAgICAgICBmcm9udG1hdHRlci50YWdzID0gWydhbGwnLCAuLi5uZXh0VGFnc107XG5cbiAgICAgICAgICAgICAgICAvLyBTZXQgUEFSQSBsb2NhdGlvbiBhcyBhIHByb3BlcnR5IChjb25maWd1cmFibGUgbmFtZSlcbiAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0eU5hbWUgPSB0aGlzLnNldHRpbmdzLnRhZ2dpbmcucHJvcGVydHlOYW1lIHx8ICdwYXJhJztcbiAgICAgICAgICAgICAgICBmcm9udG1hdHRlcltwcm9wZXJ0eU5hbWVdID0gcGFyYUxvY2F0aW9uO1xuXG4gICAgICAgICAgICAgICAgLy8gQWRkIGFyY2hpdmVkIGRhdGUgaWYgbW92aW5nIHRvIGFyY2hpdmVcbiAgICAgICAgICAgICAgICBpZiAoYXJjaGl2ZURhdGUgJiYgIWZyb250bWF0dGVyLmFyY2hpdmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGZyb250bWF0dGVyLmFyY2hpdmVkID0gYXJjaGl2ZURhdGU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQWRkIGNyZWF0ZWQgZGF0ZSBpZiBtaXNzaW5nXG4gICAgICAgICAgICAgICAgaWYgKCFmcm9udG1hdHRlci5jcmVhdGVkICYmIGNyZWF0ZWREYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIGZyb250bWF0dGVyLmNyZWF0ZWQgPSBjcmVhdGVkRGF0ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gT25seSBsb2cgaW4gdmVyYm9zZSBtb2RlIG9yIHdoZW4gcHJvZmlsaW5nXG4gICAgICAgICAgICBpZiAodGhpcy5wcm9maWxlcj8uaXNFbmFibGVkKCkgfHwgdGhpcy5zZXR0aW5ncy5kZWJ1Zz8udmVyYm9zZUxvZ2dpbmcpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgUXVpY2sgUEFSQTogVXBkYXRlZCB0YWdzIGZvciAke2ZpbGUubmFtZX0gLSBQQVJBOiAke3BhcmFMb2NhdGlvbn0sIFN1YmZvbGRlcnM6ICR7c3ViZm9sZGVyVGFncy5qb2luKCcsICcpfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uaW5jcmVtZW50KCd0YWdnaW5nOnVwZGF0ZWQnKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHVwZGF0aW5nIFBBUkEgdGFnczonLCBlcnJvcik7XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5pbmNyZW1lbnQoJ3RhZ2dpbmc6ZXJyb3JzJyk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQodGltZXIsIHsgLi4uY29udGV4dCwgcGFyYUxvY2F0aW9uIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXN5bmMgYnVsa1VwZGF0ZVRhZ3MocHJldmlldyA9IHRydWUpIHtcbiAgICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCk7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ3RhZ2dpbmc6YnVsay11cGRhdGUnKTtcbiAgICAgICAgbGV0IHVwZGF0ZWQgPSAwO1xuICAgICAgICBsZXQgc2tpcHBlZCA9IDA7XG4gICAgICAgIGNvbnN0IGVycm9ycyA9IFtdO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAocHJldmlldykge1xuICAgICAgICAgICAgICAgIC8vIFRPRE86IEltcGxlbWVudCBwcmV2aWV3IG1vZGVcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBQcmV2aWV3IG1vZGUgbm90IHlldCBpbXBsZW1lbnRlZC4gV2lsbCB1cGRhdGUgJHtmaWxlcy5sZW5ndGh9IGZpbGVzLmApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBVcGRhdGluZyBQQVJBIHRhZ3MgZm9yICR7ZmlsZXMubGVuZ3RofSBmaWxlcy4uLmApO1xuXG4gICAgICAgICAgICAvLyBQcm9jZXNzIGZpbGVzIGluIGJhdGNoZXMgZm9yIGJldHRlciBwZXJmb3JtYW5jZVxuICAgICAgICAgICAgY29uc3QgQkFUQ0hfU0laRSA9IDUwOyAvLyBQcm9jZXNzIDUwIGZpbGVzIGNvbmN1cnJlbnRseVxuICAgICAgICAgICAgY29uc3QgYmF0Y2hlcyA9IFtdO1xuXG4gICAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGZpbGVzLmxlbmd0aDsgaSArPSBCQVRDSF9TSVpFKSB7XG4gICAgICAgICAgICAgICAgYmF0Y2hlcy5wdXNoKGZpbGVzLnNsaWNlKGksIGkgKyBCQVRDSF9TSVpFKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFByb2Nlc3MgZWFjaCBiYXRjaFxuICAgICAgICAgICAgZm9yIChsZXQgYmF0Y2hJbmRleCA9IDA7IGJhdGNoSW5kZXggPCBiYXRjaGVzLmxlbmd0aDsgYmF0Y2hJbmRleCsrKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgYmF0Y2ggPSBiYXRjaGVzW2JhdGNoSW5kZXhdO1xuXG4gICAgICAgICAgICAgICAgLy8gU2hvdyBwcm9ncmVzcyBmb3IgbGFyZ2Ugb3BlcmF0aW9uc1xuICAgICAgICAgICAgICAgIGlmIChmaWxlcy5sZW5ndGggPiAxMDAgJiYgYmF0Y2hJbmRleCAlIDUgPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvZ3Jlc3MgPSBNYXRoLnJvdW5kKChiYXRjaEluZGV4IC8gYmF0Y2hlcy5sZW5ndGgpICogMTAwKTtcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZShgUHJvZ3Jlc3M6ICR7cHJvZ3Jlc3N9JSAoJHtiYXRjaEluZGV4ICogQkFUQ0hfU0laRX0vJHtmaWxlcy5sZW5ndGh9IGZpbGVzKWAsIDIwMDApO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIFByb2Nlc3MgYmF0Y2ggaW4gcGFyYWxsZWxcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGxTZXR0bGVkKFxuICAgICAgICAgICAgICAgICAgICBiYXRjaC5tYXAoYXN5bmMgKGZpbGUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVQYXJhVGFncyhmaWxlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBzdWNjZXNzOiB0cnVlLCBmaWxlOiBmaWxlLm5hbWUgfTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3VjY2VzczogZmFsc2UsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZpbGU6IGZpbGUubmFtZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3I6IGVycm9yLm1lc3NhZ2VcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgICAgICAvLyBDb3VudCByZXN1bHRzXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCByZXN1bHQgb2YgcmVzdWx0cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ2Z1bGZpbGxlZCcgJiYgcmVzdWx0LnZhbHVlLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHVwZGF0ZWQrKztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiAhcmVzdWx0LnZhbHVlLnN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVycm9ycy5wdXNoKHJlc3VsdC52YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAocmVzdWx0LnN0YXR1cyA9PT0gJ3JlamVjdGVkJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JzLnB1c2goeyBmaWxlOiAndW5rbm93bicsIGVycm9yOiByZXN1bHQucmVhc29uIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBTaG93IGZpbmFsIHN1bW1hcnlcbiAgICAgICAgICAgIGxldCBtZXNzYWdlID0gYFVwZGF0ZWQgUEFSQSB0YWdzIGZvciAke3VwZGF0ZWR9IGZpbGVzIWA7XG4gICAgICAgICAgICBpZiAoZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBtZXNzYWdlICs9IGAgKCR7ZXJyb3JzLmxlbmd0aH0gZXJyb3JzKWA7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcignUXVpY2sgUEFSQTogQnVsayB1cGRhdGUgZXJyb3JzOicsIGVycm9ycyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBuZXcgTm90aWNlKG1lc3NhZ2UpO1xuXG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQodGltZXIsIHtcbiAgICAgICAgICAgICAgICB0b3RhbEZpbGVzOiBmaWxlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgdXBkYXRlZCxcbiAgICAgICAgICAgICAgICBza2lwcGVkLFxuICAgICAgICAgICAgICAgIGVycm9yczogZXJyb3JzLmxlbmd0aFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhc3luYyBtaWdyYXRlT2xkVGFncygpIHtcbiAgICAgICAgLy8gRW5hYmxlIG1pZ3JhdGlvbiBzZXR0aW5nXG4gICAgICAgIHRoaXMuc2V0dGluZ3MudGFnZ2luZy5taWdyYXRlT2xkVGFncyA9IHRydWU7XG5cbiAgICAgICAgLy8gUnVuIGJ1bGsgdXBkYXRlXG4gICAgICAgIGF3YWl0IHRoaXMuYnVsa1VwZGF0ZVRhZ3MoZmFsc2UpO1xuXG4gICAgICAgIC8vIERpc2FibGUgbWlncmF0aW9uIHNldHRpbmdcbiAgICAgICAgdGhpcy5zZXR0aW5ncy50YWdnaW5nLm1pZ3JhdGVPbGRUYWdzID0gZmFsc2U7XG5cbiAgICAgICAgbmV3IE5vdGljZSgnTWlncmF0aW9uIGNvbXBsZXRlISBPbGQgcGFyYS8qIHRhZ3MgaGF2ZSBiZWVuIGNvbnZlcnRlZCB0byBwcm9wZXJ0aWVzLicpO1xuICAgIH1cblxuICAgIGFzeW5jIGNsZWFuVGVtcGxhdGVGaWxlcygpIHtcbiAgICAgICAgLy8gRmluZCBhbGwgZmlsZXMgaW4gVEVNUExBVEVTIGZvbGRlcnNcbiAgICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkuZmlsdGVyKGYgPT5cbiAgICAgICAgICAgIGYucGF0aC5pbmNsdWRlcygnL1RFTVBMQVRFUy8nKSB8fCBmLnBhdGguc3RhcnRzV2l0aCgnVEVNUExBVEVTLycpXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGZpbGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgbmV3IE5vdGljZSgnTm8gdGVtcGxhdGUgZmlsZXMgZm91bmQgdG8gY2xlYW4uJyk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBuZXcgTm90aWNlKGBDbGVhbmluZyAke2ZpbGVzLmxlbmd0aH0gdGVtcGxhdGUgZmlsZXMuLi5gKTtcbiAgICAgICAgbGV0IGNsZWFuZWQgPSAwO1xuXG4gICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC5maWxlTWFuYWdlci5wcm9jZXNzRnJvbnRNYXR0ZXIoZmlsZSwgKGZyb250bWF0dGVyKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGxldCBtb2RpZmllZCA9IGZhbHNlO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBwYXJhIHByb3BlcnR5XG4gICAgICAgICAgICAgICAgICAgIGlmIChmcm9udG1hdHRlci5wYXJhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgZnJvbnRtYXR0ZXIucGFyYTtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBwYXJhLyogdGFnc1xuICAgICAgICAgICAgICAgICAgICBpZiAoZnJvbnRtYXR0ZXIudGFncykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcmF3VGFncyA9IEFycmF5LmlzQXJyYXkoZnJvbnRtYXR0ZXIudGFncylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA/IGZyb250bWF0dGVyLnRhZ3NcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IFtmcm9udG1hdHRlci50YWdzXTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY2xlYW5lZFRhZ3MgPSByYXdUYWdzLmZpbHRlcih0YWcgPT4gIVN0cmluZyh0YWcpLnN0YXJ0c1dpdGgoJ3BhcmEvJykpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoY2xlYW5lZFRhZ3MubGVuZ3RoICE9PSByYXdUYWdzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZyb250bWF0dGVyLnRhZ3MgPSBjbGVhbmVkVGFncztcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBSZW1vdmUgYXJjaGl2ZWQgZGF0ZSAodGVtcGxhdGVzIHNob3VsZG4ndCBoYXZlIHRoaXMpXG4gICAgICAgICAgICAgICAgICAgIGlmIChmcm9udG1hdHRlci5hcmNoaXZlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGZyb250bWF0dGVyLmFyY2hpdmVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKG1vZGlmaWVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjbGVhbmVkKys7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhgUXVpY2sgUEFSQTogQ2xlYW5lZCB0ZW1wbGF0ZSBmaWxlOiAke2ZpbGUucGF0aH1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBjbGVhbmluZyB0ZW1wbGF0ZSAke2ZpbGUucGF0aH06YCwgZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbmV3IE5vdGljZShgQ2xlYW5lZCAke2NsZWFuZWR9IHRlbXBsYXRlIGZpbGVzIWApO1xuICAgIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVEVNUExBVEUgTUFOQUdFUlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jbGFzcyBUZW1wbGF0ZU1hbmFnZXIge1xuICAgIGNvbnN0cnVjdG9yKGFwcCwgc2V0dGluZ3MsIHByb2ZpbGVyKSB7XG4gICAgICAgIHRoaXMuYXBwID0gYXBwO1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgIHRoaXMucHJvZmlsZXIgPSBwcm9maWxlcjtcblxuICAgICAgICAvLyBFbWJlZGRlZCB0ZW1wbGF0ZXMgLSB0aGVzZSB3aWxsIGJlIGRlcGxveWVkIHRvIHRoZSB2YXVsdFxuICAgICAgICB0aGlzLnRlbXBsYXRlcyA9IHtcbiAgICAgICAgICAgICdkZWZhdWx0LXRlbXBsYXRlLm1kJzogYC0tLVxudGFnczpcbiAgLSBhbGxcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG4tLS1cblxuIyMgXHVEODNEXHVEREQyIFRhc2tzIGluIHRoaXMgbm90ZVxuXFxgXFxgXFxgdGFza3NcbnBhdGggaW5jbHVkZXMge3txdWVyeS5maWxlLnBhdGh9fVxubm90IGRvbmVcbnNvcnQgYnkgZHVlXG5zb3J0IGJ5IHByaW9yaXR5XG5cblxuXFxgXFxgXFxgXG5cbi0tLVxuIyMgUmVzb3VyY2VzXG4qQWRkIGxpbmtzIHRvIGZyZXF1ZW50IHJlZmVyZW5jZSBvciB3b3JraW5nIGRvY3VtZW50cypcblxuXG5cblxuLS0tXG4jIyBOb3Rlc1xuKlRvIGRvIGl0ZW1zIHdpbGwgYWxsIGJlIGNvbGxlY3RlZCBhdCB0aGUgdG9wIG9mIHRoZSBub3RlLipcbi0gWyBdIFN0YXJ0IG5vdGVzXG4tIFsgXVxuXG5cbmAsXG4gICAgICAgICAgICAnaW5ib3gtdGVtcGxhdGUubWQnOiBgLS0tXG50YWdzOlxuICAtIGFsbFxuY3JlYXRlZDogPCUgdHAuZmlsZS5jcmVhdGlvbl9kYXRlKCkgJT5cbi0tLVxuXG4jIyBcdUQ4M0RcdURERDIgVGFza3MgaW4gdGhpcyBub3RlXG5cXGBcXGBcXGB0YXNrc1xucGF0aCBpbmNsdWRlcyB7e3F1ZXJ5LmZpbGUucGF0aH19XG5ub3QgZG9uZVxuc29ydCBieSBkdWVcbnNvcnQgYnkgcHJpb3JpdHlcblxuXG5cXGBcXGBcXGBcblxuLS0tXG4jIyBSZXNvdXJjZXNcbipBZGQgbGlua3MgdG8gZnJlcXVlbnQgcmVmZXJlbmNlIG9yIHdvcmtpbmcgZG9jdW1lbnRzKlxuXG5cblxuXG4tLS1cbiMjIE5vdGVzXG4qVG8gZG8gaXRlbXMgd2lsbCBhbGwgYmUgY29sbGVjdGVkIGF0IHRoZSB0b3Agb2YgdGhlIG5vdGUuKlxuLSBbIF0gU3RhcnQgbm90ZXNcbi0gWyBdXG5gLFxuICAgICAgICAgICAgJ3Byb2plY3RzLXRlbXBsYXRlLm1kJzogYC0tLVxudGFnczpcbiAgLSBhbGxcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG4tLS1cblxuIyMgXHVEODNEXHVEREQyIFRhc2tzIGluIHRoaXMgbm90ZVxuXFxgXFxgXFxgdGFza3NcbnBhdGggaW5jbHVkZXMge3txdWVyeS5maWxlLnBhdGh9fVxubm90IGRvbmVcbnNvcnQgYnkgZHVlXG5zb3J0IGJ5IHByaW9yaXR5XG5cblxuXFxgXFxgXFxgXG5cbi0tLVxuIyMgUmVzb3VyY2VzXG4qQWRkIGxpbmtzIHRvIGZyZXF1ZW50IHJlZmVyZW5jZSBvciB3b3JraW5nIGRvY3VtZW50cypcblxuXG5cblxuLS0tXG4jIyBOb3Rlc1xuKlRvIGRvIGl0ZW1zIHdpbGwgYWxsIGJlIGNvbGxlY3RlZCBhdCB0aGUgdG9wIG9mIHRoZSBub3RlLipcbi0gWyBdIFN0YXJ0IG5vdGVzXG4tIFsgXVxuYCxcbiAgICAgICAgICAgICdhcmVhcy10ZW1wbGF0ZS5tZCc6IGAtLS1cbnRhZ3M6XG4gIC0gYWxsXG5jcmVhdGVkOiA8JSB0cC5maWxlLmNyZWF0aW9uX2RhdGUoKSAlPlxuLS0tXG5cbiMjIFx1RDgzRFx1REREMiBUYXNrcyBpbiB0aGlzIG5vdGVcblxcYFxcYFxcYHRhc2tzXG5wYXRoIGluY2x1ZGVzIHt7cXVlcnkuZmlsZS5wYXRofX1cbm5vdCBkb25lXG5zb3J0IGJ5IGR1ZVxuc29ydCBieSBwcmlvcml0eVxuXG5cblxcYFxcYFxcYFxuXG4tLS1cbiMjIFJlc291cmNlc1xuKkFkZCBsaW5rcyB0byBmcmVxdWVudCByZWZlcmVuY2Ugb3Igd29ya2luZyBkb2N1bWVudHMqXG5cblxuXG5cbi0tLVxuIyMgTm90ZXNcbipUbyBkbyBpdGVtcyB3aWxsIGFsbCBiZSBjb2xsZWN0ZWQgYXQgdGhlIHRvcCBvZiB0aGUgbm90ZS4qXG4tIFsgXSBTdGFydCBub3Rlc1xuLSBbIF1cbmAsXG4gICAgICAgICAgICAncmVzb3VyY2VzLXRlbXBsYXRlLm1kJzogYC0tLVxudGFnczpcbiAgLSBhbGxcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG4tLS1cblxuIyMgXHVEODNEXHVEREQyIFRhc2tzIGluIHRoaXMgbm90ZVxuXFxgXFxgXFxgdGFza3NcbnBhdGggaW5jbHVkZXMge3txdWVyeS5maWxlLnBhdGh9fVxubm90IGRvbmVcbnNvcnQgYnkgZHVlXG5zb3J0IGJ5IHByaW9yaXR5XG5cblxuXFxgXFxgXFxgXG5cbi0tLVxuIyMgUmVzb3VyY2VzXG4qQWRkIGxpbmtzIHRvIGZyZXF1ZW50IHJlZmVyZW5jZSBvciB3b3JraW5nIGRvY3VtZW50cypcblxuXG5cblxuLS0tXG4jIyBOb3Rlc1xuKlRvIGRvIGl0ZW1zIHdpbGwgYWxsIGJlIGNvbGxlY3RlZCBhdCB0aGUgdG9wIG9mIHRoZSBub3RlLipcbi0gWyBdIFN0YXJ0IG5vdGVzXG4tIFsgXVxuYCxcbiAgICAgICAgICAgICdhcmNoaXZlLXRlbXBsYXRlLm1kJzogYC0tLVxudGFnczpcbiAgLSBhbGxcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG5hcmNoaXZlZDogPCUgdHAuZmlsZS5jcmVhdGlvbl9kYXRlKCkgJT5cbi0tLVxuXG4jIyBcdUQ4M0RcdURERDIgVGFza3MgaW4gdGhpcyBub3RlXG5cXGBcXGBcXGB0YXNrc1xucGF0aCBpbmNsdWRlcyB7e3F1ZXJ5LmZpbGUucGF0aH19XG5ub3QgZG9uZVxuc29ydCBieSBkdWVcbnNvcnQgYnkgcHJpb3JpdHlcblxuXG5cXGBcXGBcXGBcblxuLS0tXG4jIyBSZXNvdXJjZXNcbipBZGQgbGlua3MgdG8gZnJlcXVlbnQgcmVmZXJlbmNlIG9yIHdvcmtpbmcgZG9jdW1lbnRzKlxuXG5cblxuXG4tLS1cbiMjIE5vdGVzXG4qVG8gZG8gaXRlbXMgd2lsbCBhbGwgYmUgY29sbGVjdGVkIGF0IHRoZSB0b3Agb2YgdGhlIG5vdGUuKlxuLSBbIF0gU3RhcnQgbm90ZXNcbi0gWyBdXG5cbmAsXG4gICAgICAgICAgICAnUHJvamVjdCBEYXNoYm9hcmQubWQnOiBgLS0tXG5rYW5iYW4tcGx1Z2luOiBib2FyZFxudGFnczpcbiAgLSBhbGxcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG4tLS1cblxuIyMgSU5CT1hcblxuXG5cbiMjIEJBQ0tCVVJORVJcblxuXG5cbiMjIE5FWFQgV0VFS1xuXG5cblxuIyMgVEhJUyBXRUVLXG5cblxuXG4jIyBCbG9ja2VkXG5cblxuXG4jIyBUT01PUlJPV1xuXG5cblxuIyMgVE9EQVlcblxuLSBbIF0gIyMjIFtbRGFpbHkgYW5kIFdlZWtseSBUYXNrc11dIFx1MjAxNCBkbyB0aGVzZSBUT0RBWSFcblxuXFxgXFxgXFxgdGFza3NcbnBhdGggaW5jbHVkZXMgRGFpbHkgYW5kIFdlZWtseSBUYXNrc1xubm90IGRvbmVcbihkdWUgdG9kYXkpIE9SIChkdWUgYmVmb3JlIHRvbW9ycm93KVxuaGlkZSByZWN1cnJlbmNlIHJ1bGVcbmhpZGUgZWRpdCBidXR0b25cbnNvcnQgYnkgZGVzY3JpcHRpb25cblxcYFxcYFxcYFxuXG5cbiMjIERvaW5nXG5cblxuXG4jIyBEb25lXG5cbioqQ29tcGxldGUqKlxuXG5gLFxuICAgICAgICAgICAgJ1BBUkEgTWV0aG9kIE92ZXJ2aWV3Lm1kJzogYC0tLVxudGFnczpcbiAgLSBhbGxcbiAgLSBwYXJhLW1ldGhvZG9sb2d5XG5jcmVhdGVkOiA8JSB0cC5maWxlLmNyZWF0aW9uX2RhdGUoKSAlPlxucGFyYTogcmVzb3VyY2VzXG4tLS1cblxuIyBQQVJBIE1ldGhvZCBPdmVydmlld1xuXG5XZWxjb21lIHRvIHlvdXIgUEFSQS1vcmdhbml6ZWQgdmF1bHQhIFRoaXMgbm90ZSBleHBsYWlucyB0aGUgUEFSQSBtZXRob2QgYW5kIGhvdyB0aGUgUXVpY2sgUEFSQSBwbHVnaW4gaW1wbGVtZW50cyBpdC5cblxuIyMgV2hhdCBpcyBQQVJBP1xuXG5QQVJBIGlzIGFuIG9yZ2FuaXphdGlvbmFsIHN5c3RlbSBjcmVhdGVkIGJ5IFRpYWdvIEZvcnRlIHRoYXQgZGl2aWRlcyBhbGwgaW5mb3JtYXRpb24gaW50byBmb3VyIGNhdGVnb3JpZXMgYmFzZWQgb24gKiphY3Rpb25hYmlsaXR5KiogYW5kICoqdGltZSBob3Jpem9uKiouXG5cbiMjIyBUaGUgRm91ciBDYXRlZ29yaWVzXG5cbiMjIyMgXHVEODNEXHVEQ0U1ICoqUHJvamVjdHMqKiAoXFxgMSAtIFBST0pFQ1RTXFxgKVxuKipEZWZpbml0aW9uKio6IFNob3J0LXRlcm0gZWZmb3J0cyB3aXRoIGEgc3BlY2lmaWMgZ29hbCBhbmQgZGVhZGxpbmUuXG5cbioqQ2hhcmFjdGVyaXN0aWNzKio6XG4tIEhhcyBhIGNsZWFyIGVuZCBzdGF0ZSBvciBkZWxpdmVyYWJsZVxuLSBUaW1lLWJvdW5kIChkZWFkbGluZSBvciB0YXJnZXQgZGF0ZSlcbi0gUmVxdWlyZXMgbXVsdGlwbGUgc3RlcHMgdG8gY29tcGxldGVcbi0gQWN0aXZlIHdvcmsgaW4gcHJvZ3Jlc3NcblxuKipFeGFtcGxlcyoqOlxuLSBQbGFuIFE0IG1hcmtldGluZyBjYW1wYWlnblxuLSBXcml0ZSBhbm51YWwgcmVwb3J0XG4tIE9yZ2FuaXplIHRlYW0gb2Zmc2l0ZVxuLSBMYXVuY2ggbmV3IHdlYnNpdGUgZmVhdHVyZVxuXG4qKlF1aWNrIFBBUkEgQmVoYXZpb3IqKjpcbi0gTm90ZXMgaW4gUHJvamVjdHMgZ2V0IFxcYHBhcmE6IHByb2plY3RzXFxgIHByb3BlcnR5XG4tIFN1YmZvbGRlciBuYW1lcyBiZWNvbWUgcGVyc2lzdGVudCB0YWdzIChlLmcuLCBcXGBwYnN3aVxcYCwgXFxgcGVyc29uYWxcXGApXG4tIFdoZW4gbW92ZWQgdG8gQXJjaGl2ZSwgcHJvamVjdHMgZ2V0IFxcYGFyY2hpdmVkXFxgIGRhdGUgcHJvcGVydHlcblxuLS0tXG5cbiMjIyMgXHVEODNDXHVERkFGICoqQXJlYXMqKiAoXFxgMiAtIEFSRUFTXFxgKVxuKipEZWZpbml0aW9uKio6IE9uZ29pbmcgcmVzcG9uc2liaWxpdGllcyB0aGF0IHJlcXVpcmUgcmVndWxhciBhdHRlbnRpb24gYnV0IGhhdmUgbm8gZW5kIGRhdGUuXG5cbioqQ2hhcmFjdGVyaXN0aWNzKio6XG4tIE5vIGRlZmluZWQgZW5kcG9pbnQgLSBjb250aW51ZXMgaW5kZWZpbml0ZWx5XG4tIFN0YW5kYXJkcyB0byBtYWludGFpbiByYXRoZXIgdGhhbiBnb2FscyB0byBhY2hpZXZlXG4tIFJlcXVpcmVzIGNvbnNpc3RlbnQsIHJlY3VycmluZyBhdHRlbnRpb25cbi0gU3VjY2VzcyA9IG1haW50YWluaW5nIGEgc3RhbmRhcmQgb3ZlciB0aW1lXG5cbioqRXhhbXBsZXMqKjpcbi0gSGVhbHRoICYgZml0bmVzc1xuLSBQcm9mZXNzaW9uYWwgZGV2ZWxvcG1lbnRcbi0gVGVhbSBtYW5hZ2VtZW50XG4tIEZpbmFuY2lhbCBwbGFubmluZ1xuLSBSZWxhdGlvbnNoaXBzXG5cbioqUXVpY2sgUEFSQSBCZWhhdmlvcioqOlxuLSBOb3RlcyBpbiBBcmVhcyBnZXQgXFxgcGFyYTogYXJlYXNcXGAgcHJvcGVydHlcbi0gQXJlYXMgcmVwcmVzZW50IGxvbmctdGVybSBjb21taXRtZW50c1xuLSBNb3ZpbmcgYmV0d2VlbiBQcm9qZWN0cyBhbmQgQXJlYXMgY2hhbmdlcyB0aGUgcHJvcGVydHkgYnV0IHByZXNlcnZlcyBjb250ZXh0IHRhZ3NcblxuLS0tXG5cbiMjIyMgXHVEODNEXHVEQ0RBICoqUmVzb3VyY2VzKiogKFxcYDMgLSBSRVNPVVJDRVNcXGApXG4qKkRlZmluaXRpb24qKjogUmVmZXJlbmNlIG1hdGVyaWFscyBhbmQgaW5mb3JtYXRpb24geW91IHdhbnQgdG8ga2VlcCBmb3IgZnV0dXJlIHVzZS5cblxuKipDaGFyYWN0ZXJpc3RpY3MqKjpcbi0gTm90IGN1cnJlbnRseSBhY3Rpb25hYmxlXG4tIFZhbHVhYmxlIGZvciByZWZlcmVuY2Ugb3IgaW5zcGlyYXRpb25cbi0gQ291bGQgYmVjb21lIHJlbGV2YW50IHRvIFByb2plY3RzIG9yIEFyZWFzIGxhdGVyXG4tIE9yZ2FuaXplZCBieSB0b3BpYyBvciB0aGVtZVxuXG4qKkV4YW1wbGVzKio6XG4tIFJlc2VhcmNoIGFydGljbGVzXG4tIFRlbXBsYXRlc1xuLSBIb3ctdG8gZ3VpZGVzXG4tIE1lZXRpbmcgbm90ZXMgYXJjaGl2ZVxuLSBEb2N1bWVudGF0aW9uXG4tIExlYXJuaW5nIG1hdGVyaWFsc1xuXG4qKlF1aWNrIFBBUkEgQmVoYXZpb3IqKjpcbi0gTm90ZXMgaW4gUmVzb3VyY2VzIGdldCBcXGBwYXJhOiByZXNvdXJjZXNcXGAgcHJvcGVydHlcbi0gVGVtcGxhdGVzIHN0b3JlZCBpbiBcXGBURU1QTEFURVMvXFxgIHN1YmZvbGRlciBhcmUgZXhjbHVkZWQgZnJvbSBhdXRvLXRhZ2dpbmdcbi0gVGhpcyBpcyB3aGVyZSB5b3Uga2VlcCByZXVzYWJsZSBhc3NldHNcblxuLS0tXG5cbiMjIyMgXHVEODNEXHVEQ0U2ICoqQXJjaGl2ZSoqIChcXGA0IC0gQVJDSElWRVxcYClcbioqRGVmaW5pdGlvbioqOiBDb21wbGV0ZWQgcHJvamVjdHMgYW5kIGluYWN0aXZlIGl0ZW1zIGZyb20gb3RoZXIgY2F0ZWdvcmllcy5cblxuKipDaGFyYWN0ZXJpc3RpY3MqKjpcbi0gTm8gbG9uZ2VyIGFjdGl2ZSBvciByZWxldmFudFxuLSBLZXB0IGZvciBoaXN0b3JpY2FsIHJlZmVyZW5jZVxuLSBPdXQgb2Ygc2lnaHQgYnV0IHJldHJpZXZhYmxlIGlmIG5lZWRlZFxuLSBPcmdhbml6ZWQgYnkgb3JpZ2luYWwgY2F0ZWdvcnlcblxuKipFeGFtcGxlcyoqOlxuLSBDb21wbGV0ZWQgcHJvamVjdHNcbi0gT2xkIGFyZWFzIHlvdSdyZSBubyBsb25nZXIgcmVzcG9uc2libGUgZm9yXG4tIE91dGRhdGVkIHJlc291cmNlc1xuLSBQYXN0IG1lZXRpbmcgbm90ZXNcblxuKipRdWljayBQQVJBIEJlaGF2aW9yKio6XG4tIE5vdGVzIG1vdmVkIHRvIEFyY2hpdmUgZ2V0IFxcYHBhcmE6IGFyY2hpdmVcXGAgcHJvcGVydHlcbi0gQXV0b21hdGljYWxseSBhZGRzIFxcYGFyY2hpdmVkOiBZWVlZLU1NLUREXFxgIGRhdGUgcHJvcGVydHlcbi0gUHJldmlvdXMgY29udGV4dCB0YWdzIHBlcnNpc3QgZm9yIHNlYXJjaGFiaWxpdHlcblxuLS0tXG5cbiMjIEhvdyBRdWljayBQQVJBIEltcGxlbWVudHMgVGhpc1xuXG4jIyMgQXV0b21hdGljIFByb3BlcnRpZXNcblxuVGhlIHBsdWdpbiBhdXRvbWF0aWNhbGx5IG1haW50YWlucyBhIFxcYHBhcmFcXGAgcHJvcGVydHkgaW4gZXZlcnkgbm90ZSdzIGZyb250bWF0dGVyIHRoYXQgcmVmbGVjdHMgaXRzIGN1cnJlbnQgUEFSQSBsb2NhdGlvbi5cblxuKipWYWx1ZXMqKjogXFxgaW5ib3hcXGAsIFxcYHByb2plY3RzXFxgLCBcXGBhcmVhc1xcYCwgXFxgcmVzb3VyY2VzXFxgLCBcXGBhcmNoaXZlXFxgXG5cbiMjIyBQZXJzaXN0ZW50IENvbnRleHQgVGFnc1xuXG5BcyBub3RlcyBtb3ZlIGRlZXBlciBpbnRvIHN1YmZvbGRlcnMsIHRoZSBwbHVnaW4gY3JlYXRlcyAqKnBlcnNpc3RlbnQgdGFncyoqIGZyb20gZm9sZGVyIG5hbWVzLlxuXG4qKldoZW4geW91IG1vdmUgdGhpcyBub3RlIHRvIEFyY2hpdmUqKiwgaXQgYmVjb21lczpcbi0gUHJvcGVydHk6IFxcYHBhcmE6IGFyY2hpdmVcXGAgKHVwZGF0ZWQpXG4tIFRhZ3MgcHJlc2VydmUgcHJvamVjdCBjb250ZXh0XG5cblRoaXMgcHJlc2VydmVzIHByb2plY3QgY29udGV4dCBldmVuIGFmdGVyIGFyY2hpdmluZy5cblxuIyMjIFRoZSBJbmJveFxuXG5UaGUgXFxgMCAtIElOQk9YXFxgIGZvbGRlciBpcyBhIHNwZWNpYWwgc3RhZ2luZyBhcmVhOlxuXG4qKlB1cnBvc2UqKjogQ2FwdHVyZSBpZGVhcyBxdWlja2x5IHdpdGhvdXQgZGVjaWRpbmcgd2hlcmUgdGhleSBiZWxvbmdcblxuKipXb3JrZmxvdyoqOlxuMS4gQ3JlYXRlIG5ldyBub3RlcyBpbiBJbmJveFxuMi4gUHJvY2VzcyByZWd1bGFybHkgKGRhaWx5L3dlZWtseSlcbjMuIE1vdmUgdG8gYXBwcm9wcmlhdGUgUEFSQSBjYXRlZ29yeSBvbmNlIHlvdSBrbm93IHdoYXQgaXQgaXNcblxuKipQcm9qZWN0IFVwZGF0ZXMqKjogQXV0b21hdGljIHByb2plY3Qgc3RhdHVzIHJlcG9ydHMgYXJlIGNyZWF0ZWQgaGVyZSBmb3IgcHJvY2Vzc2luZy5cblxuLS0tXG5cbiMjIFBBUkEgV29ya2Zsb3dcblxuIyMjIERhaWx5L1dlZWtseSBQcm9jZXNzaW5nXG5cbioqUmV2aWV3IHlvdXIgSW5ib3gqKjpcbjEuIElkZW50aWZ5IHdoaWNoIGNhdGVnb3J5IGVhY2ggaXRlbSBiZWxvbmdzIHRvXG4yLiBNb3ZlIG5vdGVzIHRvIFByb2plY3RzLCBBcmVhcywgUmVzb3VyY2VzLCBvciBBcmNoaXZlXG4zLiBLZWVwIEluYm94IGFzIGNsb3NlIHRvIGVtcHR5IGFzIHBvc3NpYmxlXG5cbioqVXNlIHRoZSBQcm9qZWN0IERhc2hib2FyZCoqOlxuLSBLYW5iYW4gYm9hcmQgaW4gSW5ib3ggZm9yIHRyYWNraW5nIGFjdGl2ZSB3b3JrXG4tIFZpc3VhbGl6ZSB3aGF0J3MgVE9EQVksIFRPTU9SUk9XLCBUSElTIFdFRUtcbi0gU2VlIEJMT0NLRUQgaXRlbXMgdGhhdCBuZWVkIGF0dGVudGlvblxuXG4tLS1cblxuIyMgTGVhcm5pbmcgTW9yZVxuXG4jIyMgT2ZmaWNpYWwgUEFSQSBSZXNvdXJjZXNcblxuKipUaWFnbyBGb3J0ZSdzIE9yaWdpbmFsIEFydGljbGUqKjpcbmh0dHBzOi8vZm9ydGVsYWJzLmNvbS9ibG9nL3BhcmEvXG5cbioqQnVpbGRpbmcgYSBTZWNvbmQgQnJhaW4qKjpcbkJvb2sgYnkgVGlhZ28gRm9ydGUgY292ZXJpbmcgUEFSQSBhbmQgcGVyc29uYWwga25vd2xlZGdlIG1hbmFnZW1lbnRcbmh0dHBzOi8vd3d3LmJ1aWxkaW5nYXNlY29uZGJyYWluLmNvbS9cblxuKipGb3J0ZSBMYWJzIEJsb2cqKjpcbmh0dHBzOi8vZm9ydGVsYWJzLmNvbS9ibG9nL1xuXG4jIyMgV2l0aGluIFlvdXIgVmF1bHRcblxuKipUZW1wbGF0ZXMqKjogU2VlIFxcYDMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL1xcYCBmb3IgYWxsIGF2YWlsYWJsZSB0ZW1wbGF0ZXNcblxuKipQcm9qZWN0IERhc2hib2FyZCoqOiBFeGFtcGxlIGthbmJhbiBib2FyZCBpbiBcXGAwIC0gSU5CT1gvUHJvamVjdCBEYXNoYm9hcmQubWRcXGBcblxuKipQbHVnaW4gRG9jdW1lbnRhdGlvbioqOiBDaGVjayB0aGUgUXVpY2sgUEFSQSBwbHVnaW4gUkVBRE1FIGZvciB0ZWNobmljYWwgZGV0YWlsc1xuXG4tLS1cblxuKipMYXN0IFVwZGF0ZWQqKjogMjAyNS0xMS0wNVxuKipQbHVnaW4gVmVyc2lvbioqOiAwLjIuMFxuKipNZXRob2QgU291cmNlKio6IEZvcnRlIExhYnMgUEFSQSBTeXN0ZW1cbmBcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMaXN0IGFsbCBhdmFpbGFibGUgdGVtcGxhdGVzXG4gICAgICovXG4gICAgbGlzdEF2YWlsYWJsZVRlbXBsYXRlcygpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMudGVtcGxhdGVzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGVtcGxhdGUgY29udGVudFxuICAgICAqL1xuICAgIGdldFRlbXBsYXRlKHRlbXBsYXRlTmFtZSkge1xuICAgICAgICByZXR1cm4gdGhpcy50ZW1wbGF0ZXNbdGVtcGxhdGVOYW1lXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXBsb3kgYSBzaW5nbGUgdGVtcGxhdGUgdG8gdGhlIHZhdWx0XG4gICAgICogU21hcnQgcmVnZW5lcmF0aW9uOiBPbmx5IGNyZWF0ZXMgbWlzc2luZyBmaWxlcywgbmV2ZXIgb3ZlcndyaXRlcyBleGlzdGluZyB0ZW1wbGF0ZXNcbiAgICAgKi9cbiAgICBhc3luYyBkZXBsb3lUZW1wbGF0ZSh0ZW1wbGF0ZU5hbWUsIGRlc3RpbmF0aW9uKSB7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ3RlbXBsYXRlczpkZXBsb3knKTtcbiAgICAgICAgY29uc3QgY29udGV4dCA9IHsgdGVtcGxhdGVOYW1lLCBkZXN0aW5hdGlvbiB9O1xuICAgICAgICBjb25zdCBjb250ZW50ID0gdGhpcy5nZXRUZW1wbGF0ZSh0ZW1wbGF0ZU5hbWUpO1xuXG4gICAgICAgIGlmICghY29udGVudCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUZW1wbGF0ZSBub3QgZm91bmQ6ICR7dGVtcGxhdGVOYW1lfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRW5zdXJlIGRlc3RpbmF0aW9uIGZvbGRlciBleGlzdHNcbiAgICAgICAgY29uc3QgZm9sZGVyUGF0aCA9IGRlc3RpbmF0aW9uLnN1YnN0cmluZygwLCBkZXN0aW5hdGlvbi5sYXN0SW5kZXhPZignLycpKTtcbiAgICAgICAgaWYgKGZvbGRlclBhdGggJiYgIXRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmb2xkZXJQYXRoKSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKGZvbGRlclBhdGgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgZmlsZSBhbHJlYWR5IGV4aXN0c1xuICAgICAgICBjb25zdCBleGlzdGluZ0ZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZGVzdGluYXRpb24pO1xuXG4gICAgICAgIGxldCByZXN1bHQgPSB7IHN0YXR1czogJ3NraXBwZWQnLCByZWFzb246ICdleGlzdHMnIH07XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmdGaWxlKSB7XG4gICAgICAgICAgICAgICAgLy8gRmlsZSBleGlzdHMgLSBza2lwIHRvIHByZXNlcnZlIHVzZXIgY3VzdG9taXphdGlvbnNcbiAgICAgICAgICAgICAgICByZXN1bHQgPSB7IHN0YXR1czogJ3NraXBwZWQnLCByZWFzb246ICdleGlzdHMnIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEZpbGUgZG9lc24ndCBleGlzdCAtIGNyZWF0ZSBmcm9tIHRlbXBsYXRlXG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKGRlc3RpbmF0aW9uLCBjb250ZW50KTtcbiAgICAgICAgICAgICAgICByZXN1bHQgPSB7IHN0YXR1czogJ2NyZWF0ZWQnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKHRpbWVyLCB7IC4uLmNvbnRleHQsIHN0YXR1czogcmVzdWx0LnN0YXR1cyB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERlcGxveSBhbGwgdGVtcGxhdGVzIHRvIGRlZmF1bHQgbG9jYXRpb25zXG4gICAgICogVXNlcyBzbWFydCByZWdlbmVyYXRpb246IG9ubHkgY3JlYXRlcyBtaXNzaW5nIHRlbXBsYXRlc1xuICAgICAqL1xuICAgIGFzeW5jIGRlcGxveUFsbFRlbXBsYXRlcygpIHtcbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgndGVtcGxhdGVzOmRlcGxveS1hbGwnKTtcbiAgICAgICAgbGV0IGNyZWF0ZWQgPSAwO1xuICAgICAgICBsZXQgc2tpcHBlZCA9IDA7XG4gICAgICAgIGxldCBlcnJvcnMgPSAwO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKCdEZXBsb3lpbmcgUEFSQSB0ZW1wbGF0ZXMuLi4nKTtcblxuICAgICAgICAgICAgY29uc3QgZGVmYXVsdERlc3RpbmF0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICAnZGVmYXVsdC10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9kZWZhdWx0LXRlbXBsYXRlLm1kJyxcbiAgICAgICAgICAgICAgICAnaW5ib3gtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvaW5ib3gtdGVtcGxhdGUubWQnLFxuICAgICAgICAgICAgICAgICdwcm9qZWN0cy10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9wcm9qZWN0cy10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ2FyZWFzLXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL2FyZWFzLXRlbXBsYXRlLm1kJyxcbiAgICAgICAgICAgICAgICAncmVzb3VyY2VzLXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL3Jlc291cmNlcy10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ2FyY2hpdmUtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvYXJjaGl2ZS10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ1Byb2plY3QgRGFzaGJvYXJkLm1kJzogJzAgLSBJTkJPWC9Qcm9qZWN0IERhc2hib2FyZC5tZCcsXG4gICAgICAgICAgICAgICAgJ1BBUkEgTWV0aG9kIE92ZXJ2aWV3Lm1kJzogJzMgLSBSRVNPVVJDRVMvUEFSQSBNZXRob2QgT3ZlcnZpZXcubWQnXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFt0ZW1wbGF0ZU5hbWUsIGRlc3RpbmF0aW9uXSBvZiBPYmplY3QuZW50cmllcyhkZWZhdWx0RGVzdGluYXRpb25zKSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVwbG95VGVtcGxhdGUodGVtcGxhdGVOYW1lLCBkZXN0aW5hdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSAnY3JlYXRlZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNyZWF0ZWQrKztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQuc3RhdHVzID09PSAnc2tpcHBlZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNraXBwZWQrKztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBkZXBsb3kgJHt0ZW1wbGF0ZU5hbWV9OmAsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JzKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZXBvcnQgcmVzdWx0c1xuICAgICAgICAgICAgY29uc3QgcGFydHMgPSBbXTtcbiAgICAgICAgICAgIGlmIChjcmVhdGVkID4gMCkgcGFydHMucHVzaChgJHtjcmVhdGVkfSBjcmVhdGVkYCk7XG4gICAgICAgICAgICBpZiAoc2tpcHBlZCA+IDApIHBhcnRzLnB1c2goYCR7c2tpcHBlZH0gc2tpcHBlZGApO1xuICAgICAgICAgICAgaWYgKGVycm9ycyA+IDApIHBhcnRzLnB1c2goYCR7ZXJyb3JzfSBlcnJvcnNgKTtcblxuICAgICAgICAgICAgbmV3IE5vdGljZShgVGVtcGxhdGVzOiAke3BhcnRzLmpvaW4oJywgJyl9YCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkZXBsb3lpbmcgdGVtcGxhdGVzOicsIGVycm9yKTtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIGRlcGxveWluZyB0ZW1wbGF0ZXM6ICR7ZXJyb3IubWVzc2FnZX1gLCA1MDAwKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyBjcmVhdGVkLCBza2lwcGVkLCBlcnJvcnMgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGb3JjZSByZWdlbmVyYXRlIGFsbCB0ZW1wbGF0ZXMgKGNhbGxlZCBieSBSZXNldCBTZXR0aW5ncylcbiAgICAgKiBUaGlzIGlzIHRoZSBPTkxZIG1ldGhvZCB0aGF0IG92ZXJ3cml0ZXMgZXhpc3RpbmcgdGVtcGxhdGVzXG4gICAgICovXG4gICAgYXN5bmMgZm9yY2VSZWdlbmVyYXRlQWxsVGVtcGxhdGVzKCkge1xuICAgICAgICBjb25zdCB0aW1lciA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCd0ZW1wbGF0ZXM6Zm9yY2UtcmVnZW5lcmF0ZScpO1xuICAgICAgICBsZXQgcmVnZW5lcmF0ZWQgPSAwO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKCdSZWdlbmVyYXRpbmcgYWxsIHRlbXBsYXRlcyBmcm9tIGRlZmF1bHRzLi4uJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGRlZmF1bHREZXN0aW5hdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgJ2RlZmF1bHQtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvZGVmYXVsdC10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ2luYm94LXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL2luYm94LXRlbXBsYXRlLm1kJyxcbiAgICAgICAgICAgICAgICAncHJvamVjdHMtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvcHJvamVjdHMtdGVtcGxhdGUubWQnLFxuICAgICAgICAgICAgICAgICdhcmVhcy10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9hcmVhcy10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ3Jlc291cmNlcy10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9yZXNvdXJjZXMtdGVtcGxhdGUubWQnLFxuICAgICAgICAgICAgICAgICdhcmNoaXZlLXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL2FyY2hpdmUtdGVtcGxhdGUubWQnLFxuICAgICAgICAgICAgICAgICdQcm9qZWN0IERhc2hib2FyZC5tZCc6ICcwIC0gSU5CT1gvUHJvamVjdCBEYXNoYm9hcmQubWQnLFxuICAgICAgICAgICAgICAgICdQQVJBIE1ldGhvZCBPdmVydmlldy5tZCc6ICczIC0gUkVTT1VSQ0VTL1BBUkEgTWV0aG9kIE92ZXJ2aWV3Lm1kJ1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgZm9yIChjb25zdCBbdGVtcGxhdGVOYW1lLCBkZXN0aW5hdGlvbl0gb2YgT2JqZWN0LmVudHJpZXMoZGVmYXVsdERlc3RpbmF0aW9ucykpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50ID0gdGhpcy5nZXRUZW1wbGF0ZSh0ZW1wbGF0ZU5hbWUpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEVuc3VyZSBmb2xkZXIgZXhpc3RzXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvbGRlclBhdGggPSBkZXN0aW5hdGlvbi5zdWJzdHJpbmcoMCwgZGVzdGluYXRpb24ubGFzdEluZGV4T2YoJy8nKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkZXJQYXRoICYmICF0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZm9sZGVyUGF0aCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihmb2xkZXJQYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nRmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChkZXN0aW5hdGlvbik7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nRmlsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gT3ZlcndyaXRlIGV4aXN0aW5nXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZXhpc3RpbmdGaWxlLCBjb250ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBuZXdcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShkZXN0aW5hdGlvbiwgY29udGVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmVnZW5lcmF0ZWQrKztcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gcmVnZW5lcmF0ZSAke3RlbXBsYXRlTmFtZX06YCwgZXJyb3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbmV3IE5vdGljZShgUmVnZW5lcmF0ZWQgJHtyZWdlbmVyYXRlZH0gdGVtcGxhdGVzIGZyb20gZGVmYXVsdHMhYCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciByZWdlbmVyYXRpbmcgdGVtcGxhdGVzOicsIGVycm9yKTtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIHJlZ2VuZXJhdGluZyB0ZW1wbGF0ZXM6ICR7ZXJyb3IubWVzc2FnZX1gLCA1MDAwKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyByZWdlbmVyYXRlZCB9KTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQUdFTkRBIE1BTkFHRVJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY2xhc3MgQWdlbmRhTWFuYWdlciB7XG4gICAgY29uc3RydWN0b3IoYXBwLCBzZXR0aW5ncywgcHJvZmlsZXIpIHtcbiAgICAgICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICAgICAgdGhpcy5wcm9maWxlciA9IHByb2ZpbGVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgZGF0ZSBvZiB0aGUgdXBjb21pbmcgTW9uZGF5IGluIE1NL0REL1lZIGZvcm1hdFxuICAgICAqIElmIHRvZGF5IGlzIE1vbmRheSwgcmV0dXJucyB0b2RheSdzIGRhdGVcbiAgICAgKi9cbiAgICBnZXROZXh0TW9uZGF5RGF0ZSgpIHtcbiAgICAgICAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpO1xuICAgICAgICBjb25zdCBkYXlPZldlZWsgPSB0b2RheS5nZXREYXkoKTsgLy8gMCA9IFN1bmRheSwgMSA9IE1vbmRheSwgZXRjLlxuXG4gICAgICAgIGxldCBkYXlzVW50aWxNb25kYXk7XG4gICAgICAgIGlmIChkYXlPZldlZWsgPT09IDEpIHtcbiAgICAgICAgICAgIC8vIFRvZGF5IGlzIE1vbmRheVxuICAgICAgICAgICAgZGF5c1VudGlsTW9uZGF5ID0gMDtcbiAgICAgICAgfSBlbHNlIGlmIChkYXlPZldlZWsgPT09IDApIHtcbiAgICAgICAgICAgIC8vIFRvZGF5IGlzIFN1bmRheSwgbmV4dCBNb25kYXkgaXMgMSBkYXkgYXdheVxuICAgICAgICAgICAgZGF5c1VudGlsTW9uZGF5ID0gMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBkYXlzIHVudGlsIG5leHQgTW9uZGF5XG4gICAgICAgICAgICBkYXlzVW50aWxNb25kYXkgPSA4IC0gZGF5T2ZXZWVrO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbW9uZGF5ID0gbmV3IERhdGUodG9kYXkpO1xuICAgICAgICBtb25kYXkuc2V0RGF0ZSh0b2RheS5nZXREYXRlKCkgKyBkYXlzVW50aWxNb25kYXkpO1xuXG4gICAgICAgIGNvbnN0IG1vbnRoID0gU3RyaW5nKG1vbmRheS5nZXRNb250aCgpICsgMSkucGFkU3RhcnQoMiwgJzAnKTtcbiAgICAgICAgY29uc3QgZGF5ID0gU3RyaW5nKG1vbmRheS5nZXREYXRlKCkpLnBhZFN0YXJ0KDIsICcwJyk7XG4gICAgICAgIGNvbnN0IHllYXIgPSBTdHJpbmcobW9uZGF5LmdldEZ1bGxZZWFyKCkpLnNsaWNlKC0yKTtcblxuICAgICAgICByZXR1cm4gYCR7bW9udGh9LyR7ZGF5fS8ke3llYXJ9YDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZSB0aGUgUHJvamVjdCBEYXNoYm9hcmQga2FuYmFuIGJvYXJkXG4gICAgICogUmV0dXJucyBzZWN0aW9uczogZG9uZSwgZG9pbmcsIHRvZGF5LCB0b21vcnJvdywgdGhpc193ZWVrLCBibG9ja2VkXG4gICAgICovXG4gICAgYXN5bmMgcGFyc2VLYW5iYW5Cb2FyZChrYW5iYW5QYXRoKSB7XG4gICAgICAgIC8vIFVzZSBwcm92aWRlZCBwYXRoIG9yIGZhbGwgYmFjayB0byBzZXR0aW5nc1xuICAgICAgICBjb25zdCBib2FyZFBhdGggPSBrYW5iYW5QYXRoIHx8IHRoaXMuc2V0dGluZ3MucHJvamVjdFVwZGF0ZXM/LmthbmJhbkZpbGUgfHwgJzAgLSBJTkJPWC9Qcm9qZWN0IERhc2hib2FyZC5tZCc7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ2FnZW5kYTpwYXJzZS1rYW5iYW4nKTtcbiAgICAgICAgY29uc3QgY29udGV4dCA9IHsgYm9hcmRQYXRoIH07XG4gICAgICAgIGxldCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGJvYXJkUGF0aCk7XG4gICAgICAgIGxldCBzZWN0aW9ucyA9IG51bGw7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgICAgICAgIC8vIFRyeSB0byByZWNyZWF0ZSBmcm9tIHRlbXBsYXRlXG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnUHJvamVjdCBEYXNoYm9hcmQgbm90IGZvdW5kLiBDcmVhdGluZyBmcm9tIHRlbXBsYXRlLi4uJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVNYW5hZ2VyID0gbmV3IFRlbXBsYXRlTWFuYWdlcih0aGlzLmFwcCwgdGhpcy5zZXR0aW5ncywgdGhpcy5wcm9maWxlcik7XG5cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0ZW1wbGF0ZU1hbmFnZXIuZGVwbG95VGVtcGxhdGUoJ1Byb2plY3QgRGFzaGJvYXJkLm1kJywgYm9hcmRQYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChib2FyZFBhdGgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gY3JlYXRlIGthbmJhbiBib2FyZCBhdDogJHtib2FyZFBhdGh9YCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCdQcm9qZWN0IERhc2hib2FyZCBjcmVhdGVkIHN1Y2Nlc3NmdWxseSEnKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjcmVhdGluZyBQcm9qZWN0IERhc2hib2FyZDonLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgS2FuYmFuIGJvYXJkIG5vdCBmb3VuZCBhbmQgY291bGQgbm90IGJlIGNyZWF0ZWQ6ICR7Ym9hcmRQYXRofWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG5cbiAgICAgICAgICAgIHNlY3Rpb25zID0ge1xuICAgICAgICAgICAgICAgIGRvbmU6IFtdLFxuICAgICAgICAgICAgICAgIGRvaW5nOiBbXSxcbiAgICAgICAgICAgICAgICB0b2RheTogW10sXG4gICAgICAgICAgICAgICAgdG9tb3Jyb3c6IFtdLFxuICAgICAgICAgICAgICAgIHRoaXNfd2VlazogW10sXG4gICAgICAgICAgICAgICAgYmxvY2tlZDogW11cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vIEV4dHJhY3Qgc2VjdGlvbnMgdXNpbmcgcmVnZXhcbiAgICAgICAgICAgIC8vIFBhdHRlcm46ICMjIFNFQ1RJT05fTkFNRSBmb2xsb3dlZCBieSBjb250ZW50IHVudGlsIG5leHQgIyMgb3IgZW5kXG4gICAgICAgICAgICBjb25zdCBzZWN0aW9uUmVnZXggPSAvXiMjXFxzKyguKz8pJFxcbiguKj8pKD89XiMjfFxcWikvZ21zO1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKHNlY3Rpb25SZWdleCldO1xuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzZWN0aW9uTmFtZSA9IG1hdGNoWzFdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlY3Rpb25Db250ZW50ID0gbWF0Y2hbMl07XG5cbiAgICAgICAgICAgICAgICAvLyBNYXAgc2VjdGlvbiBuYW1lcyB0byBvdXIga2V5c1xuICAgICAgICAgICAgICAgIGxldCBrZXkgPSBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChzZWN0aW9uTmFtZSA9PT0gJ2RvbmUnKSBrZXkgPSAnZG9uZSc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc2VjdGlvbk5hbWUgPT09ICdkb2luZycpIGtleSA9ICdkb2luZyc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc2VjdGlvbk5hbWUgPT09ICd0b2RheScpIGtleSA9ICd0b2RheSc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc2VjdGlvbk5hbWUgPT09ICd0b21vcnJvdycpIGtleSA9ICd0b21vcnJvdyc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc2VjdGlvbk5hbWUgPT09ICd0aGlzIHdlZWsnKSBrZXkgPSAndGhpc193ZWVrJztcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzZWN0aW9uTmFtZSA9PT0gJ2Jsb2NrZWQnKSBrZXkgPSAnYmxvY2tlZCc7XG5cbiAgICAgICAgICAgICAgICBpZiAoa2V5KSB7XG4gICAgICAgICAgICAgICAgICAgIHNlY3Rpb25zW2tleV0gPSB0aGlzLmV4dHJhY3RUYXNrcyhzZWN0aW9uQ29udGVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHNlY3Rpb25zO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgY29uc3Qgc2VjdGlvbkNvdW50ID0gc2VjdGlvbnMgPyBPYmplY3Qua2V5cyhzZWN0aW9ucykubGVuZ3RoIDogMDtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyAuLi5jb250ZXh0LCBzZWN0aW9uQ291bnQgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeHRyYWN0IHRhc2sgaXRlbXMgZnJvbSBzZWN0aW9uIGNvbnRlbnRcbiAgICAgKi9cbiAgICBleHRyYWN0VGFza3Moc2VjdGlvbkNvbnRlbnQpIHtcbiAgICAgICAgY29uc3QgdGFza3MgPSBbXTtcbiAgICAgICAgY29uc3QgbGluZXMgPSBzZWN0aW9uQ29udGVudC5zcGxpdCgnXFxuJyk7XG5cbiAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgICAgICAvLyBNYXRjaCBjaGVja2JveCBpdGVtczogLSBbIF0gb3IgLSBbeF1cbiAgICAgICAgICAgIGlmICgvXlxccyotXFxzK1xcW1sgeF1cXF0vaS50ZXN0KGxpbmUpKSB7XG4gICAgICAgICAgICAgICAgdGFza3MucHVzaChsaW5lLnRyaW0oKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGFza3M7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlIGEgcHJvamVjdCB1cGRhdGUgYWdlbmRhIHdpdGggZGF0YSBmcm9tIGthbmJhbiBib2FyZFxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGFnZW5kYVBhdGggLSBQYXRoIHRvIHRoZSBhZ2VuZGEgZmlsZSAoZS5nLiwgXCIwIC0gSU5CT1gvVVBEQVRFIFx1MjAxNCBQcm9qZWN0IE5hbWUubWRcIilcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30ga2FuYmFuUGF0aCAtIE9wdGlvbmFsIHBhdGggdG8ga2FuYmFuIGJvYXJkIChkZWZhdWx0cyB0byBzZXR0aW5ncylcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcHJvamVjdEZvbGRlciAtIE9wdGlvbmFsIHByb2plY3QgZm9sZGVyIHRvIGZpbHRlciB0YXNrcyAoZGVmYXVsdHMgdG8gYWxsIHByb2plY3RzKVxuICAgICAqL1xuICAgIGFzeW5jIHVwZGF0ZVByb2plY3RBZ2VuZGEoYWdlbmRhUGF0aCwga2FuYmFuUGF0aCA9IG51bGwsIHByb2plY3RGb2xkZXIgPSBudWxsKSB7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ2FnZW5kYTp1cGRhdGUnKTtcbiAgICAgICAgY29uc3QgY29udGV4dCA9IHtcbiAgICAgICAgICAgIGFnZW5kYVBhdGgsXG4gICAgICAgICAgICBrYW5iYW5QYXRoOiBrYW5iYW5QYXRoIHx8IHRoaXMuc2V0dGluZ3MucHJvamVjdFVwZGF0ZXM/LmthbmJhbkZpbGUsXG4gICAgICAgICAgICBwcm9qZWN0Rm9sZGVyXG4gICAgICAgIH07XG4gICAgICAgIGxldCBzdWNjZXNzID0gZmFsc2U7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1VwZGF0aW5nIHByb2plY3QgYWdlbmRhLi4uJyk7XG5cbiAgICAgICAgICAgIC8vIFBhcnNlIGthbmJhbiBib2FyZFxuICAgICAgICAgICAgY29uc3Qga2FuYmFuRGF0YSA9IGF3YWl0IHRoaXMucGFyc2VLYW5iYW5Cb2FyZChrYW5iYW5QYXRoKTtcblxuICAgICAgICAgICAgLy8gR2V0IG5leHQgTW9uZGF5IGRhdGVcbiAgICAgICAgICAgIGNvbnN0IG1vbmRheURhdGUgPSB0aGlzLmdldE5leHRNb25kYXlEYXRlKCk7XG5cbiAgICAgICAgICAgIC8vIEdldCBhZ2VuZGEgZmlsZVxuICAgICAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChhZ2VuZGFQYXRoKTtcblxuICAgICAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgQWdlbmRhIGZpbGUgbm90IGZvdW5kOiAke2FnZW5kYVBhdGh9YCwgNTAwMCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcblxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgTW9uZGF5IHNlY3Rpb24gZXhpc3RzXG4gICAgICAgICAgICBjb25zdCBtb25kYXlQYXR0ZXJuID0gbmV3IFJlZ0V4cChgIyMjICR7dGhpcy5lc2NhcGVSZWdleChtb25kYXlEYXRlKX1gKTtcbiAgICAgICAgICAgIGNvbnN0IGhhc01vbmRheVNlY3Rpb24gPSBtb25kYXlQYXR0ZXJuLnRlc3QoY29udGVudCk7XG5cbiAgICAgICAgICAgIGxldCB1cGRhdGVkQ29udGVudCA9IGNvbnRlbnQ7XG5cbiAgICAgICAgICAgIGlmICghaGFzTW9uZGF5U2VjdGlvbikge1xuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBuZXcgTW9uZGF5IHNlY3Rpb25cbiAgICAgICAgICAgICAgICB1cGRhdGVkQ29udGVudCA9IHRoaXMuY3JlYXRlTW9uZGF5U2VjdGlvbihjb250ZW50LCBtb25kYXlEYXRlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBNb25kYXkgc2VjdGlvbiB3aXRoIGthbmJhbiBkYXRhIChub3cgYXN5bmMpXG4gICAgICAgICAgICB1cGRhdGVkQ29udGVudCA9IGF3YWl0IHRoaXMudXBkYXRlTW9uZGF5U2VjdGlvbih1cGRhdGVkQ29udGVudCwgbW9uZGF5RGF0ZSwga2FuYmFuRGF0YSwgcHJvamVjdEZvbGRlcik7XG5cbiAgICAgICAgICAgIC8vIFdyaXRlIGJhY2sgdG8gZmlsZVxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWRDb250ZW50KTtcblxuICAgICAgICAgICAgbmV3IE5vdGljZSgnUHJvamVjdCBhZ2VuZGEgdXBkYXRlZCBzdWNjZXNzZnVsbHkhJyk7XG4gICAgICAgICAgICBzdWNjZXNzID0gdHJ1ZTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHVwZGF0aW5nIHByb2plY3QgYWdlbmRhOicsIGVycm9yKTtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIHVwZGF0aW5nIGFnZW5kYTogJHtlcnJvci5tZXNzYWdlfWAsIDUwMDApO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKHRpbWVyLCB7IC4uLmNvbnRleHQsIHN1Y2Nlc3MgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgTW9uZGF5IHNlY3Rpb24gaW4gdGhlIGFnZW5kYVxuICAgICAqL1xuICAgIGNyZWF0ZU1vbmRheVNlY3Rpb24oY29udGVudCwgbW9uZGF5RGF0ZSkge1xuICAgICAgICBjb25zdCBuZXdTZWN0aW9uID0gYCMjIyAke21vbmRheURhdGV9XG5cbiMjIyMgUHJvamVjdHNcbjwhLS0gQVVUTy1NQU5BR0VEIC0tPlxuKkF1dG8tdXBkYXRlZCBmcm9tIFByb2plY3QgRGFzaGJvYXJkKlxuXG48IS0tIEVORCBBVVRPLU1BTkFHRUQgLS0+XG5cbiMjIyMgQmxvY2tlZC9mZWVkYmFjayBuZWVkZWRcbjwhLS0gQVVUTy1NQU5BR0VEIC0tPlxuKkF1dG8tdXBkYXRlZCBmcm9tIFByb2plY3QgRGFzaGJvYXJkIFwiQmxvY2tlZFwiIHNlY3Rpb24qXG5cbjwhLS0gRU5EIEFVVE8tTUFOQUdFRCAtLT5cblxuIyMjIyBEYWlseSBIaWdobGlnaHRzIChUaGlzIFdlZWspXG48IS0tIEFVVE8tTUFOQUdFRCAtLT5cbipDb21wbGV0ZWQgdGFza3MgZnJvbSBQcm9qZWN0IERhc2hib2FyZCBcIkRvbmVcIiBzZWN0aW9uKlxuXG48IS0tIEVORCBBVVRPLU1BTkFHRUQgLS0+XG5cbiMjIyMgRmVlZGJhY2svdXBkYXRlcy9ub3RlcyBmcm9tIG1lZXRpbmdcbiAgKiAqKGFkZCBhbnkgbm90ZXMgYW5kIGFjdGlvbiBpdGVtcyBoZXJlIGFmdGVyIHRoZSBtZWV0aW5nKSpcblxuLS0tXG5cbmA7XG5cbiAgICAgICAgLy8gSW5zZXJ0IGFmdGVyIFwiIyMgTm90ZXNcIiBzZWN0aW9uXG4gICAgICAgIGNvbnN0IG5vdGVzUGF0dGVybiA9IC8oIyMgTm90ZXMuKj9cXG4uKj9cXG4pL3M7XG4gICAgICAgIGNvbnN0IG1hdGNoID0gY29udGVudC5tYXRjaChub3Rlc1BhdHRlcm4pO1xuXG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgY29uc3QgaW5zZXJ0UG9zID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICByZXR1cm4gY29udGVudC5zbGljZSgwLCBpbnNlcnRQb3MpICsgJ1xcbicgKyBuZXdTZWN0aW9uICsgY29udGVudC5zbGljZShpbnNlcnRQb3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmFsbGJhY2s6IGFwcGVuZCBhdCBlbmRcbiAgICAgICAgcmV0dXJuIGNvbnRlbnQgKyAnXFxuXFxuJyArIG5ld1NlY3Rpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlIHRoZSBNb25kYXkgc2VjdGlvbiB3aXRoIGthbmJhbiBkYXRhXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gY29udGVudCAtIEZ1bGwgYWdlbmRhIGZpbGUgY29udGVudFxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBtb25kYXlEYXRlIC0gRm9ybWF0dGVkIE1vbmRheSBkYXRlXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGthbmJhbkRhdGEgLSBQYXJzZWQga2FuYmFuIGJvYXJkIGRhdGFcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcHJvamVjdEZvbGRlciAtIE9wdGlvbmFsIHByb2plY3QgZm9sZGVyIHRvIGZpbHRlciB0YXNrc1xuICAgICAqL1xuICAgIGFzeW5jIHVwZGF0ZU1vbmRheVNlY3Rpb24oY29udGVudCwgbW9uZGF5RGF0ZSwga2FuYmFuRGF0YSwgcHJvamVjdEZvbGRlciA9IG51bGwpIHtcbiAgICAgICAgLy8gRmluZCB0aGUgTW9uZGF5IHNlY3Rpb25cbiAgICAgICAgY29uc3Qgc2VjdGlvblBhdHRlcm4gPSBuZXcgUmVnRXhwKFxuICAgICAgICAgICAgYCgjIyMgJHt0aGlzLmVzY2FwZVJlZ2V4KG1vbmRheURhdGUpfVxcXFxzKlxcXFxuKSguKj8pKD89XFxcXG4jIyMgfFxcXFxuLS0tfFxcXFxaKWAsXG4gICAgICAgICAgICAncydcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBjb250ZW50Lm1hdGNoKHNlY3Rpb25QYXR0ZXJuKTtcblxuICAgICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgICBjb25zb2xlLndhcm4oYENvdWxkIG5vdCBmaW5kIE1vbmRheSBzZWN0aW9uIGZvciAke21vbmRheURhdGV9YCk7XG4gICAgICAgICAgICByZXR1cm4gY29udGVudDtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBzZWN0aW9uQm9keSA9IG1hdGNoWzJdO1xuXG4gICAgICAgIC8vIFVwZGF0ZSBQcm9qZWN0cyBzZWN0aW9uIHdpdGggb3B0aW9uYWwgZm9sZGVyIGZpbHRlciAobm93IGFzeW5jKVxuICAgICAgICAvLyBQcm9qZWN0cyBzZWN0aW9uIG5vdyBpbmNsdWRlcyBib3RoIG9wZW4gYW5kIGNvbXBsZXRlZCB0YXNrcyBncm91cGVkIGJ5IHByb2plY3RcbiAgICAgICAgY29uc3QgcHJvamVjdHNDb250ZW50ID0gYXdhaXQgdGhpcy5mb3JtYXRQcm9qZWN0c1NlY3Rpb24oa2FuYmFuRGF0YSwgcHJvamVjdEZvbGRlcik7XG4gICAgICAgIHNlY3Rpb25Cb2R5ID0gdGhpcy51cGRhdGVBdXRvU2VjdGlvbihzZWN0aW9uQm9keSwgJ1Byb2plY3RzJywgcHJvamVjdHNDb250ZW50KTtcblxuICAgICAgICAvLyBVcGRhdGUgQmxvY2tlZCBzZWN0aW9uXG4gICAgICAgIGNvbnN0IGJsb2NrZWRDb250ZW50ID0gdGhpcy5mb3JtYXRCbG9ja2VkU2VjdGlvbihrYW5iYW5EYXRhKTtcbiAgICAgICAgc2VjdGlvbkJvZHkgPSB0aGlzLnVwZGF0ZUF1dG9TZWN0aW9uKHNlY3Rpb25Cb2R5LCAnQmxvY2tlZC9mZWVkYmFjayBuZWVkZWQnLCBibG9ja2VkQ29udGVudCk7XG5cbiAgICAgICAgLy8gTm90ZTogRGFpbHkgSGlnaGxpZ2h0cyBzZWN0aW9uIHJlbW92ZWQgLSBjb21wbGV0ZWQgdGFza3Mgbm93IGludGVncmF0ZWQgdW5kZXIgdGhlaXIgcHJvamVjdHNcblxuICAgICAgICAvLyBSZWNvbnN0cnVjdCBjb250ZW50XG4gICAgICAgIHJldHVybiBjb250ZW50LnNsaWNlKDAsIG1hdGNoLmluZGV4KSArIG1hdGNoWzFdICsgc2VjdGlvbkJvZHkgKyBjb250ZW50LnNsaWNlKG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGUgYW4gYXV0by1tYW5hZ2VkIHNlY3Rpb25cbiAgICAgKi9cbiAgICB1cGRhdGVBdXRvU2VjdGlvbihib2R5LCBzZWN0aW9uTmFtZSwgbmV3Q29udGVudCkge1xuICAgICAgICBjb25zdCBwYXR0ZXJuID0gbmV3IFJlZ0V4cChcbiAgICAgICAgICAgIGAoIyMjI1xcXFxzKyR7c2VjdGlvbk5hbWV9XFxcXHMqXFxcXG4pKC4qPykoPCEtLVxcXFxzKkFVVE8tTUFOQUdFRFxcXFxzKi0tPikoLio/KSg8IS0tXFxcXHMqRU5EIEFVVE8tTUFOQUdFRFxcXFxzKi0tPilgLFxuICAgICAgICAgICAgJ3MnXG4gICAgICAgICk7XG4gICAgICAgIGNvbnN0IG1hdGNoID0gYm9keS5tYXRjaChwYXR0ZXJuKTtcblxuICAgICAgICBpZiAobWF0Y2gpIHtcbiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IG1hdGNoWzFdO1xuICAgICAgICAgICAgY29uc3QgcHJlQXV0byA9IG1hdGNoWzJdO1xuICAgICAgICAgICAgY29uc3QgYXV0b1N0YXJ0ID0gbWF0Y2hbM107XG4gICAgICAgICAgICBjb25zdCBhdXRvRW5kID0gbWF0Y2hbNV07XG5cbiAgICAgICAgICAgIHJldHVybiBib2R5LnNsaWNlKDAsIG1hdGNoLmluZGV4KSArXG4gICAgICAgICAgICAgICAgICAgaGVhZGVyICsgcHJlQXV0byArIGF1dG9TdGFydCArICdcXG4nICsgbmV3Q29udGVudCArICdcXG4nICsgYXV0b0VuZCArXG4gICAgICAgICAgICAgICAgICAgYm9keS5zbGljZShtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gYm9keTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGb3JtYXQgdGhlIFByb2plY3RzIHNlY3Rpb24gY29udGVudFxuICAgICAqXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGthbmJhbkRhdGEgLSBQYXJzZWQga2FuYmFuIGJvYXJkIGRhdGFcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcHJvamVjdEZvbGRlciAtIE9wdGlvbmFsIHByb2plY3QgZm9sZGVyIHBhdGggdG8gZmlsdGVyIHRhc2tzXG4gICAgICovXG4gICAgYXN5bmMgZm9ybWF0UHJvamVjdHNTZWN0aW9uKGthbmJhbkRhdGEsIHByb2plY3RGb2xkZXIgPSBudWxsKSB7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ2FnZW5kYTpmb3JtYXQtcHJvamVjdHMnKTtcbiAgICAgICAgY29uc3QgbGluZXMgPSBbJypBdXRvLXVwZGF0ZWQgZnJvbSBQcm9qZWN0IERhc2hib2FyZCBhbmQgcHJvamVjdCBmb2xkZXIgdGFza3MqJywgJyddO1xuXG4gICAgICAgIC8vIENvbWJpbmUgYWN0aXZlIHdvcmsgc2VjdGlvbnMgZnJvbSBrYW5iYW5cbiAgICAgICAgY29uc3QgYWN0aXZlVGFza3MgPSBbXG4gICAgICAgICAgICAuLi5rYW5iYW5EYXRhLmRvaW5nLFxuICAgICAgICAgICAgLi4ua2FuYmFuRGF0YS50b2RheSxcbiAgICAgICAgICAgIC4uLmthbmJhbkRhdGEudG9tb3Jyb3csXG4gICAgICAgICAgICAuLi5rYW5iYW5EYXRhLnRoaXNfd2Vla1xuICAgICAgICBdO1xuXG4gICAgICAgIC8vIEdldCBjb21wbGV0ZWQgdGFza3MgZnJvbSBrYW5iYW4gXCJEb25lXCIgc2VjdGlvblxuICAgICAgICBjb25zdCBjb21wbGV0ZWRUYXNrcyA9IHRoaXMuZmlsdGVyUmVjZW50VGFza3Moa2FuYmFuRGF0YS5kb25lLCA3KTtcblxuICAgICAgICAvLyBCdWlsZCBtYXAgb2YgcHJvamVjdCBub3RlcyB3aXRoIHRoZWlyIHRhc2tzXG4gICAgICAgIGNvbnN0IHByb2plY3RNYXAgPSBuZXcgTWFwKCk7IC8vIHByb2plY3Qgd2lraWxpbmsgLT4ge29wZW46IFtdLCBjb21wbGV0ZWQ6IFtdfVxuXG4gICAgICAgIC8vIFByb2Nlc3MgYWN0aXZlIHRhc2tzIGZyb20ga2FuYmFuXG4gICAgICAgIGZvciAoY29uc3QgdGFzayBvZiBhY3RpdmVUYXNrcykge1xuICAgICAgICAgICAgY29uc3Qgd2lraWxpbmtzID0gdGFzay5tYXRjaCgvXFxbXFxbKFteXFxdXSspXFxdXFxdL2cpO1xuICAgICAgICAgICAgaWYgKHdpa2lsaW5rcykge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbGluayBvZiB3aWtpbGlua3MpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvamVjdE5hbWUgPSBsaW5rLnNsaWNlKDIsIC0yKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBwcm9qZWN0IGV4aXN0cyBpbiBmb2xkZXJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb2plY3RGb2xkZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb2plY3RGaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGAke3Byb2plY3RGb2xkZXJ9LyR7cHJvamVjdE5hbWV9Lm1kYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXByb2plY3RGaWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICghcHJvamVjdE1hcC5oYXMobGluaykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb2plY3RNYXAuc2V0KGxpbmssIHsgb3BlbjogW10sIGNvbXBsZXRlZDogW10gfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcHJvamVjdE1hcC5nZXQobGluaykub3Blbi5wdXNoKHRhc2spO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFByb2Nlc3MgY29tcGxldGVkIHRhc2tzIGZyb20ga2FuYmFuXG4gICAgICAgIGZvciAoY29uc3QgdGFzayBvZiBjb21wbGV0ZWRUYXNrcykge1xuICAgICAgICAgICAgY29uc3Qgd2lraWxpbmtzID0gdGFzay5tYXRjaCgvXFxbXFxbKFteXFxdXSspXFxdXFxdL2cpO1xuICAgICAgICAgICAgaWYgKHdpa2lsaW5rcykge1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbGluayBvZiB3aWtpbGlua3MpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvamVjdE5hbWUgPSBsaW5rLnNsaWNlKDIsIC0yKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBwcm9qZWN0IGV4aXN0cyBpbiBmb2xkZXJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHByb2plY3RGb2xkZXIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb2plY3RGaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGAke3Byb2plY3RGb2xkZXJ9LyR7cHJvamVjdE5hbWV9Lm1kYCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIXByb2plY3RGaWxlKSBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlmICghcHJvamVjdE1hcC5oYXMobGluaykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb2plY3RNYXAuc2V0KGxpbmssIHsgb3BlbjogW10sIGNvbXBsZXRlZDogW10gfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcHJvamVjdE1hcC5nZXQobGluaykuY29tcGxldGVkLnB1c2godGFzayk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgcHJvamVjdEZvbGRlciBzcGVjaWZpZWQsIGFsc28gZXh0cmFjdCB0YXNrcyBkaXJlY3RseSBmcm9tIHByb2plY3Qgbm90ZXNcbiAgICAgICAgaWYgKHByb2plY3RGb2xkZXIpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpXG4gICAgICAgICAgICAgICAgLmZpbHRlcihmaWxlID0+IGZpbGUucGF0aC5zdGFydHNXaXRoKHByb2plY3RGb2xkZXIgKyAnLycpKTtcblxuICAgICAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG4gICAgICAgICAgICAgICAgY29uc3QgbGluayA9IGBbWyR7ZmlsZS5iYXNlbmFtZX1dXWA7XG5cbiAgICAgICAgICAgICAgICBpZiAoIXByb2plY3RNYXAuaGFzKGxpbmspKSB7XG4gICAgICAgICAgICAgICAgICAgIHByb2plY3RNYXAuc2V0KGxpbmssIHsgb3BlbjogW10sIGNvbXBsZXRlZDogW10gfSk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gRXh0cmFjdCB0YXNrcyBmcm9tIG5vdGVcbiAgICAgICAgICAgICAgICBjb25zdCB0YXNrUmVnZXggPSAvXltcXHMtXSpcXFtbIHhYXVxcXVxccysoLispJC9nbTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwodGFza1JlZ2V4KV07XG5cbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZnVsbExpbmUgPSBtYXRjaFswXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNDb21wbGV0ZWQgPSAvXFxbeFxcXS9pLnRlc3QoZnVsbExpbmUpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0NvbXBsZXRlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgY29tcGxldGVkIHJlY2VudGx5XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBkYXRlTWF0Y2ggPSBmdWxsTGluZS5tYXRjaCgvXHUyNzA1XFxzKyhcXGR7NH0pLShcXGR7Mn0pLShcXGR7Mn0pLyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoZGF0ZU1hdGNoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgdGFza0RhdGUgPSBuZXcgRGF0ZShkYXRlTWF0Y2hbMV0sIGRhdGVNYXRjaFsyXSAtIDEsIGRhdGVNYXRjaFszXSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgY3V0b2ZmRGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY3V0b2ZmRGF0ZS5zZXREYXRlKGN1dG9mZkRhdGUuZ2V0RGF0ZSgpIC0gNyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAodGFza0RhdGUgPj0gY3V0b2ZmRGF0ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwcm9qZWN0TWFwLmdldChsaW5rKS5jb21wbGV0ZWQucHVzaChmdWxsTGluZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvamVjdE1hcC5nZXQobGluaykub3Blbi5wdXNoKGZ1bGxMaW5lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZvcm1hdCBvdXRwdXQgZ3JvdXBlZCBieSBwcm9qZWN0XG4gICAgICAgIGlmIChwcm9qZWN0TWFwLnNpemUgPiAwKSB7XG4gICAgICAgICAgICBjb25zdCBzb3J0ZWRQcm9qZWN0cyA9IEFycmF5LmZyb20ocHJvamVjdE1hcC5rZXlzKCkpLnNvcnQoKTtcblxuICAgICAgICAgICAgZm9yIChjb25zdCBwcm9qZWN0TGluayBvZiBzb3J0ZWRQcm9qZWN0cykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhc2tzID0gcHJvamVjdE1hcC5nZXQocHJvamVjdExpbmspO1xuXG4gICAgICAgICAgICAgICAgLy8gT25seSBzaG93IHByb2plY3RzIHdpdGggdGFza3NcbiAgICAgICAgICAgICAgICBpZiAodGFza3Mub3Blbi5sZW5ndGggPiAwIHx8IHRhc2tzLmNvbXBsZXRlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goJycpO1xuICAgICAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKGAqKiR7cHJvamVjdExpbmt9KipgKTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBTaG93IG9wZW4gdGFza3NcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCB0YXNrIG9mIHRhc2tzLm9wZW4pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVzLnB1c2godGFzayk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBTaG93IGNvbXBsZXRlZCB0YXNrc1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3MuY29tcGxldGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKHRhc2spO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBDYXRjaC1hbGwgc2VjdGlvbiBmb3Igb3JwaGFuZWQgY29tcGxldGVkIHRhc2tzXG4gICAgICAgICAgICBjb25zdCBvcnBoYW5lZENvbXBsZXRlZCA9IFtdO1xuICAgICAgICAgICAgZm9yIChjb25zdCB0YXNrIG9mIGNvbXBsZXRlZFRhc2tzKSB7XG4gICAgICAgICAgICAgICAgY29uc3Qgd2lraWxpbmtzID0gdGFzay5tYXRjaCgvXFxbXFxbKFteXFxdXSspXFxdXFxdL2cpO1xuICAgICAgICAgICAgICAgIGlmICghd2lraWxpbmtzIHx8IHdpa2lsaW5rcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgICAgICAgb3JwaGFuZWRDb21wbGV0ZWQucHVzaCh0YXNrKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChvcnBoYW5lZENvbXBsZXRlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgbGluZXMucHVzaCgnJyk7XG4gICAgICAgICAgICAgICAgbGluZXMucHVzaCgnKk90aGVyIGNvbXBsZXRlZCBpdGVtcyAobm90IGxpbmtlZCB0byBzcGVjaWZpYyBwcm9qZWN0IG5vdGVzKToqJyk7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCB0YXNrIG9mIG9ycGhhbmVkQ29tcGxldGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzLnB1c2godGFzayk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZXMucHVzaCgnLSAqKG5vIGFjdGl2ZSBwcm9qZWN0cyB0aGlzIHdlZWspKicpO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gbGluZXMuam9pbignXFxuJyk7XG4gICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyBwcm9qZWN0Rm9sZGVyLCBwcm9qZWN0Q291bnQ6IHByb2plY3RNYXAuc2l6ZSB9KTtcbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGb3JtYXQgdGhlIEJsb2NrZWQgc2VjdGlvbiBjb250ZW50XG4gICAgICovXG4gICAgZm9ybWF0QmxvY2tlZFNlY3Rpb24oa2FuYmFuRGF0YSkge1xuICAgICAgICBjb25zdCBsaW5lcyA9IFsnKkF1dG8tdXBkYXRlZCBmcm9tIFByb2plY3QgRGFzaGJvYXJkIFwiQmxvY2tlZFwiIHNlY3Rpb24qJywgJyddO1xuXG4gICAgICAgIGlmIChrYW5iYW5EYXRhLmJsb2NrZWQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgZm9yIChjb25zdCB0YXNrIG9mIGthbmJhbkRhdGEuYmxvY2tlZCkge1xuICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBjaGVja2JveCBhbmQgZm9ybWF0XG4gICAgICAgICAgICAgICAgY29uc3QgdGV4dCA9IHRhc2sucmVwbGFjZSgvXi1cXHMrXFxbWyB4XVxcXVxccysvaSwgJycpO1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goYC0gJHt0ZXh0fWApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZXMucHVzaCgnLSAqKG5vbmUpKicpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZvcm1hdCB0aGUgSGlnaGxpZ2h0cyBzZWN0aW9uIGNvbnRlbnRcbiAgICAgKi9cbiAgICBmb3JtYXRIaWdobGlnaHRzU2VjdGlvbihrYW5iYW5EYXRhKSB7XG4gICAgICAgIGNvbnN0IGxpbmVzID0gWycqQ29tcGxldGVkIHRhc2tzIGZyb20gUHJvamVjdCBEYXNoYm9hcmQgXCJEb25lXCIgc2VjdGlvbionLCAnJ107XG5cbiAgICAgICAgaWYgKGthbmJhbkRhdGEuZG9uZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvLyBHZXQgdGFza3MgZnJvbSBsYXN0IDcgZGF5c1xuICAgICAgICAgICAgY29uc3QgcmVjZW50VGFza3MgPSB0aGlzLmZpbHRlclJlY2VudFRhc2tzKGthbmJhbkRhdGEuZG9uZSwgNyk7XG4gICAgICAgICAgICBpZiAocmVjZW50VGFza3MubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goLi4ucmVjZW50VGFza3Muc2xpY2UoMCwgMTApKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbGluZXMucHVzaCgnLSAqKG5vIGNvbXBsZXRlZCB0YXNrcyB0aGlzIHdlZWspKicpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbGluZXMucHVzaCgnLSAqKG5vIGNvbXBsZXRlZCB0YXNrcyB0aGlzIHdlZWspKicpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGxpbmVzLmpvaW4oJ1xcbicpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZpbHRlciB0YXNrcyBjb21wbGV0ZWQgaW4gdGhlIGxhc3QgTiBkYXlzXG4gICAgICovXG4gICAgZmlsdGVyUmVjZW50VGFza3ModGFza3MsIGRheXMpIHtcbiAgICAgICAgY29uc3QgY3V0b2ZmRGF0ZSA9IG5ldyBEYXRlKCk7XG4gICAgICAgIGN1dG9mZkRhdGUuc2V0RGF0ZShjdXRvZmZEYXRlLmdldERhdGUoKSAtIGRheXMpO1xuXG4gICAgICAgIHJldHVybiB0YXNrcy5maWx0ZXIodGFzayA9PiB7XG4gICAgICAgICAgICBjb25zdCBkYXRlTWF0Y2ggPSB0YXNrLm1hdGNoKC9cdTI3MDVcXHMrKFxcZHs0fSktKFxcZHsyfSktKFxcZHsyfSkvKTtcbiAgICAgICAgICAgIGlmIChkYXRlTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXNrRGF0ZSA9IG5ldyBEYXRlKGRhdGVNYXRjaFsxXSwgZGF0ZU1hdGNoWzJdIC0gMSwgZGF0ZU1hdGNoWzNdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGFza0RhdGUgPj0gY3V0b2ZmRGF0ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0cnVlOyAvLyBJbmNsdWRlIHRhc2tzIHdpdGhvdXQgZGF0ZXNcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXh0cmFjdCB0YXNrcyBmcm9tIG5vdGVzIGluIGEgcHJvamVjdCBmb2xkZXJcbiAgICAgKiBSZXR1cm5zIGFuIG9iamVjdCB3aXRoIGFjdGl2ZSBhbmQgY29tcGxldGVkIHRhc2tzXG4gICAgICovXG4gICAgYXN5bmMgZXh0cmFjdFRhc2tzRnJvbVByb2plY3RGb2xkZXIocHJvamVjdEZvbGRlcikge1xuICAgICAgICBjb25zdCBhY3RpdmVUYXNrcyA9IFtdO1xuICAgICAgICBjb25zdCBjb21wbGV0ZWRUYXNrcyA9IFtdO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBHZXQgYWxsIG1hcmtkb3duIGZpbGVzIGluIHRoZSBwcm9qZWN0IGZvbGRlclxuICAgICAgICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKClcbiAgICAgICAgICAgICAgICAuZmlsdGVyKGZpbGUgPT4gZmlsZS5wYXRoLnN0YXJ0c1dpdGgocHJvamVjdEZvbGRlciArICcvJykpO1xuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcblxuICAgICAgICAgICAgICAgIC8vIEV4dHJhY3QgdGFzayBsaW5lcyAoYm90aCBjb21wbGV0ZWQgYW5kIGluY29tcGxldGUpXG4gICAgICAgICAgICAgICAgY29uc3QgdGFza1JlZ2V4ID0gL15bXFxzLV0qXFxbWyB4WF1cXF1cXHMrKC4rKSQvZ207XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKHRhc2tSZWdleCldO1xuXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZ1bGxMaW5lID0gbWF0Y2hbMF07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQ29tcGxldGVkID0gL1xcW3hcXF0vaS50ZXN0KGZ1bGxMaW5lKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNDb21wbGV0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbXBsZXRlZFRhc2tzLnB1c2goZnVsbExpbmUpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgYWN0aXZlVGFza3MucHVzaChmdWxsTGluZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBleHRyYWN0aW5nIHRhc2tzIGZyb20gJHtwcm9qZWN0Rm9sZGVyfTpgLCBlcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4geyBhY3RpdmVUYXNrcywgY29tcGxldGVkVGFza3MgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFc2NhcGUgc3BlY2lhbCByZWdleCBjaGFyYWN0ZXJzXG4gICAgICovXG4gICAgZXNjYXBlUmVnZXgoc3RyKSB7XG4gICAgICAgIHJldHVybiBzdHIucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcbiAgICB9XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFRBU0sgTUFOQUdFUlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jbGFzcyBUYXNrTWFuYWdlciB7XG4gICAgY29uc3RydWN0b3IoYXBwLCBzZXR0aW5ncywgcHJvZmlsZXIpIHtcbiAgICAgICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICAgICAgdGhpcy5wcm9maWxlciA9IHByb2ZpbGVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbmNlbCBhbGwgb3BlbiB0YXNrcyBpbiBhIGZpbGUgYnkgcmVwbGFjaW5nIGNoZWNrYm94ZXNcbiAgICAgKiBDb252ZXJ0czogLSBbIF0gdGFzayAtPiAtIFstXSB0YXNrXG4gICAgICogQWxzbyBoYW5kbGVzOiAqIFsgXSB0YXNrIGFuZCArIFsgXSB0YXNrXG4gICAgICovXG4gICAgYXN5bmMgY2FuY2VsVGFza3NJbkZpbGUoZmlsZSkge1xuICAgICAgICBpZiAoIWZpbGUpIHJldHVybiB7IG1vZGlmaWVkOiBmYWxzZSwgdGFza0NvdW50OiAwIH07XG5cbiAgICAgICAgY29uc3QgaGFuZGxlID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ3Rhc2tzOmNhbmNlbC1maWxlJyk7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICAgICAgY29uc3QgbGluZXMgPSBjb250ZW50LnNwbGl0KCdcXG4nKTtcbiAgICAgICAgICAgIGxldCBtb2RpZmllZCA9IGZhbHNlO1xuICAgICAgICAgICAgbGV0IHRhc2tDb3VudCA9IDA7XG5cbiAgICAgICAgICAgIGNvbnN0IG5ld0xpbmVzID0gbGluZXMubWFwKGxpbmUgPT4ge1xuICAgICAgICAgICAgICAgIC8vIE1hdGNoIHRhc2sgbGluZXMgd2l0aCBvcGVuIGNoZWNrYm94ZXM6IC0gWyBdLCAqIFsgXSwgb3IgKyBbIF1cbiAgICAgICAgICAgICAgICAvLyBSZWdleCBleHBsYW5hdGlvbjpcbiAgICAgICAgICAgICAgICAvLyBeKFxccyopICAgICAgLSBTdGFydCBvZiBsaW5lLCBjYXB0dXJlIGxlYWRpbmcgd2hpdGVzcGFjZVxuICAgICAgICAgICAgICAgIC8vIChbLSorXSkgICAgIC0gQ2FwdHVyZSBsaXN0IG1hcmtlclxuICAgICAgICAgICAgICAgIC8vIFxccysgICAgICAgICAtIE9uZSBvciBtb3JlIHNwYWNlcyBhZnRlciBtYXJrZXJcbiAgICAgICAgICAgICAgICAvLyBcXFsgICAgICAgICAgLSBPcGVuaW5nIGJyYWNrZXQgKGVzY2FwZWQpXG4gICAgICAgICAgICAgICAgLy8gXFxzICAgICAgICAgIC0gU3BhY2UgaW5zaWRlIGNoZWNrYm94XG4gICAgICAgICAgICAgICAgLy8gXFxdICAgICAgICAgIC0gQ2xvc2luZyBicmFja2V0IChlc2NhcGVkKVxuICAgICAgICAgICAgICAgIC8vICguKikgICAgICAgIC0gQ2FwdHVyZSBldmVyeXRoaW5nIGFmdGVyIGNoZWNrYm94IChpbmNsdWRpbmcgZW1wdHkpXG4gICAgICAgICAgICAgICAgY29uc3QgdGFza01hdGNoID0gbGluZS5tYXRjaCgvXihcXHMqKShbLSorXSlcXHMrXFxbXFxzXFxdKC4qKS8pO1xuXG4gICAgICAgICAgICAgICAgaWYgKHRhc2tNYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICB0YXNrQ291bnQrKztcbiAgICAgICAgICAgICAgICAgICAgbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBbLCBpbmRlbnQsIG1hcmtlciwgdGFza1RleHRdID0gdGFza01hdGNoO1xuICAgICAgICAgICAgICAgICAgICAvLyBSZXR1cm4gY2FuY2VsbGVkIHRhc2sgZm9ybWF0XG4gICAgICAgICAgICAgICAgICAgIC8vIHRhc2tUZXh0IGFscmVhZHkgaW5jbHVkZXMgYW55IGxlYWRpbmcvdHJhaWxpbmcgc3BhY2VzXG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBgJHtpbmRlbnR9JHttYXJrZXJ9IFstXSR7dGFza1RleHR9YDtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm4gbGluZTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBpZiAobW9kaWZpZWQpIHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgbmV3TGluZXMuam9pbignXFxuJykpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQoaGFuZGxlLCB7IGZpbGU6IGZpbGUubmFtZSwgdGFza0NvdW50LCBtb2RpZmllZCB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIHsgbW9kaWZpZWQsIHRhc2tDb3VudCB9O1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgUXVpY2sgUEFSQTogRXJyb3IgY2FuY2VsbGluZyB0YXNrcyBpbiAke2ZpbGUubmFtZX06YCwgZXJyb3IpO1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKGhhbmRsZSk7XG4gICAgICAgICAgICByZXR1cm4geyBtb2RpZmllZDogZmFsc2UsIHRhc2tDb3VudDogMCwgZXJyb3IgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENhbmNlbCBhbGwgb3BlbiB0YXNrcyBpbiBBcmNoaXZlIGZvbGRlclxuICAgICAqL1xuICAgIGFzeW5jIGNhbmNlbEFyY2hpdmVUYXNrcygpIHtcbiAgICAgICAgY29uc3QgaGFuZGxlID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ3Rhc2tzOmNhbmNlbC1hcmNoaXZlJyk7XG4gICAgICAgIGNvbnN0IGFyY2hpdmVGb2xkZXJQYXRoID0gdGhpcy5zZXR0aW5ncy5wYXJhRm9sZGVycz8uYXJjaGl2ZSB8fCAnNCAtIEFSQ0hJVkUnO1xuXG4gICAgICAgIC8vIEdldCBhbGwgbWFya2Rvd24gZmlsZXMgaW4gdGhlIGFyY2hpdmUgZm9sZGVyXG4gICAgICAgIGNvbnN0IGFsbEZpbGVzID0gdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpO1xuICAgICAgICBjb25zdCBhcmNoaXZlRmlsZXMgPSBhbGxGaWxlcy5maWx0ZXIoZmlsZSA9PlxuICAgICAgICAgICAgZmlsZS5wYXRoLnN0YXJ0c1dpdGgoYXJjaGl2ZUZvbGRlclBhdGggKyAnLycpIHx8IGZpbGUucGF0aCA9PT0gYXJjaGl2ZUZvbGRlclBhdGhcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoYXJjaGl2ZUZpbGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgbmV3IE5vdGljZShgTm8gZmlsZXMgZm91bmQgaW4gJHthcmNoaXZlRm9sZGVyUGF0aH1gKTtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZChoYW5kbGUpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbmV3IE5vdGljZShgU2Nhbm5pbmcgJHthcmNoaXZlRmlsZXMubGVuZ3RofSBmaWxlcyBpbiBBcmNoaXZlLi4uYCk7XG5cbiAgICAgICAgbGV0IGZpbGVzTW9kaWZpZWQgPSAwO1xuICAgICAgICBsZXQgdG90YWxUYXNrc0NhbmNlbGxlZCA9IDA7XG4gICAgICAgIGNvbnN0IGVycm9ycyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBhcmNoaXZlRmlsZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2FuY2VsVGFza3NJbkZpbGUoZmlsZSk7XG5cbiAgICAgICAgICAgIGlmIChyZXN1bHQuZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBlcnJvcnMucHVzaCh7IGZpbGU6IGZpbGUubmFtZSwgZXJyb3I6IHJlc3VsdC5lcnJvciB9KTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAocmVzdWx0Lm1vZGlmaWVkKSB7XG4gICAgICAgICAgICAgICAgZmlsZXNNb2RpZmllZCsrO1xuICAgICAgICAgICAgICAgIHRvdGFsVGFza3NDYW5jZWxsZWQgKz0gcmVzdWx0LnRhc2tDb3VudDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNob3cgc3VtbWFyeVxuICAgICAgICBpZiAoZXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgICAgICAgYENvbXBsZXRlZCB3aXRoIGVycm9yczogJHtmaWxlc01vZGlmaWVkfSBmaWxlcyB1cGRhdGVkLCBgICtcbiAgICAgICAgICAgICAgICBgJHt0b3RhbFRhc2tzQ2FuY2VsbGVkfSB0YXNrcyBjYW5jZWxsZWQsICR7ZXJyb3JzLmxlbmd0aH0gZXJyb3JzYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1F1aWNrIFBBUkE6IEVycm9ycyBkdXJpbmcgdGFzayBjYW5jZWxsYXRpb246JywgZXJyb3JzKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgICAgICAgYEFyY2hpdmUgdGFza3MgY2FuY2VsbGVkOiAke3RvdGFsVGFza3NDYW5jZWxsZWR9IHRhc2tzIGluICR7ZmlsZXNNb2RpZmllZH0gZmlsZXNgXG4gICAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKGhhbmRsZSwge1xuICAgICAgICAgICAgYXJjaGl2ZUZpbGVzOiBhcmNoaXZlRmlsZXMubGVuZ3RoLFxuICAgICAgICAgICAgZmlsZXNNb2RpZmllZCxcbiAgICAgICAgICAgIHRvdGFsVGFza3NDYW5jZWxsZWQsXG4gICAgICAgICAgICBlcnJvcnM6IGVycm9ycy5sZW5ndGhcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc29sZS5sb2coYFF1aWNrIFBBUkE6IEFyY2hpdmUgdGFzayBjYW5jZWxsYXRpb24gY29tcGxldGUgLSAke2ZpbGVzTW9kaWZpZWR9IGZpbGVzLCAke3RvdGFsVGFza3NDYW5jZWxsZWR9IHRhc2tzYCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogQ2FuY2VsIGFsbCBvcGVuIHRhc2tzIGluIGN1cnJlbnQgZmlsZVxuICAgICAqL1xuICAgIGFzeW5jIGNhbmNlbEN1cnJlbnRGaWxlVGFza3MoKSB7XG4gICAgICAgIGNvbnN0IGhhbmRsZSA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCd0YXNrczpjYW5jZWwtY3VycmVudCcpO1xuICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcblxuICAgICAgICBpZiAoIWZpbGUpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ05vIGFjdGl2ZSBmaWxlJyk7XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQoaGFuZGxlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuY2FuY2VsVGFza3NJbkZpbGUoZmlsZSk7XG5cbiAgICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgY2FuY2VsbGluZyB0YXNrczogJHtyZXN1bHQuZXJyb3IubWVzc2FnZX1gKTtcbiAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQubW9kaWZpZWQpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYENhbmNlbGxlZCAke3Jlc3VsdC50YXNrQ291bnR9IHRhc2tzIGluICR7ZmlsZS5uYW1lfWApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbmV3IE5vdGljZSgnTm8gb3BlbiB0YXNrcyBmb3VuZCBpbiBjdXJyZW50IGZpbGUnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZChoYW5kbGUpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFByZXZpZXcgd2hpY2ggdGFza3Mgd291bGQgYmUgY2FuY2VsbGVkIChkcnkgcnVuKVxuICAgICAqL1xuICAgIGFzeW5jIHByZXZpZXdBcmNoaXZlVGFza0NhbmNlbGxhdGlvbigpIHtcbiAgICAgICAgY29uc3QgaGFuZGxlID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ3Rhc2tzOnByZXZpZXctYXJjaGl2ZScpO1xuICAgICAgICBjb25zdCBhcmNoaXZlRm9sZGVyUGF0aCA9IHRoaXMuc2V0dGluZ3MucGFyYUZvbGRlcnM/LmFyY2hpdmUgfHwgJzQgLSBBUkNISVZFJztcblxuICAgICAgICBjb25zdCBhbGxGaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKTtcbiAgICAgICAgY29uc3QgYXJjaGl2ZUZpbGVzID0gYWxsRmlsZXMuZmlsdGVyKGZpbGUgPT5cbiAgICAgICAgICAgIGZpbGUucGF0aC5zdGFydHNXaXRoKGFyY2hpdmVGb2xkZXJQYXRoICsgJy8nKSB8fCBmaWxlLnBhdGggPT09IGFyY2hpdmVGb2xkZXJQYXRoXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGFyY2hpdmVGaWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYE5vIGZpbGVzIGZvdW5kIGluICR7YXJjaGl2ZUZvbGRlclBhdGh9YCk7XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQoaGFuZGxlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCB0b3RhbFRhc2tzID0gMDtcbiAgICAgICAgY29uc3QgZmlsZXNXaXRoVGFza3MgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgYXJjaGl2ZUZpbGVzKSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgICAgIGNvbnN0IHRhc2tNYXRjaGVzID0gY29udGVudC5tYXRjaCgvXihcXHMqKShbLSorXSlcXHMrXFxbXFxzXFxdKC4qKS9nbSk7XG5cbiAgICAgICAgICAgIGlmICh0YXNrTWF0Y2hlcyAmJiB0YXNrTWF0Y2hlcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgdG90YWxUYXNrcyArPSB0YXNrTWF0Y2hlcy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgZmlsZXNXaXRoVGFza3MucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgIHBhdGg6IGZpbGUucGF0aCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogZmlsZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICB0YXNrQ291bnQ6IHRhc2tNYXRjaGVzLmxlbmd0aFxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRvdGFsVGFza3MgPT09IDApIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ05vIG9wZW4gdGFza3MgZm91bmQgaW4gQXJjaGl2ZSBmb2xkZXInKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdRdWljayBQQVJBOiBBcmNoaXZlIHRhc2sgcHJldmlldzonLCB7XG4gICAgICAgICAgICAgICAgdG90YWxGaWxlczogYXJjaGl2ZUZpbGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBmaWxlc1dpdGhUYXNrczogZmlsZXNXaXRoVGFza3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgIHRvdGFsT3BlblRhc2tzOiB0b3RhbFRhc2tzLFxuICAgICAgICAgICAgICAgIGZpbGVzOiBmaWxlc1dpdGhUYXNrc1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIG5ldyBOb3RpY2UoXG4gICAgICAgICAgICAgICAgYFByZXZpZXc6ICR7dG90YWxUYXNrc30gb3BlbiB0YXNrcyBmb3VuZCBpbiAke2ZpbGVzV2l0aFRhc2tzLmxlbmd0aH0gZmlsZXMuIGAgK1xuICAgICAgICAgICAgICAgIGBDaGVjayBjb25zb2xlIGZvciBkZXRhaWxzLmBcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQoaGFuZGxlLCB7XG4gICAgICAgICAgICB0b3RhbFRhc2tzLFxuICAgICAgICAgICAgZmlsZXNXaXRoVGFza3M6IGZpbGVzV2l0aFRhc2tzLmxlbmd0aFxuICAgICAgICB9KTtcbiAgICB9XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIFNFVFRJTkdTIFRBQlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jbGFzcyBRdWlja1BhcmFTZXR0aW5nVGFiIGV4dGVuZHMgUGx1Z2luU2V0dGluZ1RhYiB7XG4gICAgY29uc3RydWN0b3IoYXBwLCBwbHVnaW4pIHtcbiAgICAgICAgc3VwZXIoYXBwLCBwbHVnaW4pO1xuICAgICAgICB0aGlzLnBsdWdpbiA9IHBsdWdpbjtcbiAgICB9XG5cbiAgICBkaXNwbGF5KCkge1xuICAgICAgICBjb25zdCB7IGNvbnRhaW5lckVsIH0gPSB0aGlzO1xuICAgICAgICBjb250YWluZXJFbC5lbXB0eSgpO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMScsIHsgdGV4dDogJ1F1aWNrIFBBUkEgU2V0dGluZ3MnIH0pO1xuXG4gICAgICAgIC8vIEhlYWRlciBkZXNjcmlwdGlvblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdRdWljayBQQVJBIGhlbHBzIHlvdSBvcmdhbml6ZSB5b3VyIE9ic2lkaWFuIHZhdWx0IHVzaW5nIHRoZSBQQVJBIG1ldGhvZCAoUHJvamVjdHMsIEFyZWFzLCBSZXNvdXJjZXMsIEFyY2hpdmUpLiBUaGlzIHBsdWdpbiBhdXRvbWF0ZXMgZm9sZGVyIHNldHVwLCB0ZW1wbGF0ZSBkZXBsb3ltZW50LCBhbmQgdGFzayBtYW5hZ2VtZW50IGZvciBhcmNoaXZlZCBub3Rlcy4nLFxuICAgICAgICAgICAgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJ1xuICAgICAgICB9KTtcblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdMZWFybiBtb3JlIGFib3V0IFBBUkE6IFNlZSB0aGUgXCJQQVJBIE1ldGhvZCBPdmVydmlld1wiIG5vdGUgaW4geW91ciBSZXNvdXJjZXMgZm9sZGVyLicsXG4gICAgICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdocicpO1xuXG4gICAgICAgIC8vIEFjdGlvbnMgU2VjdGlvbiAtIEFUIFRIRSBUT1BcbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnUXVpY2sgQWN0aW9ucycgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnXHVEODNEXHVERTgwIFJ1biBTZXR1cCBXaXphcmQnKVxuICAgICAgICAgICAgLnNldERlc2MoJ0xhdW5jaCB0aGUgc3RlcC1ieS1zdGVwIHNldHVwIHdpemFyZCB0byBjcmVhdGUgeW91ciBQQVJBIGZvbGRlciBzdHJ1Y3R1cmUgYW5kIGRlcGxveSB0ZW1wbGF0ZXMnKVxuICAgICAgICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXG4gICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQoJ1J1biBTZXR1cCBXaXphcmQnKVxuICAgICAgICAgICAgICAgIC5zZXRDdGEoKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4ucHJvdmlzaW9uaW5nTWFuYWdlci5ydW5TZXR1cFdpemFyZCgpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdcdUQ4M0RcdUREMEQgQ2hlY2sgRGVwZW5kZW5jaWVzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdWZXJpZnkgdGhhdCByZXF1aXJlZCBwbHVnaW5zIChUZW1wbGF0ZXIsIFRhc2tzKSBhcmUgaW5zdGFsbGVkLiBNYWtlIHN1cmUgZWFjaCBwbHVnaW4gaXMgYWxzbyBhY3RpdmUgYWZ0ZXIgaW5zdGFsbGF0aW9uLicpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnQ2hlY2sgRGVwZW5kZW5jaWVzJylcbiAgICAgICAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLmNoZWNrRGVwZW5kZW5jaWVzKHRydWUpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdcdUQ4M0NcdURGRjdcdUZFMEYgVXBkYXRlIEFsbCBQQVJBIFRhZ3MnKVxuICAgICAgICAgICAgLnNldERlc2MoJ0J1bGsgdXBkYXRlIFBBUkEgdGFncyBmb3IgYWxsIGZpbGVzIGluIHlvdXIgdmF1bHQgdG8gbWF0Y2ggdGhlaXIgY3VycmVudCBmb2xkZXIgbG9jYXRpb25zJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdVcGRhdGUgQWxsIFRhZ3MnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udGFnZ2luZ01hbmFnZXIuYnVsa1VwZGF0ZVRhZ3MoKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnXHVEODNEXHVEQ0REIERlcGxveSBQQVJBIFRlbXBsYXRlcycpXG4gICAgICAgICAgICAuc2V0RGVzYygnSW5zdGFsbCBkZWZhdWx0IHRlbXBsYXRlcyBmb3Igbm90ZXMgaW4gZWFjaCBQQVJBIGZvbGRlciAoaW5ib3gsIHByb2plY3RzLCBhcmVhcywgcmVzb3VyY2VzLCBhcmNoaXZlKSwgcGx1cyB0aGUgUEFSQSBNZXRob2QgT3ZlcnZpZXcgZ3VpZGUuIFRoZXNlIGFyZSBzdGFydGluZyBwb2ludHMgeW91IGNhbiBjdXN0b21pemUgdG8geW91ciBsaWtpbmcuIFNldCB0aGVzZSB0ZW1wbGF0ZXMgaW4gVGVtcGxhdGVyIHBsdWdpbiBzZXR0aW5ncyB0byB1c2UgdGhlbSB3aGVuIGNyZWF0aW5nIG5ldyBub3Rlcy4gT25seSBjcmVhdGVzIG1pc3NpbmcgdGVtcGxhdGVzLCB3aWxsIG5vdCBvdmVyd3JpdGUgeW91ciBjdXN0b21pemF0aW9ucy4nKVxuICAgICAgICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXG4gICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQoJ0RlcGxveSBUZW1wbGF0ZXMnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udGVtcGxhdGVNYW5hZ2VyLmRlcGxveUFsbFRlbXBsYXRlcygpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdcdTI3NEMgQ2FuY2VsIEFyY2hpdmUgVGFza3MnKVxuICAgICAgICAgICAgLnNldERlc2MoJ0NhbmNlbCBhbGwgb3BlbiB0YXNrcyBpbiB5b3VyIEFyY2hpdmUgZm9sZGVyLiBVc2VmdWwgZm9yIGNsZWFuaW5nIHVwIHRhc2tzIGZyb20gY2FuY2VsbGVkIG9yIGNvbXBsZXRlZCBwcm9qZWN0cy4nKVxuICAgICAgICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXG4gICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQoJ0NhbmNlbCBBcmNoaXZlIFRhc2tzJylcbiAgICAgICAgICAgICAgICAuc2V0V2FybmluZygpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29uZmlybSgnVGhpcyB3aWxsIGNhbmNlbCBhbGwgb3BlbiB0YXNrcyBpbiB5b3VyIEFyY2hpdmUgZm9sZGVyIGJ5IGNvbnZlcnRpbmcgWyBdIHRvIFstXS4gVGhpcyBjYW5ub3QgYmUgdW5kb25lIGV4Y2VwdCB0aHJvdWdoIHVuZG8gaGlzdG9yeS5cXG5cXG5Db250aW51ZT8nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udGFza01hbmFnZXIuY2FuY2VsQXJjaGl2ZVRhc2tzKCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgLy8gRGVwZW5kZW5jeSBsaW5rc1xuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDQnLCB7IHRleHQ6ICdSZXF1aXJlZCBEZXBlbmRlbmNpZXMnIH0pO1xuXG4gICAgICAgIGNvbnN0IHRlbXBsYXRlckxpbmsgPSBjb250YWluZXJFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nIH0pO1xuICAgICAgICB0ZW1wbGF0ZXJMaW5rLmlubmVySFRNTCA9ICdcdTIwMjIgPHN0cm9uZz5UZW1wbGF0ZXI8L3N0cm9uZz46IFJlcXVpcmVkIGZvciB0ZW1wbGF0ZSB2YXJpYWJsZSBzdWJzdGl0dXRpb24uIDxhIGhyZWY9XCJvYnNpZGlhbjovL3Nob3ctcGx1Z2luP2lkPXRlbXBsYXRlci1vYnNpZGlhblwiPkluc3RhbGwgZnJvbSBDb21tdW5pdHkgUGx1Z2luczwvYT4nO1xuXG4gICAgICAgIGNvbnN0IHRhc2tzTGluayA9IGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbicgfSk7XG4gICAgICAgIHRhc2tzTGluay5pbm5lckhUTUwgPSAnXHUyMDIyIDxzdHJvbmc+VGFza3M8L3N0cm9uZz46IFJlcXVpcmVkIGZvciB0YXNrIG1hbmFnZW1lbnQgZmVhdHVyZXMuIDxhIGhyZWY9XCJvYnNpZGlhbjovL3Nob3ctcGx1Z2luP2lkPW9ic2lkaWFuLXRhc2tzLXBsdWdpblwiPkluc3RhbGwgZnJvbSBDb21tdW5pdHkgUGx1Z2luczwvYT4nO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdocicpO1xuXG4gICAgICAgIC8vIFBBUkEgRm9sZGVycyBTZWN0aW9uXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ1BBUkEgRm9sZGVyIENvbmZpZ3VyYXRpb24nIH0pO1xuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdDb25maWd1cmUgdGhlIG5hbWVzIG9mIHlvdXIgZml2ZSBjb3JlIFBBUkEgZm9sZGVycy4gVGhlc2UgZm9sZGVycyB3aWxsIGJlIGNyZWF0ZWQgYXV0b21hdGljYWxseSBkdXJpbmcgc2V0dXAgaWYgdGhleSBkb25cXCd0IGV4aXN0LiBUaGUgcGx1Z2luIHVzZXMgdGhlc2UgcGF0aHMgdG8gZGV0ZXJtaW5lIHdoZXJlIG5vdGVzIGJlbG9uZyBhbmQgd2hhdCBwcm9wZXJ0aWVzIHRvIGFzc2lnbi4nLFxuICAgICAgICAgICAgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJ1xuICAgICAgICB9KTtcblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdOb3RlOiBGb2xkZXIgbmFtZXMgYXJlIGNhc2UtaW5zZW5zaXRpdmUuIFRoZSBwbHVnaW4gd2lsbCBtYXRjaCBcIjEgLSBwcm9qZWN0c1wiLCBcIjEgLSBQcm9qZWN0c1wiLCBvciBcIjEgLSBQUk9KRUNUU1wiIGVxdWFsbHkuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ3JlYXRlIGZvbGRlciBzdWdnZXN0aW9ucyBkYXRhbGlzdCAoc2hhcmVkIGJ5IGFsbCBmb2xkZXIgaW5wdXRzKVxuICAgICAgICBjb25zdCBmb2xkZXJzID0gdGhpcy5hcHAudmF1bHQuZ2V0QWxsTG9hZGVkRmlsZXMoKVxuICAgICAgICAgICAgLmZpbHRlcihmID0+IGYuY2hpbGRyZW4gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIC5tYXAoZiA9PiBmLnBhdGgpXG4gICAgICAgICAgICAuc29ydCgpO1xuICAgICAgICBjb25zdCBkYXRhbGlzdElkID0gJ3BhcmEtZm9sZGVyLXN1Z2dlc3QnO1xuICAgICAgICBjb25zdCBkYXRhbGlzdCA9IGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdkYXRhbGlzdCcsIHsgYXR0cjogeyBpZDogZGF0YWxpc3RJZCB9IH0pO1xuICAgICAgICBmb2xkZXJzLmZvckVhY2goZm9sZGVyID0+IHtcbiAgICAgICAgICAgIGRhdGFsaXN0LmNyZWF0ZUVsKCdvcHRpb24nLCB7IHZhbHVlOiBmb2xkZXIgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGluYm94U2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0luYm94IEZvbGRlcicpXG4gICAgICAgICAgICAuc2V0RGVzYygnVG9wLWxldmVsIGZvbGRlciBmb3IgaW5ib3ggaXRlbXMnKTtcbiAgICAgICAgY29uc3QgaW5ib3hJbnB1dCA9IGluYm94U2V0dGluZy5jb250cm9sRWwuY3JlYXRlRWwoJ2lucHV0Jywge1xuICAgICAgICAgICAgdHlwZTogJ3RleHQnLFxuICAgICAgICAgICAgcGxhY2Vob2xkZXI6ICcwIC0gSU5CT1gnLFxuICAgICAgICAgICAgdmFsdWU6IHRoaXMucGx1Z2luLnNldHRpbmdzLnBhcmFGb2xkZXJzLmluYm94LFxuICAgICAgICAgICAgYXR0cjogeyBsaXN0OiBkYXRhbGlzdElkIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGluYm94SW5wdXQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgIGluYm94SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFyYUZvbGRlcnMuaW5ib3ggPSBlLnRhcmdldC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgcHJvamVjdHNTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnUHJvamVjdHMgRm9sZGVyJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdUb3AtbGV2ZWwgZm9sZGVyIGZvciBhY3RpdmUgcHJvamVjdHMnKTtcbiAgICAgICAgY29uc3QgcHJvamVjdHNJbnB1dCA9IHByb2plY3RzU2V0dGluZy5jb250cm9sRWwuY3JlYXRlRWwoJ2lucHV0Jywge1xuICAgICAgICAgICAgdHlwZTogJ3RleHQnLFxuICAgICAgICAgICAgcGxhY2Vob2xkZXI6ICcxIC0gUFJPSkVDVFMnLFxuICAgICAgICAgICAgdmFsdWU6IHRoaXMucGx1Z2luLnNldHRpbmdzLnBhcmFGb2xkZXJzLnByb2plY3RzLFxuICAgICAgICAgICAgYXR0cjogeyBsaXN0OiBkYXRhbGlzdElkIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHByb2plY3RzSW5wdXQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgIHByb2plY3RzSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFyYUZvbGRlcnMucHJvamVjdHMgPSBlLnRhcmdldC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgYXJlYXNTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnQXJlYXMgRm9sZGVyJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdUb3AtbGV2ZWwgZm9sZGVyIGZvciBvbmdvaW5nIGFyZWFzJyk7XG4gICAgICAgIGNvbnN0IGFyZWFzSW5wdXQgPSBhcmVhc1NldHRpbmcuY29udHJvbEVsLmNyZWF0ZUVsKCdpbnB1dCcsIHtcbiAgICAgICAgICAgIHR5cGU6ICd0ZXh0JyxcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyOiAnMiAtIEFSRUFTJyxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXJhRm9sZGVycy5hcmVhcyxcbiAgICAgICAgICAgIGF0dHI6IHsgbGlzdDogZGF0YWxpc3RJZCB9XG4gICAgICAgIH0pO1xuICAgICAgICBhcmVhc0lucHV0LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuICAgICAgICBhcmVhc0lucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBhcmFGb2xkZXJzLmFyZWFzID0gZS50YXJnZXQudmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHJlc291cmNlc1NldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdSZXNvdXJjZXMgRm9sZGVyJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdUb3AtbGV2ZWwgZm9sZGVyIGZvciByZWZlcmVuY2UgbWF0ZXJpYWxzJyk7XG4gICAgICAgIGNvbnN0IHJlc291cmNlc0lucHV0ID0gcmVzb3VyY2VzU2V0dGluZy5jb250cm9sRWwuY3JlYXRlRWwoJ2lucHV0Jywge1xuICAgICAgICAgICAgdHlwZTogJ3RleHQnLFxuICAgICAgICAgICAgcGxhY2Vob2xkZXI6ICczIC0gUkVTT1VSQ0VTJyxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXJhRm9sZGVycy5yZXNvdXJjZXMsXG4gICAgICAgICAgICBhdHRyOiB7IGxpc3Q6IGRhdGFsaXN0SWQgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmVzb3VyY2VzSW5wdXQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgIHJlc291cmNlc0lucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBhcmFGb2xkZXJzLnJlc291cmNlcyA9IGUudGFyZ2V0LnZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBhcmNoaXZlU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0FyY2hpdmUgRm9sZGVyJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdUb3AtbGV2ZWwgZm9sZGVyIGZvciBhcmNoaXZlZCBpdGVtcycpO1xuICAgICAgICBjb25zdCBhcmNoaXZlSW5wdXQgPSBhcmNoaXZlU2V0dGluZy5jb250cm9sRWwuY3JlYXRlRWwoJ2lucHV0Jywge1xuICAgICAgICAgICAgdHlwZTogJ3RleHQnLFxuICAgICAgICAgICAgcGxhY2Vob2xkZXI6ICc0IC0gQVJDSElWRScsXG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFyYUZvbGRlcnMuYXJjaGl2ZSxcbiAgICAgICAgICAgIGF0dHI6IHsgbGlzdDogZGF0YWxpc3RJZCB9XG4gICAgICAgIH0pO1xuICAgICAgICBhcmNoaXZlSW5wdXQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgIGFyY2hpdmVJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXJhRm9sZGVycy5hcmNoaXZlID0gZS50YXJnZXQudmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdocicpO1xuXG4gICAgICAgIC8vIFRhZ2dpbmcgQmVoYXZpb3IgU2VjdGlvblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdBdXRvbWF0aWMgVGFnZ2luZyBCZWhhdmlvcicgfSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICB0ZXh0OiAnQ29udHJvbCBob3cgdGhlIHBsdWdpbiBhdXRvbWF0aWNhbGx5IGFzc2lnbnMgcHJvcGVydGllcyBhbmQgdGFncyB3aGVuIHlvdSBjcmVhdGUgb3IgbW92ZSBub3Rlcy4gVGhlIFwicGFyYVwiIHByb3BlcnR5IChsb2NrZWQgdG8gdGhpcyBuYW1lKSBhbHdheXMgcmVmbGVjdHMgYSBub3RlXFwncyBjdXJyZW50IFBBUkEgbG9jYXRpb24sIHdoaWxlIHN1YmZvbGRlciB0YWdzIHByb3ZpZGUgaGlzdG9yaWNhbCBjb250ZXh0LicsXG4gICAgICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1ByZXNlcnZlIFN1YmZvbGRlciBUYWdzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdXaGVuIGVuYWJsZWQsIHRhZ3MgZnJvbSBzdWJmb2xkZXIgbmFtZXMgcGVyc2lzdCBldmVuIHdoZW4geW91IG1vdmUgbm90ZXMgYmV0d2VlbiBQQVJBIGZvbGRlcnMuIFRoaXMgcHJlc2VydmVzIHByb2plY3QgY29udGV4dCBvdmVyIHRpbWUuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50YWdnaW5nLnBlcnNpc3RTdWJmb2xkZXJUYWdzKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudGFnZ2luZy5wZXJzaXN0U3ViZm9sZGVyVGFncyA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2hyJyk7XG5cbiAgICAgICAgLy8gVGVtcGxhdGUgTWFuYWdlbWVudCBTZWN0aW9uXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ1BBUkEgVGVtcGxhdGVzJyB9KTtcblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdNYW5hZ2UgdGhlIGRlZmF1bHQgdGVtcGxhdGVzIHRoYXQgZ2V0IGRlcGxveWVkIHRvIHlvdXIgdmF1bHQuIFRlbXBsYXRlcyBhcmUgc3RvcmVkIGluIFwiMyAtIFJFU09VUkNFUy9URU1QTEFURVMvXCIgYW5kIHVzZSBUZW1wbGF0ZXIgc3ludGF4IGZvciBkeW5hbWljIGNvbnRlbnQuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICB0ZXh0OiAnTm90ZTogVGVtcGxhdGUgZmlsZXMgdGhlbXNlbHZlcyBuZXZlciByZWNlaXZlIFBBUkEgcHJvcGVydGllcyAtIHRoZXkgcmVtYWluIFwiY2xlYW5cIiBzbyBuZXcgbm90ZXMgY3JlYXRlZCBmcm9tIHRoZW0gc3RhcnQgZnJlc2guJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnQXV0by1EZXBsb3kgVGVtcGxhdGVzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdBdXRvbWF0aWNhbGx5IGRlcGxveSB0ZW1wbGF0ZXMgZHVyaW5nIHNldHVwIHdpemFyZCcpXG4gICAgICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGxhdGVzLmF1dG9EZXBsb3lPblNldHVwKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGxhdGVzLmF1dG9EZXBsb3lPblNldHVwID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdDbGVhbiBUZW1wbGF0ZSBGaWxlcycpXG4gICAgICAgICAgICAuc2V0RGVzYygnVXNlIHRoaXMgaWYgd2hlbiB5b3UgY3JlYXRlIG5ldyBub3RlcywgdGhleSBhcmUgYmVpbmcgcHJlLWFzc2lnbmVkIG9kZCB0YWdzIG9yIFBBUkEgcHJvcGVydGllcyB0aGF0IGRvblxcJ3QgbWF0Y2ggdGhlIGZvbGRlciB5b3UgcGxhY2UgdGhlbSBpbi4gVGhpcyByZXNldHMgdGVtcGxhdGUgZmlsZXMgdG8gcmVtb3ZlIGFueSBhY2NpZGVudGFsbHkgc2F2ZWQgZnJvbnRtYXR0ZXIuJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdDbGVhbiBUZW1wbGF0ZXMnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udGFnZ2luZ01hbmFnZXIuY2xlYW5UZW1wbGF0ZUZpbGVzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdocicpO1xuXG4gICAgICAgIC8vIERpYWdub3N0aWNzIFNlY3Rpb25cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnRGlhZ25vc3RpY3MgJiBQcm9maWxpbmcnIH0pO1xuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdVc2UgdGhlc2Ugb3B0aW9ucyB3aGlsZSB3b3JraW5nIG9uIElzc3VlIEIgKG1vYmlsZSBvcHRpbWl6YXRpb24pIHRvIGNhcHR1cmUgcGVyZm9ybWFuY2UgdGltaW5ncyBhbmQgZXZlbnQgY291bnRzLiBEaXNhYmxlIHByb2ZpbGluZyB3aGVuIG5vdCBhY3RpdmVseSBiZW5jaG1hcmtpbmcuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnRW5hYmxlIHByb2ZpbGluZyBsb2dzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdSZWNvcmRzIHRpbWluZyBkYXRhIGZvciBrZXkgb3BlcmF0aW9ucyBhbmQgd2FybnMgd2hlbiBhIGNhbGwgZXhjZWVkcyB0aGUgY29uZmlndXJlZCB0aHJlc2hvbGQuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5wcm9maWxpbmdFbmFibGVkKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZGlhZ25vc3RpY3MucHJvZmlsaW5nRW5hYmxlZCA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXZhbHVlICYmIHRoaXMucGx1Z2luLnNldHRpbmdzLmRpYWdub3N0aWNzLmxvZ1N1bW1hcnlPblVubG9hZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nUGVyZm9ybWFuY2VTbmFwc2hvdCgncHJvZmlsaW5nLWRpc2FibGVkJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5hcHBseVByb2ZpbGVyU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnU2xvdyBvcGVyYXRpb24gdGhyZXNob2xkIChtcyknKVxuICAgICAgICAgICAgLnNldERlc2MoJ09wZXJhdGlvbnMgdGFraW5nIGxvbmdlciB0aGFuIHRoaXMgd2lsbCB0cmlnZ2VyIGEgY29uc29sZSB3YXJuaW5nLicpXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcbiAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJzIwMCcpXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5zbG93T3BlcmF0aW9uVGhyZXNob2xkTXMpKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGFyc2VkKSAmJiBwYXJzZWQgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5zbG93T3BlcmF0aW9uVGhyZXNob2xkTXMgPSBwYXJzZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmFwcGx5UHJvZmlsZXJTZXR0aW5ncygpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0xvZyBzdW1tYXJ5IG9uIHVubG9hZCcpXG4gICAgICAgICAgICAuc2V0RGVzYygnQXV0b21hdGljYWxseSBsb2dzIGEgcHJvZmlsaW5nIHN1bW1hcnkgd2hlbiB0aGUgcGx1Z2luIHVubG9hZHMgb3IgcHJvZmlsaW5nIGlzIHR1cm5lZCBvZmYuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5sb2dTdW1tYXJ5T25VbmxvYWQpXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5sb2dTdW1tYXJ5T25VbmxvYWQgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0xvZyBzbmFwc2hvdCBub3cnKVxuICAgICAgICAgICAgLnNldERlc2MoJ1dyaXRlcyB0aGUgY3VycmVudCBjb3VudGVycyBhbmQgdGltaW5ncyB0byB0aGUgZGV2ZWxvcGVyIGNvbnNvbGUuJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdMb2cgU25hcHNob3QnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5wcm9maWxpbmdFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCdFbmFibGUgcHJvZmlsaW5nIGJlZm9yZSBsb2dnaW5nIGEgc25hcHNob3QuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nUGVyZm9ybWFuY2VTbmFwc2hvdCgnc2V0dGluZ3MtcGFuZWwnKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnUmVzZXQgcHJvZmlsaW5nIHNlc3Npb24nKVxuICAgICAgICAgICAgLnNldERlc2MoJ0NsZWFycyBhY2N1bXVsYXRlZCBjb3VudGVycy90aW1pbmdzIGFuZCByZXN0YXJ0cyB0aGUgcHJvZmlsaW5nIGNsb2NrLicpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnUmVzZXQgQ291bnRlcnMnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGx1Z2luLnByb2ZpbGVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5wcm9maWxlci5yZXNldCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnUHJvZmlsaW5nIHNlc3Npb24gcmVzZXQuJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2hyJyk7XG5cbiAgICAgICAgLy8gVGFzayBNYW5hZ2VtZW50IFNlY3Rpb25cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnVGFzayBNYW5hZ2VtZW50JyB9KTtcbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICB0ZXh0OiAnV2hlbiBub3RlcyBhcmUgbW92ZWQgdG8gQXJjaGl2ZSwgdGhleSBvZnRlbiBjb250YWluIG9wZW4gdGFza3MgdGhhdCBhcmUgbm8gbG9uZ2VyIHJlbGV2YW50LiBVc2UgdGhlc2UgdG9vbHMgdG8gYXV0b21hdGljYWxseSBjYW5jZWwgdGhvc2UgdGFza3MuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnQXV0b21hdGljYWxseSBjYW5jZWwgdGFza3Mgd2hlbiBhcmNoaXZpbmcnKVxuICAgICAgICAgICAgLnNldERlc2MoJ1doZW4gYSBub3RlIGlzIG1vdmVkIHRvIEFyY2hpdmUsIGF1dG9tYXRpY2FsbHkgY2FuY2VsIGFsbCBvcGVuIHRhc2tzIFsgXSBcdTIxOTIgWy1dLiBEaXNhYmxlZCBieSBkZWZhdWx0IGZvciBzYWZldHkuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50YXNrcy5hdXRvQ2FuY2VsT25BcmNoaXZlKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudGFza3MuYXV0b0NhbmNlbE9uQXJjaGl2ZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnU2hvdyBub3RpY2VzIGZvciBhdXRvLWNhbmNlbGxlZCB0YXNrcycpXG4gICAgICAgICAgICAuc2V0RGVzYygnRGlzcGxheSBhIG5vdGlmaWNhdGlvbiB3aGVuIHRhc2tzIGFyZSBhdXRvbWF0aWNhbGx5IGNhbmNlbGxlZCBkdXJpbmcgYXJjaGl2aW5nJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50YXNrcy5zaG93Q2FuY2VsbGF0aW9uTm90aWNlcylcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnRhc2tzLnNob3dDYW5jZWxsYXRpb25Ob3RpY2VzID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDQnLCB7IHRleHQ6ICdNYW51YWwgVGFzayBPcGVyYXRpb25zJyB9KTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdcdUQ4M0RcdUREMEQgUHJldmlldyBBcmNoaXZlIFRhc2tzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdTZWUgaG93IG1hbnkgb3BlbiB0YXNrcyBleGlzdCBpbiB5b3VyIEFyY2hpdmUgZm9sZGVyIHdpdGhvdXQgbWFraW5nIGFueSBjaGFuZ2VzJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdQcmV2aWV3JylcbiAgICAgICAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnRhc2tNYW5hZ2VyLnByZXZpZXdBcmNoaXZlVGFza0NhbmNlbGxhdGlvbigpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdcdTI3NEMgQ2FuY2VsIEFyY2hpdmUgVGFza3MnKVxuICAgICAgICAgICAgLnNldERlc2MoJ0NhbmNlbCBhbGwgb3BlbiB0YXNrcyBpbiBBcmNoaXZlIGZvbGRlciAoY29udmVydHMgWyBdIHRvIFstXSkuIFRoaXMgaXMgdXNlZnVsIGZvciBjbGVhbmluZyB1cCBkdXBsaWNhdGl2ZSBvciBjYW5jZWxsZWQgdGFza3MuJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdDYW5jZWwgQXJjaGl2ZSBUYXNrcycpXG4gICAgICAgICAgICAgICAgLnNldFdhcm5pbmcoKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbmZpcm0oJ1RoaXMgd2lsbCBjYW5jZWwgYWxsIG9wZW4gdGFza3MgaW4geW91ciBBcmNoaXZlIGZvbGRlciBieSBjb252ZXJ0aW5nIFsgXSB0byBbLV0uIFRoaXMgY2Fubm90IGJlIHVuZG9uZSBleGNlcHQgdGhyb3VnaCB1bmRvIGhpc3RvcnkuXFxuXFxuQ29udGludWU/JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnRhc2tNYW5hZ2VyLmNhbmNlbEFyY2hpdmVUYXNrcygpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1x1Mjc0QyBDYW5jZWwgQ3VycmVudCBGaWxlIFRhc2tzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdDYW5jZWwgYWxsIG9wZW4gdGFza3MgaW4gdGhlIGN1cnJlbnRseSBhY3RpdmUgZmlsZScpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnQ2FuY2VsIEN1cnJlbnQgRmlsZScpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi50YXNrTWFuYWdlci5jYW5jZWxDdXJyZW50RmlsZVRhc2tzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgdGV4dDogJ1RpcDogWW91IGNhbiBhbHNvIGFjY2VzcyB0aGVzZSBjb21tYW5kcyBmcm9tIHRoZSBDb21tYW5kIFBhbGV0dGUgKEN0cmwvQ21kK1ApLicsXG4gICAgICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdocicpO1xuXG4gICAgICAgIC8vIEFkdmFuY2VkIFNlY3Rpb25cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnQWR2YW5jZWQgU2V0dGluZ3MnIH0pO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1Jlc2V0IHRvIERlZmF1bHRzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdcdTI2QTBcdUZFMEYgV0FSTklORzogVGhpcyB3aWxsIHJlc3RvcmUgYWxsIHNldHRpbmdzIHRvIGRlZmF1bHRzIEFORCByZWdlbmVyYXRlIGFsbCB0ZW1wbGF0ZXMgZnJvbSBkZWZhdWx0cywgb3ZlcndyaXRpbmcgYW55IGN1c3RvbWl6YXRpb25zIHlvdSBtYWRlLiBZb3VyIGZvbGRlcnMgYW5kIG5vdGVzIHdpbGwgbm90IGJlIGFmZmVjdGVkLicpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnUmVzZXQgQWxsIFNldHRpbmdzJylcbiAgICAgICAgICAgICAgICAuc2V0V2FybmluZygpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29uZmlybSgnXHUyNkEwXHVGRTBGIFdBUk5JTkc6IFRoaXMgd2lsbDpcXG5cXG4xLiBSZXNldCBBTEwgcGx1Z2luIHNldHRpbmdzIHRvIGRlZmF1bHRzXFxuMi4gT1ZFUldSSVRFIGFsbCB0ZW1wbGF0ZXMgd2l0aCBkZWZhdWx0cyAoeW91ciBjdXN0b20gdGVtcGxhdGUgY2hhbmdlcyB3aWxsIGJlIGxvc3QpXFxuXFxuWW91ciBmb2xkZXJzIGFuZCBub3RlcyB3aWxsIE5PVCBiZSBhZmZlY3RlZC5cXG5cXG5BcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gY29udGludWU/JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFJlc2V0IHNldHRpbmdzXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvcmNlIHJlZ2VuZXJhdGUgYWxsIHRlbXBsYXRlc1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udGVtcGxhdGVNYW5hZ2VyLmZvcmNlUmVnZW5lcmF0ZUFsbFRlbXBsYXRlcygpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBSZWZyZXNoIHNldHRpbmdzIFVJXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICB9XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIE1BSU4gUExVR0lOIENMQVNTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgUXVpY2tQYXJhUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgICBhc3luYyBvbmxvYWQoKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKCdMb2FkaW5nIFF1aWNrIFBBUkEgcGx1Z2luJyk7XG5cbiAgICAgICAgLy8gTG9hZCBzZXR0aW5nc1xuICAgICAgICBhd2FpdCB0aGlzLmxvYWRTZXR0aW5ncygpO1xuICAgICAgICB0aGlzLmluaXRpYWxpemVQcm9maWxlcigpO1xuICAgICAgICBjb25zdCBvbmxvYWRUaW1lciA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCdwbHVnaW46b25sb2FkJyk7XG5cbiAgICAgICAgLy8gSW5pdGlhbGl6ZSBtYW5hZ2VycyAob3JkZXIgbWF0dGVyczogdGFza01hbmFnZXIgbXVzdCBleGlzdCBiZWZvcmUgdGFnZ2luZ01hbmFnZXIpXG4gICAgICAgIHRoaXMuZGVwZW5kZW5jeU1hbmFnZXIgPSBuZXcgRGVwZW5kZW5jeU1hbmFnZXIodGhpcy5hcHApO1xuICAgICAgICB0aGlzLnByb3Zpc2lvbmluZ01hbmFnZXIgPSBuZXcgUHJvdmlzaW9uaW5nTWFuYWdlcih0aGlzLmFwcCwgdGhpcy5zZXR0aW5ncyk7XG4gICAgICAgIHRoaXMudGFza01hbmFnZXIgPSBuZXcgVGFza01hbmFnZXIodGhpcy5hcHAsIHRoaXMuc2V0dGluZ3MsIHRoaXMucHJvZmlsZXIpO1xuICAgICAgICB0aGlzLnRhZ2dpbmdNYW5hZ2VyID0gbmV3IFRhZ2dpbmdNYW5hZ2VyKHRoaXMuYXBwLCB0aGlzLnNldHRpbmdzLCB0aGlzLnByb2ZpbGVyLCB0aGlzLnRhc2tNYW5hZ2VyKTtcbiAgICAgICAgdGhpcy5hZ2VuZGFNYW5hZ2VyID0gbmV3IEFnZW5kYU1hbmFnZXIodGhpcy5hcHAsIHRoaXMuc2V0dGluZ3MsIHRoaXMucHJvZmlsZXIpO1xuICAgICAgICB0aGlzLnRlbXBsYXRlTWFuYWdlciA9IG5ldyBUZW1wbGF0ZU1hbmFnZXIodGhpcy5hcHAsIHRoaXMuc2V0dGluZ3MsIHRoaXMucHJvZmlsZXIpO1xuXG4gICAgICAgIC8vIENoZWNrIGRlcGVuZGVuY2llcyBvbiBsb2FkXG4gICAgICAgIGF3YWl0IHRoaXMuY2hlY2tEZXBlbmRlbmNpZXMoKTtcblxuICAgICAgICAvLyBSZWdpc3RlciBmaWxlIGV2ZW50IGxpc3RlbmVycyBmb3IgYXV0by10YWdnaW5nXG4gICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgICAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKCdyZW5hbWUnLCBhc3luYyAoZmlsZSwgb2xkUGF0aCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiAhPT0gJ21kJykgcmV0dXJuO1xuICAgICAgICAgICAgICAgIGlmIChvbGRQYXRoICE9PSBmaWxlLnBhdGgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uaW5jcmVtZW50KCdldmVudHM6cmVuYW1lJyk7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCdldmVudHM6cmVuYW1lOnVwZGF0ZScpO1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy50YWdnaW5nTWFuYWdlci51cGRhdGVQYXJhVGFncyhmaWxlKTtcbiAgICAgICAgICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZChoYW5kbGUsIHsgcGF0aDogZmlsZS5wYXRoIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcblxuICAgICAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICAgICAgICB0aGlzLmFwcC52YXVsdC5vbignY3JlYXRlJywgYXN5bmMgKGZpbGUpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmlsZS5leHRlbnNpb24gIT09ICdtZCcpIHJldHVybjtcbiAgICAgICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5pbmNyZW1lbnQoJ2V2ZW50czpjcmVhdGUnKTtcbiAgICAgICAgICAgICAgICAvLyBMb25nZXIgZGVsYXkgdG8gbGV0IFRlbXBsYXRlciBmaW5pc2ggd3JpdGluZ1xuICAgICAgICAgICAgICAgIHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYW5kbGUgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgnZXZlbnRzOmNyZWF0ZTp1cGRhdGUnKTtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMudGFnZ2luZ01hbmFnZXIudXBkYXRlUGFyYVRhZ3MoZmlsZSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQoaGFuZGxlLCB7IHBhdGg6IGZpbGUucGF0aCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sIDUwMCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIEFsc28gbGlzdGVuIGZvciBtb2RpZnkgZXZlbnRzIHRvIGNhdGNoIFRlbXBsYXRlciB1cGRhdGVzXG4gICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgICAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKCdtb2RpZnknLCBhc3luYyAoZmlsZSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiAhPT0gJ21kJykgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmluY3JlbWVudCgnZXZlbnRzOm1vZGlmeScpO1xuXG4gICAgICAgICAgICAgICAgLy8gT25seSBwcm9jZXNzIHJlY2VudCBmaWxlcyAoY3JlYXRlZCBpbiBsYXN0IDUgc2Vjb25kcylcbiAgICAgICAgICAgICAgICBjb25zdCBzdGF0ID0gZmlsZS5zdGF0ID8/IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmFkYXB0ZXIuc3RhdChmaWxlLnBhdGgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGVBZ2UgPSBEYXRlLm5vdygpIC0gc3RhdC5jdGltZTtcblxuICAgICAgICAgICAgICAgIGlmIChmaWxlQWdlIDwgNTAwMCkgeyAgLy8gRmlsZSBjcmVhdGVkIGluIGxhc3QgNSBzZWNvbmRzXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCdldmVudHM6bW9kaWZ5OnVwZGF0ZScpO1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy50YWdnaW5nTWFuYWdlci51cGRhdGVQYXJhVGFncyhmaWxlKTtcbiAgICAgICAgICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZChoYW5kbGUsIHsgcGF0aDogZmlsZS5wYXRoLCBmaWxlQWdlIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uaW5jcmVtZW50KCdldmVudHM6bW9kaWZ5OnNraXBwZWQtYWdlJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBSZWdpc3RlciBjb21tYW5kc1xuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICdzZXR1cC1wYXJhJyxcbiAgICAgICAgICAgIG5hbWU6ICdSdW4gUEFSQSBTZXR1cCBXaXphcmQnLFxuICAgICAgICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnByb3Zpc2lvbmluZ01hbmFnZXIucnVuU2V0dXBXaXphcmQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgICAgICAgIGlkOiAndXBkYXRlLXBhcmEtdGFncycsXG4gICAgICAgICAgICBuYW1lOiAnVXBkYXRlIFBBUkEgdGFncyBmb3IgY3VycmVudCBmaWxlJyxcbiAgICAgICAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLndvcmtzcGFjZS5nZXRBY3RpdmVGaWxlKCk7XG4gICAgICAgICAgICAgICAgaWYgKGZpbGUpIHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy50YWdnaW5nTWFuYWdlci51cGRhdGVQYXJhVGFncyhmaWxlKTtcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnUEFSQSB0YWdzIHVwZGF0ZWQhJyk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnTm8gYWN0aXZlIGZpbGUnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICAgICAgICBpZDogJ3VwZGF0ZS1hbGwtcGFyYS10YWdzJyxcbiAgICAgICAgICAgIG5hbWU6ICdVcGRhdGUgUEFSQSB0YWdzIGZvciBhbGwgZmlsZXMnLFxuICAgICAgICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnRhZ2dpbmdNYW5hZ2VyLmJ1bGtVcGRhdGVUYWdzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICAgICAgICBpZDogJ2RlcGxveS10ZW1wbGF0ZXMnLFxuICAgICAgICAgICAgbmFtZTogJ0RlcGxveSBQQVJBIHRlbXBsYXRlcycsXG4gICAgICAgICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMudGVtcGxhdGVNYW5hZ2VyLmRlcGxveUFsbFRlbXBsYXRlcygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICdjbGVhbi10ZW1wbGF0ZS1maWxlcycsXG4gICAgICAgICAgICBuYW1lOiAnQ2xlYW4gUEFSQSBwcm9wZXJ0aWVzIGZyb20gdGVtcGxhdGUgZmlsZXMnLFxuICAgICAgICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnRhZ2dpbmdNYW5hZ2VyLmNsZWFuVGVtcGxhdGVGaWxlcygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICdsb2ctcGVyZm9ybWFuY2Utc25hcHNob3QnLFxuICAgICAgICAgICAgbmFtZTogJ0xvZyBwcm9maWxpbmcgc25hcHNob3QgdG8gY29uc29sZScsXG4gICAgICAgICAgICBjYWxsYmFjazogKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5kaWFnbm9zdGljcz8ucHJvZmlsaW5nRW5hYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCdFbmFibGUgcHJvZmlsaW5nIGluIHNldHRpbmdzIGJlZm9yZSBsb2dnaW5nIGEgc25hcHNob3QuJyk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdGhpcy5sb2dQZXJmb3JtYW5jZVNuYXBzaG90KCdjb21tYW5kJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICAgICAgICBpZDogJ2NoZWNrLWRlcGVuZGVuY2llcycsXG4gICAgICAgICAgICBuYW1lOiAnQ2hlY2sgcGx1Z2luIGRlcGVuZGVuY2llcycsXG4gICAgICAgICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuY2hlY2tEZXBlbmRlbmNpZXModHJ1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICAgICAgICBpZDogJ2NhbmNlbC1hcmNoaXZlLXRhc2tzJyxcbiAgICAgICAgICAgIG5hbWU6ICdDYW5jZWwgYWxsIG9wZW4gdGFza3MgaW4gQXJjaGl2ZSBmb2xkZXInLFxuICAgICAgICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnRhc2tNYW5hZ2VyLmNhbmNlbEFyY2hpdmVUYXNrcygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICdjYW5jZWwtY3VycmVudC1maWxlLXRhc2tzJyxcbiAgICAgICAgICAgIG5hbWU6ICdDYW5jZWwgYWxsIG9wZW4gdGFza3MgaW4gY3VycmVudCBmaWxlJyxcbiAgICAgICAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy50YXNrTWFuYWdlci5jYW5jZWxDdXJyZW50RmlsZVRhc2tzKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICAgICAgICBpZDogJ3ByZXZpZXctYXJjaGl2ZS10YXNrLWNhbmNlbGxhdGlvbicsXG4gICAgICAgICAgICBuYW1lOiAnUHJldmlldyBhcmNoaXZlIHRhc2sgY2FuY2VsbGF0aW9uIChkcnkgcnVuKScsXG4gICAgICAgICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMudGFza01hbmFnZXIucHJldmlld0FyY2hpdmVUYXNrQ2FuY2VsbGF0aW9uKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFkZCBzZXR0aW5ncyB0YWJcbiAgICAgICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBRdWlja1BhcmFTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cbiAgICAgICAgLy8gRmlyc3QtcnVuIGNoZWNrXG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLmZpcnN0UnVuKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmhhbmRsZUZpcnN0UnVuKCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmxvZygnUXVpY2sgUEFSQSBwbHVnaW4gbG9hZGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQob25sb2FkVGltZXIsIHsgc3RhdHVzOiAnbG9hZGVkJyB9KTtcbiAgICB9XG5cbiAgICBpbml0aWFsaXplUHJvZmlsZXIoKSB7XG4gICAgICAgIHRoaXMucHJvZmlsZXIgPSBuZXcgUGVyZm9ybWFuY2VQcm9maWxlcih7XG4gICAgICAgICAgICBlbmFibGVkOiB0aGlzLnNldHRpbmdzPy5kaWFnbm9zdGljcz8ucHJvZmlsaW5nRW5hYmxlZCxcbiAgICAgICAgICAgIHNsb3dUaHJlc2hvbGQ6IHRoaXMuc2V0dGluZ3M/LmRpYWdub3N0aWNzPy5zbG93T3BlcmF0aW9uVGhyZXNob2xkTXNcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXBwbHlQcm9maWxlclNldHRpbmdzKCkge1xuICAgICAgICBpZiAoIXRoaXMucHJvZmlsZXIpIHtcbiAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZVByb2ZpbGVyKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnByb2ZpbGVyLmNvbmZpZ3VyZSh7XG4gICAgICAgICAgICBzbG93VGhyZXNob2xkOiB0aGlzLnNldHRpbmdzPy5kaWFnbm9zdGljcz8uc2xvd09wZXJhdGlvblRocmVzaG9sZE1zXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnByb2ZpbGVyLnNldEVuYWJsZWQodGhpcy5zZXR0aW5ncz8uZGlhZ25vc3RpY3M/LnByb2ZpbGluZ0VuYWJsZWQpO1xuICAgIH1cblxuICAgIGxvZ1BlcmZvcm1hbmNlU25hcHNob3QocmVhc29uID0gJ21hbnVhbCcpIHtcbiAgICAgICAgaWYgKCF0aGlzLnByb2ZpbGVyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ1F1aWNrIFBBUkE6IFByb2ZpbGVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wcm9maWxlci5sb2dTdW1tYXJ5KHJlYXNvbik7XG4gICAgfVxuXG4gICAgYXN5bmMgY2hlY2tEZXBlbmRlbmNpZXMoc2hvd05vdGljZSA9IGZhbHNlKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVwZW5kZW5jeU1hbmFnZXIuY2hlY2tEZXBlbmRlbmNpZXMoKTtcblxuICAgICAgICBpZiAoIXJlc3VsdC5hbGxNZXQpIHtcbiAgICAgICAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5kZXBlbmRlbmN5TWFuYWdlci5zaG93RGVwZW5kZW5jeVdhcm5pbmcocmVzdWx0Lm1pc3NpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdRdWljayBQQVJBOiBTb21lIGRlcGVuZGVuY2llcyBhcmUgbWlzc2luZycsIHJlc3VsdC5taXNzaW5nKTtcbiAgICAgICAgfSBlbHNlIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKCdBbGwgZGVwZW5kZW5jaWVzIGFyZSBpbnN0YWxsZWQhJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGFzeW5jIGhhbmRsZUZpcnN0UnVuKCkge1xuICAgICAgICAvLyBXYWl0IGEgYml0IGZvciBPYnNpZGlhbiB0byBmdWxseSBsb2FkXG4gICAgICAgIHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgbmV3IE5vdGljZSgnV2VsY29tZSB0byBRdWljayBQQVJBISBDbGljayB0aGUgZ3JpZCBpY29uIHRvIHJ1biBzZXR1cC4nKTtcblxuICAgICAgICAgICAgLy8gTWFyayBmaXJzdCBydW4gYXMgY29tcGxldGVcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZmlyc3RSdW4gPSBmYWxzZTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0sIDIwMDApO1xuICAgIH1cblxuICAgIGFzeW5jIGxvYWRTZXR0aW5ncygpIHtcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MsIGF3YWl0IHRoaXMubG9hZERhdGEoKSk7XG5cbiAgICAgICAgLy8gTWlncmF0aW9uOiBDb252ZXJ0IG9sZCBhZ2VuZGFHZW5lcmF0aW9uIHNldHRpbmdzIHRvIG5ldyBwcm9qZWN0VXBkYXRlcyBpZiBuZWVkZWRcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuYWdlbmRhR2VuZXJhdGlvbiAmJiAhdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcykge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ01pZ3JhdGluZyBvbGQgYWdlbmRhR2VuZXJhdGlvbiBzZXR0aW5ncyB0byBwcm9qZWN0VXBkYXRlcycpO1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcyA9IHtcbiAgICAgICAgICAgICAgICBlbmFibGVkOiB0aGlzLnNldHRpbmdzLmFnZW5kYUdlbmVyYXRpb24uZW5hYmxlZCB8fCBmYWxzZSxcbiAgICAgICAgICAgICAgICBrYW5iYW5GaWxlOiB0aGlzLnNldHRpbmdzLmFnZW5kYUdlbmVyYXRpb24ua2FuYmFuRmlsZSB8fCAnMCAtIElOQk9YL1Byb2plY3QgRGFzaGJvYXJkLm1kJyxcbiAgICAgICAgICAgICAgICBjb25maWdzOiBbXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIE9sZCBzZXR0aW5ncyBhcmUgcHJlc2VydmVkIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IGJ1dCBub3QgYWN0aXZlbHkgdXNlZFxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRW5zdXJlIG5ldyBzZXR0aW5ncyBzdHJ1Y3R1cmUgZXhpc3RzXG4gICAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcykge1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcyA9IERFRkFVTFRfU0VUVElOR1MucHJvamVjdFVwZGF0ZXM7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFbnN1cmUga2FuYmFuRmlsZSBleGlzdHMgaW4gcHJvamVjdFVwZGF0ZXNcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLnByb2plY3RVcGRhdGVzLmthbmJhbkZpbGUpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MucHJvamVjdFVwZGF0ZXMua2FuYmFuRmlsZSA9ICcwIC0gSU5CT1gvUHJvamVjdCBEYXNoYm9hcmQubWQnO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVtb3ZlIG1pZ3JhdGVPbGRUYWdzIGlmIGl0IGV4aXN0cyAobm8gbG9uZ2VyIHJlbGV2YW50IGZvciBuZXcgdXNlcnMpXG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLnRhZ2dpbmcgJiYgdGhpcy5zZXR0aW5ncy50YWdnaW5nLm1pZ3JhdGVPbGRUYWdzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnNldHRpbmdzLnRhZ2dpbmcubWlncmF0ZU9sZFRhZ3M7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MuZGlhZ25vc3RpY3MgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLmRpYWdub3N0aWNzLCB0aGlzLnNldHRpbmdzLmRpYWdub3N0aWNzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcbiAgICB9XG5cbiAgICBvbnVubG9hZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3M/LmRpYWdub3N0aWNzPy5wcm9maWxpbmdFbmFibGVkICYmIHRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MubG9nU3VtbWFyeU9uVW5sb2FkKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ1BlcmZvcm1hbmNlU25hcHNob3QoJ3BsdWdpbi11bmxvYWQnKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zb2xlLmxvZygnVW5sb2FkaW5nIFF1aWNrIFBBUkEgcGx1Z2luJyk7XG4gICAgfVxufTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7OztBQUFBO0FBQUEsZ0NBQUFBLFVBQUFDLFNBQUE7QUFBQSxRQUFNQyx1QkFBTixNQUEwQjtBQUFBLE1BQ3RCLFlBQVksVUFBVSxDQUFDLEdBQUc7QUFEOUI7QUFFUSxhQUFLLFdBQVUsYUFBUSxZQUFSLFlBQW1CO0FBQ2xDLGFBQUssaUJBQWdCLGFBQVEsa0JBQVIsWUFBeUI7QUFDOUMsYUFBSyxNQUFNO0FBQUEsTUFDZjtBQUFBLE1BRUEsUUFBUTtBQUNK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QUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUE2QnJCLHdCQUF3QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUE2QnhCLHFCQUFxQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUE2QnJCLHlCQUF5QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUE2QnpCLHVCQUF1QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BK0J2Qix3QkFBd0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFzRHhCLDJCQUEyQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FB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LFNBQVMsaUJBQWlCLGlCQUFpQjtBQUFBLElBQ3BEO0FBR0EsUUFBSSxDQUFDLEtBQUssU0FBUyxlQUFlLFlBQVk7QUFDMUMsV0FBSyxTQUFTLGVBQWUsYUFBYTtBQUFBLElBQzlDO0FBR0EsUUFBSSxLQUFLLFNBQVMsV0FBVyxLQUFLLFNBQVMsUUFBUSxtQkFBbUIsUUFBVztBQUM3RSxhQUFPLEtBQUssU0FBUyxRQUFRO0FBQUEsSUFDakM7QUFFQSxRQUFJLENBQUMsS0FBSyxTQUFTLGFBQWE7QUFDNUIsV0FBSyxTQUFTLGNBQWMsRUFBRSxHQUFHLGlCQUFpQixZQUFZO0FBQUEsSUFDbEUsT0FBTztBQUNILFdBQUssU0FBUyxjQUFjLE9BQU8sT0FBTyxDQUFDLEdBQUcsaUJBQWlCLGFBQWEsS0FBSyxTQUFTLFdBQVc7QUFBQSxJQUN6RztBQUFBLEVBQ0o7QUFBQSxFQUVBLE1BQU0sZUFBZTtBQUNqQixVQUFNLEtBQUssU0FBUyxLQUFLLFFBQVE7QUFBQSxFQUNyQztBQUFBLEVBRUEsV0FBVztBQWhyRmY7QUFpckZRLFVBQUksZ0JBQUssYUFBTCxtQkFBZSxnQkFBZixtQkFBNEIscUJBQW9CLEtBQUssU0FBUyxZQUFZLG9CQUFvQjtBQUM5RixXQUFLLHVCQUF1QixlQUFlO0FBQUEsSUFDL0M7QUFDQSxZQUFRLElBQUksNkJBQTZCO0FBQUEsRUFDN0M7QUFDSjsiLAogICJuYW1lcyI6IFsiZXhwb3J0cyIsICJtb2R1bGUiLCAiUGVyZm9ybWFuY2VQcm9maWxlciIsICJfYSIsICJfYiJdCn0K
