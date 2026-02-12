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
    if (!file) return;
    const filePath = file.path;
    const timer = (_a = this.profiler) == null ? void 0 : _a.start("tagging:update");
    const context = { path: filePath };
    if (filePath.includes("/TEMPLATES/") || filePath.startsWith("TEMPLATES/")) {
      if (this.settings.diagnostics.profilingEnabled) {
        console.log("Quick PARA: Skipping template file:", filePath);
      }
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
          if (this.settings.diagnostics.profilingEnabled) {
            console.log("Quick PARA: Migrated old para/* tags");
          }
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
            if (this.settings.diagnostics.profilingEnabled) {
              console.log(`Quick PARA: Cleaned template file: ${file.path}`);
            }
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
      if (created > 0) parts.push(`${created} created`);
      if (skipped > 0) parts.push(`${skipped} skipped`);
      if (errors > 0) parts.push(`${errors} errors`);
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
        if (sectionName === "done") key = "done";
        else if (sectionName === "doing") key = "doing";
        else if (sectionName === "today") key = "today";
        else if (sectionName === "tomorrow") key = "tomorrow";
        else if (sectionName === "this week") key = "this_week";
        else if (sectionName === "blocked") key = "blocked";
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
      if (this.settings.diagnostics.profilingEnabled) {
        console.warn(`Could not find Monday section for ${mondayDate}`);
      }
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
            if (!projectFile) continue;
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
            if (!projectFile) continue;
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
    if (!file) return { modified: false, taskCount: 0 };
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
    if (this.settings.diagnostics.profilingEnabled) {
      console.log(`Quick PARA: Archive task cancellation complete - ${filesModified} files, ${totalTasksCancelled} tasks`);
    }
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
      if (this.settings.diagnostics.profilingEnabled) {
        console.log("Quick PARA: Archive task preview:", {
          totalFiles: archiveFiles.length,
          filesWithTasks: filesWithTasks.length,
          totalOpenTasks: totalTasks,
          files: filesWithTasks
        });
      }
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
    new Setting(containerEl).setName("Quick Actions").setHeading();
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
    new Setting(containerEl).setName("Required Dependencies").setHeading();
    const templaterLink = containerEl.createEl("div", { cls: "setting-item-description" });
    templaterLink.appendText("\u2022 ");
    templaterLink.createEl("strong", { text: "Templater" });
    templaterLink.appendText(": Required for template variable substitution. ");
    templaterLink.createEl("a", { text: "Install from Community Plugins", href: "obsidian://show-plugin?id=templater-obsidian" });
    const tasksLink = containerEl.createEl("div", { cls: "setting-item-description" });
    tasksLink.appendText("\u2022 ");
    tasksLink.createEl("strong", { text: "Tasks" });
    tasksLink.appendText(": Required for task management features. ");
    tasksLink.createEl("a", { text: "Install from Community Plugins", href: "obsidian://show-plugin?id=obsidian-tasks-plugin" });
    containerEl.createEl("hr");
    new Setting(containerEl).setName("PARA Folder Configuration").setHeading();
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
    new Setting(containerEl).setName("Automatic Tagging Behavior").setHeading();
    containerEl.createEl("p", {
      text: `Control how the plugin automatically assigns properties and tags when you create or move notes. The "para" property (locked to this name) always reflects a note's current PARA location, while subfolder tags provide historical context.`,
      cls: "setting-item-description"
    });
    new Setting(containerEl).setName("Preserve Subfolder Tags").setDesc("When enabled, tags from subfolder names persist even when you move notes between PARA folders. This preserves project context over time.").addToggle((toggle) => toggle.setValue(this.plugin.settings.tagging.persistSubfolderTags).onChange(async (value) => {
      this.plugin.settings.tagging.persistSubfolderTags = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("hr");
    new Setting(containerEl).setName("PARA Templates").setHeading();
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
    new Setting(containerEl).setName("Diagnostics & Profiling").setHeading();
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
    new Setting(containerEl).setName("Task Management").setHeading();
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
    new Setting(containerEl).setName("Manual Task Operations").setHeading();
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
    new Setting(containerEl).setName("Advanced Settings").setHeading();
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
        if (file.extension !== "md") return;
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
        if (file.extension !== "md") return;
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
        if (file.extension !== "md") return;
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
    var _a;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    if (this.settings.agendaGeneration && !this.settings.projectUpdates) {
      if ((_a = this.settings.diagnostics) == null ? void 0 : _a.profilingEnabled) {
        console.log("Migrating old agendaGeneration settings to projectUpdates");
      }
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
  }
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL3BlcmZvcm1hbmNlLXByb2ZpbGVyLmpzIiwgInNyYy9pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY2xhc3MgUGVyZm9ybWFuY2VQcm9maWxlciB7XG4gICAgY29uc3RydWN0b3Iob3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIHRoaXMuZW5hYmxlZCA9IG9wdGlvbnMuZW5hYmxlZCA/PyBmYWxzZTtcbiAgICAgICAgdGhpcy5zbG93VGhyZXNob2xkID0gb3B0aW9ucy5zbG93VGhyZXNob2xkID8/IDIwMDtcbiAgICAgICAgdGhpcy5yZXNldCgpO1xuICAgIH1cblxuICAgIHJlc2V0KCkge1xuICAgICAgICB0aGlzLnRpbWVycyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5zdGF0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5jb3VudGVycyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uU3RhcnQgPSBEYXRlLm5vdygpO1xuICAgICAgICB0aGlzLnRpbWVyQ291bnRlciA9IDA7XG4gICAgfVxuXG4gICAgbm93KCkge1xuICAgICAgICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcGVyZm9ybWFuY2Uubm93ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIERhdGUubm93KCk7XG4gICAgfVxuXG4gICAgc2V0RW5hYmxlZChlbmFibGVkKSB7XG4gICAgICAgIGlmICh0aGlzLmVuYWJsZWQgPT09IGVuYWJsZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQ7XG4gICAgICAgIGlmIChlbmFibGVkKSB7XG4gICAgICAgICAgICB0aGlzLnJlc2V0KCk7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ1tRdWljayBQQVJBXVtQZXJmXSBQcm9maWxpbmcgZW5hYmxlZCcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdbUXVpY2sgUEFSQV1bUGVyZl0gUHJvZmlsaW5nIGRpc2FibGVkJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25maWd1cmUob3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5zbG93VGhyZXNob2xkID09PSAnbnVtYmVyJyAmJiAhTnVtYmVyLmlzTmFOKG9wdGlvbnMuc2xvd1RocmVzaG9sZCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2xvd1RocmVzaG9sZCA9IG9wdGlvbnMuc2xvd1RocmVzaG9sZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0KGxhYmVsKSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8ICFsYWJlbCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBoYW5kbGUgPSBgJHtsYWJlbH06JHt0aGlzLnRpbWVyQ291bnRlcisrfWA7XG4gICAgICAgIHRoaXMudGltZXJzLnNldChoYW5kbGUsIHtcbiAgICAgICAgICAgIGxhYmVsLFxuICAgICAgICAgICAgc3RhcnQ6IHRoaXMubm93KClcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBoYW5kbGU7XG4gICAgfVxuXG4gICAgZW5kKGhhbmRsZSwgY29udGV4dCA9IHt9KSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8ICFoYW5kbGUpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnRpbWVycy5nZXQoaGFuZGxlKTtcbiAgICAgICAgaWYgKCF0aW1lcikge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBkdXJhdGlvbiA9IHRoaXMubm93KCkgLSB0aW1lci5zdGFydDtcbiAgICAgICAgdGhpcy50aW1lcnMuZGVsZXRlKGhhbmRsZSk7XG4gICAgICAgIHRoaXMucmVjb3JkRHVyYXRpb24odGltZXIubGFiZWwsIGR1cmF0aW9uLCBjb250ZXh0KTtcbiAgICAgICAgcmV0dXJuIGR1cmF0aW9uO1xuICAgIH1cblxuICAgIGFzeW5jIHRpbWUobGFiZWwsIGZuLCBjb250ZXh0QnVpbGRlcikge1xuICAgICAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkKSB7XG4gICAgICAgICAgICByZXR1cm4gZm4oKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGhhbmRsZSA9IHRoaXMuc3RhcnQobGFiZWwpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IGZuKCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZXh0ID0gdHlwZW9mIGNvbnRleHRCdWlsZGVyID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICAgICAgPyBjb250ZXh0QnVpbGRlcigpXG4gICAgICAgICAgICAgICAgOiAoY29udGV4dEJ1aWxkZXIgfHwge30pO1xuICAgICAgICAgICAgdGhpcy5lbmQoaGFuZGxlLCBjb250ZXh0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlY29yZER1cmF0aW9uKGxhYmVsLCBkdXJhdGlvbiwgY29udGV4dCA9IHt9KSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8IHR5cGVvZiBkdXJhdGlvbiAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHN0YXRzID0gdGhpcy5zdGF0cy5nZXQobGFiZWwpIHx8IHtcbiAgICAgICAgICAgIGNvdW50OiAwLFxuICAgICAgICAgICAgdG90YWxNczogMCxcbiAgICAgICAgICAgIG1heE1zOiAwLFxuICAgICAgICAgICAgbWluTXM6IG51bGwsXG4gICAgICAgICAgICBsYXN0Q29udGV4dDogbnVsbFxuICAgICAgICB9O1xuXG4gICAgICAgIHN0YXRzLmNvdW50ICs9IDE7XG4gICAgICAgIHN0YXRzLnRvdGFsTXMgKz0gZHVyYXRpb247XG4gICAgICAgIHN0YXRzLm1heE1zID0gTWF0aC5tYXgoc3RhdHMubWF4TXMsIGR1cmF0aW9uKTtcbiAgICAgICAgc3RhdHMubWluTXMgPSBzdGF0cy5taW5NcyA9PT0gbnVsbCA/IGR1cmF0aW9uIDogTWF0aC5taW4oc3RhdHMubWluTXMsIGR1cmF0aW9uKTtcbiAgICAgICAgc3RhdHMubGFzdENvbnRleHQgPSBjb250ZXh0O1xuXG4gICAgICAgIHRoaXMuc3RhdHMuc2V0KGxhYmVsLCBzdGF0cyk7XG5cbiAgICAgICAgY29uc3QgZHVyYXRpb25MYWJlbCA9IGR1cmF0aW9uLnRvRml4ZWQoMik7XG4gICAgICAgIGlmIChkdXJhdGlvbiA+PSB0aGlzLnNsb3dUaHJlc2hvbGQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgW1F1aWNrIFBBUkFdW1BlcmZdICR7bGFiZWx9IHRvb2sgJHtkdXJhdGlvbkxhYmVsfW1zYCwgY29udGV4dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKGBbUXVpY2sgUEFSQV1bUGVyZl0gJHtsYWJlbH06ICR7ZHVyYXRpb25MYWJlbH1tc2AsIGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaW5jcmVtZW50KGxhYmVsKSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8ICFsYWJlbCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY291bnQgPSAodGhpcy5jb3VudGVycy5nZXQobGFiZWwpIHx8IDApICsgMTtcbiAgICAgICAgdGhpcy5jb3VudGVycy5zZXQobGFiZWwsIGNvdW50KTtcbiAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgIH1cblxuICAgIHN1bW1hcml6ZSgpIHtcbiAgICAgICAgY29uc3Qgc3RhdHMgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbbGFiZWwsIGVudHJ5XSBvZiB0aGlzLnN0YXRzLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgc3RhdHNbbGFiZWxdID0ge1xuICAgICAgICAgICAgICAgIGNvdW50OiBlbnRyeS5jb3VudCxcbiAgICAgICAgICAgICAgICB0b3RhbE1zOiBOdW1iZXIoZW50cnkudG90YWxNcy50b0ZpeGVkKDIpKSxcbiAgICAgICAgICAgICAgICBhdmdNczogZW50cnkuY291bnQgPyBOdW1iZXIoKGVudHJ5LnRvdGFsTXMgLyBlbnRyeS5jb3VudCkudG9GaXhlZCgyKSkgOiAwLFxuICAgICAgICAgICAgICAgIG1heE1zOiBOdW1iZXIoZW50cnkubWF4TXMudG9GaXhlZCgyKSksXG4gICAgICAgICAgICAgICAgbWluTXM6IGVudHJ5Lm1pbk1zID09PSBudWxsID8gbnVsbCA6IE51bWJlcihlbnRyeS5taW5Ncy50b0ZpeGVkKDIpKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvdW50ZXJzID0ge307XG4gICAgICAgIGZvciAoY29uc3QgW2xhYmVsLCBjb3VudF0gb2YgdGhpcy5jb3VudGVycy5lbnRyaWVzKCkpIHtcbiAgICAgICAgICAgIGNvdW50ZXJzW2xhYmVsXSA9IGNvdW50O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRoaXMuZW5hYmxlZCxcbiAgICAgICAgICAgIHNsb3dUaHJlc2hvbGQ6IHRoaXMuc2xvd1RocmVzaG9sZCxcbiAgICAgICAgICAgIHNlc3Npb25TdGFydDogdGhpcy5zZXNzaW9uU3RhcnQsXG4gICAgICAgICAgICBzZXNzaW9uRHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHRoaXMuc2Vzc2lvblN0YXJ0LFxuICAgICAgICAgICAgc3RhdHMsXG4gICAgICAgICAgICBjb3VudGVyc1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGxvZ1N1bW1hcnkocmVhc29uID0gJ21hbnVhbCcpIHtcbiAgICAgICAgaWYgKCF0aGlzLmVuYWJsZWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnW1F1aWNrIFBBUkFdW1BlcmZdIFByb2ZpbGluZyBkaXNhYmxlZDsgbm8gc3VtbWFyeSB0byBsb2cuJyk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHN1bW1hcnkgPSB0aGlzLnN1bW1hcml6ZSgpO1xuICAgICAgICBjb25zb2xlLmdyb3VwKGBbUXVpY2sgUEFSQV1bUGVyZl0gU3VtbWFyeSAoJHtyZWFzb259KWApO1xuICAgICAgICBjb25zb2xlLmluZm8oJ1Nlc3Npb24gZHVyYXRpb24gKG1zKTonLCBzdW1tYXJ5LnNlc3Npb25EdXJhdGlvbk1zKTtcbiAgICAgICAgY29uc29sZS5pbmZvKCdTbG93IHRocmVzaG9sZCAobXMpOicsIHN1bW1hcnkuc2xvd1RocmVzaG9sZCk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnRXZlbnQgY291bnRlcnM6Jywgc3VtbWFyeS5jb3VudGVycyk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnVGltaW5nIHN0YXRzOicsIHN1bW1hcnkuc3RhdHMpO1xuICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XG4gICAgICAgIHJldHVybiBzdW1tYXJ5O1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7IFBlcmZvcm1hbmNlUHJvZmlsZXIgfTtcbiIsICJjb25zdCB7IFBsdWdpbiwgTm90aWNlLCBNb2RhbCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9ID0gcmVxdWlyZSgnb2JzaWRpYW4nKTtcbmNvbnN0IHsgUGVyZm9ybWFuY2VQcm9maWxlciB9ID0gcmVxdWlyZSgnLi9wZXJmb3JtYW5jZS1wcm9maWxlcicpO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBERUZBVUxUIFNFVFRJTkdTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1MgPSB7XG4gICAgZmlyc3RSdW46IHRydWUsXG4gICAgcGFyYUZvbGRlcnM6IHtcbiAgICAgICAgaW5ib3g6IFwiMCAtIElOQk9YXCIsXG4gICAgICAgIHByb2plY3RzOiBcIjEgLSBQUk9KRUNUU1wiLFxuICAgICAgICBhcmVhczogXCIyIC0gQVJFQVNcIixcbiAgICAgICAgcmVzb3VyY2VzOiBcIjMgLSBSRVNPVVJDRVNcIixcbiAgICAgICAgYXJjaGl2ZTogXCI0IC0gQVJDSElWRVwiXG4gICAgfSxcbiAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgYXV0b0RlcGxveU9uU2V0dXA6IHRydWUsXG4gICAgICAgIGJhY2t1cEJlZm9yZU92ZXJ3cml0ZTogdHJ1ZVxuICAgIH0sXG4gICAgdGFnZ2luZzoge1xuICAgICAgICBwcm9wZXJ0eU5hbWU6IFwicGFyYVwiLCAgLy8gTG9ja2VkIC0gbm90IHVzZXItY29uZmlndXJhYmxlXG4gICAgICAgIHBlcnNpc3RTdWJmb2xkZXJUYWdzOiB0cnVlXG4gICAgfSxcbiAgICB0YXNrczoge1xuICAgICAgICBhdXRvQ2FuY2VsT25BcmNoaXZlOiBmYWxzZSwgIC8vIERlZmF1bHQ6IGRpc2FibGVkIGZvciBzYWZldHlcbiAgICAgICAgc2hvd0NhbmNlbGxhdGlvbk5vdGljZXM6IHRydWUgIC8vIFNob3cgZmVlZGJhY2sgd2hlbiBhdXRvLWNhbmNlbGxpbmdcbiAgICB9LFxuICAgIGRpYWdub3N0aWNzOiB7XG4gICAgICAgIHByb2ZpbGluZ0VuYWJsZWQ6IGZhbHNlLFxuICAgICAgICBzbG93T3BlcmF0aW9uVGhyZXNob2xkTXM6IDIwMCxcbiAgICAgICAgbG9nU3VtbWFyeU9uVW5sb2FkOiB0cnVlXG4gICAgfVxufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gREVQRU5ERU5DWSBNQU5BR0VSXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNsYXNzIERlcGVuZGVuY3lNYW5hZ2VyIHtcbiAgICBjb25zdHJ1Y3RvcihhcHApIHtcbiAgICAgICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgICAgIHRoaXMucmVxdWlyZWRQbHVnaW5zID0ge1xuICAgICAgICAgICAgJ3RlbXBsYXRlci1vYnNpZGlhbic6IHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnVGVtcGxhdGVyJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlcXVpcmVkIGZvciB0ZW1wbGF0ZSB2YXJpYWJsZSBzdWJzdGl0dXRpb24nLFxuICAgICAgICAgICAgICAgIHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9TaWxlbnRWb2lkMTMvVGVtcGxhdGVyJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICdvYnNpZGlhbi10YXNrcy1wbHVnaW4nOiB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ1Rhc2tzJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlcXVpcmVkIGZvciB0YXNrIG1hbmFnZW1lbnQnLFxuICAgICAgICAgICAgICAgIHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vYnNpZGlhbi10YXNrcy1ncm91cC9vYnNpZGlhbi10YXNrcydcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICB0aGlzLm9wdGlvbmFsUGx1Z2lucyA9IHt9O1xuICAgIH1cblxuICAgIGFzeW5jIGNoZWNrRGVwZW5kZW5jaWVzKCkge1xuICAgICAgICBjb25zdCBtaXNzaW5nID0gW107XG4gICAgICAgIGNvbnN0IGluc3RhbGxlZCA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgW3BsdWdpbklkLCBpbmZvXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLnJlcXVpcmVkUGx1Z2lucykpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmlzUGx1Z2luRW5hYmxlZChwbHVnaW5JZCkpIHtcbiAgICAgICAgICAgICAgICBpbnN0YWxsZWQucHVzaChpbmZvLm5hbWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtaXNzaW5nLnB1c2goeyAuLi5pbmZvLCBwbHVnaW5JZCwgcmVxdWlyZWQ6IHRydWUgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKGNvbnN0IFtwbHVnaW5JZCwgaW5mb10gb2YgT2JqZWN0LmVudHJpZXModGhpcy5vcHRpb25hbFBsdWdpbnMpKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5pc1BsdWdpbkVuYWJsZWQocGx1Z2luSWQpKSB7XG4gICAgICAgICAgICAgICAgaW5zdGFsbGVkLnB1c2goaW5mby5uYW1lKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbWlzc2luZy5wdXNoKHsgLi4uaW5mbywgcGx1Z2luSWQsIHJlcXVpcmVkOiBmYWxzZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBhbGxNZXQ6IG1pc3NpbmcuZmlsdGVyKHAgPT4gcC5yZXF1aXJlZCkubGVuZ3RoID09PSAwLFxuICAgICAgICAgICAgaW5zdGFsbGVkLFxuICAgICAgICAgICAgbWlzc2luZ1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGlzUGx1Z2luSW5zdGFsbGVkKHBsdWdpbklkKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmFwcC5wbHVnaW5zLm1hbmlmZXN0c1twbHVnaW5JZF0gIT09IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBpc1BsdWdpbkVuYWJsZWQocGx1Z2luSWQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXBwLnBsdWdpbnMuZW5hYmxlZFBsdWdpbnMuaGFzKHBsdWdpbklkKTtcbiAgICB9XG5cbiAgICBhc3luYyBzaG93RGVwZW5kZW5jeVdhcm5pbmcobWlzc2luZykge1xuICAgICAgICBjb25zdCBtb2RhbCA9IG5ldyBEZXBlbmRlbmN5V2FybmluZ01vZGFsKHRoaXMuYXBwLCBtaXNzaW5nKTtcbiAgICAgICAgbW9kYWwub3BlbigpO1xuICAgIH1cbn1cblxuY2xhc3MgRGVwZW5kZW5jeVdhcm5pbmdNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgICBjb25zdHJ1Y3RvcihhcHAsIG1pc3NpbmcpIHtcbiAgICAgICAgc3VwZXIoYXBwKTtcbiAgICAgICAgdGhpcy5taXNzaW5nID0gbWlzc2luZztcbiAgICB9XG5cbiAgICBvbk9wZW4oKSB7XG4gICAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgICAgICBjb250ZW50RWwuZW1wdHkoKTtcblxuICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiAnUGx1Z2luIERlcGVuZGVuY2llcycgfSk7XG5cbiAgICAgICAgY29uc3QgcmVxdWlyZWQgPSB0aGlzLm1pc3NpbmcuZmlsdGVyKHAgPT4gcC5yZXF1aXJlZCk7XG4gICAgICAgIGNvbnN0IG9wdGlvbmFsID0gdGhpcy5taXNzaW5nLmZpbHRlcihwID0+ICFwLnJlcXVpcmVkKTtcblxuICAgICAgICBpZiAocmVxdWlyZWQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ1JlcXVpcmVkIFBsdWdpbnMgKE1pc3NpbmcpJyB9KTtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgICAgICB0ZXh0OiAnVGhlc2UgcGx1Z2lucyBhcmUgcmVxdWlyZWQgZm9yIFF1aWNrIFBBUkEgdG8gZnVuY3Rpb24gcHJvcGVybHkuJyxcbiAgICAgICAgICAgICAgICBjbHM6ICdtb2Qtd2FybmluZydcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCByZXFMaXN0ID0gY29udGVudEVsLmNyZWF0ZUVsKCd1bCcpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBwbHVnaW4gb2YgcmVxdWlyZWQpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaSA9IHJlcUxpc3QuY3JlYXRlRWwoJ2xpJyk7XG4gICAgICAgICAgICAgICAgbGkuY3JlYXRlRWwoJ3N0cm9uZycsIHsgdGV4dDogcGx1Z2luLm5hbWUgfSk7XG4gICAgICAgICAgICAgICAgbGkuYXBwZW5kVGV4dChgOiAke3BsdWdpbi5kZXNjcmlwdGlvbn1gKTtcbiAgICAgICAgICAgICAgICBsaS5jcmVhdGVFbCgnYnInKTtcbiAgICAgICAgICAgICAgICBsaS5jcmVhdGVFbCgnYScsIHsgdGV4dDogJ0luc3RhbGwnLCBocmVmOiBwbHVnaW4udXJsIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKG9wdGlvbmFsLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdPcHRpb25hbCBQbHVnaW5zIChNaXNzaW5nKScgfSk7XG4gICAgICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICAgICAgdGV4dDogJ1RoZXNlIHBsdWdpbnMgZW5oYW5jZSBRdWljayBQQVJBIGJ1dCBhcmUgbm90IHJlcXVpcmVkLidcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICBjb25zdCBvcHRMaXN0ID0gY29udGVudEVsLmNyZWF0ZUVsKCd1bCcpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBwbHVnaW4gb2Ygb3B0aW9uYWwpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBsaSA9IG9wdExpc3QuY3JlYXRlRWwoJ2xpJyk7XG4gICAgICAgICAgICAgICAgbGkuY3JlYXRlRWwoJ3N0cm9uZycsIHsgdGV4dDogcGx1Z2luLm5hbWUgfSk7XG4gICAgICAgICAgICAgICAgbGkuYXBwZW5kVGV4dChgOiAke3BsdWdpbi5kZXNjcmlwdGlvbn1gKTtcbiAgICAgICAgICAgICAgICBsaS5jcmVhdGVFbCgnYnInKTtcbiAgICAgICAgICAgICAgICBsaS5jcmVhdGVFbCgnYScsIHsgdGV4dDogJ0luc3RhbGwnLCBocmVmOiBwbHVnaW4udXJsIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHRoaXMubWlzc2luZy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ0FsbCBkZXBlbmRlbmNpZXMgYXJlIGluc3RhbGxlZCEnIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgYnV0dG9uQ29udGFpbmVyID0gY29udGVudEVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ21vZGFsLWJ1dHRvbi1jb250YWluZXInIH0pO1xuICAgICAgICBjb25zdCBjbG9zZUJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnQ2xvc2UnIH0pO1xuICAgICAgICBjbG9zZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuY2xvc2UoKSk7XG4gICAgfVxuXG4gICAgb25DbG9zZSgpIHtcbiAgICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUFJPVklTSU9OSU5HIE1BTkFHRVJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY2xhc3MgUHJvdmlzaW9uaW5nTWFuYWdlciB7XG4gICAgY29uc3RydWN0b3IoYXBwLCBzZXR0aW5ncykge1xuICAgICAgICB0aGlzLmFwcCA9IGFwcDtcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHNldHRpbmdzO1xuICAgIH1cblxuICAgIGFzeW5jIGRldGVjdEV4aXN0aW5nU3RydWN0dXJlKCkge1xuICAgICAgICBjb25zdCBkZXRlY3RlZCA9IHt9O1xuICAgICAgICBjb25zdCBmb2xkZXJzID0gdGhpcy5hcHAudmF1bHQuZ2V0QWxsTG9hZGVkRmlsZXMoKVxuICAgICAgICAgICAgLmZpbHRlcihmID0+IGYuY2hpbGRyZW4gIT09IHVuZGVmaW5lZCk7IC8vIE9ubHkgZm9sZGVyc1xuXG4gICAgICAgIGZvciAoY29uc3QgW2xvY2F0aW9uLCBmb2xkZXJOYW1lXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLnNldHRpbmdzLnBhcmFGb2xkZXJzKSkge1xuICAgICAgICAgICAgY29uc3QgZXhpc3RzID0gZm9sZGVycy5zb21lKGYgPT4gZi5wYXRoID09PSBmb2xkZXJOYW1lKTtcbiAgICAgICAgICAgIGRldGVjdGVkW2xvY2F0aW9uXSA9IHsgZXhpc3RzLCBwYXRoOiBmb2xkZXJOYW1lIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZGV0ZWN0ZWQ7XG4gICAgfVxuXG4gICAgYXN5bmMgcHJvdmlzaW9uRm9sZGVycyhjcmVhdGVNaXNzaW5nT25seSA9IHRydWUpIHtcbiAgICAgICAgY29uc3Qgc3RydWN0dXJlID0gYXdhaXQgdGhpcy5kZXRlY3RFeGlzdGluZ1N0cnVjdHVyZSgpO1xuICAgICAgICBjb25zdCBjcmVhdGVkID0gW107XG4gICAgICAgIGNvbnN0IHNraXBwZWQgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IFtsb2NhdGlvbiwgaW5mb10gb2YgT2JqZWN0LmVudHJpZXMoc3RydWN0dXJlKSkge1xuICAgICAgICAgICAgaWYgKGluZm8uZXhpc3RzICYmIGNyZWF0ZU1pc3NpbmdPbmx5KSB7XG4gICAgICAgICAgICAgICAgc2tpcHBlZC5wdXNoKGluZm8ucGF0aCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKGluZm8ucGF0aCk7XG4gICAgICAgICAgICAgICAgY3JlYXRlZC5wdXNoKGluZm8ucGF0aCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdhbHJlYWR5IGV4aXN0cycpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNraXBwZWQucHVzaChpbmZvLnBhdGgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBjcmVhdGUgZm9sZGVyICR7aW5mby5wYXRofTpgLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHsgY3JlYXRlZCwgc2tpcHBlZCB9O1xuICAgIH1cblxuICAgIGFzeW5jIHJ1blNldHVwV2l6YXJkKCkge1xuICAgICAgICBjb25zdCBtb2RhbCA9IG5ldyBTZXR1cFdpemFyZE1vZGFsKHRoaXMuYXBwLCB0aGlzKTtcbiAgICAgICAgbW9kYWwub3BlbigpO1xuICAgIH1cbn1cblxuY2xhc3MgU2V0dXBXaXphcmRNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgICBjb25zdHJ1Y3RvcihhcHAsIHByb3Zpc2lvbmluZ01hbmFnZXIpIHtcbiAgICAgICAgc3VwZXIoYXBwKTtcbiAgICAgICAgdGhpcy5wcm92aXNpb25pbmdNYW5hZ2VyID0gcHJvdmlzaW9uaW5nTWFuYWdlcjtcbiAgICAgICAgdGhpcy5zdGVwID0gMTtcbiAgICAgICAgdGhpcy50b3RhbFN0ZXBzID0gMztcbiAgICB9XG5cbiAgICBvbk9wZW4oKSB7XG4gICAgICAgIHRoaXMucmVuZGVyU3RlcCgpO1xuICAgIH1cblxuICAgIHJlbmRlclN0ZXAoKSB7XG4gICAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgICAgICBjb250ZW50RWwuZW1wdHkoKTtcblxuICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiBgUXVpY2sgUEFSQSBTZXR1cCAoU3RlcCAke3RoaXMuc3RlcH0vJHt0aGlzLnRvdGFsU3RlcHN9KWAgfSk7XG5cbiAgICAgICAgc3dpdGNoICh0aGlzLnN0ZXApIHtcbiAgICAgICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcldlbGNvbWVTdGVwKGNvbnRlbnRFbCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJGb2xkZXJTdGVwKGNvbnRlbnRFbCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJDb25maXJtU3RlcChjb250ZW50RWwpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVuZGVyV2VsY29tZVN0ZXAoY29udGVudEVsKSB7XG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ1dlbGNvbWUgdG8gUXVpY2sgUEFSQSEgVGhpcyB3aXphcmQgd2lsbCBoZWxwIHlvdSBzZXQgdXAgeW91ciB2YXVsdCB3aXRoIHRoZSBQQVJBIG1ldGhvZC4nIH0pO1xuXG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdXaGF0IGlzIFBBUkE/JyB9KTtcbiAgICAgICAgY29uc3QgbGlzdCA9IGNvbnRlbnRFbC5jcmVhdGVFbCgndWwnKTtcbiAgICAgICAgbGlzdC5jcmVhdGVFbCgnbGknLCB7IHRleHQ6ICdQcm9qZWN0czogQWN0aXZlIHdvcmsgd2l0aCBkZWFkbGluZXMnIH0pO1xuICAgICAgICBsaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ0FyZWFzOiBPbmdvaW5nIHJlc3BvbnNpYmlsaXRpZXMnIH0pO1xuICAgICAgICBsaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ1Jlc291cmNlczogUmVmZXJlbmNlIG1hdGVyaWFscycgfSk7XG4gICAgICAgIGxpc3QuY3JlYXRlRWwoJ2xpJywgeyB0ZXh0OiAnQXJjaGl2ZTogQ29tcGxldGVkIG9yIGluYWN0aXZlIGl0ZW1zJyB9KTtcblxuICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICdUaGlzIHdpemFyZCB3aWxsOicgfSk7XG4gICAgICAgIGNvbnN0IHNldHVwTGlzdCA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnb2wnKTtcbiAgICAgICAgc2V0dXBMaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ0NyZWF0ZSBQQVJBIGZvbGRlciBzdHJ1Y3R1cmUnIH0pO1xuICAgICAgICBzZXR1cExpc3QuY3JlYXRlRWwoJ2xpJywgeyB0ZXh0OiAnRGVwbG95IG5vdGUgdGVtcGxhdGVzJyB9KTtcbiAgICAgICAgc2V0dXBMaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ0NvbmZpZ3VyZSBhdXRvbWF0aWMgdGFnZ2luZycgfSk7XG5cbiAgICAgICAgdGhpcy5yZW5kZXJCdXR0b25zKGNvbnRlbnRFbCwgZmFsc2UsIHRydWUpO1xuICAgIH1cblxuICAgIGFzeW5jIHJlbmRlckZvbGRlclN0ZXAoY29udGVudEVsKSB7XG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ0NoZWNraW5nIGV4aXN0aW5nIGZvbGRlciBzdHJ1Y3R1cmUuLi4nIH0pO1xuXG4gICAgICAgIGNvbnN0IHN0cnVjdHVyZSA9IGF3YWl0IHRoaXMucHJvdmlzaW9uaW5nTWFuYWdlci5kZXRlY3RFeGlzdGluZ1N0cnVjdHVyZSgpO1xuXG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdQQVJBIEZvbGRlcnMnIH0pO1xuICAgICAgICBjb25zdCB0YWJsZSA9IGNvbnRlbnRFbC5jcmVhdGVFbCgndGFibGUnLCB7IGNsczogJ3BhcmEtZm9sZGVycy10YWJsZScgfSk7XG5cbiAgICAgICAgY29uc3QgaGVhZGVyID0gdGFibGUuY3JlYXRlRWwoJ3RyJyk7XG4gICAgICAgIGhlYWRlci5jcmVhdGVFbCgndGgnLCB7IHRleHQ6ICdMb2NhdGlvbicgfSk7XG4gICAgICAgIGhlYWRlci5jcmVhdGVFbCgndGgnLCB7IHRleHQ6ICdGb2xkZXIgUGF0aCcgfSk7XG4gICAgICAgIGhlYWRlci5jcmVhdGVFbCgndGgnLCB7IHRleHQ6ICdTdGF0dXMnIH0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgW2xvY2F0aW9uLCBpbmZvXSBvZiBPYmplY3QuZW50cmllcyhzdHJ1Y3R1cmUpKSB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSB0YWJsZS5jcmVhdGVFbCgndHInKTtcbiAgICAgICAgICAgIHJvdy5jcmVhdGVFbCgndGQnLCB7IHRleHQ6IGxvY2F0aW9uLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbG9jYXRpb24uc2xpY2UoMSkgfSk7XG4gICAgICAgICAgICByb3cuY3JlYXRlRWwoJ3RkJywgeyB0ZXh0OiBpbmZvLnBhdGggfSk7XG4gICAgICAgICAgICBjb25zdCBzdGF0dXNDZWxsID0gcm93LmNyZWF0ZUVsKCd0ZCcpO1xuICAgICAgICAgICAgc3RhdHVzQ2VsbC5jcmVhdGVFbCgnc3BhbicsIHtcbiAgICAgICAgICAgICAgICB0ZXh0OiBpbmZvLmV4aXN0cyA/ICdFeGlzdHMnIDogJ1dpbGwgY3JlYXRlJyxcbiAgICAgICAgICAgICAgICBjbHM6IGluZm8uZXhpc3RzID8gJ3BhcmEtZXhpc3RzJyA6ICdwYXJhLWNyZWF0ZSdcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgdGV4dDogJ0V4aXN0aW5nIGZvbGRlcnMgd2lsbCBub3QgYmUgbW9kaWZpZWQuIE9ubHkgbWlzc2luZyBmb2xkZXJzIHdpbGwgYmUgY3JlYXRlZC4nLFxuICAgICAgICAgICAgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJ1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnJlbmRlckJ1dHRvbnMoY29udGVudEVsLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBhc3luYyByZW5kZXJDb25maXJtU3RlcChjb250ZW50RWwpIHtcbiAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiAnQ3JlYXRpbmcgZm9sZGVycy4uLicgfSk7XG5cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wcm92aXNpb25pbmdNYW5hZ2VyLnByb3Zpc2lvbkZvbGRlcnModHJ1ZSk7XG5cbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdTZXR1cCBDb21wbGV0ZSEnIH0pO1xuXG4gICAgICAgIGlmIChyZXN1bHQuY3JlYXRlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnQ3JlYXRlZCBGb2xkZXJzJyB9KTtcbiAgICAgICAgICAgIGNvbnN0IGNyZWF0ZWRMaXN0ID0gY29udGVudEVsLmNyZWF0ZUVsKCd1bCcpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBmb2xkZXIgb2YgcmVzdWx0LmNyZWF0ZWQpIHtcbiAgICAgICAgICAgICAgICBjcmVhdGVkTGlzdC5jcmVhdGVFbCgnbGknLCB7IHRleHQ6IGZvbGRlciB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZXN1bHQuc2tpcHBlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnRXhpc3RpbmcgRm9sZGVycyAoU2tpcHBlZCknIH0pO1xuICAgICAgICAgICAgY29uc3Qgc2tpcHBlZExpc3QgPSBjb250ZW50RWwuY3JlYXRlRWwoJ3VsJyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZvbGRlciBvZiByZXN1bHQuc2tpcHBlZCkge1xuICAgICAgICAgICAgICAgIHNraXBwZWRMaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogZm9sZGVyIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ05leHQgU3RlcHMnIH0pO1xuICAgICAgICBjb25zdCBuZXh0U3RlcHMgPSBjb250ZW50RWwuY3JlYXRlRWwoJ29sJyk7XG4gICAgICAgIG5leHRTdGVwcy5jcmVhdGVFbCgnbGknLCB7IHRleHQ6ICdJbnN0YWxsIFRlbXBsYXRlciBhbmQgVGFza3MgcGx1Z2lucyAoaWYgbm90IGFscmVhZHkgaW5zdGFsbGVkKScgfSk7XG4gICAgICAgIG5leHRTdGVwcy5jcmVhdGVFbCgnbGknLCB7IHRleHQ6ICdEZXBsb3kgdGVtcGxhdGVzIHVzaW5nIHRoZSBcIkRlcGxveSBQQVJBIHRlbXBsYXRlc1wiIGNvbW1hbmQnIH0pO1xuICAgICAgICBuZXh0U3RlcHMuY3JlYXRlRWwoJ2xpJywgeyB0ZXh0OiAnU3RhcnQgY3JlYXRpbmcgbm90ZXMgaW4geW91ciBQQVJBIGZvbGRlcnMhJyB9KTtcblxuICAgICAgICB0aGlzLnJlbmRlckJ1dHRvbnMoY29udGVudEVsLCBmYWxzZSwgZmFsc2UsIHRydWUpO1xuICAgIH1cblxuICAgIHJlbmRlckJ1dHRvbnMoY29udGVudEVsLCBzaG93QmFjaywgc2hvd05leHQsIHNob3dDbG9zZSA9IGZhbHNlKSB7XG4gICAgICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdtb2RhbC1idXR0b24tY29udGFpbmVyJyB9KTtcblxuICAgICAgICBpZiAoc2hvd0JhY2spIHtcbiAgICAgICAgICAgIGNvbnN0IGJhY2tCdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ0JhY2snIH0pO1xuICAgICAgICAgICAgYmFja0J1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnN0ZXAtLTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclN0ZXAoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3dOZXh0KSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0QnV0dG9uID0gYnV0dG9uQ29udGFpbmVyLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdOZXh0JywgY2xzOiAnbW9kLWN0YScgfSk7XG4gICAgICAgICAgICBuZXh0QnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RlcCsrO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyU3RlcCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2hvd0Nsb3NlKSB7XG4gICAgICAgICAgICBjb25zdCBjbG9zZUJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnQ2xvc2UnLCBjbHM6ICdtb2QtY3RhJyB9KTtcbiAgICAgICAgICAgIGNsb3NlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5jbG9zZSgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNhbmNlbEJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnQ2FuY2VsJyB9KTtcbiAgICAgICAgY2FuY2VsQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5jbG9zZSgpKTtcbiAgICB9XG5cbiAgICBvbkNsb3NlKCkge1xuICAgICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUQUdHSU5HIE1BTkFHRVJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY2xhc3MgVGFnZ2luZ01hbmFnZXIge1xuICAgIGNvbnN0cnVjdG9yKGFwcCwgc2V0dGluZ3MsIHByb2ZpbGVyKSB7XG4gICAgICAgIHRoaXMuYXBwID0gYXBwO1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgIHRoaXMucHJvZmlsZXIgPSBwcm9maWxlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmUgUEFSQSBsb2NhdGlvbiBhbmQgc3ViZm9sZGVyIHRhZyhzKSBiYXNlZCBvbiBmaWxlIHBhdGhcbiAgICAgKlxuICAgICAqIExvZ2ljOlxuICAgICAqIC0gUEFSQSBsb2NhdGlvbiBpcyBzdG9yZWQgYXMgYSBwcm9wZXJ0eSAoZS5nLiwgcGFyYTogXCJwcm9qZWN0c1wiKVxuICAgICAqIC0gU3ViZm9sZGVyIHRhZ3MgYXJlIGFwcGxpZWQgc2VwYXJhdGVseSBhbmQgcGVyc2lzdCBhY3Jvc3MgbW92ZXNcbiAgICAgKiAtIEV4YW1wbGU6IFwiMSAtIFByb2plY3RzL1BCU1dJL1NvbWUgUHJvamVjdC5tZFwiXG4gICAgICogICBSZXN1bHRzIGluOiBwYXJhIHByb3BlcnR5ID0gXCJwcm9qZWN0c1wiLCB0YWdzIGluY2x1ZGUgXCJwYnN3aVwiXG4gICAgICovXG4gICAgZ2V0VGFnc0Zyb21QYXRoKGZpbGVQYXRoKSB7XG4gICAgICAgIGxldCBwYXJhTG9jYXRpb24gPSBudWxsO1xuICAgICAgICBjb25zdCBzdWJmb2xkZXJUYWdzID0gW107XG5cbiAgICAgICAgLy8gRmluZCBtYXRjaGluZyBQQVJBIHJvb3QgZm9sZGVyIChjYXNlLWluc2Vuc2l0aXZlKVxuICAgICAgICBmb3IgKGNvbnN0IFtsb2NhdGlvbiwgZm9sZGVyTmFtZV0gb2YgT2JqZWN0LmVudHJpZXModGhpcy5zZXR0aW5ncy5wYXJhRm9sZGVycykpIHtcbiAgICAgICAgICAgIGNvbnN0IGxvd2VyRmlsZVBhdGggPSBmaWxlUGF0aC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgY29uc3QgbG93ZXJGb2xkZXJOYW1lID0gZm9sZGVyTmFtZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgICAgICAgICBpZiAobG93ZXJGaWxlUGF0aC5zdGFydHNXaXRoKGxvd2VyRm9sZGVyTmFtZSArICcvJykgfHwgbG93ZXJGaWxlUGF0aCA9PT0gbG93ZXJGb2xkZXJOYW1lKSB7XG4gICAgICAgICAgICAgICAgcGFyYUxvY2F0aW9uID0gbG9jYXRpb247XG5cbiAgICAgICAgICAgICAgICAvLyBFeHRyYWN0IHN1YmZvbGRlciBwYXRoIGFmdGVyIHRoZSBQQVJBIHJvb3QgKHVzZSBvcmlnaW5hbCBjYXNlIGZvciBleHRyYWN0aW9uKVxuICAgICAgICAgICAgICAgIGNvbnN0IHJlbWFpbmluZ1BhdGggPSBmaWxlUGF0aC5zdWJzdHJpbmcoZm9sZGVyTmFtZS5sZW5ndGggKyAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXRoUGFydHMgPSByZW1haW5pbmdQYXRoLnNwbGl0KCcvJyk7XG5cbiAgICAgICAgICAgICAgICAvLyBJZiB0aGVyZSBhcmUgc3ViZm9sZGVycyAobm90IGp1c3QgdGhlIGZpbGVuYW1lKSwgYWRkIHRoZW0gYXMgdGFnc1xuICAgICAgICAgICAgICAgIGlmIChwYXRoUGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaXJzdCBzdWJmb2xkZXIgYmVjb21lcyBhIHRhZyAobG93ZXJjYXNlLCBubyBzcGFjZXMpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1YmZvbGRlciA9IHBhdGhQYXJ0c1swXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN1YmZvbGRlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ29udmVydCB0byBsb3dlcmNhc2Uga2ViYWItY2FzZVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ViZm9sZGVyVGFnID0gc3ViZm9sZGVyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxzKy9nLCAnLScpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1teYS16MC05XFwtXS9nLCAnJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdWJmb2xkZXJUYWcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJmb2xkZXJUYWdzLnB1c2goc3ViZm9sZGVyVGFnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHsgcGFyYUxvY2F0aW9uLCBzdWJmb2xkZXJUYWdzIH07XG4gICAgfVxuXG4gICAgYXN5bmMgdXBkYXRlUGFyYVRhZ3MoZmlsZSkge1xuICAgICAgICBpZiAoIWZpbGUpIHJldHVybjtcblxuICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGZpbGUucGF0aDtcbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgndGFnZ2luZzp1cGRhdGUnKTtcbiAgICAgICAgY29uc3QgY29udGV4dCA9IHsgcGF0aDogZmlsZVBhdGggfTtcblxuICAgICAgICAvLyBTa2lwIGZpbGVzIGluIFRFTVBMQVRFUyBmb2xkZXIgLSB0ZW1wbGF0ZXMgc2hvdWxkbid0IGdldCBQQVJBIHByb3BlcnRpZXNcbiAgICAgICAgaWYgKGZpbGVQYXRoLmluY2x1ZGVzKCcvVEVNUExBVEVTLycpIHx8IGZpbGVQYXRoLnN0YXJ0c1dpdGgoJ1RFTVBMQVRFUy8nKSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MucHJvZmlsaW5nRW5hYmxlZCkgeyBjb25zb2xlLmxvZygnUXVpY2sgUEFSQTogU2tpcHBpbmcgdGVtcGxhdGUgZmlsZTonLCBmaWxlUGF0aCk7IH1cbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmluY3JlbWVudCgndGFnZ2luZzpza2lwOnRlbXBsYXRlcycpO1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKHRpbWVyLCB7IC4uLmNvbnRleHQsIHJlYXNvbjogJ3RlbXBsYXRlJyB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERldGVybWluZSBQQVJBIGxvY2F0aW9uIGFuZCBzdWJmb2xkZXIgdGFnc1xuICAgICAgICBjb25zdCB7IHBhcmFMb2NhdGlvbiwgc3ViZm9sZGVyVGFncyB9ID0gdGhpcy5nZXRUYWdzRnJvbVBhdGgoZmlsZVBhdGgpO1xuXG4gICAgICAgIC8vIElmIGZpbGUgaXMgbm90IGluIGEgUEFSQSBmb2xkZXIsIHNraXBcbiAgICAgICAgaWYgKCFwYXJhTG9jYXRpb24pIHtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmluY3JlbWVudCgndGFnZ2luZzpza2lwOm5vbi1wYXJhJyk7XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQodGltZXIsIHsgLi4uY29udGV4dCwgcmVhc29uOiAnb3V0c2lkZS1wYXJhJyB9KTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBjcmVhdGVkRGF0ZSA9IG51bGw7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBVc2UgY2FjaGVkIHN0YXQgZmlyc3Q7IGZhbGwgYmFjayB0byBhZGFwdGVyLnN0YXQgd2hpY2ggaXMgYXN5bmNcbiAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBmaWxlLnN0YXQgPz8gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5zdGF0KGZpbGUucGF0aCk7XG4gICAgICAgICAgICBpZiAoc3RhdD8uY3RpbWUpIHtcbiAgICAgICAgICAgICAgICBjcmVhdGVkRGF0ZSA9IG5ldyBEYXRlKHN0YXQuY3RpbWUpLnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoc3RhdEVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdRdWljayBQQVJBOiBGYWlsZWQgdG8gcmVhZCBmaWxlIHN0YXQgZGF0YScsIHN0YXRFcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBhcmNoaXZlRGF0ZSA9IHBhcmFMb2NhdGlvbiA9PT0gJ2FyY2hpdmUnXG4gICAgICAgICAgICA/IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdXG4gICAgICAgICAgICA6IG51bGw7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFVwZGF0ZSB0aGUgZnJvbnRtYXR0ZXJcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCAoZnJvbnRtYXR0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCByYXdUYWdzID0gQXJyYXkuaXNBcnJheShmcm9udG1hdHRlci50YWdzKVxuICAgICAgICAgICAgICAgICAgICA/IGZyb250bWF0dGVyLnRhZ3MubWFwKHRhZyA9PiB0YWcudG9TdHJpbmcoKSlcbiAgICAgICAgICAgICAgICAgICAgOiBmcm9udG1hdHRlci50YWdzXG4gICAgICAgICAgICAgICAgICAgICAgICA/IFtmcm9udG1hdHRlci50YWdzLnRvU3RyaW5nKCldXG4gICAgICAgICAgICAgICAgICAgICAgICA6IFtdO1xuXG4gICAgICAgICAgICAgICAgLy8gUmVtb3ZlIG9sZCBQQVJBIHRhZ3MgKGluIGNhc2UgdGhleSBleGlzdCBmcm9tIG9sZCBwbHVnaW4gdmVyc2lvbilcbiAgICAgICAgICAgICAgICAvLyBLZWVwIGFsbCBvdGhlciB0YWdzIChpbmNsdWRpbmcgc3ViZm9sZGVyIHRhZ3MgZnJvbSBwcmV2aW91cyBsb2NhdGlvbnMpXG4gICAgICAgICAgICAgICAgbGV0IGZpbHRlcmVkVGFncyA9IHJhd1RhZ3MuZmlsdGVyKHRhZyA9PiAhdGFnLnN0YXJ0c1dpdGgoJ3BhcmEvJykpO1xuXG4gICAgICAgICAgICAgICAgLy8gUmVtb3ZlIHRlbXBsYXRlLXNwZWNpZmljIHRhZ3MgdGhhdCBzaG91bGRuJ3QgcHJvcGFnYXRlXG4gICAgICAgICAgICAgICAgZmlsdGVyZWRUYWdzID0gZmlsdGVyZWRUYWdzLmZpbHRlcih0YWcgPT4ge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCB0YWdTdHIgPSBTdHJpbmcodGFnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGFnU3RyICE9PSAndGVtcGxhdGVzJyAmJlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgdGFnU3RyICE9PSAndGVtcGxhdGUnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB0YWdTdHIgIT09ICdyZXNvdXJjZXMnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB0YWdTdHIgIT09ICdhbGwnOyAgLy8gV2UnbGwgcmUtYWRkICdhbGwnIGxhdGVyXG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgICAgICAvLyBPcHRpb25hbGx5IG1pZ3JhdGUgb2xkIHRhZ3NcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy50YWdnaW5nLm1pZ3JhdGVPbGRUYWdzKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIE1pZ3JhdGlvbiBhbHJlYWR5IGhhcHBlbnMgYWJvdmUgYnkgcmVtb3ZpbmcgcGFyYS8qIHRhZ3NcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MucHJvZmlsaW5nRW5hYmxlZCkgeyBjb25zb2xlLmxvZygnUXVpY2sgUEFSQTogTWlncmF0ZWQgb2xkIHBhcmEvKiB0YWdzJyk7IH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBCdWlsZCBuZXcgdGFnIGxpc3RcbiAgICAgICAgICAgICAgICBjb25zdCBuZXh0VGFncyA9IEFycmF5LmZyb20obmV3IFNldChmaWx0ZXJlZFRhZ3MpKTtcblxuICAgICAgICAgICAgICAgIC8vIEFkZCBzdWJmb2xkZXIgdGFncyAodGhlc2UgcGVyc2lzdCBldmVuIGFmdGVyIG1vdmluZywgaWYgZW5hYmxlZClcbiAgICAgICAgICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy50YWdnaW5nLnBlcnNpc3RTdWJmb2xkZXJUYWdzKSB7XG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3Qgc3ViZm9sZGVyVGFnIG9mIHN1YmZvbGRlclRhZ3MpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghbmV4dFRhZ3MuaW5jbHVkZXMoc3ViZm9sZGVyVGFnKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5leHRUYWdzLnB1c2goc3ViZm9sZGVyVGFnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEFsd2F5cyBpbmNsdWRlICdhbGwnIHRhZyBmaXJzdFxuICAgICAgICAgICAgICAgIGZyb250bWF0dGVyLnRhZ3MgPSBbJ2FsbCcsIC4uLm5leHRUYWdzXTtcblxuICAgICAgICAgICAgICAgIC8vIFNldCBQQVJBIGxvY2F0aW9uIGFzIGEgcHJvcGVydHkgKGNvbmZpZ3VyYWJsZSBuYW1lKVxuICAgICAgICAgICAgICAgIGNvbnN0IHByb3BlcnR5TmFtZSA9IHRoaXMuc2V0dGluZ3MudGFnZ2luZy5wcm9wZXJ0eU5hbWUgfHwgJ3BhcmEnO1xuICAgICAgICAgICAgICAgIGZyb250bWF0dGVyW3Byb3BlcnR5TmFtZV0gPSBwYXJhTG9jYXRpb247XG5cbiAgICAgICAgICAgICAgICAvLyBBZGQgYXJjaGl2ZWQgZGF0ZSBpZiBtb3ZpbmcgdG8gYXJjaGl2ZVxuICAgICAgICAgICAgICAgIGlmIChhcmNoaXZlRGF0ZSAmJiAhZnJvbnRtYXR0ZXIuYXJjaGl2ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgZnJvbnRtYXR0ZXIuYXJjaGl2ZWQgPSBhcmNoaXZlRGF0ZTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBZGQgY3JlYXRlZCBkYXRlIGlmIG1pc3NpbmdcbiAgICAgICAgICAgICAgICBpZiAoIWZyb250bWF0dGVyLmNyZWF0ZWQgJiYgY3JlYXRlZERhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgZnJvbnRtYXR0ZXIuY3JlYXRlZCA9IGNyZWF0ZWREYXRlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBPbmx5IGxvZyBpbiB2ZXJib3NlIG1vZGUgb3Igd2hlbiBwcm9maWxpbmdcbiAgICAgICAgICAgIGlmICh0aGlzLnByb2ZpbGVyPy5pc0VuYWJsZWQoKSB8fCB0aGlzLnNldHRpbmdzLmRlYnVnPy52ZXJib3NlTG9nZ2luZykge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBRdWljayBQQVJBOiBVcGRhdGVkIHRhZ3MgZm9yICR7ZmlsZS5uYW1lfSAtIFBBUkE6ICR7cGFyYUxvY2F0aW9ufSwgU3ViZm9sZGVyczogJHtzdWJmb2xkZXJUYWdzLmpvaW4oJywgJyl9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5pbmNyZW1lbnQoJ3RhZ2dpbmc6dXBkYXRlZCcpO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgUEFSQSB0YWdzOicsIGVycm9yKTtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmluY3JlbWVudCgndGFnZ2luZzplcnJvcnMnKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyAuLi5jb250ZXh0LCBwYXJhTG9jYXRpb24gfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBhc3luYyBidWxrVXBkYXRlVGFncyhwcmV2aWV3ID0gdHJ1ZSkge1xuICAgICAgICBjb25zdCBmaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKTtcbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgndGFnZ2luZzpidWxrLXVwZGF0ZScpO1xuICAgICAgICBsZXQgdXBkYXRlZCA9IDA7XG4gICAgICAgIGxldCBza2lwcGVkID0gMDtcbiAgICAgICAgY29uc3QgZXJyb3JzID0gW107XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChwcmV2aWV3KSB7XG4gICAgICAgICAgICAgICAgLy8gVE9ETzogSW1wbGVtZW50IHByZXZpZXcgbW9kZVxuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYFByZXZpZXcgbW9kZSBub3QgeWV0IGltcGxlbWVudGVkLiBXaWxsIHVwZGF0ZSAke2ZpbGVzLmxlbmd0aH0gZmlsZXMuYCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYFVwZGF0aW5nIFBBUkEgdGFncyBmb3IgJHtmaWxlcy5sZW5ndGh9IGZpbGVzLi4uYCk7XG5cbiAgICAgICAgICAgIC8vIFByb2Nlc3MgZmlsZXMgaW4gYmF0Y2hlcyBmb3IgYmV0dGVyIHBlcmZvcm1hbmNlXG4gICAgICAgICAgICBjb25zdCBCQVRDSF9TSVpFID0gNTA7IC8vIFByb2Nlc3MgNTAgZmlsZXMgY29uY3VycmVudGx5XG4gICAgICAgICAgICBjb25zdCBiYXRjaGVzID0gW107XG5cbiAgICAgICAgICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmlsZXMubGVuZ3RoOyBpICs9IEJBVENIX1NJWkUpIHtcbiAgICAgICAgICAgICAgICBiYXRjaGVzLnB1c2goZmlsZXMuc2xpY2UoaSwgaSArIEJBVENIX1NJWkUpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUHJvY2VzcyBlYWNoIGJhdGNoXG4gICAgICAgICAgICBmb3IgKGxldCBiYXRjaEluZGV4ID0gMDsgYmF0Y2hJbmRleCA8IGJhdGNoZXMubGVuZ3RoOyBiYXRjaEluZGV4KyspIHtcbiAgICAgICAgICAgICAgICBjb25zdCBiYXRjaCA9IGJhdGNoZXNbYmF0Y2hJbmRleF07XG5cbiAgICAgICAgICAgICAgICAvLyBTaG93IHByb2dyZXNzIGZvciBsYXJnZSBvcGVyYXRpb25zXG4gICAgICAgICAgICAgICAgaWYgKGZpbGVzLmxlbmd0aCA+IDEwMCAmJiBiYXRjaEluZGV4ICUgNSA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9ncmVzcyA9IE1hdGgucm91bmQoKGJhdGNoSW5kZXggLyBiYXRjaGVzLmxlbmd0aCkgKiAxMDApO1xuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBQcm9ncmVzczogJHtwcm9ncmVzc30lICgke2JhdGNoSW5kZXggKiBCQVRDSF9TSVpFfS8ke2ZpbGVzLmxlbmd0aH0gZmlsZXMpYCwgMjAwMCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gUHJvY2VzcyBiYXRjaCBpbiBwYXJhbGxlbFxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbFNldHRsZWQoXG4gICAgICAgICAgICAgICAgICAgIGJhdGNoLm1hcChhc3luYyAoZmlsZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZVBhcmFUYWdzKGZpbGUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIGZpbGU6IGZpbGUubmFtZSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWNjZXNzOiBmYWxzZSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZmlsZTogZmlsZS5uYW1lLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBlcnJvcjogZXJyb3IubWVzc2FnZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgKTtcblxuICAgICAgICAgICAgICAgIC8vIENvdW50IHJlc3VsdHNcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHJlc3VsdCBvZiByZXN1bHRzKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSAnZnVsZmlsbGVkJyAmJiByZXN1bHQudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgdXBkYXRlZCsrO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdC5zdGF0dXMgPT09ICdmdWxmaWxsZWQnICYmICFyZXN1bHQudmFsdWUuc3VjY2Vzcykge1xuICAgICAgICAgICAgICAgICAgICAgICAgZXJyb3JzLnB1c2gocmVzdWx0LnZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQuc3RhdHVzID09PSAncmVqZWN0ZWQnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBlcnJvcnMucHVzaCh7IGZpbGU6ICd1bmtub3duJywgZXJyb3I6IHJlc3VsdC5yZWFzb24gfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFNob3cgZmluYWwgc3VtbWFyeVxuICAgICAgICAgICAgbGV0IG1lc3NhZ2UgPSBgVXBkYXRlZCBQQVJBIHRhZ3MgZm9yICR7dXBkYXRlZH0gZmlsZXMhYDtcbiAgICAgICAgICAgIGlmIChlcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIG1lc3NhZ2UgKz0gYCAoJHtlcnJvcnMubGVuZ3RofSBlcnJvcnMpYDtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdRdWljayBQQVJBOiBCdWxrIHVwZGF0ZSBlcnJvcnM6JywgZXJyb3JzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG5ldyBOb3RpY2UobWVzc2FnZSk7XG5cbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwge1xuICAgICAgICAgICAgICAgIHRvdGFsRmlsZXM6IGZpbGVzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICB1cGRhdGVkLFxuICAgICAgICAgICAgICAgIHNraXBwZWQsXG4gICAgICAgICAgICAgICAgZXJyb3JzOiBlcnJvcnMubGVuZ3RoXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIG1pZ3JhdGVPbGRUYWdzKCkge1xuICAgICAgICAvLyBFbmFibGUgbWlncmF0aW9uIHNldHRpbmdcbiAgICAgICAgdGhpcy5zZXR0aW5ncy50YWdnaW5nLm1pZ3JhdGVPbGRUYWdzID0gdHJ1ZTtcblxuICAgICAgICAvLyBSdW4gYnVsayB1cGRhdGVcbiAgICAgICAgYXdhaXQgdGhpcy5idWxrVXBkYXRlVGFncyhmYWxzZSk7XG5cbiAgICAgICAgLy8gRGlzYWJsZSBtaWdyYXRpb24gc2V0dGluZ1xuICAgICAgICB0aGlzLnNldHRpbmdzLnRhZ2dpbmcubWlncmF0ZU9sZFRhZ3MgPSBmYWxzZTtcblxuICAgICAgICBuZXcgTm90aWNlKCdNaWdyYXRpb24gY29tcGxldGUhIE9sZCBwYXJhLyogdGFncyBoYXZlIGJlZW4gY29udmVydGVkIHRvIHByb3BlcnRpZXMuJyk7XG4gICAgfVxuXG4gICAgYXN5bmMgY2xlYW5UZW1wbGF0ZUZpbGVzKCkge1xuICAgICAgICAvLyBGaW5kIGFsbCBmaWxlcyBpbiBURU1QTEFURVMgZm9sZGVyc1xuICAgICAgICBjb25zdCBmaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKS5maWx0ZXIoZiA9PlxuICAgICAgICAgICAgZi5wYXRoLmluY2x1ZGVzKCcvVEVNUExBVEVTLycpIHx8IGYucGF0aC5zdGFydHNXaXRoKCdURU1QTEFURVMvJylcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoZmlsZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKCdObyB0ZW1wbGF0ZSBmaWxlcyBmb3VuZCB0byBjbGVhbi4nKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIG5ldyBOb3RpY2UoYENsZWFuaW5nICR7ZmlsZXMubGVuZ3RofSB0ZW1wbGF0ZSBmaWxlcy4uLmApO1xuICAgICAgICBsZXQgY2xlYW5lZCA9IDA7XG5cbiAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCAoZnJvbnRtYXR0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IG1vZGlmaWVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIHBhcmEgcHJvcGVydHlcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZyb250bWF0dGVyLnBhcmEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBmcm9udG1hdHRlci5wYXJhO1xuICAgICAgICAgICAgICAgICAgICAgICAgbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIHBhcmEvKiB0YWdzXG4gICAgICAgICAgICAgICAgICAgIGlmIChmcm9udG1hdHRlci50YWdzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByYXdUYWdzID0gQXJyYXkuaXNBcnJheShmcm9udG1hdHRlci50YWdzKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gZnJvbnRtYXR0ZXIudGFnc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogW2Zyb250bWF0dGVyLnRhZ3NdO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbGVhbmVkVGFncyA9IHJhd1RhZ3MuZmlsdGVyKHRhZyA9PiAhU3RyaW5nKHRhZykuc3RhcnRzV2l0aCgncGFyYS8nKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbGVhbmVkVGFncy5sZW5ndGggIT09IHJhd1RhZ3MubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZnJvbnRtYXR0ZXIudGFncyA9IGNsZWFuZWRUYWdzO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBhcmNoaXZlZCBkYXRlICh0ZW1wbGF0ZXMgc2hvdWxkbid0IGhhdmUgdGhpcylcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZyb250bWF0dGVyLmFyY2hpdmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgZnJvbnRtYXR0ZXIuYXJjaGl2ZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAobW9kaWZpZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuZWQrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnNldHRpbmdzLmRpYWdub3N0aWNzLnByb2ZpbGluZ0VuYWJsZWQpIHsgY29uc29sZS5sb2coYFF1aWNrIFBBUkE6IENsZWFuZWQgdGVtcGxhdGUgZmlsZTogJHtmaWxlLnBhdGh9YCk7IH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBFcnJvciBjbGVhbmluZyB0ZW1wbGF0ZSAke2ZpbGUucGF0aH06YCwgZXJyb3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbmV3IE5vdGljZShgQ2xlYW5lZCAke2NsZWFuZWR9IHRlbXBsYXRlIGZpbGVzIWApO1xuICAgIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gVEVNUExBVEUgTUFOQUdFUlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jbGFzcyBUZW1wbGF0ZU1hbmFnZXIge1xuICAgIGNvbnN0cnVjdG9yKGFwcCwgc2V0dGluZ3MsIHByb2ZpbGVyKSB7XG4gICAgICAgIHRoaXMuYXBwID0gYXBwO1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgIHRoaXMucHJvZmlsZXIgPSBwcm9maWxlcjtcblxuICAgICAgICAvLyBFbWJlZGRlZCB0ZW1wbGF0ZXMgLSB0aGVzZSB3aWxsIGJlIGRlcGxveWVkIHRvIHRoZSB2YXVsdFxuICAgICAgICB0aGlzLnRlbXBsYXRlcyA9IHtcbiAgICAgICAgICAgICdkZWZhdWx0LXRlbXBsYXRlLm1kJzogYC0tLVxudGFnczpcbiAgLSBhbGxcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG4tLS1cblxuIyMgXHVEODNEXHVEREQyIFRhc2tzIGluIHRoaXMgbm90ZVxuXFxgXFxgXFxgdGFza3NcbnBhdGggaW5jbHVkZXMge3txdWVyeS5maWxlLnBhdGh9fVxubm90IGRvbmVcbnNvcnQgYnkgZHVlXG5zb3J0IGJ5IHByaW9yaXR5XG5cblxuXFxgXFxgXFxgXG5cbi0tLVxuIyMgUmVzb3VyY2VzXG4qQWRkIGxpbmtzIHRvIGZyZXF1ZW50IHJlZmVyZW5jZSBvciB3b3JraW5nIGRvY3VtZW50cypcblxuXG5cblxuLS0tXG4jIyBOb3Rlc1xuKlRvIGRvIGl0ZW1zIHdpbGwgYWxsIGJlIGNvbGxlY3RlZCBhdCB0aGUgdG9wIG9mIHRoZSBub3RlLipcbi0gWyBdIFN0YXJ0IG5vdGVzXG4tIFsgXVxuXG5cbmAsXG4gICAgICAgICAgICAnaW5ib3gtdGVtcGxhdGUubWQnOiBgLS0tXG50YWdzOlxuICAtIGFsbFxuY3JlYXRlZDogPCUgdHAuZmlsZS5jcmVhdGlvbl9kYXRlKCkgJT5cbi0tLVxuXG4jIyBcdUQ4M0RcdURERDIgVGFza3MgaW4gdGhpcyBub3RlXG5cXGBcXGBcXGB0YXNrc1xucGF0aCBpbmNsdWRlcyB7e3F1ZXJ5LmZpbGUucGF0aH19XG5ub3QgZG9uZVxuc29ydCBieSBkdWVcbnNvcnQgYnkgcHJpb3JpdHlcblxuXG5cXGBcXGBcXGBcblxuLS0tXG4jIyBSZXNvdXJjZXNcbipBZGQgbGlua3MgdG8gZnJlcXVlbnQgcmVmZXJlbmNlIG9yIHdvcmtpbmcgZG9jdW1lbnRzKlxuXG5cblxuXG4tLS1cbiMjIE5vdGVzXG4qVG8gZG8gaXRlbXMgd2lsbCBhbGwgYmUgY29sbGVjdGVkIGF0IHRoZSB0b3Agb2YgdGhlIG5vdGUuKlxuLSBbIF0gU3RhcnQgbm90ZXNcbi0gWyBdXG5gLFxuICAgICAgICAgICAgJ3Byb2plY3RzLXRlbXBsYXRlLm1kJzogYC0tLVxudGFnczpcbiAgLSBhbGxcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG4tLS1cblxuIyMgXHVEODNEXHVEREQyIFRhc2tzIGluIHRoaXMgbm90ZVxuXFxgXFxgXFxgdGFza3NcbnBhdGggaW5jbHVkZXMge3txdWVyeS5maWxlLnBhdGh9fVxubm90IGRvbmVcbnNvcnQgYnkgZHVlXG5zb3J0IGJ5IHByaW9yaXR5XG5cblxuXFxgXFxgXFxgXG5cbi0tLVxuIyMgUmVzb3VyY2VzXG4qQWRkIGxpbmtzIHRvIGZyZXF1ZW50IHJlZmVyZW5jZSBvciB3b3JraW5nIGRvY3VtZW50cypcblxuXG5cblxuLS0tXG4jIyBOb3Rlc1xuKlRvIGRvIGl0ZW1zIHdpbGwgYWxsIGJlIGNvbGxlY3RlZCBhdCB0aGUgdG9wIG9mIHRoZSBub3RlLipcbi0gWyBdIFN0YXJ0IG5vdGVzXG4tIFsgXVxuYCxcbiAgICAgICAgICAgICdhcmVhcy10ZW1wbGF0ZS5tZCc6IGAtLS1cbnRhZ3M6XG4gIC0gYWxsXG5jcmVhdGVkOiA8JSB0cC5maWxlLmNyZWF0aW9uX2RhdGUoKSAlPlxuLS0tXG5cbiMjIFx1RDgzRFx1REREMiBUYXNrcyBpbiB0aGlzIG5vdGVcblxcYFxcYFxcYHRhc2tzXG5wYXRoIGluY2x1ZGVzIHt7cXVlcnkuZmlsZS5wYXRofX1cbm5vdCBkb25lXG5zb3J0IGJ5IGR1ZVxuc29ydCBieSBwcmlvcml0eVxuXG5cblxcYFxcYFxcYFxuXG4tLS1cbiMjIFJlc291cmNlc1xuKkFkZCBsaW5rcyB0byBmcmVxdWVudCByZWZlcmVuY2Ugb3Igd29ya2luZyBkb2N1bWVudHMqXG5cblxuXG5cbi0tLVxuIyMgTm90ZXNcbipUbyBkbyBpdGVtcyB3aWxsIGFsbCBiZSBjb2xsZWN0ZWQgYXQgdGhlIHRvcCBvZiB0aGUgbm90ZS4qXG4tIFsgXSBTdGFydCBub3Rlc1xuLSBbIF1cbmAsXG4gICAgICAgICAgICAncmVzb3VyY2VzLXRlbXBsYXRlLm1kJzogYC0tLVxudGFnczpcbiAgLSBhbGxcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG4tLS1cblxuIyMgXHVEODNEXHVEREQyIFRhc2tzIGluIHRoaXMgbm90ZVxuXFxgXFxgXFxgdGFza3NcbnBhdGggaW5jbHVkZXMge3txdWVyeS5maWxlLnBhdGh9fVxubm90IGRvbmVcbnNvcnQgYnkgZHVlXG5zb3J0IGJ5IHByaW9yaXR5XG5cblxuXFxgXFxgXFxgXG5cbi0tLVxuIyMgUmVzb3VyY2VzXG4qQWRkIGxpbmtzIHRvIGZyZXF1ZW50IHJlZmVyZW5jZSBvciB3b3JraW5nIGRvY3VtZW50cypcblxuXG5cblxuLS0tXG4jIyBOb3Rlc1xuKlRvIGRvIGl0ZW1zIHdpbGwgYWxsIGJlIGNvbGxlY3RlZCBhdCB0aGUgdG9wIG9mIHRoZSBub3RlLipcbi0gWyBdIFN0YXJ0IG5vdGVzXG4tIFsgXVxuYCxcbiAgICAgICAgICAgICdhcmNoaXZlLXRlbXBsYXRlLm1kJzogYC0tLVxudGFnczpcbiAgLSBhbGxcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG5hcmNoaXZlZDogPCUgdHAuZmlsZS5jcmVhdGlvbl9kYXRlKCkgJT5cbi0tLVxuXG4jIyBcdUQ4M0RcdURERDIgVGFza3MgaW4gdGhpcyBub3RlXG5cXGBcXGBcXGB0YXNrc1xucGF0aCBpbmNsdWRlcyB7e3F1ZXJ5LmZpbGUucGF0aH19XG5ub3QgZG9uZVxuc29ydCBieSBkdWVcbnNvcnQgYnkgcHJpb3JpdHlcblxuXG5cXGBcXGBcXGBcblxuLS0tXG4jIyBSZXNvdXJjZXNcbipBZGQgbGlua3MgdG8gZnJlcXVlbnQgcmVmZXJlbmNlIG9yIHdvcmtpbmcgZG9jdW1lbnRzKlxuXG5cblxuXG4tLS1cbiMjIE5vdGVzXG4qVG8gZG8gaXRlbXMgd2lsbCBhbGwgYmUgY29sbGVjdGVkIGF0IHRoZSB0b3Agb2YgdGhlIG5vdGUuKlxuLSBbIF0gU3RhcnQgbm90ZXNcbi0gWyBdXG5cbmAsXG4gICAgICAgICAgICAnUHJvamVjdCBEYXNoYm9hcmQubWQnOiBgLS0tXG5rYW5iYW4tcGx1Z2luOiBib2FyZFxudGFnczpcbiAgLSBhbGxcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG4tLS1cblxuIyMgSU5CT1hcblxuXG5cbiMjIEJBQ0tCVVJORVJcblxuXG5cbiMjIE5FWFQgV0VFS1xuXG5cblxuIyMgVEhJUyBXRUVLXG5cblxuXG4jIyBCbG9ja2VkXG5cblxuXG4jIyBUT01PUlJPV1xuXG5cblxuIyMgVE9EQVlcblxuLSBbIF0gIyMjIFtbRGFpbHkgYW5kIFdlZWtseSBUYXNrc11dIFx1MjAxNCBkbyB0aGVzZSBUT0RBWSFcblxuXFxgXFxgXFxgdGFza3NcbnBhdGggaW5jbHVkZXMgRGFpbHkgYW5kIFdlZWtseSBUYXNrc1xubm90IGRvbmVcbihkdWUgdG9kYXkpIE9SIChkdWUgYmVmb3JlIHRvbW9ycm93KVxuaGlkZSByZWN1cnJlbmNlIHJ1bGVcbmhpZGUgZWRpdCBidXR0b25cbnNvcnQgYnkgZGVzY3JpcHRpb25cblxcYFxcYFxcYFxuXG5cbiMjIERvaW5nXG5cblxuXG4jIyBEb25lXG5cbioqQ29tcGxldGUqKlxuXG5gLFxuICAgICAgICAgICAgJ1BBUkEgTWV0aG9kIE92ZXJ2aWV3Lm1kJzogYC0tLVxudGFnczpcbiAgLSBhbGxcbiAgLSBwYXJhLW1ldGhvZG9sb2d5XG5jcmVhdGVkOiA8JSB0cC5maWxlLmNyZWF0aW9uX2RhdGUoKSAlPlxucGFyYTogcmVzb3VyY2VzXG4tLS1cblxuIyBQQVJBIE1ldGhvZCBPdmVydmlld1xuXG5XZWxjb21lIHRvIHlvdXIgUEFSQS1vcmdhbml6ZWQgdmF1bHQhIFRoaXMgbm90ZSBleHBsYWlucyB0aGUgUEFSQSBtZXRob2QgYW5kIGhvdyB0aGUgUXVpY2sgUEFSQSBwbHVnaW4gaW1wbGVtZW50cyBpdC5cblxuIyMgV2hhdCBpcyBQQVJBP1xuXG5QQVJBIGlzIGFuIG9yZ2FuaXphdGlvbmFsIHN5c3RlbSBjcmVhdGVkIGJ5IFRpYWdvIEZvcnRlIHRoYXQgZGl2aWRlcyBhbGwgaW5mb3JtYXRpb24gaW50byBmb3VyIGNhdGVnb3JpZXMgYmFzZWQgb24gKiphY3Rpb25hYmlsaXR5KiogYW5kICoqdGltZSBob3Jpem9uKiouXG5cbiMjIyBUaGUgRm91ciBDYXRlZ29yaWVzXG5cbiMjIyMgXHVEODNEXHVEQ0U1ICoqUHJvamVjdHMqKiAoXFxgMSAtIFBST0pFQ1RTXFxgKVxuKipEZWZpbml0aW9uKio6IFNob3J0LXRlcm0gZWZmb3J0cyB3aXRoIGEgc3BlY2lmaWMgZ29hbCBhbmQgZGVhZGxpbmUuXG5cbioqQ2hhcmFjdGVyaXN0aWNzKio6XG4tIEhhcyBhIGNsZWFyIGVuZCBzdGF0ZSBvciBkZWxpdmVyYWJsZVxuLSBUaW1lLWJvdW5kIChkZWFkbGluZSBvciB0YXJnZXQgZGF0ZSlcbi0gUmVxdWlyZXMgbXVsdGlwbGUgc3RlcHMgdG8gY29tcGxldGVcbi0gQWN0aXZlIHdvcmsgaW4gcHJvZ3Jlc3NcblxuKipFeGFtcGxlcyoqOlxuLSBQbGFuIFE0IG1hcmtldGluZyBjYW1wYWlnblxuLSBXcml0ZSBhbm51YWwgcmVwb3J0XG4tIE9yZ2FuaXplIHRlYW0gb2Zmc2l0ZVxuLSBMYXVuY2ggbmV3IHdlYnNpdGUgZmVhdHVyZVxuXG4qKlF1aWNrIFBBUkEgQmVoYXZpb3IqKjpcbi0gTm90ZXMgaW4gUHJvamVjdHMgZ2V0IFxcYHBhcmE6IHByb2plY3RzXFxgIHByb3BlcnR5XG4tIFN1YmZvbGRlciBuYW1lcyBiZWNvbWUgcGVyc2lzdGVudCB0YWdzIChlLmcuLCBcXGBwYnN3aVxcYCwgXFxgcGVyc29uYWxcXGApXG4tIFdoZW4gbW92ZWQgdG8gQXJjaGl2ZSwgcHJvamVjdHMgZ2V0IFxcYGFyY2hpdmVkXFxgIGRhdGUgcHJvcGVydHlcblxuLS0tXG5cbiMjIyMgXHVEODNDXHVERkFGICoqQXJlYXMqKiAoXFxgMiAtIEFSRUFTXFxgKVxuKipEZWZpbml0aW9uKio6IE9uZ29pbmcgcmVzcG9uc2liaWxpdGllcyB0aGF0IHJlcXVpcmUgcmVndWxhciBhdHRlbnRpb24gYnV0IGhhdmUgbm8gZW5kIGRhdGUuXG5cbioqQ2hhcmFjdGVyaXN0aWNzKio6XG4tIE5vIGRlZmluZWQgZW5kcG9pbnQgLSBjb250aW51ZXMgaW5kZWZpbml0ZWx5XG4tIFN0YW5kYXJkcyB0byBtYWludGFpbiByYXRoZXIgdGhhbiBnb2FscyB0byBhY2hpZXZlXG4tIFJlcXVpcmVzIGNvbnNpc3RlbnQsIHJlY3VycmluZyBhdHRlbnRpb25cbi0gU3VjY2VzcyA9IG1haW50YWluaW5nIGEgc3RhbmRhcmQgb3ZlciB0aW1lXG5cbioqRXhhbXBsZXMqKjpcbi0gSGVhbHRoICYgZml0bmVzc1xuLSBQcm9mZXNzaW9uYWwgZGV2ZWxvcG1lbnRcbi0gVGVhbSBtYW5hZ2VtZW50XG4tIEZpbmFuY2lhbCBwbGFubmluZ1xuLSBSZWxhdGlvbnNoaXBzXG5cbioqUXVpY2sgUEFSQSBCZWhhdmlvcioqOlxuLSBOb3RlcyBpbiBBcmVhcyBnZXQgXFxgcGFyYTogYXJlYXNcXGAgcHJvcGVydHlcbi0gQXJlYXMgcmVwcmVzZW50IGxvbmctdGVybSBjb21taXRtZW50c1xuLSBNb3ZpbmcgYmV0d2VlbiBQcm9qZWN0cyBhbmQgQXJlYXMgY2hhbmdlcyB0aGUgcHJvcGVydHkgYnV0IHByZXNlcnZlcyBjb250ZXh0IHRhZ3NcblxuLS0tXG5cbiMjIyMgXHVEODNEXHVEQ0RBICoqUmVzb3VyY2VzKiogKFxcYDMgLSBSRVNPVVJDRVNcXGApXG4qKkRlZmluaXRpb24qKjogUmVmZXJlbmNlIG1hdGVyaWFscyBhbmQgaW5mb3JtYXRpb24geW91IHdhbnQgdG8ga2VlcCBmb3IgZnV0dXJlIHVzZS5cblxuKipDaGFyYWN0ZXJpc3RpY3MqKjpcbi0gTm90IGN1cnJlbnRseSBhY3Rpb25hYmxlXG4tIFZhbHVhYmxlIGZvciByZWZlcmVuY2Ugb3IgaW5zcGlyYXRpb25cbi0gQ291bGQgYmVjb21lIHJlbGV2YW50IHRvIFByb2plY3RzIG9yIEFyZWFzIGxhdGVyXG4tIE9yZ2FuaXplZCBieSB0b3BpYyBvciB0aGVtZVxuXG4qKkV4YW1wbGVzKio6XG4tIFJlc2VhcmNoIGFydGljbGVzXG4tIFRlbXBsYXRlc1xuLSBIb3ctdG8gZ3VpZGVzXG4tIE1lZXRpbmcgbm90ZXMgYXJjaGl2ZVxuLSBEb2N1bWVudGF0aW9uXG4tIExlYXJuaW5nIG1hdGVyaWFsc1xuXG4qKlF1aWNrIFBBUkEgQmVoYXZpb3IqKjpcbi0gTm90ZXMgaW4gUmVzb3VyY2VzIGdldCBcXGBwYXJhOiByZXNvdXJjZXNcXGAgcHJvcGVydHlcbi0gVGVtcGxhdGVzIHN0b3JlZCBpbiBcXGBURU1QTEFURVMvXFxgIHN1YmZvbGRlciBhcmUgZXhjbHVkZWQgZnJvbSBhdXRvLXRhZ2dpbmdcbi0gVGhpcyBpcyB3aGVyZSB5b3Uga2VlcCByZXVzYWJsZSBhc3NldHNcblxuLS0tXG5cbiMjIyMgXHVEODNEXHVEQ0U2ICoqQXJjaGl2ZSoqIChcXGA0IC0gQVJDSElWRVxcYClcbioqRGVmaW5pdGlvbioqOiBDb21wbGV0ZWQgcHJvamVjdHMgYW5kIGluYWN0aXZlIGl0ZW1zIGZyb20gb3RoZXIgY2F0ZWdvcmllcy5cblxuKipDaGFyYWN0ZXJpc3RpY3MqKjpcbi0gTm8gbG9uZ2VyIGFjdGl2ZSBvciByZWxldmFudFxuLSBLZXB0IGZvciBoaXN0b3JpY2FsIHJlZmVyZW5jZVxuLSBPdXQgb2Ygc2lnaHQgYnV0IHJldHJpZXZhYmxlIGlmIG5lZWRlZFxuLSBPcmdhbml6ZWQgYnkgb3JpZ2luYWwgY2F0ZWdvcnlcblxuKipFeGFtcGxlcyoqOlxuLSBDb21wbGV0ZWQgcHJvamVjdHNcbi0gT2xkIGFyZWFzIHlvdSdyZSBubyBsb25nZXIgcmVzcG9uc2libGUgZm9yXG4tIE91dGRhdGVkIHJlc291cmNlc1xuLSBQYXN0IG1lZXRpbmcgbm90ZXNcblxuKipRdWljayBQQVJBIEJlaGF2aW9yKio6XG4tIE5vdGVzIG1vdmVkIHRvIEFyY2hpdmUgZ2V0IFxcYHBhcmE6IGFyY2hpdmVcXGAgcHJvcGVydHlcbi0gQXV0b21hdGljYWxseSBhZGRzIFxcYGFyY2hpdmVkOiBZWVlZLU1NLUREXFxgIGRhdGUgcHJvcGVydHlcbi0gUHJldmlvdXMgY29udGV4dCB0YWdzIHBlcnNpc3QgZm9yIHNlYXJjaGFiaWxpdHlcblxuLS0tXG5cbiMjIEhvdyBRdWljayBQQVJBIEltcGxlbWVudHMgVGhpc1xuXG4jIyMgQXV0b21hdGljIFByb3BlcnRpZXNcblxuVGhlIHBsdWdpbiBhdXRvbWF0aWNhbGx5IG1haW50YWlucyBhIFxcYHBhcmFcXGAgcHJvcGVydHkgaW4gZXZlcnkgbm90ZSdzIGZyb250bWF0dGVyIHRoYXQgcmVmbGVjdHMgaXRzIGN1cnJlbnQgUEFSQSBsb2NhdGlvbi5cblxuKipWYWx1ZXMqKjogXFxgaW5ib3hcXGAsIFxcYHByb2plY3RzXFxgLCBcXGBhcmVhc1xcYCwgXFxgcmVzb3VyY2VzXFxgLCBcXGBhcmNoaXZlXFxgXG5cbiMjIyBQZXJzaXN0ZW50IENvbnRleHQgVGFnc1xuXG5BcyBub3RlcyBtb3ZlIGRlZXBlciBpbnRvIHN1YmZvbGRlcnMsIHRoZSBwbHVnaW4gY3JlYXRlcyAqKnBlcnNpc3RlbnQgdGFncyoqIGZyb20gZm9sZGVyIG5hbWVzLlxuXG4qKldoZW4geW91IG1vdmUgdGhpcyBub3RlIHRvIEFyY2hpdmUqKiwgaXQgYmVjb21lczpcbi0gUHJvcGVydHk6IFxcYHBhcmE6IGFyY2hpdmVcXGAgKHVwZGF0ZWQpXG4tIFRhZ3MgcHJlc2VydmUgcHJvamVjdCBjb250ZXh0XG5cblRoaXMgcHJlc2VydmVzIHByb2plY3QgY29udGV4dCBldmVuIGFmdGVyIGFyY2hpdmluZy5cblxuIyMjIFRoZSBJbmJveFxuXG5UaGUgXFxgMCAtIElOQk9YXFxgIGZvbGRlciBpcyBhIHNwZWNpYWwgc3RhZ2luZyBhcmVhOlxuXG4qKlB1cnBvc2UqKjogQ2FwdHVyZSBpZGVhcyBxdWlja2x5IHdpdGhvdXQgZGVjaWRpbmcgd2hlcmUgdGhleSBiZWxvbmdcblxuKipXb3JrZmxvdyoqOlxuMS4gQ3JlYXRlIG5ldyBub3RlcyBpbiBJbmJveFxuMi4gUHJvY2VzcyByZWd1bGFybHkgKGRhaWx5L3dlZWtseSlcbjMuIE1vdmUgdG8gYXBwcm9wcmlhdGUgUEFSQSBjYXRlZ29yeSBvbmNlIHlvdSBrbm93IHdoYXQgaXQgaXNcblxuKipQcm9qZWN0IFVwZGF0ZXMqKjogQXV0b21hdGljIHByb2plY3Qgc3RhdHVzIHJlcG9ydHMgYXJlIGNyZWF0ZWQgaGVyZSBmb3IgcHJvY2Vzc2luZy5cblxuLS0tXG5cbiMjIFBBUkEgV29ya2Zsb3dcblxuIyMjIERhaWx5L1dlZWtseSBQcm9jZXNzaW5nXG5cbioqUmV2aWV3IHlvdXIgSW5ib3gqKjpcbjEuIElkZW50aWZ5IHdoaWNoIGNhdGVnb3J5IGVhY2ggaXRlbSBiZWxvbmdzIHRvXG4yLiBNb3ZlIG5vdGVzIHRvIFByb2plY3RzLCBBcmVhcywgUmVzb3VyY2VzLCBvciBBcmNoaXZlXG4zLiBLZWVwIEluYm94IGFzIGNsb3NlIHRvIGVtcHR5IGFzIHBvc3NpYmxlXG5cbioqVXNlIHRoZSBQcm9qZWN0IERhc2hib2FyZCoqOlxuLSBLYW5iYW4gYm9hcmQgaW4gSW5ib3ggZm9yIHRyYWNraW5nIGFjdGl2ZSB3b3JrXG4tIFZpc3VhbGl6ZSB3aGF0J3MgVE9EQVksIFRPTU9SUk9XLCBUSElTIFdFRUtcbi0gU2VlIEJMT0NLRUQgaXRlbXMgdGhhdCBuZWVkIGF0dGVudGlvblxuXG4tLS1cblxuIyMgTGVhcm5pbmcgTW9yZVxuXG4jIyMgT2ZmaWNpYWwgUEFSQSBSZXNvdXJjZXNcblxuKipUaWFnbyBGb3J0ZSdzIE9yaWdpbmFsIEFydGljbGUqKjpcbmh0dHBzOi8vZm9ydGVsYWJzLmNvbS9ibG9nL3BhcmEvXG5cbioqQnVpbGRpbmcgYSBTZWNvbmQgQnJhaW4qKjpcbkJvb2sgYnkgVGlhZ28gRm9ydGUgY292ZXJpbmcgUEFSQSBhbmQgcGVyc29uYWwga25vd2xlZGdlIG1hbmFnZW1lbnRcbmh0dHBzOi8vd3d3LmJ1aWxkaW5nYXNlY29uZGJyYWluLmNvbS9cblxuKipGb3J0ZSBMYWJzIEJsb2cqKjpcbmh0dHBzOi8vZm9ydGVsYWJzLmNvbS9ibG9nL1xuXG4jIyMgV2l0aGluIFlvdXIgVmF1bHRcblxuKipUZW1wbGF0ZXMqKjogU2VlIFxcYDMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL1xcYCBmb3IgYWxsIGF2YWlsYWJsZSB0ZW1wbGF0ZXNcblxuKipQcm9qZWN0IERhc2hib2FyZCoqOiBFeGFtcGxlIGthbmJhbiBib2FyZCBpbiBcXGAwIC0gSU5CT1gvUHJvamVjdCBEYXNoYm9hcmQubWRcXGBcblxuKipQbHVnaW4gRG9jdW1lbnRhdGlvbioqOiBDaGVjayB0aGUgUXVpY2sgUEFSQSBwbHVnaW4gUkVBRE1FIGZvciB0ZWNobmljYWwgZGV0YWlsc1xuXG4tLS1cblxuKipMYXN0IFVwZGF0ZWQqKjogMjAyNS0xMS0wNVxuKipQbHVnaW4gVmVyc2lvbioqOiAwLjIuMFxuKipNZXRob2QgU291cmNlKio6IEZvcnRlIExhYnMgUEFSQSBTeXN0ZW1cbmBcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBMaXN0IGFsbCBhdmFpbGFibGUgdGVtcGxhdGVzXG4gICAgICovXG4gICAgbGlzdEF2YWlsYWJsZVRlbXBsYXRlcygpIHtcbiAgICAgICAgcmV0dXJuIE9iamVjdC5rZXlzKHRoaXMudGVtcGxhdGVzKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBHZXQgdGVtcGxhdGUgY29udGVudFxuICAgICAqL1xuICAgIGdldFRlbXBsYXRlKHRlbXBsYXRlTmFtZSkge1xuICAgICAgICByZXR1cm4gdGhpcy50ZW1wbGF0ZXNbdGVtcGxhdGVOYW1lXTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXBsb3kgYSBzaW5nbGUgdGVtcGxhdGUgdG8gdGhlIHZhdWx0XG4gICAgICogU21hcnQgcmVnZW5lcmF0aW9uOiBPbmx5IGNyZWF0ZXMgbWlzc2luZyBmaWxlcywgbmV2ZXIgb3ZlcndyaXRlcyBleGlzdGluZyB0ZW1wbGF0ZXNcbiAgICAgKi9cbiAgICBhc3luYyBkZXBsb3lUZW1wbGF0ZSh0ZW1wbGF0ZU5hbWUsIGRlc3RpbmF0aW9uKSB7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ3RlbXBsYXRlczpkZXBsb3knKTtcbiAgICAgICAgY29uc3QgY29udGV4dCA9IHsgdGVtcGxhdGVOYW1lLCBkZXN0aW5hdGlvbiB9O1xuICAgICAgICBjb25zdCBjb250ZW50ID0gdGhpcy5nZXRUZW1wbGF0ZSh0ZW1wbGF0ZU5hbWUpO1xuXG4gICAgICAgIGlmICghY29udGVudCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBUZW1wbGF0ZSBub3QgZm91bmQ6ICR7dGVtcGxhdGVOYW1lfWApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRW5zdXJlIGRlc3RpbmF0aW9uIGZvbGRlciBleGlzdHNcbiAgICAgICAgY29uc3QgZm9sZGVyUGF0aCA9IGRlc3RpbmF0aW9uLnN1YnN0cmluZygwLCBkZXN0aW5hdGlvbi5sYXN0SW5kZXhPZignLycpKTtcbiAgICAgICAgaWYgKGZvbGRlclBhdGggJiYgIXRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmb2xkZXJQYXRoKSkge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKGZvbGRlclBhdGgpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgZmlsZSBhbHJlYWR5IGV4aXN0c1xuICAgICAgICBjb25zdCBleGlzdGluZ0ZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZGVzdGluYXRpb24pO1xuXG4gICAgICAgIGxldCByZXN1bHQgPSB7IHN0YXR1czogJ3NraXBwZWQnLCByZWFzb246ICdleGlzdHMnIH07XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmdGaWxlKSB7XG4gICAgICAgICAgICAgICAgLy8gRmlsZSBleGlzdHMgLSBza2lwIHRvIHByZXNlcnZlIHVzZXIgY3VzdG9taXphdGlvbnNcbiAgICAgICAgICAgICAgICByZXN1bHQgPSB7IHN0YXR1czogJ3NraXBwZWQnLCByZWFzb246ICdleGlzdHMnIH07XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEZpbGUgZG9lc24ndCBleGlzdCAtIGNyZWF0ZSBmcm9tIHRlbXBsYXRlXG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKGRlc3RpbmF0aW9uLCBjb250ZW50KTtcbiAgICAgICAgICAgICAgICByZXN1bHQgPSB7IHN0YXR1czogJ2NyZWF0ZWQnIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKHRpbWVyLCB7IC4uLmNvbnRleHQsIHN0YXR1czogcmVzdWx0LnN0YXR1cyB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERlcGxveSBhbGwgdGVtcGxhdGVzIHRvIGRlZmF1bHQgbG9jYXRpb25zXG4gICAgICogVXNlcyBzbWFydCByZWdlbmVyYXRpb246IG9ubHkgY3JlYXRlcyBtaXNzaW5nIHRlbXBsYXRlc1xuICAgICAqL1xuICAgIGFzeW5jIGRlcGxveUFsbFRlbXBsYXRlcygpIHtcbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgndGVtcGxhdGVzOmRlcGxveS1hbGwnKTtcbiAgICAgICAgbGV0IGNyZWF0ZWQgPSAwO1xuICAgICAgICBsZXQgc2tpcHBlZCA9IDA7XG4gICAgICAgIGxldCBlcnJvcnMgPSAwO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKCdEZXBsb3lpbmcgUEFSQSB0ZW1wbGF0ZXMuLi4nKTtcblxuICAgICAgICAgICAgY29uc3QgZGVmYXVsdERlc3RpbmF0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICAnZGVmYXVsdC10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9kZWZhdWx0LXRlbXBsYXRlLm1kJyxcbiAgICAgICAgICAgICAgICAnaW5ib3gtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvaW5ib3gtdGVtcGxhdGUubWQnLFxuICAgICAgICAgICAgICAgICdwcm9qZWN0cy10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9wcm9qZWN0cy10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ2FyZWFzLXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL2FyZWFzLXRlbXBsYXRlLm1kJyxcbiAgICAgICAgICAgICAgICAncmVzb3VyY2VzLXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL3Jlc291cmNlcy10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ2FyY2hpdmUtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvYXJjaGl2ZS10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ1Byb2plY3QgRGFzaGJvYXJkLm1kJzogJzAgLSBJTkJPWC9Qcm9qZWN0IERhc2hib2FyZC5tZCcsXG4gICAgICAgICAgICAgICAgJ1BBUkEgTWV0aG9kIE92ZXJ2aWV3Lm1kJzogJzMgLSBSRVNPVVJDRVMvUEFSQSBNZXRob2QgT3ZlcnZpZXcubWQnXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFt0ZW1wbGF0ZU5hbWUsIGRlc3RpbmF0aW9uXSBvZiBPYmplY3QuZW50cmllcyhkZWZhdWx0RGVzdGluYXRpb25zKSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVwbG95VGVtcGxhdGUodGVtcGxhdGVOYW1lLCBkZXN0aW5hdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuc3RhdHVzID09PSAnY3JlYXRlZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNyZWF0ZWQrKztcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIGlmIChyZXN1bHQuc3RhdHVzID09PSAnc2tpcHBlZCcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNraXBwZWQrKztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBkZXBsb3kgJHt0ZW1wbGF0ZU5hbWV9OmAsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3JzKys7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZXBvcnQgcmVzdWx0c1xuICAgICAgICAgICAgY29uc3QgcGFydHMgPSBbXTtcbiAgICAgICAgICAgIGlmIChjcmVhdGVkID4gMCkgcGFydHMucHVzaChgJHtjcmVhdGVkfSBjcmVhdGVkYCk7XG4gICAgICAgICAgICBpZiAoc2tpcHBlZCA+IDApIHBhcnRzLnB1c2goYCR7c2tpcHBlZH0gc2tpcHBlZGApO1xuICAgICAgICAgICAgaWYgKGVycm9ycyA+IDApIHBhcnRzLnB1c2goYCR7ZXJyb3JzfSBlcnJvcnNgKTtcblxuICAgICAgICAgICAgbmV3IE5vdGljZShgVGVtcGxhdGVzOiAke3BhcnRzLmpvaW4oJywgJyl9YCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBkZXBsb3lpbmcgdGVtcGxhdGVzOicsIGVycm9yKTtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIGRlcGxveWluZyB0ZW1wbGF0ZXM6ICR7ZXJyb3IubWVzc2FnZX1gLCA1MDAwKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyBjcmVhdGVkLCBza2lwcGVkLCBlcnJvcnMgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGb3JjZSByZWdlbmVyYXRlIGFsbCB0ZW1wbGF0ZXMgKGNhbGxlZCBieSBSZXNldCBTZXR0aW5ncylcbiAgICAgKiBUaGlzIGlzIHRoZSBPTkxZIG1ldGhvZCB0aGF0IG92ZXJ3cml0ZXMgZXhpc3RpbmcgdGVtcGxhdGVzXG4gICAgICovXG4gICAgYXN5bmMgZm9yY2VSZWdlbmVyYXRlQWxsVGVtcGxhdGVzKCkge1xuICAgICAgICBjb25zdCB0aW1lciA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCd0ZW1wbGF0ZXM6Zm9yY2UtcmVnZW5lcmF0ZScpO1xuICAgICAgICBsZXQgcmVnZW5lcmF0ZWQgPSAwO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKCdSZWdlbmVyYXRpbmcgYWxsIHRlbXBsYXRlcyBmcm9tIGRlZmF1bHRzLi4uJyk7XG5cbiAgICAgICAgICAgIGNvbnN0IGRlZmF1bHREZXN0aW5hdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgJ2RlZmF1bHQtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvZGVmYXVsdC10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ2luYm94LXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL2luYm94LXRlbXBsYXRlLm1kJyxcbiAgICAgICAgICAgICAgICAncHJvamVjdHMtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvcHJvamVjdHMtdGVtcGxhdGUubWQnLFxuICAgICAgICAgICAgICAgICdhcmVhcy10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9hcmVhcy10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ3Jlc291cmNlcy10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9yZXNvdXJjZXMtdGVtcGxhdGUubWQnLFxuICAgICAgICAgICAgICAgICdhcmNoaXZlLXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL2FyY2hpdmUtdGVtcGxhdGUubWQnLFxuICAgICAgICAgICAgICAgICdQcm9qZWN0IERhc2hib2FyZC5tZCc6ICcwIC0gSU5CT1gvUHJvamVjdCBEYXNoYm9hcmQubWQnLFxuICAgICAgICAgICAgICAgICdQQVJBIE1ldGhvZCBPdmVydmlldy5tZCc6ICczIC0gUkVTT1VSQ0VTL1BBUkEgTWV0aG9kIE92ZXJ2aWV3Lm1kJ1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgZm9yIChjb25zdCBbdGVtcGxhdGVOYW1lLCBkZXN0aW5hdGlvbl0gb2YgT2JqZWN0LmVudHJpZXMoZGVmYXVsdERlc3RpbmF0aW9ucykpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50ID0gdGhpcy5nZXRUZW1wbGF0ZSh0ZW1wbGF0ZU5hbWUpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIEVuc3VyZSBmb2xkZXIgZXhpc3RzXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZvbGRlclBhdGggPSBkZXN0aW5hdGlvbi5zdWJzdHJpbmcoMCwgZGVzdGluYXRpb24ubGFzdEluZGV4T2YoJy8nKSk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChmb2xkZXJQYXRoICYmICF0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoZm9sZGVyUGF0aCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZUZvbGRlcihmb2xkZXJQYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGV4aXN0aW5nRmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChkZXN0aW5hdGlvbik7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGV4aXN0aW5nRmlsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gT3ZlcndyaXRlIGV4aXN0aW5nXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZXhpc3RpbmdGaWxlLCBjb250ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBuZXdcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZShkZXN0aW5hdGlvbiwgY29udGVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgcmVnZW5lcmF0ZWQrKztcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKGBGYWlsZWQgdG8gcmVnZW5lcmF0ZSAke3RlbXBsYXRlTmFtZX06YCwgZXJyb3IpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbmV3IE5vdGljZShgUmVnZW5lcmF0ZWQgJHtyZWdlbmVyYXRlZH0gdGVtcGxhdGVzIGZyb20gZGVmYXVsdHMhYCk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciByZWdlbmVyYXRpbmcgdGVtcGxhdGVzOicsIGVycm9yKTtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIHJlZ2VuZXJhdGluZyB0ZW1wbGF0ZXM6ICR7ZXJyb3IubWVzc2FnZX1gLCA1MDAwKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyByZWdlbmVyYXRlZCB9KTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gQUdFTkRBIE1BTkFHRVJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY2xhc3MgQWdlbmRhTWFuYWdlciB7XG4gICAgY29uc3RydWN0b3IoYXBwLCBzZXR0aW5ncywgcHJvZmlsZXIpIHtcbiAgICAgICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICAgICAgdGhpcy5wcm9maWxlciA9IHByb2ZpbGVyO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0aGUgZGF0ZSBvZiB0aGUgdXBjb21pbmcgTW9uZGF5IGluIE1NL0REL1lZIGZvcm1hdFxuICAgICAqIElmIHRvZGF5IGlzIE1vbmRheSwgcmV0dXJucyB0b2RheSdzIGRhdGVcbiAgICAgKi9cbiAgICBnZXROZXh0TW9uZGF5RGF0ZSgpIHtcbiAgICAgICAgY29uc3QgdG9kYXkgPSBuZXcgRGF0ZSgpO1xuICAgICAgICBjb25zdCBkYXlPZldlZWsgPSB0b2RheS5nZXREYXkoKTsgLy8gMCA9IFN1bmRheSwgMSA9IE1vbmRheSwgZXRjLlxuXG4gICAgICAgIGxldCBkYXlzVW50aWxNb25kYXk7XG4gICAgICAgIGlmIChkYXlPZldlZWsgPT09IDEpIHtcbiAgICAgICAgICAgIC8vIFRvZGF5IGlzIE1vbmRheVxuICAgICAgICAgICAgZGF5c1VudGlsTW9uZGF5ID0gMDtcbiAgICAgICAgfSBlbHNlIGlmIChkYXlPZldlZWsgPT09IDApIHtcbiAgICAgICAgICAgIC8vIFRvZGF5IGlzIFN1bmRheSwgbmV4dCBNb25kYXkgaXMgMSBkYXkgYXdheVxuICAgICAgICAgICAgZGF5c1VudGlsTW9uZGF5ID0gMTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIENhbGN1bGF0ZSBkYXlzIHVudGlsIG5leHQgTW9uZGF5XG4gICAgICAgICAgICBkYXlzVW50aWxNb25kYXkgPSA4IC0gZGF5T2ZXZWVrO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbW9uZGF5ID0gbmV3IERhdGUodG9kYXkpO1xuICAgICAgICBtb25kYXkuc2V0RGF0ZSh0b2RheS5nZXREYXRlKCkgKyBkYXlzVW50aWxNb25kYXkpO1xuXG4gICAgICAgIGNvbnN0IG1vbnRoID0gU3RyaW5nKG1vbmRheS5nZXRNb250aCgpICsgMSkucGFkU3RhcnQoMiwgJzAnKTtcbiAgICAgICAgY29uc3QgZGF5ID0gU3RyaW5nKG1vbmRheS5nZXREYXRlKCkpLnBhZFN0YXJ0KDIsICcwJyk7XG4gICAgICAgIGNvbnN0IHllYXIgPSBTdHJpbmcobW9uZGF5LmdldEZ1bGxZZWFyKCkpLnNsaWNlKC0yKTtcblxuICAgICAgICByZXR1cm4gYCR7bW9udGh9LyR7ZGF5fS8ke3llYXJ9YDtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBQYXJzZSB0aGUgUHJvamVjdCBEYXNoYm9hcmQga2FuYmFuIGJvYXJkXG4gICAgICogUmV0dXJucyBzZWN0aW9uczogZG9uZSwgZG9pbmcsIHRvZGF5LCB0b21vcnJvdywgdGhpc193ZWVrLCBibG9ja2VkXG4gICAgICovXG4gICAgYXN5bmMgcGFyc2VLYW5iYW5Cb2FyZChrYW5iYW5QYXRoKSB7XG4gICAgICAgIC8vIFVzZSBwcm92aWRlZCBwYXRoIG9yIGZhbGwgYmFjayB0byBzZXR0aW5nc1xuICAgICAgICBjb25zdCBib2FyZFBhdGggPSBrYW5iYW5QYXRoIHx8IHRoaXMuc2V0dGluZ3MucHJvamVjdFVwZGF0ZXM/LmthbmJhbkZpbGUgfHwgJzAgLSBJTkJPWC9Qcm9qZWN0IERhc2hib2FyZC5tZCc7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ2FnZW5kYTpwYXJzZS1rYW5iYW4nKTtcbiAgICAgICAgY29uc3QgY29udGV4dCA9IHsgYm9hcmRQYXRoIH07XG4gICAgICAgIGxldCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGJvYXJkUGF0aCk7XG4gICAgICAgIGxldCBzZWN0aW9ucyA9IG51bGw7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgICAgICAgIC8vIFRyeSB0byByZWNyZWF0ZSBmcm9tIHRlbXBsYXRlXG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnUHJvamVjdCBEYXNoYm9hcmQgbm90IGZvdW5kLiBDcmVhdGluZyBmcm9tIHRlbXBsYXRlLi4uJyk7XG4gICAgICAgICAgICAgICAgY29uc3QgdGVtcGxhdGVNYW5hZ2VyID0gbmV3IFRlbXBsYXRlTWFuYWdlcih0aGlzLmFwcCwgdGhpcy5zZXR0aW5ncywgdGhpcy5wcm9maWxlcik7XG5cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0ZW1wbGF0ZU1hbmFnZXIuZGVwbG95VGVtcGxhdGUoJ1Byb2plY3QgRGFzaGJvYXJkLm1kJywgYm9hcmRQYXRoKTtcbiAgICAgICAgICAgICAgICAgICAgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChib2FyZFBhdGgpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gY3JlYXRlIGthbmJhbiBib2FyZCBhdDogJHtib2FyZFBhdGh9YCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCdQcm9qZWN0IERhc2hib2FyZCBjcmVhdGVkIHN1Y2Nlc3NmdWxseSEnKTtcbiAgICAgICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjcmVhdGluZyBQcm9qZWN0IERhc2hib2FyZDonLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgS2FuYmFuIGJvYXJkIG5vdCBmb3VuZCBhbmQgY291bGQgbm90IGJlIGNyZWF0ZWQ6ICR7Ym9hcmRQYXRofWApO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG5cbiAgICAgICAgICAgIHNlY3Rpb25zID0ge1xuICAgICAgICAgICAgICAgIGRvbmU6IFtdLFxuICAgICAgICAgICAgICAgIGRvaW5nOiBbXSxcbiAgICAgICAgICAgICAgICB0b2RheTogW10sXG4gICAgICAgICAgICAgICAgdG9tb3Jyb3c6IFtdLFxuICAgICAgICAgICAgICAgIHRoaXNfd2VlazogW10sXG4gICAgICAgICAgICAgICAgYmxvY2tlZDogW11cbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIC8vIEV4dHJhY3Qgc2VjdGlvbnMgdXNpbmcgcmVnZXhcbiAgICAgICAgICAgIC8vIFBhdHRlcm46ICMjIFNFQ1RJT05fTkFNRSBmb2xsb3dlZCBieSBjb250ZW50IHVudGlsIG5leHQgIyMgb3IgZW5kXG4gICAgICAgICAgICBjb25zdCBzZWN0aW9uUmVnZXggPSAvXiMjXFxzKyguKz8pJFxcbiguKj8pKD89XiMjfFxcWikvZ21zO1xuICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKHNlY3Rpb25SZWdleCldO1xuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBzZWN0aW9uTmFtZSA9IG1hdGNoWzFdLnRyaW0oKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlY3Rpb25Db250ZW50ID0gbWF0Y2hbMl07XG5cbiAgICAgICAgICAgICAgICAvLyBNYXAgc2VjdGlvbiBuYW1lcyB0byBvdXIga2V5c1xuICAgICAgICAgICAgICAgIGxldCBrZXkgPSBudWxsO1xuICAgICAgICAgICAgICAgIGlmIChzZWN0aW9uTmFtZSA9PT0gJ2RvbmUnKSBrZXkgPSAnZG9uZSc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc2VjdGlvbk5hbWUgPT09ICdkb2luZycpIGtleSA9ICdkb2luZyc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc2VjdGlvbk5hbWUgPT09ICd0b2RheScpIGtleSA9ICd0b2RheSc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc2VjdGlvbk5hbWUgPT09ICd0b21vcnJvdycpIGtleSA9ICd0b21vcnJvdyc7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc2VjdGlvbk5hbWUgPT09ICd0aGlzIHdlZWsnKSBrZXkgPSAndGhpc193ZWVrJztcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzZWN0aW9uTmFtZSA9PT0gJ2Jsb2NrZWQnKSBrZXkgPSAnYmxvY2tlZCc7XG5cbiAgICAgICAgICAgICAgICBpZiAoa2V5KSB7XG4gICAgICAgICAgICAgICAgICAgIHNlY3Rpb25zW2tleV0gPSB0aGlzLmV4dHJhY3RUYXNrcyhzZWN0aW9uQ29udGVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHNlY3Rpb25zO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgY29uc3Qgc2VjdGlvbkNvdW50ID0gc2VjdGlvbnMgPyBPYmplY3Qua2V5cyhzZWN0aW9ucykubGVuZ3RoIDogMDtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyAuLi5jb250ZXh0LCBzZWN0aW9uQ291bnQgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeHRyYWN0IHRhc2sgaXRlbXMgZnJvbSBzZWN0aW9uIGNvbnRlbnRcbiAgICAgKi9cbiAgICBleHRyYWN0VGFza3Moc2VjdGlvbkNvbnRlbnQpIHtcbiAgICAgICAgY29uc3QgdGFza3MgPSBbXTtcbiAgICAgICAgY29uc3QgbGluZXMgPSBzZWN0aW9uQ29udGVudC5zcGxpdCgnXFxuJyk7XG5cbiAgICAgICAgZm9yIChjb25zdCBsaW5lIG9mIGxpbmVzKSB7XG4gICAgICAgICAgICAvLyBNYXRjaCBjaGVja2JveCBpdGVtczogLSBbIF0gb3IgLSBbeF1cbiAgICAgICAgICAgIGlmICgvXlxccyotXFxzK1xcW1sgeF1cXF0vaS50ZXN0KGxpbmUpKSB7XG4gICAgICAgICAgICAgICAgdGFza3MucHVzaChsaW5lLnRyaW0oKSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGFza3M7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlIGEgcHJvamVjdCB1cGRhdGUgYWdlbmRhIHdpdGggZGF0YSBmcm9tIGthbmJhbiBib2FyZFxuICAgICAqXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IGFnZW5kYVBhdGggLSBQYXRoIHRvIHRoZSBhZ2VuZGEgZmlsZSAoZS5nLiwgXCIwIC0gSU5CT1gvVVBEQVRFIFx1MjAxNCBQcm9qZWN0IE5hbWUubWRcIilcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30ga2FuYmFuUGF0aCAtIE9wdGlvbmFsIHBhdGggdG8ga2FuYmFuIGJvYXJkIChkZWZhdWx0cyB0byBzZXR0aW5ncylcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcHJvamVjdEZvbGRlciAtIE9wdGlvbmFsIHByb2plY3QgZm9sZGVyIHRvIGZpbHRlciB0YXNrcyAoZGVmYXVsdHMgdG8gYWxsIHByb2plY3RzKVxuICAgICAqL1xuICAgIGFzeW5jIHVwZGF0ZVByb2plY3RBZ2VuZGEoYWdlbmRhUGF0aCwga2FuYmFuUGF0aCA9IG51bGwsIHByb2plY3RGb2xkZXIgPSBudWxsKSB7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ2FnZW5kYTp1cGRhdGUnKTtcbiAgICAgICAgY29uc3QgY29udGV4dCA9IHtcbiAgICAgICAgICAgIGFnZW5kYVBhdGgsXG4gICAgICAgICAgICBrYW5iYW5QYXRoOiBrYW5iYW5QYXRoIHx8IHRoaXMuc2V0dGluZ3MucHJvamVjdFVwZGF0ZXM/LmthbmJhbkZpbGUsXG4gICAgICAgICAgICBwcm9qZWN0Rm9sZGVyXG4gICAgICAgIH07XG4gICAgICAgIGxldCBzdWNjZXNzID0gZmFsc2U7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1VwZGF0aW5nIHByb2plY3QgYWdlbmRhLi4uJyk7XG5cbiAgICAgICAgICAgIC8vIFBhcnNlIGthbmJhbiBib2FyZFxuICAgICAgICAgICAgY29uc3Qga2FuYmFuRGF0YSA9IGF3YWl0IHRoaXMucGFyc2VLYW5iYW5Cb2FyZChrYW5iYW5QYXRoKTtcblxuICAgICAgICAgICAgLy8gR2V0IG5leHQgTW9uZGF5IGRhdGVcbiAgICAgICAgICAgIGNvbnN0IG1vbmRheURhdGUgPSB0aGlzLmdldE5leHRNb25kYXlEYXRlKCk7XG5cbiAgICAgICAgICAgIC8vIEdldCBhZ2VuZGEgZmlsZVxuICAgICAgICAgICAgY29uc3QgZmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChhZ2VuZGFQYXRoKTtcblxuICAgICAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgQWdlbmRhIGZpbGUgbm90IGZvdW5kOiAke2FnZW5kYVBhdGh9YCwgNTAwMCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcblxuICAgICAgICAgICAgLy8gQ2hlY2sgaWYgTW9uZGF5IHNlY3Rpb24gZXhpc3RzXG4gICAgICAgICAgICBjb25zdCBtb25kYXlQYXR0ZXJuID0gbmV3IFJlZ0V4cChgIyMjICR7dGhpcy5lc2NhcGVSZWdleChtb25kYXlEYXRlKX1gKTtcbiAgICAgICAgICAgIGNvbnN0IGhhc01vbmRheVNlY3Rpb24gPSBtb25kYXlQYXR0ZXJuLnRlc3QoY29udGVudCk7XG5cbiAgICAgICAgICAgIGxldCB1cGRhdGVkQ29udGVudCA9IGNvbnRlbnQ7XG5cbiAgICAgICAgICAgIGlmICghaGFzTW9uZGF5U2VjdGlvbikge1xuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBuZXcgTW9uZGF5IHNlY3Rpb25cbiAgICAgICAgICAgICAgICB1cGRhdGVkQ29udGVudCA9IHRoaXMuY3JlYXRlTW9uZGF5U2VjdGlvbihjb250ZW50LCBtb25kYXlEYXRlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBNb25kYXkgc2VjdGlvbiB3aXRoIGthbmJhbiBkYXRhIChub3cgYXN5bmMpXG4gICAgICAgICAgICB1cGRhdGVkQ29udGVudCA9IGF3YWl0IHRoaXMudXBkYXRlTW9uZGF5U2VjdGlvbih1cGRhdGVkQ29udGVudCwgbW9uZGF5RGF0ZSwga2FuYmFuRGF0YSwgcHJvamVjdEZvbGRlcik7XG5cbiAgICAgICAgICAgIC8vIFdyaXRlIGJhY2sgdG8gZmlsZVxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIHVwZGF0ZWRDb250ZW50KTtcblxuICAgICAgICAgICAgbmV3IE5vdGljZSgnUHJvamVjdCBhZ2VuZGEgdXBkYXRlZCBzdWNjZXNzZnVsbHkhJyk7XG4gICAgICAgICAgICBzdWNjZXNzID0gdHJ1ZTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHVwZGF0aW5nIHByb2plY3QgYWdlbmRhOicsIGVycm9yKTtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIHVwZGF0aW5nIGFnZW5kYTogJHtlcnJvci5tZXNzYWdlfWAsIDUwMDApO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKHRpbWVyLCB7IC4uLmNvbnRleHQsIHN1Y2Nlc3MgfSk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDcmVhdGUgYSBuZXcgTW9uZGF5IHNlY3Rpb24gaW4gdGhlIGFnZW5kYVxuICAgICAqL1xuICAgIGNyZWF0ZU1vbmRheVNlY3Rpb24oY29udGVudCwgbW9uZGF5RGF0ZSkge1xuICAgICAgICBjb25zdCBuZXdTZWN0aW9uID0gYCMjIyAke21vbmRheURhdGV9XG5cbiMjIyMgUHJvamVjdHNcbjwhLS0gQVVUTy1NQU5BR0VEIC0tPlxuKkF1dG8tdXBkYXRlZCBmcm9tIFByb2plY3QgRGFzaGJvYXJkKlxuXG48IS0tIEVORCBBVVRPLU1BTkFHRUQgLS0+XG5cbiMjIyMgQmxvY2tlZC9mZWVkYmFjayBuZWVkZWRcbjwhLS0gQVVUTy1NQU5BR0VEIC0tPlxuKkF1dG8tdXBkYXRlZCBmcm9tIFByb2plY3QgRGFzaGJvYXJkIFwiQmxvY2tlZFwiIHNlY3Rpb24qXG5cbjwhLS0gRU5EIEFVVE8tTUFOQUdFRCAtLT5cblxuIyMjIyBEYWlseSBIaWdobGlnaHRzIChUaGlzIFdlZWspXG48IS0tIEFVVE8tTUFOQUdFRCAtLT5cbipDb21wbGV0ZWQgdGFza3MgZnJvbSBQcm9qZWN0IERhc2hib2FyZCBcIkRvbmVcIiBzZWN0aW9uKlxuXG48IS0tIEVORCBBVVRPLU1BTkFHRUQgLS0+XG5cbiMjIyMgRmVlZGJhY2svdXBkYXRlcy9ub3RlcyBmcm9tIG1lZXRpbmdcbiAgKiAqKGFkZCBhbnkgbm90ZXMgYW5kIGFjdGlvbiBpdGVtcyBoZXJlIGFmdGVyIHRoZSBtZWV0aW5nKSpcblxuLS0tXG5cbmA7XG5cbiAgICAgICAgLy8gSW5zZXJ0IGFmdGVyIFwiIyMgTm90ZXNcIiBzZWN0aW9uXG4gICAgICAgIGNvbnN0IG5vdGVzUGF0dGVybiA9IC8oIyMgTm90ZXMuKj9cXG4uKj9cXG4pL3M7XG4gICAgICAgIGNvbnN0IG1hdGNoID0gY29udGVudC5tYXRjaChub3Rlc1BhdHRlcm4pO1xuXG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgY29uc3QgaW5zZXJ0UG9zID0gbWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGg7XG4gICAgICAgICAgICByZXR1cm4gY29udGVudC5zbGljZSgwLCBpbnNlcnRQb3MpICsgJ1xcbicgKyBuZXdTZWN0aW9uICsgY29udGVudC5zbGljZShpbnNlcnRQb3MpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmFsbGJhY2s6IGFwcGVuZCBhdCBlbmRcbiAgICAgICAgcmV0dXJuIGNvbnRlbnQgKyAnXFxuXFxuJyArIG5ld1NlY3Rpb247XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlIHRoZSBNb25kYXkgc2VjdGlvbiB3aXRoIGthbmJhbiBkYXRhXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gY29udGVudCAtIEZ1bGwgYWdlbmRhIGZpbGUgY29udGVudFxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBtb25kYXlEYXRlIC0gRm9ybWF0dGVkIE1vbmRheSBkYXRlXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGthbmJhbkRhdGEgLSBQYXJzZWQga2FuYmFuIGJvYXJkIGRhdGFcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gcHJvamVjdEZvbGRlciAtIE9wdGlvbmFsIHByb2plY3QgZm9sZGVyIHRvIGZpbHRlciB0YXNrc1xuICAgICAqL1xuICAgIGFzeW5jIHVwZGF0ZU1vbmRheVNlY3Rpb24oY29udGVudCwgbW9uZGF5RGF0ZSwga2FuYmFuRGF0YSwgcHJvamVjdEZvbGRlciA9IG51bGwpIHtcbiAgICAgICAgLy8gRmluZCB0aGUgTW9uZGF5IHNlY3Rpb25cbiAgICAgICAgY29uc3Qgc2VjdGlvblBhdHRlcm4gPSBuZXcgUmVnRXhwKFxuICAgICAgICAgICAgYCgjIyMgJHt0aGlzLmVzY2FwZVJlZ2V4KG1vbmRheURhdGUpfVxcXFxzKlxcXFxuKSguKj8pKD89XFxcXG4jIyMgfFxcXFxuLS0tfFxcXFxaKWAsXG4gICAgICAgICAgICAncydcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBjb250ZW50Lm1hdGNoKHNlY3Rpb25QYXR0ZXJuKTtcblxuICAgICAgICBpZiAoIW1hdGNoKSB7XG4gICAgICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5kaWFnbm9zdGljcy5wcm9maWxpbmdFbmFibGVkKSB7IGNvbnNvbGUud2FybihgQ291bGQgbm90IGZpbmQgTW9uZGF5IHNlY3Rpb24gZm9yICR7bW9uZGF5RGF0ZX1gKTsgfVxuICAgICAgICAgICAgcmV0dXJuIGNvbnRlbnQ7XG4gICAgICAgIH1cblxuICAgICAgICBsZXQgc2VjdGlvbkJvZHkgPSBtYXRjaFsyXTtcblxuICAgICAgICAvLyBVcGRhdGUgUHJvamVjdHMgc2VjdGlvbiB3aXRoIG9wdGlvbmFsIGZvbGRlciBmaWx0ZXIgKG5vdyBhc3luYylcbiAgICAgICAgLy8gUHJvamVjdHMgc2VjdGlvbiBub3cgaW5jbHVkZXMgYm90aCBvcGVuIGFuZCBjb21wbGV0ZWQgdGFza3MgZ3JvdXBlZCBieSBwcm9qZWN0XG4gICAgICAgIGNvbnN0IHByb2plY3RzQ29udGVudCA9IGF3YWl0IHRoaXMuZm9ybWF0UHJvamVjdHNTZWN0aW9uKGthbmJhbkRhdGEsIHByb2plY3RGb2xkZXIpO1xuICAgICAgICBzZWN0aW9uQm9keSA9IHRoaXMudXBkYXRlQXV0b1NlY3Rpb24oc2VjdGlvbkJvZHksICdQcm9qZWN0cycsIHByb2plY3RzQ29udGVudCk7XG5cbiAgICAgICAgLy8gVXBkYXRlIEJsb2NrZWQgc2VjdGlvblxuICAgICAgICBjb25zdCBibG9ja2VkQ29udGVudCA9IHRoaXMuZm9ybWF0QmxvY2tlZFNlY3Rpb24oa2FuYmFuRGF0YSk7XG4gICAgICAgIHNlY3Rpb25Cb2R5ID0gdGhpcy51cGRhdGVBdXRvU2VjdGlvbihzZWN0aW9uQm9keSwgJ0Jsb2NrZWQvZmVlZGJhY2sgbmVlZGVkJywgYmxvY2tlZENvbnRlbnQpO1xuXG4gICAgICAgIC8vIE5vdGU6IERhaWx5IEhpZ2hsaWdodHMgc2VjdGlvbiByZW1vdmVkIC0gY29tcGxldGVkIHRhc2tzIG5vdyBpbnRlZ3JhdGVkIHVuZGVyIHRoZWlyIHByb2plY3RzXG5cbiAgICAgICAgLy8gUmVjb25zdHJ1Y3QgY29udGVudFxuICAgICAgICByZXR1cm4gY29udGVudC5zbGljZSgwLCBtYXRjaC5pbmRleCkgKyBtYXRjaFsxXSArIHNlY3Rpb25Cb2R5ICsgY29udGVudC5zbGljZShtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogVXBkYXRlIGFuIGF1dG8tbWFuYWdlZCBzZWN0aW9uXG4gICAgICovXG4gICAgdXBkYXRlQXV0b1NlY3Rpb24oYm9keSwgc2VjdGlvbk5hbWUsIG5ld0NvbnRlbnQpIHtcbiAgICAgICAgY29uc3QgcGF0dGVybiA9IG5ldyBSZWdFeHAoXG4gICAgICAgICAgICBgKCMjIyNcXFxccyske3NlY3Rpb25OYW1lfVxcXFxzKlxcXFxuKSguKj8pKDwhLS1cXFxccypBVVRPLU1BTkFHRURcXFxccyotLT4pKC4qPykoPCEtLVxcXFxzKkVORCBBVVRPLU1BTkFHRURcXFxccyotLT4pYCxcbiAgICAgICAgICAgICdzJ1xuICAgICAgICApO1xuICAgICAgICBjb25zdCBtYXRjaCA9IGJvZHkubWF0Y2gocGF0dGVybik7XG5cbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICBjb25zdCBoZWFkZXIgPSBtYXRjaFsxXTtcbiAgICAgICAgICAgIGNvbnN0IHByZUF1dG8gPSBtYXRjaFsyXTtcbiAgICAgICAgICAgIGNvbnN0IGF1dG9TdGFydCA9IG1hdGNoWzNdO1xuICAgICAgICAgICAgY29uc3QgYXV0b0VuZCA9IG1hdGNoWzVdO1xuXG4gICAgICAgICAgICByZXR1cm4gYm9keS5zbGljZSgwLCBtYXRjaC5pbmRleCkgK1xuICAgICAgICAgICAgICAgICAgIGhlYWRlciArIHByZUF1dG8gKyBhdXRvU3RhcnQgKyAnXFxuJyArIG5ld0NvbnRlbnQgKyAnXFxuJyArIGF1dG9FbmQgK1xuICAgICAgICAgICAgICAgICAgIGJvZHkuc2xpY2UobWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGgpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGJvZHk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRm9ybWF0IHRoZSBQcm9qZWN0cyBzZWN0aW9uIGNvbnRlbnRcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBrYW5iYW5EYXRhIC0gUGFyc2VkIGthbmJhbiBib2FyZCBkYXRhXG4gICAgICogQHBhcmFtIHtzdHJpbmd9IHByb2plY3RGb2xkZXIgLSBPcHRpb25hbCBwcm9qZWN0IGZvbGRlciBwYXRoIHRvIGZpbHRlciB0YXNrc1xuICAgICAqL1xuICAgIGFzeW5jIGZvcm1hdFByb2plY3RzU2VjdGlvbihrYW5iYW5EYXRhLCBwcm9qZWN0Rm9sZGVyID0gbnVsbCkge1xuICAgICAgICBjb25zdCB0aW1lciA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCdhZ2VuZGE6Zm9ybWF0LXByb2plY3RzJyk7XG4gICAgICAgIGNvbnN0IGxpbmVzID0gWycqQXV0by11cGRhdGVkIGZyb20gUHJvamVjdCBEYXNoYm9hcmQgYW5kIHByb2plY3QgZm9sZGVyIHRhc2tzKicsICcnXTtcblxuICAgICAgICAvLyBDb21iaW5lIGFjdGl2ZSB3b3JrIHNlY3Rpb25zIGZyb20ga2FuYmFuXG4gICAgICAgIGNvbnN0IGFjdGl2ZVRhc2tzID0gW1xuICAgICAgICAgICAgLi4ua2FuYmFuRGF0YS5kb2luZyxcbiAgICAgICAgICAgIC4uLmthbmJhbkRhdGEudG9kYXksXG4gICAgICAgICAgICAuLi5rYW5iYW5EYXRhLnRvbW9ycm93LFxuICAgICAgICAgICAgLi4ua2FuYmFuRGF0YS50aGlzX3dlZWtcbiAgICAgICAgXTtcblxuICAgICAgICAvLyBHZXQgY29tcGxldGVkIHRhc2tzIGZyb20ga2FuYmFuIFwiRG9uZVwiIHNlY3Rpb25cbiAgICAgICAgY29uc3QgY29tcGxldGVkVGFza3MgPSB0aGlzLmZpbHRlclJlY2VudFRhc2tzKGthbmJhbkRhdGEuZG9uZSwgNyk7XG5cbiAgICAgICAgLy8gQnVpbGQgbWFwIG9mIHByb2plY3Qgbm90ZXMgd2l0aCB0aGVpciB0YXNrc1xuICAgICAgICBjb25zdCBwcm9qZWN0TWFwID0gbmV3IE1hcCgpOyAvLyBwcm9qZWN0IHdpa2lsaW5rIC0+IHtvcGVuOiBbXSwgY29tcGxldGVkOiBbXX1cblxuICAgICAgICAvLyBQcm9jZXNzIGFjdGl2ZSB0YXNrcyBmcm9tIGthbmJhblxuICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2YgYWN0aXZlVGFza3MpIHtcbiAgICAgICAgICAgIGNvbnN0IHdpa2lsaW5rcyA9IHRhc2subWF0Y2goL1xcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKTtcbiAgICAgICAgICAgIGlmICh3aWtpbGlua3MpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGxpbmsgb2Ygd2lraWxpbmtzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb2plY3ROYW1lID0gbGluay5zbGljZSgyLCAtMik7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcHJvamVjdCBleGlzdHMgaW4gZm9sZGVyXG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm9qZWN0Rm9sZGVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9qZWN0RmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChgJHtwcm9qZWN0Rm9sZGVyfS8ke3Byb2plY3ROYW1lfS5tZGApO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFwcm9qZWN0RmlsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXByb2plY3RNYXAuaGFzKGxpbmspKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9qZWN0TWFwLnNldChsaW5rLCB7IG9wZW46IFtdLCBjb21wbGV0ZWQ6IFtdIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHByb2plY3RNYXAuZ2V0KGxpbmspLm9wZW4ucHVzaCh0YXNrKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBQcm9jZXNzIGNvbXBsZXRlZCB0YXNrcyBmcm9tIGthbmJhblxuICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2YgY29tcGxldGVkVGFza3MpIHtcbiAgICAgICAgICAgIGNvbnN0IHdpa2lsaW5rcyA9IHRhc2subWF0Y2goL1xcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKTtcbiAgICAgICAgICAgIGlmICh3aWtpbGlua3MpIHtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IGxpbmsgb2Ygd2lraWxpbmtzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHByb2plY3ROYW1lID0gbGluay5zbGljZSgyLCAtMik7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gQ2hlY2sgaWYgcHJvamVjdCBleGlzdHMgaW4gZm9sZGVyXG4gICAgICAgICAgICAgICAgICAgIGlmIChwcm9qZWN0Rm9sZGVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9qZWN0RmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChgJHtwcm9qZWN0Rm9sZGVyfS8ke3Byb2plY3ROYW1lfS5tZGApO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCFwcm9qZWN0RmlsZSkgY29udGludWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXByb2plY3RNYXAuaGFzKGxpbmspKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9qZWN0TWFwLnNldChsaW5rLCB7IG9wZW46IFtdLCBjb21wbGV0ZWQ6IFtdIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHByb2plY3RNYXAuZ2V0KGxpbmspLmNvbXBsZXRlZC5wdXNoKHRhc2spO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIElmIHByb2plY3RGb2xkZXIgc3BlY2lmaWVkLCBhbHNvIGV4dHJhY3QgdGFza3MgZGlyZWN0bHkgZnJvbSBwcm9qZWN0IG5vdGVzXG4gICAgICAgIGlmIChwcm9qZWN0Rm9sZGVyKSB7XG4gICAgICAgICAgICBjb25zdCBmaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIoZmlsZSA9PiBmaWxlLnBhdGguc3RhcnRzV2l0aChwcm9qZWN0Rm9sZGVyICsgJy8nKSk7XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpbmsgPSBgW1ske2ZpbGUuYmFzZW5hbWV9XV1gO1xuXG4gICAgICAgICAgICAgICAgaWYgKCFwcm9qZWN0TWFwLmhhcyhsaW5rKSkge1xuICAgICAgICAgICAgICAgICAgICBwcm9qZWN0TWFwLnNldChsaW5rLCB7IG9wZW46IFtdLCBjb21wbGV0ZWQ6IFtdIH0pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIEV4dHJhY3QgdGFza3MgZnJvbSBub3RlXG4gICAgICAgICAgICAgICAgY29uc3QgdGFza1JlZ2V4ID0gL15bXFxzLV0qXFxbWyB4WF1cXF1cXHMrKC4rKSQvZ207XG4gICAgICAgICAgICAgICAgY29uc3QgbWF0Y2hlcyA9IFsuLi5jb250ZW50Lm1hdGNoQWxsKHRhc2tSZWdleCldO1xuXG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBtYXRjaCBvZiBtYXRjaGVzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGZ1bGxMaW5lID0gbWF0Y2hbMF07XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGlzQ29tcGxldGVkID0gL1xcW3hcXF0vaS50ZXN0KGZ1bGxMaW5lKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNDb21wbGV0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIGNvbXBsZXRlZCByZWNlbnRseVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgZGF0ZU1hdGNoID0gZnVsbExpbmUubWF0Y2goL1x1MjcwNVxccysoXFxkezR9KS0oXFxkezJ9KS0oXFxkezJ9KS8pO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGRhdGVNYXRjaCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhc2tEYXRlID0gbmV3IERhdGUoZGF0ZU1hdGNoWzFdLCBkYXRlTWF0Y2hbMl0gLSAxLCBkYXRlTWF0Y2hbM10pO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGN1dG9mZkRhdGUgPSBuZXcgRGF0ZSgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN1dG9mZkRhdGUuc2V0RGF0ZShjdXRvZmZEYXRlLmdldERhdGUoKSAtIDcpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRhc2tEYXRlID49IGN1dG9mZkRhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHJvamVjdE1hcC5nZXQobGluaykuY29tcGxldGVkLnB1c2goZnVsbExpbmUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHByb2plY3RNYXAuZ2V0KGxpbmspLm9wZW4ucHVzaChmdWxsTGluZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGb3JtYXQgb3V0cHV0IGdyb3VwZWQgYnkgcHJvamVjdFxuICAgICAgICBpZiAocHJvamVjdE1hcC5zaXplID4gMCkge1xuICAgICAgICAgICAgY29uc3Qgc29ydGVkUHJvamVjdHMgPSBBcnJheS5mcm9tKHByb2plY3RNYXAua2V5cygpKS5zb3J0KCk7XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgcHJvamVjdExpbmsgb2Ygc29ydGVkUHJvamVjdHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB0YXNrcyA9IHByb2plY3RNYXAuZ2V0KHByb2plY3RMaW5rKTtcblxuICAgICAgICAgICAgICAgIC8vIE9ubHkgc2hvdyBwcm9qZWN0cyB3aXRoIHRhc2tzXG4gICAgICAgICAgICAgICAgaWYgKHRhc2tzLm9wZW4ubGVuZ3RoID4gMCB8fCB0YXNrcy5jb21wbGV0ZWQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICAgICAgICAgICAgICAgICAgbGluZXMucHVzaChgKioke3Byb2plY3RMaW5rfSoqYCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gU2hvdyBvcGVuIHRhc2tzXG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdGFzayBvZiB0YXNrcy5vcGVuKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKHRhc2spO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gU2hvdyBjb21wbGV0ZWQgdGFza3NcbiAgICAgICAgICAgICAgICAgICAgZm9yIChjb25zdCB0YXNrIG9mIHRhc2tzLmNvbXBsZXRlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZXMucHVzaCh0YXNrKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gQ2F0Y2gtYWxsIHNlY3Rpb24gZm9yIG9ycGhhbmVkIGNvbXBsZXRlZCB0YXNrc1xuICAgICAgICAgICAgY29uc3Qgb3JwaGFuZWRDb21wbGV0ZWQgPSBbXTtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdGFzayBvZiBjb21wbGV0ZWRUYXNrcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHdpa2lsaW5rcyA9IHRhc2subWF0Y2goL1xcW1xcWyhbXlxcXV0rKVxcXVxcXS9nKTtcbiAgICAgICAgICAgICAgICBpZiAoIXdpa2lsaW5rcyB8fCB3aWtpbGlua3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIG9ycGhhbmVkQ29tcGxldGVkLnB1c2godGFzayk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAob3JwaGFuZWRDb21wbGV0ZWQubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goJycpO1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goJypPdGhlciBjb21wbGV0ZWQgaXRlbXMgKG5vdCBsaW5rZWQgdG8gc3BlY2lmaWMgcHJvamVjdCBub3Rlcyk6KicpO1xuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdGFzayBvZiBvcnBoYW5lZENvbXBsZXRlZCkge1xuICAgICAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKHRhc2spO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goJy0gKihubyBhY3RpdmUgcHJvamVjdHMgdGhpcyB3ZWVrKSonKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGxpbmVzLmpvaW4oJ1xcbicpO1xuICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQodGltZXIsIHsgcHJvamVjdEZvbGRlciwgcHJvamVjdENvdW50OiBwcm9qZWN0TWFwLnNpemUgfSk7XG4gICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRm9ybWF0IHRoZSBCbG9ja2VkIHNlY3Rpb24gY29udGVudFxuICAgICAqL1xuICAgIGZvcm1hdEJsb2NrZWRTZWN0aW9uKGthbmJhbkRhdGEpIHtcbiAgICAgICAgY29uc3QgbGluZXMgPSBbJypBdXRvLXVwZGF0ZWQgZnJvbSBQcm9qZWN0IERhc2hib2FyZCBcIkJsb2NrZWRcIiBzZWN0aW9uKicsICcnXTtcblxuICAgICAgICBpZiAoa2FuYmFuRGF0YS5ibG9ja2VkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGZvciAoY29uc3QgdGFzayBvZiBrYW5iYW5EYXRhLmJsb2NrZWQpIHtcbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgY2hlY2tib3ggYW5kIGZvcm1hdFxuICAgICAgICAgICAgICAgIGNvbnN0IHRleHQgPSB0YXNrLnJlcGxhY2UoL14tXFxzK1xcW1sgeF1cXF1cXHMrL2ksICcnKTtcbiAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKGAtICR7dGV4dH1gKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goJy0gKihub25lKSonKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGb3JtYXQgdGhlIEhpZ2hsaWdodHMgc2VjdGlvbiBjb250ZW50XG4gICAgICovXG4gICAgZm9ybWF0SGlnaGxpZ2h0c1NlY3Rpb24oa2FuYmFuRGF0YSkge1xuICAgICAgICBjb25zdCBsaW5lcyA9IFsnKkNvbXBsZXRlZCB0YXNrcyBmcm9tIFByb2plY3QgRGFzaGJvYXJkIFwiRG9uZVwiIHNlY3Rpb24qJywgJyddO1xuXG4gICAgICAgIGlmIChrYW5iYW5EYXRhLmRvbmUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgLy8gR2V0IHRhc2tzIGZyb20gbGFzdCA3IGRheXNcbiAgICAgICAgICAgIGNvbnN0IHJlY2VudFRhc2tzID0gdGhpcy5maWx0ZXJSZWNlbnRUYXNrcyhrYW5iYW5EYXRhLmRvbmUsIDcpO1xuICAgICAgICAgICAgaWYgKHJlY2VudFRhc2tzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKC4uLnJlY2VudFRhc2tzLnNsaWNlKDAsIDEwKSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goJy0gKihubyBjb21wbGV0ZWQgdGFza3MgdGhpcyB3ZWVrKSonKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goJy0gKihubyBjb21wbGV0ZWQgdGFza3MgdGhpcyB3ZWVrKSonKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBGaWx0ZXIgdGFza3MgY29tcGxldGVkIGluIHRoZSBsYXN0IE4gZGF5c1xuICAgICAqL1xuICAgIGZpbHRlclJlY2VudFRhc2tzKHRhc2tzLCBkYXlzKSB7XG4gICAgICAgIGNvbnN0IGN1dG9mZkRhdGUgPSBuZXcgRGF0ZSgpO1xuICAgICAgICBjdXRvZmZEYXRlLnNldERhdGUoY3V0b2ZmRGF0ZS5nZXREYXRlKCkgLSBkYXlzKTtcblxuICAgICAgICByZXR1cm4gdGFza3MuZmlsdGVyKHRhc2sgPT4ge1xuICAgICAgICAgICAgY29uc3QgZGF0ZU1hdGNoID0gdGFzay5tYXRjaCgvXHUyNzA1XFxzKyhcXGR7NH0pLShcXGR7Mn0pLShcXGR7Mn0pLyk7XG4gICAgICAgICAgICBpZiAoZGF0ZU1hdGNoKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFza0RhdGUgPSBuZXcgRGF0ZShkYXRlTWF0Y2hbMV0sIGRhdGVNYXRjaFsyXSAtIDEsIGRhdGVNYXRjaFszXSk7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRhc2tEYXRlID49IGN1dG9mZkRhdGU7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdHJ1ZTsgLy8gSW5jbHVkZSB0YXNrcyB3aXRob3V0IGRhdGVzXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4dHJhY3QgdGFza3MgZnJvbSBub3RlcyBpbiBhIHByb2plY3QgZm9sZGVyXG4gICAgICogUmV0dXJucyBhbiBvYmplY3Qgd2l0aCBhY3RpdmUgYW5kIGNvbXBsZXRlZCB0YXNrc1xuICAgICAqL1xuICAgIGFzeW5jIGV4dHJhY3RUYXNrc0Zyb21Qcm9qZWN0Rm9sZGVyKHByb2plY3RGb2xkZXIpIHtcbiAgICAgICAgY29uc3QgYWN0aXZlVGFza3MgPSBbXTtcbiAgICAgICAgY29uc3QgY29tcGxldGVkVGFza3MgPSBbXTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gR2V0IGFsbCBtYXJrZG93biBmaWxlcyBpbiB0aGUgcHJvamVjdCBmb2xkZXJcbiAgICAgICAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpXG4gICAgICAgICAgICAgICAgLmZpbHRlcihmaWxlID0+IGZpbGUucGF0aC5zdGFydHNXaXRoKHByb2plY3RGb2xkZXIgKyAnLycpKTtcblxuICAgICAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgY29udGVudCA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LnJlYWQoZmlsZSk7XG5cbiAgICAgICAgICAgICAgICAvLyBFeHRyYWN0IHRhc2sgbGluZXMgKGJvdGggY29tcGxldGVkIGFuZCBpbmNvbXBsZXRlKVxuICAgICAgICAgICAgICAgIGNvbnN0IHRhc2tSZWdleCA9IC9eW1xccy1dKlxcW1sgeFhdXFxdXFxzKyguKykkL2dtO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCh0YXNrUmVnZXgpXTtcblxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmdWxsTGluZSA9IG1hdGNoWzBdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc0NvbXBsZXRlZCA9IC9cXFt4XFxdL2kudGVzdChmdWxsTGluZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzQ29tcGxldGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wbGV0ZWRUYXNrcy5wdXNoKGZ1bGxMaW5lKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGFjdGl2ZVRhc2tzLnB1c2goZnVsbExpbmUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRXJyb3IgZXh0cmFjdGluZyB0YXNrcyBmcm9tICR7cHJvamVjdEZvbGRlcn06YCwgZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHsgYWN0aXZlVGFza3MsIGNvbXBsZXRlZFRhc2tzIH07XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRXNjYXBlIHNwZWNpYWwgcmVnZXggY2hhcmFjdGVyc1xuICAgICAqL1xuICAgIGVzY2FwZVJlZ2V4KHN0cikge1xuICAgICAgICByZXR1cm4gc3RyLnJlcGxhY2UoL1suKis/XiR7fSgpfFtcXF1cXFxcXS9nLCAnXFxcXCQmJyk7XG4gICAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUQVNLIE1BTkFHRVJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY2xhc3MgVGFza01hbmFnZXIge1xuICAgIGNvbnN0cnVjdG9yKGFwcCwgc2V0dGluZ3MsIHByb2ZpbGVyKSB7XG4gICAgICAgIHRoaXMuYXBwID0gYXBwO1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgIHRoaXMucHJvZmlsZXIgPSBwcm9maWxlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYW5jZWwgYWxsIG9wZW4gdGFza3MgaW4gYSBmaWxlIGJ5IHJlcGxhY2luZyBjaGVja2JveGVzXG4gICAgICogQ29udmVydHM6IC0gWyBdIHRhc2sgLT4gLSBbLV0gdGFza1xuICAgICAqIEFsc28gaGFuZGxlczogKiBbIF0gdGFzayBhbmQgKyBbIF0gdGFza1xuICAgICAqL1xuICAgIGFzeW5jIGNhbmNlbFRhc2tzSW5GaWxlKGZpbGUpIHtcbiAgICAgICAgaWYgKCFmaWxlKSByZXR1cm4geyBtb2RpZmllZDogZmFsc2UsIHRhc2tDb3VudDogMCB9O1xuXG4gICAgICAgIGNvbnN0IGhhbmRsZSA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCd0YXNrczpjYW5jZWwtZmlsZScpO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgICAgIGNvbnN0IGxpbmVzID0gY29udGVudC5zcGxpdCgnXFxuJyk7XG4gICAgICAgICAgICBsZXQgbW9kaWZpZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIGxldCB0YXNrQ291bnQgPSAwO1xuXG4gICAgICAgICAgICBjb25zdCBuZXdMaW5lcyA9IGxpbmVzLm1hcChsaW5lID0+IHtcbiAgICAgICAgICAgICAgICAvLyBNYXRjaCB0YXNrIGxpbmVzIHdpdGggb3BlbiBjaGVja2JveGVzOiAtIFsgXSwgKiBbIF0sIG9yICsgWyBdXG4gICAgICAgICAgICAgICAgLy8gUmVnZXggZXhwbGFuYXRpb246XG4gICAgICAgICAgICAgICAgLy8gXihcXHMqKSAgICAgIC0gU3RhcnQgb2YgbGluZSwgY2FwdHVyZSBsZWFkaW5nIHdoaXRlc3BhY2VcbiAgICAgICAgICAgICAgICAvLyAoWy0qK10pICAgICAtIENhcHR1cmUgbGlzdCBtYXJrZXJcbiAgICAgICAgICAgICAgICAvLyBcXHMrICAgICAgICAgLSBPbmUgb3IgbW9yZSBzcGFjZXMgYWZ0ZXIgbWFya2VyXG4gICAgICAgICAgICAgICAgLy8gXFxbICAgICAgICAgIC0gT3BlbmluZyBicmFja2V0IChlc2NhcGVkKVxuICAgICAgICAgICAgICAgIC8vIFxccyAgICAgICAgICAtIFNwYWNlIGluc2lkZSBjaGVja2JveFxuICAgICAgICAgICAgICAgIC8vIFxcXSAgICAgICAgICAtIENsb3NpbmcgYnJhY2tldCAoZXNjYXBlZClcbiAgICAgICAgICAgICAgICAvLyAoLiopICAgICAgICAtIENhcHR1cmUgZXZlcnl0aGluZyBhZnRlciBjaGVja2JveCAoaW5jbHVkaW5nIGVtcHR5KVxuICAgICAgICAgICAgICAgIGNvbnN0IHRhc2tNYXRjaCA9IGxpbmUubWF0Y2goL14oXFxzKikoWy0qK10pXFxzK1xcW1xcc1xcXSguKikvKTtcblxuICAgICAgICAgICAgICAgIGlmICh0YXNrTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgdGFza0NvdW50Kys7XG4gICAgICAgICAgICAgICAgICAgIG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgWywgaW5kZW50LCBtYXJrZXIsIHRhc2tUZXh0XSA9IHRhc2tNYXRjaDtcbiAgICAgICAgICAgICAgICAgICAgLy8gUmV0dXJuIGNhbmNlbGxlZCB0YXNrIGZvcm1hdFxuICAgICAgICAgICAgICAgICAgICAvLyB0YXNrVGV4dCBhbHJlYWR5IGluY2x1ZGVzIGFueSBsZWFkaW5nL3RyYWlsaW5nIHNwYWNlc1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYCR7aW5kZW50fSR7bWFya2VyfSBbLV0ke3Rhc2tUZXh0fWA7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgcmV0dXJuIGxpbmU7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgaWYgKG1vZGlmaWVkKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQubW9kaWZ5KGZpbGUsIG5ld0xpbmVzLmpvaW4oJ1xcbicpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKGhhbmRsZSwgeyBmaWxlOiBmaWxlLm5hbWUsIHRhc2tDb3VudCwgbW9kaWZpZWQgfSk7XG5cbiAgICAgICAgICAgIHJldHVybiB7IG1vZGlmaWVkLCB0YXNrQ291bnQgfTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYFF1aWNrIFBBUkE6IEVycm9yIGNhbmNlbGxpbmcgdGFza3MgaW4gJHtmaWxlLm5hbWV9OmAsIGVycm9yKTtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZChoYW5kbGUpO1xuICAgICAgICAgICAgcmV0dXJuIHsgbW9kaWZpZWQ6IGZhbHNlLCB0YXNrQ291bnQ6IDAsIGVycm9yIH07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYW5jZWwgYWxsIG9wZW4gdGFza3MgaW4gQXJjaGl2ZSBmb2xkZXJcbiAgICAgKi9cbiAgICBhc3luYyBjYW5jZWxBcmNoaXZlVGFza3MoKSB7XG4gICAgICAgIGNvbnN0IGhhbmRsZSA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCd0YXNrczpjYW5jZWwtYXJjaGl2ZScpO1xuICAgICAgICBjb25zdCBhcmNoaXZlRm9sZGVyUGF0aCA9IHRoaXMuc2V0dGluZ3MucGFyYUZvbGRlcnM/LmFyY2hpdmUgfHwgJzQgLSBBUkNISVZFJztcblxuICAgICAgICAvLyBHZXQgYWxsIG1hcmtkb3duIGZpbGVzIGluIHRoZSBhcmNoaXZlIGZvbGRlclxuICAgICAgICBjb25zdCBhbGxGaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKTtcbiAgICAgICAgY29uc3QgYXJjaGl2ZUZpbGVzID0gYWxsRmlsZXMuZmlsdGVyKGZpbGUgPT5cbiAgICAgICAgICAgIGZpbGUucGF0aC5zdGFydHNXaXRoKGFyY2hpdmVGb2xkZXJQYXRoICsgJy8nKSB8fCBmaWxlLnBhdGggPT09IGFyY2hpdmVGb2xkZXJQYXRoXG4gICAgICAgICk7XG5cbiAgICAgICAgaWYgKGFyY2hpdmVGaWxlcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYE5vIGZpbGVzIGZvdW5kIGluICR7YXJjaGl2ZUZvbGRlclBhdGh9YCk7XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQoaGFuZGxlKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIG5ldyBOb3RpY2UoYFNjYW5uaW5nICR7YXJjaGl2ZUZpbGVzLmxlbmd0aH0gZmlsZXMgaW4gQXJjaGl2ZS4uLmApO1xuXG4gICAgICAgIGxldCBmaWxlc01vZGlmaWVkID0gMDtcbiAgICAgICAgbGV0IHRvdGFsVGFza3NDYW5jZWxsZWQgPSAwO1xuICAgICAgICBjb25zdCBlcnJvcnMgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgYXJjaGl2ZUZpbGVzKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmNhbmNlbFRhc2tzSW5GaWxlKGZpbGUpO1xuXG4gICAgICAgICAgICBpZiAocmVzdWx0LmVycm9yKSB7XG4gICAgICAgICAgICAgICAgZXJyb3JzLnB1c2goeyBmaWxlOiBmaWxlLm5hbWUsIGVycm9yOiByZXN1bHQuZXJyb3IgfSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdC5tb2RpZmllZCkge1xuICAgICAgICAgICAgICAgIGZpbGVzTW9kaWZpZWQrKztcbiAgICAgICAgICAgICAgICB0b3RhbFRhc2tzQ2FuY2VsbGVkICs9IHJlc3VsdC50YXNrQ291bnQ7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBTaG93IHN1bW1hcnlcbiAgICAgICAgaWYgKGVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgICAgICAgIGBDb21wbGV0ZWQgd2l0aCBlcnJvcnM6ICR7ZmlsZXNNb2RpZmllZH0gZmlsZXMgdXBkYXRlZCwgYCArXG4gICAgICAgICAgICAgICAgYCR7dG90YWxUYXNrc0NhbmNlbGxlZH0gdGFza3MgY2FuY2VsbGVkLCAke2Vycm9ycy5sZW5ndGh9IGVycm9yc2BcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdRdWljayBQQVJBOiBFcnJvcnMgZHVyaW5nIHRhc2sgY2FuY2VsbGF0aW9uOicsIGVycm9ycyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKFxuICAgICAgICAgICAgICAgIGBBcmNoaXZlIHRhc2tzIGNhbmNlbGxlZDogJHt0b3RhbFRhc2tzQ2FuY2VsbGVkfSB0YXNrcyBpbiAke2ZpbGVzTW9kaWZpZWR9IGZpbGVzYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZChoYW5kbGUsIHtcbiAgICAgICAgICAgIGFyY2hpdmVGaWxlczogYXJjaGl2ZUZpbGVzLmxlbmd0aCxcbiAgICAgICAgICAgIGZpbGVzTW9kaWZpZWQsXG4gICAgICAgICAgICB0b3RhbFRhc2tzQ2FuY2VsbGVkLFxuICAgICAgICAgICAgZXJyb3JzOiBlcnJvcnMubGVuZ3RoXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLmRpYWdub3N0aWNzLnByb2ZpbGluZ0VuYWJsZWQpIHsgY29uc29sZS5sb2coYFF1aWNrIFBBUkE6IEFyY2hpdmUgdGFzayBjYW5jZWxsYXRpb24gY29tcGxldGUgLSAke2ZpbGVzTW9kaWZpZWR9IGZpbGVzLCAke3RvdGFsVGFza3NDYW5jZWxsZWR9IHRhc2tzYCk7IH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBDYW5jZWwgYWxsIG9wZW4gdGFza3MgaW4gY3VycmVudCBmaWxlXG4gICAgICovXG4gICAgYXN5bmMgY2FuY2VsQ3VycmVudEZpbGVUYXNrcygpIHtcbiAgICAgICAgY29uc3QgaGFuZGxlID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ3Rhc2tzOmNhbmNlbC1jdXJyZW50Jyk7XG4gICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuXG4gICAgICAgIGlmICghZmlsZSkge1xuICAgICAgICAgICAgbmV3IE5vdGljZSgnTm8gYWN0aXZlIGZpbGUnKTtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZChoYW5kbGUpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5jYW5jZWxUYXNrc0luRmlsZShmaWxlKTtcblxuICAgICAgICBpZiAocmVzdWx0LmVycm9yKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKGBFcnJvciBjYW5jZWxsaW5nIHRhc2tzOiAke3Jlc3VsdC5lcnJvci5tZXNzYWdlfWApO1xuICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdC5tb2RpZmllZCkge1xuICAgICAgICAgICAgbmV3IE5vdGljZShgQ2FuY2VsbGVkICR7cmVzdWx0LnRhc2tDb3VudH0gdGFza3MgaW4gJHtmaWxlLm5hbWV9YCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKCdObyBvcGVuIHRhc2tzIGZvdW5kIGluIGN1cnJlbnQgZmlsZScpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKGhhbmRsZSk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogUHJldmlldyB3aGljaCB0YXNrcyB3b3VsZCBiZSBjYW5jZWxsZWQgKGRyeSBydW4pXG4gICAgICovXG4gICAgYXN5bmMgcHJldmlld0FyY2hpdmVUYXNrQ2FuY2VsbGF0aW9uKCkge1xuICAgICAgICBjb25zdCBoYW5kbGUgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgndGFza3M6cHJldmlldy1hcmNoaXZlJyk7XG4gICAgICAgIGNvbnN0IGFyY2hpdmVGb2xkZXJQYXRoID0gdGhpcy5zZXR0aW5ncy5wYXJhRm9sZGVycz8uYXJjaGl2ZSB8fCAnNCAtIEFSQ0hJVkUnO1xuXG4gICAgICAgIGNvbnN0IGFsbEZpbGVzID0gdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpO1xuICAgICAgICBjb25zdCBhcmNoaXZlRmlsZXMgPSBhbGxGaWxlcy5maWx0ZXIoZmlsZSA9PlxuICAgICAgICAgICAgZmlsZS5wYXRoLnN0YXJ0c1dpdGgoYXJjaGl2ZUZvbGRlclBhdGggKyAnLycpIHx8IGZpbGUucGF0aCA9PT0gYXJjaGl2ZUZvbGRlclBhdGhcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoYXJjaGl2ZUZpbGVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgbmV3IE5vdGljZShgTm8gZmlsZXMgZm91bmQgaW4gJHthcmNoaXZlRm9sZGVyUGF0aH1gKTtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZChoYW5kbGUpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHRvdGFsVGFza3MgPSAwO1xuICAgICAgICBjb25zdCBmaWxlc1dpdGhUYXNrcyA9IFtdO1xuXG4gICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBhcmNoaXZlRmlsZXMpIHtcbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuICAgICAgICAgICAgY29uc3QgdGFza01hdGNoZXMgPSBjb250ZW50Lm1hdGNoKC9eKFxccyopKFstKitdKVxccytcXFtcXHNcXF0oLiopL2dtKTtcblxuICAgICAgICAgICAgaWYgKHRhc2tNYXRjaGVzICYmIHRhc2tNYXRjaGVzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB0b3RhbFRhc2tzICs9IHRhc2tNYXRjaGVzLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBmaWxlc1dpdGhUYXNrcy5wdXNoKHtcbiAgICAgICAgICAgICAgICAgICAgcGF0aDogZmlsZS5wYXRoLFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiBmaWxlLm5hbWUsXG4gICAgICAgICAgICAgICAgICAgIHRhc2tDb3VudDogdGFza01hdGNoZXMubGVuZ3RoXG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodG90YWxUYXNrcyA9PT0gMCkge1xuICAgICAgICAgICAgbmV3IE5vdGljZSgnTm8gb3BlbiB0YXNrcyBmb3VuZCBpbiBBcmNoaXZlIGZvbGRlcicpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MucHJvZmlsaW5nRW5hYmxlZCkge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdRdWljayBQQVJBOiBBcmNoaXZlIHRhc2sgcHJldmlldzonLCB7XG4gICAgICAgICAgICAgICAgICAgIHRvdGFsRmlsZXM6IGFyY2hpdmVGaWxlcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIGZpbGVzV2l0aFRhc2tzOiBmaWxlc1dpdGhUYXNrcy5sZW5ndGgsXG4gICAgICAgICAgICAgICAgICAgIHRvdGFsT3BlblRhc2tzOiB0b3RhbFRhc2tzLFxuICAgICAgICAgICAgICAgICAgICBmaWxlczogZmlsZXNXaXRoVGFza3NcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbmV3IE5vdGljZShcbiAgICAgICAgICAgICAgICBgUHJldmlldzogJHt0b3RhbFRhc2tzfSBvcGVuIHRhc2tzIGZvdW5kIGluICR7ZmlsZXNXaXRoVGFza3MubGVuZ3RofSBmaWxlcy4gYCArXG4gICAgICAgICAgICAgICAgYENoZWNrIGNvbnNvbGUgZm9yIGRldGFpbHMuYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZChoYW5kbGUsIHtcbiAgICAgICAgICAgIHRvdGFsVGFza3MsXG4gICAgICAgICAgICBmaWxlc1dpdGhUYXNrczogZmlsZXNXaXRoVGFza3MubGVuZ3RoXG4gICAgICAgIH0pO1xuICAgIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gU0VUVElOR1MgVEFCXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNsYXNzIFF1aWNrUGFyYVNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgICBjb25zdHJ1Y3RvcihhcHAsIHBsdWdpbikge1xuICAgICAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gICAgICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIH1cblxuICAgIGRpc3BsYXkoKSB7XG4gICAgICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG4gICAgICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gxJywgeyB0ZXh0OiAnUXVpY2sgUEFSQSBTZXR0aW5ncycgfSk7XG5cbiAgICAgICAgLy8gSGVhZGVyIGRlc2NyaXB0aW9uXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgdGV4dDogJ1F1aWNrIFBBUkEgaGVscHMgeW91IG9yZ2FuaXplIHlvdXIgT2JzaWRpYW4gdmF1bHQgdXNpbmcgdGhlIFBBUkEgbWV0aG9kIChQcm9qZWN0cywgQXJlYXMsIFJlc291cmNlcywgQXJjaGl2ZSkuIFRoaXMgcGx1Z2luIGF1dG9tYXRlcyBmb2xkZXIgc2V0dXAsIHRlbXBsYXRlIGRlcGxveW1lbnQsIGFuZCB0YXNrIG1hbmFnZW1lbnQgZm9yIGFyY2hpdmVkIG5vdGVzLicsXG4gICAgICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgdGV4dDogJ0xlYXJuIG1vcmUgYWJvdXQgUEFSQTogU2VlIHRoZSBcIlBBUkEgTWV0aG9kIE92ZXJ2aWV3XCIgbm90ZSBpbiB5b3VyIFJlc291cmNlcyBmb2xkZXIuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2hyJyk7XG5cbiAgICAgICAgLy8gQWN0aW9ucyBTZWN0aW9uIC0gQVQgVEhFIFRPUFxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZSgnUXVpY2sgQWN0aW9ucycpLnNldEhlYWRpbmcoKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdcdUQ4M0RcdURFODAgUnVuIFNldHVwIFdpemFyZCcpXG4gICAgICAgICAgICAuc2V0RGVzYygnTGF1bmNoIHRoZSBzdGVwLWJ5LXN0ZXAgc2V0dXAgd2l6YXJkIHRvIGNyZWF0ZSB5b3VyIFBBUkEgZm9sZGVyIHN0cnVjdHVyZSBhbmQgZGVwbG95IHRlbXBsYXRlcycpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnUnVuIFNldHVwIFdpemFyZCcpXG4gICAgICAgICAgICAgICAgLnNldEN0YSgpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5wcm92aXNpb25pbmdNYW5hZ2VyLnJ1blNldHVwV2l6YXJkKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1x1RDgzRFx1REQwRCBDaGVjayBEZXBlbmRlbmNpZXMnKVxuICAgICAgICAgICAgLnNldERlc2MoJ1ZlcmlmeSB0aGF0IHJlcXVpcmVkIHBsdWdpbnMgKFRlbXBsYXRlciwgVGFza3MpIGFyZSBpbnN0YWxsZWQuIE1ha2Ugc3VyZSBlYWNoIHBsdWdpbiBpcyBhbHNvIGFjdGl2ZSBhZnRlciBpbnN0YWxsYXRpb24uJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdDaGVjayBEZXBlbmRlbmNpZXMnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uY2hlY2tEZXBlbmRlbmNpZXModHJ1ZSk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1x1RDgzQ1x1REZGN1x1RkUwRiBVcGRhdGUgQWxsIFBBUkEgVGFncycpXG4gICAgICAgICAgICAuc2V0RGVzYygnQnVsayB1cGRhdGUgUEFSQSB0YWdzIGZvciBhbGwgZmlsZXMgaW4geW91ciB2YXVsdCB0byBtYXRjaCB0aGVpciBjdXJyZW50IGZvbGRlciBsb2NhdGlvbnMnKVxuICAgICAgICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXG4gICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQoJ1VwZGF0ZSBBbGwgVGFncycpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi50YWdnaW5nTWFuYWdlci5idWxrVXBkYXRlVGFncygpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdcdUQ4M0RcdURDREQgRGVwbG95IFBBUkEgVGVtcGxhdGVzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdJbnN0YWxsIGRlZmF1bHQgdGVtcGxhdGVzIGZvciBub3RlcyBpbiBlYWNoIFBBUkEgZm9sZGVyIChpbmJveCwgcHJvamVjdHMsIGFyZWFzLCByZXNvdXJjZXMsIGFyY2hpdmUpLCBwbHVzIHRoZSBQQVJBIE1ldGhvZCBPdmVydmlldyBndWlkZS4gVGhlc2UgYXJlIHN0YXJ0aW5nIHBvaW50cyB5b3UgY2FuIGN1c3RvbWl6ZSB0byB5b3VyIGxpa2luZy4gU2V0IHRoZXNlIHRlbXBsYXRlcyBpbiBUZW1wbGF0ZXIgcGx1Z2luIHNldHRpbmdzIHRvIHVzZSB0aGVtIHdoZW4gY3JlYXRpbmcgbmV3IG5vdGVzLiBPbmx5IGNyZWF0ZXMgbWlzc2luZyB0ZW1wbGF0ZXMsIHdpbGwgbm90IG92ZXJ3cml0ZSB5b3VyIGN1c3RvbWl6YXRpb25zLicpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnRGVwbG95IFRlbXBsYXRlcycpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi50ZW1wbGF0ZU1hbmFnZXIuZGVwbG95QWxsVGVtcGxhdGVzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1x1Mjc0QyBDYW5jZWwgQXJjaGl2ZSBUYXNrcycpXG4gICAgICAgICAgICAuc2V0RGVzYygnQ2FuY2VsIGFsbCBvcGVuIHRhc2tzIGluIHlvdXIgQXJjaGl2ZSBmb2xkZXIuIFVzZWZ1bCBmb3IgY2xlYW5pbmcgdXAgdGFza3MgZnJvbSBjYW5jZWxsZWQgb3IgY29tcGxldGVkIHByb2plY3RzLicpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnQ2FuY2VsIEFyY2hpdmUgVGFza3MnKVxuICAgICAgICAgICAgICAgIC5zZXRXYXJuaW5nKClcbiAgICAgICAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb25maXJtKCdUaGlzIHdpbGwgY2FuY2VsIGFsbCBvcGVuIHRhc2tzIGluIHlvdXIgQXJjaGl2ZSBmb2xkZXIgYnkgY29udmVydGluZyBbIF0gdG8gWy1dLiBUaGlzIGNhbm5vdCBiZSB1bmRvbmUgZXhjZXB0IHRocm91Z2ggdW5kbyBoaXN0b3J5LlxcblxcbkNvbnRpbnVlPycpKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi50YXNrTWFuYWdlci5jYW5jZWxBcmNoaXZlVGFza3MoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAvLyBEZXBlbmRlbmN5IGxpbmtzXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKCdSZXF1aXJlZCBEZXBlbmRlbmNpZXMnKS5zZXRIZWFkaW5nKCk7XG5cbiAgICAgICAgY29uc3QgdGVtcGxhdGVyTGluayA9IGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdkaXYnLCB7IGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbicgfSk7XG4gICAgICAgIHRlbXBsYXRlckxpbmsuYXBwZW5kVGV4dCgnXFx1MjAyMiAnKTtcbiAgICAgICAgdGVtcGxhdGVyTGluay5jcmVhdGVFbCgnc3Ryb25nJywgeyB0ZXh0OiAnVGVtcGxhdGVyJyB9KTtcbiAgICAgICAgdGVtcGxhdGVyTGluay5hcHBlbmRUZXh0KCc6IFJlcXVpcmVkIGZvciB0ZW1wbGF0ZSB2YXJpYWJsZSBzdWJzdGl0dXRpb24uICcpO1xuICAgICAgICB0ZW1wbGF0ZXJMaW5rLmNyZWF0ZUVsKCdhJywgeyB0ZXh0OiAnSW5zdGFsbCBmcm9tIENvbW11bml0eSBQbHVnaW5zJywgaHJlZjogJ29ic2lkaWFuOi8vc2hvdy1wbHVnaW4/aWQ9dGVtcGxhdGVyLW9ic2lkaWFuJyB9KTtcblxuICAgICAgICBjb25zdCB0YXNrc0xpbmsgPSBjb250YWluZXJFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nIH0pO1xuICAgICAgICB0YXNrc0xpbmsuYXBwZW5kVGV4dCgnXFx1MjAyMiAnKTtcbiAgICAgICAgdGFza3NMaW5rLmNyZWF0ZUVsKCdzdHJvbmcnLCB7IHRleHQ6ICdUYXNrcycgfSk7XG4gICAgICAgIHRhc2tzTGluay5hcHBlbmRUZXh0KCc6IFJlcXVpcmVkIGZvciB0YXNrIG1hbmFnZW1lbnQgZmVhdHVyZXMuICcpO1xuICAgICAgICB0YXNrc0xpbmsuY3JlYXRlRWwoJ2EnLCB7IHRleHQ6ICdJbnN0YWxsIGZyb20gQ29tbXVuaXR5IFBsdWdpbnMnLCBocmVmOiAnb2JzaWRpYW46Ly9zaG93LXBsdWdpbj9pZD1vYnNpZGlhbi10YXNrcy1wbHVnaW4nIH0pO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdocicpO1xuXG4gICAgICAgIC8vIFBBUkEgRm9sZGVycyBTZWN0aW9uXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKCdQQVJBIEZvbGRlciBDb25maWd1cmF0aW9uJykuc2V0SGVhZGluZygpO1xuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdDb25maWd1cmUgdGhlIG5hbWVzIG9mIHlvdXIgZml2ZSBjb3JlIFBBUkEgZm9sZGVycy4gVGhlc2UgZm9sZGVycyB3aWxsIGJlIGNyZWF0ZWQgYXV0b21hdGljYWxseSBkdXJpbmcgc2V0dXAgaWYgdGhleSBkb25cXCd0IGV4aXN0LiBUaGUgcGx1Z2luIHVzZXMgdGhlc2UgcGF0aHMgdG8gZGV0ZXJtaW5lIHdoZXJlIG5vdGVzIGJlbG9uZyBhbmQgd2hhdCBwcm9wZXJ0aWVzIHRvIGFzc2lnbi4nLFxuICAgICAgICAgICAgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJ1xuICAgICAgICB9KTtcblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdOb3RlOiBGb2xkZXIgbmFtZXMgYXJlIGNhc2UtaW5zZW5zaXRpdmUuIFRoZSBwbHVnaW4gd2lsbCBtYXRjaCBcIjEgLSBwcm9qZWN0c1wiLCBcIjEgLSBQcm9qZWN0c1wiLCBvciBcIjEgLSBQUk9KRUNUU1wiIGVxdWFsbHkuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gQ3JlYXRlIGZvbGRlciBzdWdnZXN0aW9ucyBkYXRhbGlzdCAoc2hhcmVkIGJ5IGFsbCBmb2xkZXIgaW5wdXRzKVxuICAgICAgICBjb25zdCBmb2xkZXJzID0gdGhpcy5hcHAudmF1bHQuZ2V0QWxsTG9hZGVkRmlsZXMoKVxuICAgICAgICAgICAgLmZpbHRlcihmID0+IGYuY2hpbGRyZW4gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIC5tYXAoZiA9PiBmLnBhdGgpXG4gICAgICAgICAgICAuc29ydCgpO1xuICAgICAgICBjb25zdCBkYXRhbGlzdElkID0gJ3BhcmEtZm9sZGVyLXN1Z2dlc3QnO1xuICAgICAgICBjb25zdCBkYXRhbGlzdCA9IGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdkYXRhbGlzdCcsIHsgYXR0cjogeyBpZDogZGF0YWxpc3RJZCB9IH0pO1xuICAgICAgICBmb2xkZXJzLmZvckVhY2goZm9sZGVyID0+IHtcbiAgICAgICAgICAgIGRhdGFsaXN0LmNyZWF0ZUVsKCdvcHRpb24nLCB7IHZhbHVlOiBmb2xkZXIgfSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGluYm94U2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0luYm94IEZvbGRlcicpXG4gICAgICAgICAgICAuc2V0RGVzYygnVG9wLWxldmVsIGZvbGRlciBmb3IgaW5ib3ggaXRlbXMnKTtcbiAgICAgICAgY29uc3QgaW5ib3hJbnB1dCA9IGluYm94U2V0dGluZy5jb250cm9sRWwuY3JlYXRlRWwoJ2lucHV0Jywge1xuICAgICAgICAgICAgdHlwZTogJ3RleHQnLFxuICAgICAgICAgICAgcGxhY2Vob2xkZXI6ICcwIC0gSU5CT1gnLFxuICAgICAgICAgICAgdmFsdWU6IHRoaXMucGx1Z2luLnNldHRpbmdzLnBhcmFGb2xkZXJzLmluYm94LFxuICAgICAgICAgICAgYXR0cjogeyBsaXN0OiBkYXRhbGlzdElkIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGluYm94SW5wdXQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgIGluYm94SW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFyYUZvbGRlcnMuaW5ib3ggPSBlLnRhcmdldC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgcHJvamVjdHNTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnUHJvamVjdHMgRm9sZGVyJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdUb3AtbGV2ZWwgZm9sZGVyIGZvciBhY3RpdmUgcHJvamVjdHMnKTtcbiAgICAgICAgY29uc3QgcHJvamVjdHNJbnB1dCA9IHByb2plY3RzU2V0dGluZy5jb250cm9sRWwuY3JlYXRlRWwoJ2lucHV0Jywge1xuICAgICAgICAgICAgdHlwZTogJ3RleHQnLFxuICAgICAgICAgICAgcGxhY2Vob2xkZXI6ICcxIC0gUFJPSkVDVFMnLFxuICAgICAgICAgICAgdmFsdWU6IHRoaXMucGx1Z2luLnNldHRpbmdzLnBhcmFGb2xkZXJzLnByb2plY3RzLFxuICAgICAgICAgICAgYXR0cjogeyBsaXN0OiBkYXRhbGlzdElkIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHByb2plY3RzSW5wdXQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgIHByb2plY3RzSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFyYUZvbGRlcnMucHJvamVjdHMgPSBlLnRhcmdldC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgYXJlYXNTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnQXJlYXMgRm9sZGVyJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdUb3AtbGV2ZWwgZm9sZGVyIGZvciBvbmdvaW5nIGFyZWFzJyk7XG4gICAgICAgIGNvbnN0IGFyZWFzSW5wdXQgPSBhcmVhc1NldHRpbmcuY29udHJvbEVsLmNyZWF0ZUVsKCdpbnB1dCcsIHtcbiAgICAgICAgICAgIHR5cGU6ICd0ZXh0JyxcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyOiAnMiAtIEFSRUFTJyxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXJhRm9sZGVycy5hcmVhcyxcbiAgICAgICAgICAgIGF0dHI6IHsgbGlzdDogZGF0YWxpc3RJZCB9XG4gICAgICAgIH0pO1xuICAgICAgICBhcmVhc0lucHV0LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuICAgICAgICBhcmVhc0lucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBhcmFGb2xkZXJzLmFyZWFzID0gZS50YXJnZXQudmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHJlc291cmNlc1NldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdSZXNvdXJjZXMgRm9sZGVyJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdUb3AtbGV2ZWwgZm9sZGVyIGZvciByZWZlcmVuY2UgbWF0ZXJpYWxzJyk7XG4gICAgICAgIGNvbnN0IHJlc291cmNlc0lucHV0ID0gcmVzb3VyY2VzU2V0dGluZy5jb250cm9sRWwuY3JlYXRlRWwoJ2lucHV0Jywge1xuICAgICAgICAgICAgdHlwZTogJ3RleHQnLFxuICAgICAgICAgICAgcGxhY2Vob2xkZXI6ICczIC0gUkVTT1VSQ0VTJyxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXJhRm9sZGVycy5yZXNvdXJjZXMsXG4gICAgICAgICAgICBhdHRyOiB7IGxpc3Q6IGRhdGFsaXN0SWQgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmVzb3VyY2VzSW5wdXQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgIHJlc291cmNlc0lucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBhcmFGb2xkZXJzLnJlc291cmNlcyA9IGUudGFyZ2V0LnZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBhcmNoaXZlU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0FyY2hpdmUgRm9sZGVyJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdUb3AtbGV2ZWwgZm9sZGVyIGZvciBhcmNoaXZlZCBpdGVtcycpO1xuICAgICAgICBjb25zdCBhcmNoaXZlSW5wdXQgPSBhcmNoaXZlU2V0dGluZy5jb250cm9sRWwuY3JlYXRlRWwoJ2lucHV0Jywge1xuICAgICAgICAgICAgdHlwZTogJ3RleHQnLFxuICAgICAgICAgICAgcGxhY2Vob2xkZXI6ICc0IC0gQVJDSElWRScsXG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFyYUZvbGRlcnMuYXJjaGl2ZSxcbiAgICAgICAgICAgIGF0dHI6IHsgbGlzdDogZGF0YWxpc3RJZCB9XG4gICAgICAgIH0pO1xuICAgICAgICBhcmNoaXZlSW5wdXQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgIGFyY2hpdmVJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXJhRm9sZGVycy5hcmNoaXZlID0gZS50YXJnZXQudmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdocicpO1xuXG4gICAgICAgIC8vIFRhZ2dpbmcgQmVoYXZpb3IgU2VjdGlvblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZSgnQXV0b21hdGljIFRhZ2dpbmcgQmVoYXZpb3InKS5zZXRIZWFkaW5nKCk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICB0ZXh0OiAnQ29udHJvbCBob3cgdGhlIHBsdWdpbiBhdXRvbWF0aWNhbGx5IGFzc2lnbnMgcHJvcGVydGllcyBhbmQgdGFncyB3aGVuIHlvdSBjcmVhdGUgb3IgbW92ZSBub3Rlcy4gVGhlIFwicGFyYVwiIHByb3BlcnR5IChsb2NrZWQgdG8gdGhpcyBuYW1lKSBhbHdheXMgcmVmbGVjdHMgYSBub3RlXFwncyBjdXJyZW50IFBBUkEgbG9jYXRpb24sIHdoaWxlIHN1YmZvbGRlciB0YWdzIHByb3ZpZGUgaGlzdG9yaWNhbCBjb250ZXh0LicsXG4gICAgICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1ByZXNlcnZlIFN1YmZvbGRlciBUYWdzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdXaGVuIGVuYWJsZWQsIHRhZ3MgZnJvbSBzdWJmb2xkZXIgbmFtZXMgcGVyc2lzdCBldmVuIHdoZW4geW91IG1vdmUgbm90ZXMgYmV0d2VlbiBQQVJBIGZvbGRlcnMuIFRoaXMgcHJlc2VydmVzIHByb2plY3QgY29udGV4dCBvdmVyIHRpbWUuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50YWdnaW5nLnBlcnNpc3RTdWJmb2xkZXJUYWdzKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudGFnZ2luZy5wZXJzaXN0U3ViZm9sZGVyVGFncyA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2hyJyk7XG5cbiAgICAgICAgLy8gVGVtcGxhdGUgTWFuYWdlbWVudCBTZWN0aW9uXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKS5zZXROYW1lKCdQQVJBIFRlbXBsYXRlcycpLnNldEhlYWRpbmcoKTtcblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdNYW5hZ2UgdGhlIGRlZmF1bHQgdGVtcGxhdGVzIHRoYXQgZ2V0IGRlcGxveWVkIHRvIHlvdXIgdmF1bHQuIFRlbXBsYXRlcyBhcmUgc3RvcmVkIGluIFwiMyAtIFJFU09VUkNFUy9URU1QTEFURVMvXCIgYW5kIHVzZSBUZW1wbGF0ZXIgc3ludGF4IGZvciBkeW5hbWljIGNvbnRlbnQuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICB0ZXh0OiAnTm90ZTogVGVtcGxhdGUgZmlsZXMgdGhlbXNlbHZlcyBuZXZlciByZWNlaXZlIFBBUkEgcHJvcGVydGllcyAtIHRoZXkgcmVtYWluIFwiY2xlYW5cIiBzbyBuZXcgbm90ZXMgY3JlYXRlZCBmcm9tIHRoZW0gc3RhcnQgZnJlc2guJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnQXV0by1EZXBsb3kgVGVtcGxhdGVzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdBdXRvbWF0aWNhbGx5IGRlcGxveSB0ZW1wbGF0ZXMgZHVyaW5nIHNldHVwIHdpemFyZCcpXG4gICAgICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGxhdGVzLmF1dG9EZXBsb3lPblNldHVwKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGxhdGVzLmF1dG9EZXBsb3lPblNldHVwID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdDbGVhbiBUZW1wbGF0ZSBGaWxlcycpXG4gICAgICAgICAgICAuc2V0RGVzYygnVXNlIHRoaXMgaWYgd2hlbiB5b3UgY3JlYXRlIG5ldyBub3RlcywgdGhleSBhcmUgYmVpbmcgcHJlLWFzc2lnbmVkIG9kZCB0YWdzIG9yIFBBUkEgcHJvcGVydGllcyB0aGF0IGRvblxcJ3QgbWF0Y2ggdGhlIGZvbGRlciB5b3UgcGxhY2UgdGhlbSBpbi4gVGhpcyByZXNldHMgdGVtcGxhdGUgZmlsZXMgdG8gcmVtb3ZlIGFueSBhY2NpZGVudGFsbHkgc2F2ZWQgZnJvbnRtYXR0ZXIuJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdDbGVhbiBUZW1wbGF0ZXMnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udGFnZ2luZ01hbmFnZXIuY2xlYW5UZW1wbGF0ZUZpbGVzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdocicpO1xuXG4gICAgICAgIC8vIERpYWdub3N0aWNzIFNlY3Rpb25cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoJ0RpYWdub3N0aWNzICYgUHJvZmlsaW5nJykuc2V0SGVhZGluZygpO1xuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdVc2UgdGhlc2Ugb3B0aW9ucyB3aGlsZSB3b3JraW5nIG9uIElzc3VlIEIgKG1vYmlsZSBvcHRpbWl6YXRpb24pIHRvIGNhcHR1cmUgcGVyZm9ybWFuY2UgdGltaW5ncyBhbmQgZXZlbnQgY291bnRzLiBEaXNhYmxlIHByb2ZpbGluZyB3aGVuIG5vdCBhY3RpdmVseSBiZW5jaG1hcmtpbmcuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnRW5hYmxlIHByb2ZpbGluZyBsb2dzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdSZWNvcmRzIHRpbWluZyBkYXRhIGZvciBrZXkgb3BlcmF0aW9ucyBhbmQgd2FybnMgd2hlbiBhIGNhbGwgZXhjZWVkcyB0aGUgY29uZmlndXJlZCB0aHJlc2hvbGQuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5wcm9maWxpbmdFbmFibGVkKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZGlhZ25vc3RpY3MucHJvZmlsaW5nRW5hYmxlZCA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXZhbHVlICYmIHRoaXMucGx1Z2luLnNldHRpbmdzLmRpYWdub3N0aWNzLmxvZ1N1bW1hcnlPblVubG9hZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nUGVyZm9ybWFuY2VTbmFwc2hvdCgncHJvZmlsaW5nLWRpc2FibGVkJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5hcHBseVByb2ZpbGVyU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnU2xvdyBvcGVyYXRpb24gdGhyZXNob2xkIChtcyknKVxuICAgICAgICAgICAgLnNldERlc2MoJ09wZXJhdGlvbnMgdGFraW5nIGxvbmdlciB0aGFuIHRoaXMgd2lsbCB0cmlnZ2VyIGEgY29uc29sZSB3YXJuaW5nLicpXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcbiAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJzIwMCcpXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5zbG93T3BlcmF0aW9uVGhyZXNob2xkTXMpKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGFyc2VkKSAmJiBwYXJzZWQgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5zbG93T3BlcmF0aW9uVGhyZXNob2xkTXMgPSBwYXJzZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmFwcGx5UHJvZmlsZXJTZXR0aW5ncygpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0xvZyBzdW1tYXJ5IG9uIHVubG9hZCcpXG4gICAgICAgICAgICAuc2V0RGVzYygnQXV0b21hdGljYWxseSBsb2dzIGEgcHJvZmlsaW5nIHN1bW1hcnkgd2hlbiB0aGUgcGx1Z2luIHVubG9hZHMgb3IgcHJvZmlsaW5nIGlzIHR1cm5lZCBvZmYuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5sb2dTdW1tYXJ5T25VbmxvYWQpXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5sb2dTdW1tYXJ5T25VbmxvYWQgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0xvZyBzbmFwc2hvdCBub3cnKVxuICAgICAgICAgICAgLnNldERlc2MoJ1dyaXRlcyB0aGUgY3VycmVudCBjb3VudGVycyBhbmQgdGltaW5ncyB0byB0aGUgZGV2ZWxvcGVyIGNvbnNvbGUuJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdMb2cgU25hcHNob3QnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5wcm9maWxpbmdFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCdFbmFibGUgcHJvZmlsaW5nIGJlZm9yZSBsb2dnaW5nIGEgc25hcHNob3QuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nUGVyZm9ybWFuY2VTbmFwc2hvdCgnc2V0dGluZ3MtcGFuZWwnKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnUmVzZXQgcHJvZmlsaW5nIHNlc3Npb24nKVxuICAgICAgICAgICAgLnNldERlc2MoJ0NsZWFycyBhY2N1bXVsYXRlZCBjb3VudGVycy90aW1pbmdzIGFuZCByZXN0YXJ0cyB0aGUgcHJvZmlsaW5nIGNsb2NrLicpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnUmVzZXQgQ291bnRlcnMnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGx1Z2luLnByb2ZpbGVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5wcm9maWxlci5yZXNldCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnUHJvZmlsaW5nIHNlc3Npb24gcmVzZXQuJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2hyJyk7XG5cbiAgICAgICAgLy8gVGFzayBNYW5hZ2VtZW50IFNlY3Rpb25cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoJ1Rhc2sgTWFuYWdlbWVudCcpLnNldEhlYWRpbmcoKTtcbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICB0ZXh0OiAnV2hlbiBub3RlcyBhcmUgbW92ZWQgdG8gQXJjaGl2ZSwgdGhleSBvZnRlbiBjb250YWluIG9wZW4gdGFza3MgdGhhdCBhcmUgbm8gbG9uZ2VyIHJlbGV2YW50LiBVc2UgdGhlc2UgdG9vbHMgdG8gYXV0b21hdGljYWxseSBjYW5jZWwgdGhvc2UgdGFza3MuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnQXV0b21hdGljYWxseSBjYW5jZWwgdGFza3Mgd2hlbiBhcmNoaXZpbmcnKVxuICAgICAgICAgICAgLnNldERlc2MoJ1doZW4gYSBub3RlIGlzIG1vdmVkIHRvIEFyY2hpdmUsIGF1dG9tYXRpY2FsbHkgY2FuY2VsIGFsbCBvcGVuIHRhc2tzIFsgXSBcdTIxOTIgWy1dLiBEaXNhYmxlZCBieSBkZWZhdWx0IGZvciBzYWZldHkuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50YXNrcy5hdXRvQ2FuY2VsT25BcmNoaXZlKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudGFza3MuYXV0b0NhbmNlbE9uQXJjaGl2ZSA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnU2hvdyBub3RpY2VzIGZvciBhdXRvLWNhbmNlbGxlZCB0YXNrcycpXG4gICAgICAgICAgICAuc2V0RGVzYygnRGlzcGxheSBhIG5vdGlmaWNhdGlvbiB3aGVuIHRhc2tzIGFyZSBhdXRvbWF0aWNhbGx5IGNhbmNlbGxlZCBkdXJpbmcgYXJjaGl2aW5nJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50YXNrcy5zaG93Q2FuY2VsbGF0aW9uTm90aWNlcylcbiAgICAgICAgICAgICAgICAub25DaGFuZ2UoYXN5bmMgKHZhbHVlKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnRhc2tzLnNob3dDYW5jZWxsYXRpb25Ob3RpY2VzID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbCkuc2V0TmFtZSgnTWFudWFsIFRhc2sgT3BlcmF0aW9ucycpLnNldEhlYWRpbmcoKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdcdUQ4M0RcdUREMEQgUHJldmlldyBBcmNoaXZlIFRhc2tzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdTZWUgaG93IG1hbnkgb3BlbiB0YXNrcyBleGlzdCBpbiB5b3VyIEFyY2hpdmUgZm9sZGVyIHdpdGhvdXQgbWFraW5nIGFueSBjaGFuZ2VzJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdQcmV2aWV3JylcbiAgICAgICAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnRhc2tNYW5hZ2VyLnByZXZpZXdBcmNoaXZlVGFza0NhbmNlbGxhdGlvbigpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdcdTI3NEMgQ2FuY2VsIEFyY2hpdmUgVGFza3MnKVxuICAgICAgICAgICAgLnNldERlc2MoJ0NhbmNlbCBhbGwgb3BlbiB0YXNrcyBpbiBBcmNoaXZlIGZvbGRlciAoY29udmVydHMgWyBdIHRvIFstXSkuIFRoaXMgaXMgdXNlZnVsIGZvciBjbGVhbmluZyB1cCBkdXBsaWNhdGl2ZSBvciBjYW5jZWxsZWQgdGFza3MuJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdDYW5jZWwgQXJjaGl2ZSBUYXNrcycpXG4gICAgICAgICAgICAgICAgLnNldFdhcm5pbmcoKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGNvbmZpcm0oJ1RoaXMgd2lsbCBjYW5jZWwgYWxsIG9wZW4gdGFza3MgaW4geW91ciBBcmNoaXZlIGZvbGRlciBieSBjb252ZXJ0aW5nIFsgXSB0byBbLV0uIFRoaXMgY2Fubm90IGJlIHVuZG9uZSBleGNlcHQgdGhyb3VnaCB1bmRvIGhpc3RvcnkuXFxuXFxuQ29udGludWU/JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnRhc2tNYW5hZ2VyLmNhbmNlbEFyY2hpdmVUYXNrcygpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1x1Mjc0QyBDYW5jZWwgQ3VycmVudCBGaWxlIFRhc2tzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdDYW5jZWwgYWxsIG9wZW4gdGFza3MgaW4gdGhlIGN1cnJlbnRseSBhY3RpdmUgZmlsZScpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnQ2FuY2VsIEN1cnJlbnQgRmlsZScpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi50YXNrTWFuYWdlci5jYW5jZWxDdXJyZW50RmlsZVRhc2tzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgdGV4dDogJ1RpcDogWW91IGNhbiBhbHNvIGFjY2VzcyB0aGVzZSBjb21tYW5kcyBmcm9tIHRoZSBDb21tYW5kIFBhbGV0dGUgKEN0cmwvQ21kK1ApLicsXG4gICAgICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdocicpO1xuXG4gICAgICAgIC8vIEFkdmFuY2VkIFNlY3Rpb25cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpLnNldE5hbWUoJ0FkdmFuY2VkIFNldHRpbmdzJykuc2V0SGVhZGluZygpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1Jlc2V0IHRvIERlZmF1bHRzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdcdTI2QTBcdUZFMEYgV0FSTklORzogVGhpcyB3aWxsIHJlc3RvcmUgYWxsIHNldHRpbmdzIHRvIGRlZmF1bHRzIEFORCByZWdlbmVyYXRlIGFsbCB0ZW1wbGF0ZXMgZnJvbSBkZWZhdWx0cywgb3ZlcndyaXRpbmcgYW55IGN1c3RvbWl6YXRpb25zIHlvdSBtYWRlLiBZb3VyIGZvbGRlcnMgYW5kIG5vdGVzIHdpbGwgbm90IGJlIGFmZmVjdGVkLicpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnUmVzZXQgQWxsIFNldHRpbmdzJylcbiAgICAgICAgICAgICAgICAuc2V0V2FybmluZygpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBpZiAoY29uZmlybSgnXHUyNkEwXHVGRTBGIFdBUk5JTkc6IFRoaXMgd2lsbDpcXG5cXG4xLiBSZXNldCBBTEwgcGx1Z2luIHNldHRpbmdzIHRvIGRlZmF1bHRzXFxuMi4gT1ZFUldSSVRFIGFsbCB0ZW1wbGF0ZXMgd2l0aCBkZWZhdWx0cyAoeW91ciBjdXN0b20gdGVtcGxhdGUgY2hhbmdlcyB3aWxsIGJlIGxvc3QpXFxuXFxuWW91ciBmb2xkZXJzIGFuZCBub3RlcyB3aWxsIE5PVCBiZSBhZmZlY3RlZC5cXG5cXG5BcmUgeW91IHN1cmUgeW91IHdhbnQgdG8gY29udGludWU/JykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFJlc2V0IHNldHRpbmdzXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZvcmNlIHJlZ2VuZXJhdGUgYWxsIHRlbXBsYXRlc1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udGVtcGxhdGVNYW5hZ2VyLmZvcmNlUmVnZW5lcmF0ZUFsbFRlbXBsYXRlcygpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBSZWZyZXNoIHNldHRpbmdzIFVJXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmRpc3BsYXkoKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pKTtcbiAgICB9XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIE1BSU4gUExVR0lOIENMQVNTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbm1vZHVsZS5leHBvcnRzID0gY2xhc3MgUXVpY2tQYXJhUGx1Z2luIGV4dGVuZHMgUGx1Z2luIHtcbiAgICBhc3luYyBvbmxvYWQoKSB7XG4gICAgICAgIC8vIExvYWQgc2V0dGluZ3NcbiAgICAgICAgYXdhaXQgdGhpcy5sb2FkU2V0dGluZ3MoKTtcbiAgICAgICAgdGhpcy5pbml0aWFsaXplUHJvZmlsZXIoKTtcbiAgICAgICAgY29uc3Qgb25sb2FkVGltZXIgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgncGx1Z2luOm9ubG9hZCcpO1xuXG4gICAgICAgIC8vIEluaXRpYWxpemUgbWFuYWdlcnMgKG9yZGVyIG1hdHRlcnM6IHRhc2tNYW5hZ2VyIG11c3QgZXhpc3QgYmVmb3JlIHRhZ2dpbmdNYW5hZ2VyKVxuICAgICAgICB0aGlzLmRlcGVuZGVuY3lNYW5hZ2VyID0gbmV3IERlcGVuZGVuY3lNYW5hZ2VyKHRoaXMuYXBwKTtcbiAgICAgICAgdGhpcy5wcm92aXNpb25pbmdNYW5hZ2VyID0gbmV3IFByb3Zpc2lvbmluZ01hbmFnZXIodGhpcy5hcHAsIHRoaXMuc2V0dGluZ3MpO1xuICAgICAgICB0aGlzLnRhc2tNYW5hZ2VyID0gbmV3IFRhc2tNYW5hZ2VyKHRoaXMuYXBwLCB0aGlzLnNldHRpbmdzLCB0aGlzLnByb2ZpbGVyKTtcbiAgICAgICAgdGhpcy50YWdnaW5nTWFuYWdlciA9IG5ldyBUYWdnaW5nTWFuYWdlcih0aGlzLmFwcCwgdGhpcy5zZXR0aW5ncywgdGhpcy5wcm9maWxlciwgdGhpcy50YXNrTWFuYWdlcik7XG4gICAgICAgIHRoaXMuYWdlbmRhTWFuYWdlciA9IG5ldyBBZ2VuZGFNYW5hZ2VyKHRoaXMuYXBwLCB0aGlzLnNldHRpbmdzLCB0aGlzLnByb2ZpbGVyKTtcbiAgICAgICAgdGhpcy50ZW1wbGF0ZU1hbmFnZXIgPSBuZXcgVGVtcGxhdGVNYW5hZ2VyKHRoaXMuYXBwLCB0aGlzLnNldHRpbmdzLCB0aGlzLnByb2ZpbGVyKTtcblxuICAgICAgICAvLyBDaGVjayBkZXBlbmRlbmNpZXMgb24gbG9hZFxuICAgICAgICBhd2FpdCB0aGlzLmNoZWNrRGVwZW5kZW5jaWVzKCk7XG5cbiAgICAgICAgLy8gUmVnaXN0ZXIgZmlsZSBldmVudCBsaXN0ZW5lcnMgZm9yIGF1dG8tdGFnZ2luZ1xuICAgICAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICAgICAgICB0aGlzLmFwcC52YXVsdC5vbigncmVuYW1lJywgYXN5bmMgKGZpbGUsIG9sZFBhdGgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmlsZS5leHRlbnNpb24gIT09ICdtZCcpIHJldHVybjtcbiAgICAgICAgICAgICAgICBpZiAob2xkUGF0aCAhPT0gZmlsZS5wYXRoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmluY3JlbWVudCgnZXZlbnRzOnJlbmFtZScpO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYW5kbGUgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgnZXZlbnRzOnJlbmFtZTp1cGRhdGUnKTtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMudGFnZ2luZ01hbmFnZXIudXBkYXRlUGFyYVRhZ3MoZmlsZSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQoaGFuZGxlLCB7IHBhdGg6IGZpbGUucGF0aCB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG5cbiAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgICAgICAgdGhpcy5hcHAudmF1bHQub24oJ2NyZWF0ZScsIGFzeW5jIChmaWxlKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uICE9PSAnbWQnKSByZXR1cm47XG4gICAgICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uaW5jcmVtZW50KCdldmVudHM6Y3JlYXRlJyk7XG4gICAgICAgICAgICAgICAgLy8gTG9uZ2VyIGRlbGF5IHRvIGxldCBUZW1wbGF0ZXIgZmluaXNoIHdyaXRpbmdcbiAgICAgICAgICAgICAgICBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFuZGxlID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ2V2ZW50czpjcmVhdGU6dXBkYXRlJyk7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnRhZ2dpbmdNYW5hZ2VyLnVwZGF0ZVBhcmFUYWdzKGZpbGUpO1xuICAgICAgICAgICAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKGhhbmRsZSwgeyBwYXRoOiBmaWxlLnBhdGggfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9LCA1MDApO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcblxuICAgICAgICAvLyBBbHNvIGxpc3RlbiBmb3IgbW9kaWZ5IGV2ZW50cyB0byBjYXRjaCBUZW1wbGF0ZXIgdXBkYXRlc1xuICAgICAgICB0aGlzLnJlZ2lzdGVyRXZlbnQoXG4gICAgICAgICAgICB0aGlzLmFwcC52YXVsdC5vbignbW9kaWZ5JywgYXN5bmMgKGZpbGUpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoZmlsZS5leHRlbnNpb24gIT09ICdtZCcpIHJldHVybjtcbiAgICAgICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5pbmNyZW1lbnQoJ2V2ZW50czptb2RpZnknKTtcblxuICAgICAgICAgICAgICAgIC8vIE9ubHkgcHJvY2VzcyByZWNlbnQgZmlsZXMgKGNyZWF0ZWQgaW4gbGFzdCA1IHNlY29uZHMpXG4gICAgICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZpbGUuc3RhdCA/PyBhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLnN0YXQoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlQWdlID0gRGF0ZS5ub3coKSAtIHN0YXQuY3RpbWU7XG5cbiAgICAgICAgICAgICAgICBpZiAoZmlsZUFnZSA8IDUwMDApIHsgIC8vIEZpbGUgY3JlYXRlZCBpbiBsYXN0IDUgc2Vjb25kc1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBoYW5kbGUgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgnZXZlbnRzOm1vZGlmeTp1cGRhdGUnKTtcbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMudGFnZ2luZ01hbmFnZXIudXBkYXRlUGFyYVRhZ3MoZmlsZSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQoaGFuZGxlLCB7IHBhdGg6IGZpbGUucGF0aCwgZmlsZUFnZSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmluY3JlbWVudCgnZXZlbnRzOm1vZGlmeTpza2lwcGVkLWFnZScpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gUmVnaXN0ZXIgY29tbWFuZHNcbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgICAgICAgIGlkOiAnc2V0dXAtcGFyYScsXG4gICAgICAgICAgICBuYW1lOiAnUnVuIFBBUkEgU2V0dXAgV2l6YXJkJyxcbiAgICAgICAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wcm92aXNpb25pbmdNYW5hZ2VyLnJ1blNldHVwV2l6YXJkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICAgICAgICBpZDogJ3VwZGF0ZS1wYXJhLXRhZ3MnLFxuICAgICAgICAgICAgbmFtZTogJ1VwZGF0ZSBQQVJBIHRhZ3MgZm9yIGN1cnJlbnQgZmlsZScsXG4gICAgICAgICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IGZpbGUgPSB0aGlzLmFwcC53b3Jrc3BhY2UuZ2V0QWN0aXZlRmlsZSgpO1xuICAgICAgICAgICAgICAgIGlmIChmaWxlKSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMudGFnZ2luZ01hbmFnZXIudXBkYXRlUGFyYVRhZ3MoZmlsZSk7XG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1BBUkEgdGFncyB1cGRhdGVkIScpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoJ05vIGFjdGl2ZSBmaWxlJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICd1cGRhdGUtYWxsLXBhcmEtdGFncycsXG4gICAgICAgICAgICBuYW1lOiAnVXBkYXRlIFBBUkEgdGFncyBmb3IgYWxsIGZpbGVzJyxcbiAgICAgICAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy50YWdnaW5nTWFuYWdlci5idWxrVXBkYXRlVGFncygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICdkZXBsb3ktdGVtcGxhdGVzJyxcbiAgICAgICAgICAgIG5hbWU6ICdEZXBsb3kgUEFSQSB0ZW1wbGF0ZXMnLFxuICAgICAgICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnRlbXBsYXRlTWFuYWdlci5kZXBsb3lBbGxUZW1wbGF0ZXMoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgICAgICAgIGlkOiAnY2xlYW4tdGVtcGxhdGUtZmlsZXMnLFxuICAgICAgICAgICAgbmFtZTogJ0NsZWFuIFBBUkEgcHJvcGVydGllcyBmcm9tIHRlbXBsYXRlIGZpbGVzJyxcbiAgICAgICAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy50YWdnaW5nTWFuYWdlci5jbGVhblRlbXBsYXRlRmlsZXMoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgICAgICAgIGlkOiAnbG9nLXBlcmZvcm1hbmNlLXNuYXBzaG90JyxcbiAgICAgICAgICAgIG5hbWU6ICdMb2cgcHJvZmlsaW5nIHNuYXBzaG90IHRvIGNvbnNvbGUnLFxuICAgICAgICAgICAgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3M/LnByb2ZpbGluZ0VuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnRW5hYmxlIHByb2ZpbGluZyBpbiBzZXR0aW5ncyBiZWZvcmUgbG9nZ2luZyBhIHNuYXBzaG90LicpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMubG9nUGVyZm9ybWFuY2VTbmFwc2hvdCgnY29tbWFuZCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICdjaGVjay1kZXBlbmRlbmNpZXMnLFxuICAgICAgICAgICAgbmFtZTogJ0NoZWNrIHBsdWdpbiBkZXBlbmRlbmNpZXMnLFxuICAgICAgICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoZWNrRGVwZW5kZW5jaWVzKHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICdjYW5jZWwtYXJjaGl2ZS10YXNrcycsXG4gICAgICAgICAgICBuYW1lOiAnQ2FuY2VsIGFsbCBvcGVuIHRhc2tzIGluIEFyY2hpdmUgZm9sZGVyJyxcbiAgICAgICAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy50YXNrTWFuYWdlci5jYW5jZWxBcmNoaXZlVGFza3MoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgICAgICAgIGlkOiAnY2FuY2VsLWN1cnJlbnQtZmlsZS10YXNrcycsXG4gICAgICAgICAgICBuYW1lOiAnQ2FuY2VsIGFsbCBvcGVuIHRhc2tzIGluIGN1cnJlbnQgZmlsZScsXG4gICAgICAgICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMudGFza01hbmFnZXIuY2FuY2VsQ3VycmVudEZpbGVUYXNrcygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICdwcmV2aWV3LWFyY2hpdmUtdGFzay1jYW5jZWxsYXRpb24nLFxuICAgICAgICAgICAgbmFtZTogJ1ByZXZpZXcgYXJjaGl2ZSB0YXNrIGNhbmNlbGxhdGlvbiAoZHJ5IHJ1biknLFxuICAgICAgICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnRhc2tNYW5hZ2VyLnByZXZpZXdBcmNoaXZlVGFza0NhbmNlbGxhdGlvbigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBBZGQgc2V0dGluZ3MgdGFiXG4gICAgICAgIHRoaXMuYWRkU2V0dGluZ1RhYihuZXcgUXVpY2tQYXJhU2V0dGluZ1RhYih0aGlzLmFwcCwgdGhpcykpO1xuXG4gICAgICAgIC8vIEZpcnN0LXJ1biBjaGVja1xuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5maXJzdFJ1bikge1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5oYW5kbGVGaXJzdFJ1bigpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKG9ubG9hZFRpbWVyLCB7IHN0YXR1czogJ2xvYWRlZCcgfSk7XG4gICAgfVxuXG4gICAgaW5pdGlhbGl6ZVByb2ZpbGVyKCkge1xuICAgICAgICB0aGlzLnByb2ZpbGVyID0gbmV3IFBlcmZvcm1hbmNlUHJvZmlsZXIoe1xuICAgICAgICAgICAgZW5hYmxlZDogdGhpcy5zZXR0aW5ncz8uZGlhZ25vc3RpY3M/LnByb2ZpbGluZ0VuYWJsZWQsXG4gICAgICAgICAgICBzbG93VGhyZXNob2xkOiB0aGlzLnNldHRpbmdzPy5kaWFnbm9zdGljcz8uc2xvd09wZXJhdGlvblRocmVzaG9sZE1zXG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGFwcGx5UHJvZmlsZXJTZXR0aW5ncygpIHtcbiAgICAgICAgaWYgKCF0aGlzLnByb2ZpbGVyKSB7XG4gICAgICAgICAgICB0aGlzLmluaXRpYWxpemVQcm9maWxlcigpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wcm9maWxlci5jb25maWd1cmUoe1xuICAgICAgICAgICAgc2xvd1RocmVzaG9sZDogdGhpcy5zZXR0aW5ncz8uZGlhZ25vc3RpY3M/LnNsb3dPcGVyYXRpb25UaHJlc2hvbGRNc1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5wcm9maWxlci5zZXRFbmFibGVkKHRoaXMuc2V0dGluZ3M/LmRpYWdub3N0aWNzPy5wcm9maWxpbmdFbmFibGVkKTtcbiAgICB9XG5cbiAgICBsb2dQZXJmb3JtYW5jZVNuYXBzaG90KHJlYXNvbiA9ICdtYW51YWwnKSB7XG4gICAgICAgIGlmICghdGhpcy5wcm9maWxlcikge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdRdWljayBQQVJBOiBQcm9maWxlciBub3QgaW5pdGlhbGl6ZWQnKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMucHJvZmlsZXIubG9nU3VtbWFyeShyZWFzb24pO1xuICAgIH1cblxuICAgIGFzeW5jIGNoZWNrRGVwZW5kZW5jaWVzKHNob3dOb3RpY2UgPSBmYWxzZSkge1xuICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLmRlcGVuZGVuY3lNYW5hZ2VyLmNoZWNrRGVwZW5kZW5jaWVzKCk7XG5cbiAgICAgICAgaWYgKCFyZXN1bHQuYWxsTWV0KSB7XG4gICAgICAgICAgICBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuZGVwZW5kZW5jeU1hbmFnZXIuc2hvd0RlcGVuZGVuY3lXYXJuaW5nKHJlc3VsdC5taXNzaW5nKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGNvbnNvbGUud2FybignUXVpY2sgUEFSQTogU29tZSBkZXBlbmRlbmNpZXMgYXJlIG1pc3NpbmcnLCByZXN1bHQubWlzc2luZyk7XG4gICAgICAgIH0gZWxzZSBpZiAoc2hvd05vdGljZSkge1xuICAgICAgICAgICAgbmV3IE5vdGljZSgnQWxsIGRlcGVuZGVuY2llcyBhcmUgaW5zdGFsbGVkIScpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBhc3luYyBoYW5kbGVGaXJzdFJ1bigpIHtcbiAgICAgICAgLy8gV2FpdCBhIGJpdCBmb3IgT2JzaWRpYW4gdG8gZnVsbHkgbG9hZFxuICAgICAgICBzZXRUaW1lb3V0KGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1dlbGNvbWUgdG8gUXVpY2sgUEFSQSEgQ2xpY2sgdGhlIGdyaWQgaWNvbiB0byBydW4gc2V0dXAuJyk7XG5cbiAgICAgICAgICAgIC8vIE1hcmsgZmlyc3QgcnVuIGFzIGNvbXBsZXRlXG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzLmZpcnN0UnVuID0gZmFsc2U7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9LCAyMDAwKTtcbiAgICB9XG5cbiAgICBhc3luYyBsb2FkU2V0dGluZ3MoKSB7XG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLCBhd2FpdCB0aGlzLmxvYWREYXRhKCkpO1xuXG4gICAgICAgIC8vIE1pZ3JhdGlvbjogQ29udmVydCBvbGQgYWdlbmRhR2VuZXJhdGlvbiBzZXR0aW5ncyB0byBuZXcgcHJvamVjdFVwZGF0ZXMgaWYgbmVlZGVkXG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLmFnZW5kYUdlbmVyYXRpb24gJiYgIXRoaXMuc2V0dGluZ3MucHJvamVjdFVwZGF0ZXMpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLnNldHRpbmdzLmRpYWdub3N0aWNzPy5wcm9maWxpbmdFbmFibGVkKSB7IGNvbnNvbGUubG9nKCdNaWdyYXRpbmcgb2xkIGFnZW5kYUdlbmVyYXRpb24gc2V0dGluZ3MgdG8gcHJvamVjdFVwZGF0ZXMnKTsgfVxuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcyA9IHtcbiAgICAgICAgICAgICAgICBlbmFibGVkOiB0aGlzLnNldHRpbmdzLmFnZW5kYUdlbmVyYXRpb24uZW5hYmxlZCB8fCBmYWxzZSxcbiAgICAgICAgICAgICAgICBrYW5iYW5GaWxlOiB0aGlzLnNldHRpbmdzLmFnZW5kYUdlbmVyYXRpb24ua2FuYmFuRmlsZSB8fCAnMCAtIElOQk9YL1Byb2plY3QgRGFzaGJvYXJkLm1kJyxcbiAgICAgICAgICAgICAgICBjb25maWdzOiBbXVxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIC8vIE9sZCBzZXR0aW5ncyBhcmUgcHJlc2VydmVkIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5IGJ1dCBub3QgYWN0aXZlbHkgdXNlZFxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRW5zdXJlIG5ldyBzZXR0aW5ncyBzdHJ1Y3R1cmUgZXhpc3RzXG4gICAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcykge1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcyA9IERFRkFVTFRfU0VUVElOR1MucHJvamVjdFVwZGF0ZXM7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFbnN1cmUga2FuYmFuRmlsZSBleGlzdHMgaW4gcHJvamVjdFVwZGF0ZXNcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLnByb2plY3RVcGRhdGVzLmthbmJhbkZpbGUpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MucHJvamVjdFVwZGF0ZXMua2FuYmFuRmlsZSA9ICcwIC0gSU5CT1gvUHJvamVjdCBEYXNoYm9hcmQubWQnO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVtb3ZlIG1pZ3JhdGVPbGRUYWdzIGlmIGl0IGV4aXN0cyAobm8gbG9uZ2VyIHJlbGV2YW50IGZvciBuZXcgdXNlcnMpXG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLnRhZ2dpbmcgJiYgdGhpcy5zZXR0aW5ncy50YWdnaW5nLm1pZ3JhdGVPbGRUYWdzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnNldHRpbmdzLnRhZ2dpbmcubWlncmF0ZU9sZFRhZ3M7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MgPSB7IC4uLkRFRkFVTFRfU0VUVElOR1MuZGlhZ25vc3RpY3MgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MgPSBPYmplY3QuYXNzaWduKHt9LCBERUZBVUxUX1NFVFRJTkdTLmRpYWdub3N0aWNzLCB0aGlzLnNldHRpbmdzLmRpYWdub3N0aWNzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIHNhdmVTZXR0aW5ncygpIHtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlRGF0YSh0aGlzLnNldHRpbmdzKTtcbiAgICB9XG5cbiAgICBvbnVubG9hZCgpIHtcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3M/LmRpYWdub3N0aWNzPy5wcm9maWxpbmdFbmFibGVkICYmIHRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MubG9nU3VtbWFyeU9uVW5sb2FkKSB7XG4gICAgICAgICAgICB0aGlzLmxvZ1BlcmZvcm1hbmNlU25hcHNob3QoJ3BsdWdpbi11bmxvYWQnKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7QUFBQTtBQUFBLGdDQUFBQSxVQUFBQyxTQUFBO0FBQUEsUUFBTUMsdUJBQU4sTUFBMEI7QUFBQSxNQUN0QixZQUFZLFVBQVUsQ0FBQyxHQUFHO0FBRDlCO0FBRVEsYUFBSyxXQUFVLGFBQVEsWUFBUixZQUFtQjtBQUNsQyxhQUFLLGlCQUFnQixhQUFRLGtCQUFSLFlBQXlCO0FBQzlDLGFBQUssTUFBTTtBQUFBLE1BQ2Y7QUFBQSxNQUVBLFFBQVE7QUFDSixhQUFLLFNBQVMsb0JBQUksSUFBSTtBQUN0QixhQUFLLFFBQVEsb0JBQUksSUFBSTtBQUNyQixhQUFLLFdBQVcsb0JBQUksSUFBSTtBQUN4QixhQUFLLGVBQWUsS0FBSyxJQUFJO0FBQzdCLGFBQUssZUFBZTtBQUFBLE1BQ3hCO0FBQUEsTUFFQSxNQUFNO0FBQ0YsWUFBSSxPQUFPLGdCQUFnQixlQUFlLE9BQU8sWUFBWSxRQUFRLFlBQVk7QUFDN0UsaUJBQU8sWUFBWSxJQUFJO0FBQUEsUUFDM0I7QUFDQSxlQUFPLEtBQUssSUFBSTtBQUFBLE1BQ3BCO0FBQUEsTUFFQSxXQUFXLFNBQVM7QUFDaEIsWUFBSSxLQUFLLFlBQVksU0FBUztBQUMxQjtBQUFBLFFBQ0o7QUFFQSxhQUFLLFVBQVU7QUFD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O0FBQUE7QUFBQTtBQUFBO0FBQUEsTUE2QnhCLHFCQUFxQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUE2QnJCLHlCQUF5QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUE2QnpCLHVCQUF1QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BK0J2Qix3QkFBd0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUFzRHhCLDJCQUEyQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxJQTBML0I7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSx5QkFBeUI7QUFDckIsV0FBTyxPQUFPLEtBQUssS0FBSyxTQUFTO0FBQUEsRUFDckM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLFlBQVksY0FBYztBQUN0QixXQUFPLEtBQUssVUFBVSxZQUFZO0FBQUEsRUFDdEM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBTSxlQUFlLGNBQWMsYUFBYTtBQW5uQ3BEO0FBb25DUSxVQUFNLFNBQVEsVUFBSyxhQUFMLG1CQUFlLE1BQU07QUFDbkMsVUFBTSxVQUFVLEVBQUUsY0FBYyxZQUFZO0FBQzVDLFVBQU0sVUFBVSxLQUFLLFlBQVksWUFBWTtBQUU3QyxRQUFJLENBQUMsU0FBUztBQUNWLFlBQU0sSUFBSSxNQUFNLHVCQUF1QixZQUFZLEVBQUU7QUFBQSxJQUN6RDtBQUdBLFVBQU0sYUFBYSxZQUFZLFVBQVUsR0FBRyxZQUFZLFlBQVksR0FBRyxDQUFDO0FBQ3hFLFFBQUksY0FBYyxDQUFDLEtBQUssSUFBSSxNQUFNLHNCQUFzQixVQUFVLEdBQUc7QUFDakUsWUFBTSxLQUFLLElBQUksTUFBTSxhQUFhLFVBQVU7QUFBQSxJQUNoRDtBQUdBLFVBQU0sZUFBZSxLQUFLLElBQUksTUFBTSxzQkFBc0IsV0FBVztBQUVyRSxRQUFJLFNBQVMsRUFBRSxRQUFRLFdBQVcsUUFBUSxTQUFTO0FBQ25ELFFBQUk7QUFDQSxVQUFJLGNBQWM7QUFFZCxpQkFBUyxFQUFFLFFBQVEsV0FBVyxRQUFRLFNBQVM7QUFBQSxNQUNuRCxPQUFPO0FBRUgsY0FBTSxLQUFLLElBQUksTUFBTSxPQUFPLGFBQWEsT0FBTztBQUNoRCxpQkFBUyxFQUFFLFFBQVEsVUFBVTtBQUFBLE1BQ2pDO0FBQ0EsYUFBTztBQUFBLElBQ1gsVUFBRTtBQUNFLGlCQUFLLGFBQUwsbUJBQWUsSUFBSSxPQUFPLEVBQUUsR0FBRyxTQUFTLFFBQVEsT0FBTyxPQUFPO0FBQUEsSUFDbEU7QUFBQSxFQUNKO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQU0scUJBQXFCO0FBenBDL0I7QUEwcENRLFVBQU0sU0FBUSxVQUFLLGFBQUwsbUJBQWUsTUFBTTtBQUNuQyxRQUFJLFVBQVU7QUFDZCxRQUFJLFVBQVU7QUFDZCxRQUFJLFNBQVM7QUFFYixRQUFJO0FBQ0EsVUFBSSxPQUFPLDZCQUE2QjtBQUV4QyxZQUFNLHNCQUFzQjtBQUFBLFFBQ3hCLHVCQUF1QjtBQUFBLFFBQ3ZCLHFCQUFxQjtBQUFBLFFBQ3JCLHdCQUF3QjtBQUFBLFFBQ3hCLHFCQUFxQjtBQUFBLFFBQ3JCLHlCQUF5QjtBQUFBLFFBQ3pCLHVCQUF1QjtBQUFBLFFBQ3ZCLHdCQUF3QjtBQUFBLFFBQ3hCLDJCQUEyQjtBQUFBLE1BQy9CO0FBRUEsaUJBQVcsQ0FBQyxjQUFjLFdBQVcsS0FBSyxPQUFPLFFBQVEsbUJBQW1CLEdBQUc7QUFDM0UsWUFBSTtBQUNBLGdCQUFNLFNBQVMsTUFBTSxLQUFLLGVBQWUsY0FBYyxXQUFXO0FBQ2xFLGNBQUksT0FBTyxXQUFXLFdBQVc7QUFDN0I7QUFBQSxVQUNKLFdBQVcsT0FBTyxXQUFXLFdBQVc7QUFDcEM7QUFBQSxVQUNKO0FBQUEsUUFDSixTQUFTLE9BQU87QUFDWixrQkFBUSxNQUFNLG9CQUFvQixZQUFZLEtBQUssS0FBSztBQUN4RDtBQUFBLFFBQ0o7QUFBQSxNQUNKO0FBR0EsWUFBTSxRQUFRLENBQUM7QUFDZixVQUFJLFVBQVUsRUFBRyxPQUFNLEtBQUssR0FBRyxPQUFPLFVBQVU7QUFDaEQsVUFBSSxVQUFVLEVBQUcsT0FBTSxLQUFLLEdBQUcsT0FBTyxVQUFVO0FBQ2hELFVBQUksU0FBUyxFQUFHLE9BQU0sS0FBSyxHQUFHLE1BQU0sU0FBUztBQUU3QyxVQUFJLE9BQU8sY0FBYyxNQUFNLEtBQUssSUFBSSxDQUFDLEVBQUU7QUFBQSxJQUMvQyxTQUFTLE9BQU87QUFDWixjQUFRLE1BQU0sOEJBQThCLEtBQUs7QUFDakQsVUFBSSxPQUFPLDhCQUE4QixNQUFNLE9BQU8sSUFBSSxHQUFJO0FBQUEsSUFDbEUsVUFBRTtBQUNFLGlCQUFLLGFBQUwsbUJBQWUsSUFBSSxPQUFPLEVBQUUsU0FBUyxTQUFTLE9BQU87QUFBQSxJQUN6RDtBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBTSw4QkFBOEI7QUE5c0N4QztBQStzQ1EsVUFBTSxTQUFRLFVBQUssYUFBTCxtQkFBZSxNQUFNO0FBQ25DLFFBQUksY0FBYztBQUVsQixRQUFJO0FBQ0EsVUFBSSxPQUFPLDZDQUE2QztBQUV4RCxZQUFNLHNCQUFzQjtBQUFBLFFBQ3hCLHVCQUF1QjtBQUFBLFFBQ3ZCLHFCQUFxQjtBQUFBLFFBQ3JCLHdCQUF3QjtBQUFBLFFBQ3hCLHFCQUFxQjtBQUFBLFFBQ3JCLHlCQUF5QjtBQUFBLFFBQ3pCLHVCQUF1QjtBQUFBLFFBQ3ZCLHdCQUF3QjtBQUFBLFFBQ3hCLDJCQUEyQjtBQUFBLE1BQy9CO0FBRUEsaUJBQVcsQ0FBQyxjQUFjLFdBQVcsS0FBSyxPQUFPLFFBQVEsbUJBQW1CLEdBQUc7QUFDM0UsWUFBSTtBQUNBLGdCQUFNLFVBQVUsS0FBSyxZQUFZLFlBQVk7QUFHN0MsZ0JBQU0sYUFBYSxZQUFZLFVBQVUsR0FBRyxZQUFZLFlBQVksR0FBRyxDQUFDO0FBQ3hFLGNBQUksY0FBYyxDQUFDLEtBQUssSUFBSSxNQUFNLHNCQUFzQixVQUFVLEdBQUc7QUFDakUsa0JBQU0sS0FBSyxJQUFJLE1BQU0sYUFBYSxVQUFVO0FBQUEsVUFDaEQ7QUFFQSxnQkFBTSxlQUFlLEtBQUssSUFBSSxNQUFNLHNCQUFzQixXQUFXO0FBRXJFLGNBQUksY0FBYztBQUVkLGtCQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sY0FBYyxPQUFPO0FBQUEsVUFDckQsT0FBTztBQUVILGtCQUFNLEtBQUssSUFBSSxNQUFNLE9BQU8sYUFBYSxPQUFPO0FBQUEsVUFDcEQ7QUFDQTtBQUFBLFFBQ0osU0FBUyxPQUFPO0FBQ1osa0JBQVEsTUFBTSx3QkFBd0IsWUFBWSxLQUFLLEtBQUs7QUFBQSxRQUNoRTtBQUFBLE1BQ0o7QUFFQSxVQUFJLE9BQU8sZUFBZSxXQUFXLDJCQUEyQjtBQUFBLElBQ3BFLFNBQVMsT0FBTztBQUNaLGNBQVEsTUFBTSxpQ0FBaUMsS0FBSztBQUNwRCxVQUFJLE9BQU8saUNBQWlDLE1BQU0sT0FBTyxJQUFJLEdBQUk7QUFBQSxJQUNyRSxVQUFFO0FBQ0UsaUJBQUssYUFBTCxtQkFBZSxJQUFJLE9BQU8sRUFBRSxZQUFZO0FBQUEsSUFDNUM7QUFBQSxFQUNKO0FBQ0o7QUFNQSxJQUFNLGdCQUFOLE1BQW9CO0FBQUEsRUFDaEIsWUFBWSxLQUFLLFVBQVUsVUFBVTtBQUNqQyxTQUFLLE1BQU07QUFDWCxTQUFLLFdBQVc7QUFDaEIsU0FBSyxXQUFXO0FBQUEsRUFDcEI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsb0JBQW9CO0FBQ2hCLFVBQU0sUUFBUSxvQkFBSSxLQUFLO0FBQ3ZCLFVBQU0sWUFBWSxNQUFNLE9BQU87QUFFL0IsUUFBSTtBQUNKLFFBQUksY0FBYyxHQUFHO0FBRWpCLHdCQUFrQjtBQUFBLElBQ3RCLFdBQVcsY0FBYyxHQUFHO0FBRXhCLHdCQUFrQjtBQUFBLElBQ3RCLE9BQU87QUFFSCx3QkFBa0IsSUFBSTtBQUFBLElBQzFCO0FBRUEsVUFBTSxTQUFTLElBQUksS0FBSyxLQUFLO0FBQzdCLFdBQU8sUUFBUSxNQUFNLFFBQVEsSUFBSSxlQUFlO0FBRWhELFVBQU0sUUFBUSxPQUFPLE9BQU8sU0FBUyxJQUFJLENBQUMsRUFBRSxTQUFTLEdBQUcsR0FBRztBQUMzRCxVQUFNLE1BQU0sT0FBTyxPQUFPLFFBQVEsQ0FBQyxFQUFFLFNBQVMsR0FBRyxHQUFHO0FBQ3BELFVBQU0sT0FBTyxPQUFPLE9BQU8sWUFBWSxDQUFDLEVBQUUsTUFBTSxFQUFFO0FBRWxELFdBQU8sR0FBRyxLQUFLLElBQUksR0FBRyxJQUFJLElBQUk7QUFBQSxFQUNsQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxNQUFNLGlCQUFpQixZQUFZO0FBaHpDdkM7QUFrekNRLFVBQU0sWUFBWSxnQkFBYyxVQUFLLFNBQVMsbUJBQWQsbUJBQThCLGVBQWM7QUFDNUUsVUFBTSxTQUFRLFVBQUssYUFBTCxtQkFBZSxNQUFNO0FBQ25DLFVBQU0sVUFBVSxFQUFFLFVBQVU7QUFDNUIsUUFBSSxPQUFPLEtBQUssSUFBSSxNQUFNLHNCQUFzQixTQUFTO0FBQ3pELFFBQUksV0FBVztBQUVmLFFBQUk7QUFDQSxVQUFJLENBQUMsTUFBTTtBQUVQLFlBQUksT0FBTyx3REFBd0Q7QUFDbkUsY0FBTSxrQkFBa0IsSUFBSSxnQkFBZ0IsS0FBSyxLQUFLLEtBQUssVUFBVSxLQUFLLFFBQVE7QUFFbEYsWUFBSTtBQUNBLGdCQUFNLGdCQUFnQixlQUFlLHdCQUF3QixTQUFTO0FBQ3RFLGlCQUFPLEtBQUssSUFBSSxNQUFNLHNCQUFzQixTQUFTO0FBRXJELGNBQUksQ0FBQyxNQUFNO0FBQ1Asa0JBQU0sSUFBSSxNQUFNLHFDQUFxQyxTQUFTLEVBQUU7QUFBQSxVQUNwRTtBQUVBLGNBQUksT0FBTyx5Q0FBeUM7QUFBQSxRQUN4RCxTQUFTLE9BQU87QUFDWixrQkFBUSxNQUFNLHFDQUFxQyxLQUFLO0FBQ3hELGdCQUFNLElBQUksTUFBTSxvREFBb0QsU0FBUyxFQUFFO0FBQUEsUUFDbkY7QUFBQSxNQUNKO0FBRUEsWUFBTSxVQUFVLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJO0FBRTlDLGlCQUFXO0FBQUEsUUFDUCxNQUFNLENBQUM7QUFBQSxRQUNQLE9BQU8sQ0FBQztBQUFBLFFBQ1IsT0FBTyxDQUFDO0FBQUEsUUFDUixVQUFVLENBQUM7QUFBQSxRQUNYLFdBQVcsQ0FBQztBQUFBLFFBQ1osU0FBUyxDQUFDO0FBQUEsTUFDZDtBQUlBLFlBQU0sZUFBZTtBQUNyQixZQUFNLFVBQVUsQ0FBQyxHQUFHLFFBQVEsU0FBUyxZQUFZLENBQUM7QUFFbEQsaUJBQVcsU0FBUyxTQUFTO0FBQ3pCLGNBQU0sY0FBYyxNQUFNLENBQUMsRUFBRSxLQUFLLEVBQUUsWUFBWTtBQUNoRCxjQUFNLGlCQUFpQixNQUFNLENBQUM7QUFHOUIsWUFBSSxNQUFNO0FBQ1YsWUFBSSxnQkFBZ0IsT0FBUSxPQUFNO0FBQUEsaUJBQ3pCLGdCQUFnQixRQUFTLE9BQU07QUFBQSxpQkFDL0IsZ0JBQWdCLFFBQVMsT0FBTTtBQUFBLGlCQUMvQixnQkFBZ0IsV0FBWSxPQUFNO0FBQUEsaUJBQ2xDLGdCQUFnQixZQUFhLE9BQU07QUFBQSxpQkFDbkMsZ0JBQWdCLFVBQVcsT0FBTTtBQUUxQyxZQUFJLEtBQUs7QUFDTCxtQkFBUyxHQUFHLElBQUksS0FBSyxhQUFhLGNBQWM7QUFBQSxRQUNwRDtBQUFBLE1BQ0o7QUFDQSxhQUFPO0FBQUEsSUFDWCxVQUFFO0FBQ0UsWUFBTSxlQUFlLFdBQVcsT0FBTyxLQUFLLFFBQVEsRUFBRSxTQUFTO0FBQy9ELGlCQUFLLGFBQUwsbUJBQWUsSUFBSSxPQUFPLEVBQUUsR0FBRyxTQUFTLGFBQWE7QUFBQSxJQUN6RDtBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLGFBQWEsZ0JBQWdCO0FBQ3pCLFVBQU0sUUFBUSxDQUFDO0FBQ2YsVUFBTSxRQUFRLGVBQWUsTUFBTSxJQUFJO0FBRXZDLGVBQVcsUUFBUSxPQUFPO0FBRXRCLFVBQUksb0JBQW9CLEtBQUssSUFBSSxHQUFHO0FBQ2hDLGNBQU0sS0FBSyxLQUFLLEtBQUssQ0FBQztBQUFBLE1BQzFCO0FBQUEsSUFDSjtBQUVBLFdBQU87QUFBQSxFQUNYO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNBLE1BQU0sb0JBQW9CLFlBQVksYUFBYSxNQUFNLGdCQUFnQixNQUFNO0FBNzRDbkY7QUE4NENRLFVBQU0sU0FBUSxVQUFLLGFBQUwsbUJBQWUsTUFBTTtBQUNuQyxVQUFNLFVBQVU7QUFBQSxNQUNaO0FBQUEsTUFDQSxZQUFZLGdCQUFjLFVBQUssU0FBUyxtQkFBZCxtQkFBOEI7QUFBQSxNQUN4RDtBQUFBLElBQ0o7QUFDQSxRQUFJLFVBQVU7QUFFZCxRQUFJO0FBQ0EsVUFBSSxPQUFPLDRCQUE0QjtBQUd2QyxZQUFNLGFBQWEsTUFBTSxLQUFLLGlCQUFpQixVQUFVO0FBR3pELFlBQU0sYUFBYSxLQUFLLGtCQUFrQjtBQUcxQyxZQUFNLE9BQU8sS0FBSyxJQUFJLE1BQU0sc0JBQXNCLFVBQVU7QUFFNUQsVUFBSSxDQUFDLE1BQU07QUFDUCxZQUFJLE9BQU8sMEJBQTBCLFVBQVUsSUFBSSxHQUFJO0FBQ3ZEO0FBQUEsTUFDSjtBQUVBLFlBQU0sVUFBVSxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSTtBQUc5QyxZQUFNLGdCQUFnQixJQUFJLE9BQU8sT0FBTyxLQUFLLFlBQVksVUFBVSxDQUFDLEVBQUU7QUFDdEUsWUFBTSxtQkFBbUIsY0FBYyxLQUFLLE9BQU87QUFFbkQsVUFBSSxpQkFBaUI7QUFFckIsVUFBSSxDQUFDLGtCQUFrQjtBQUVuQix5QkFBaUIsS0FBSyxvQkFBb0IsU0FBUyxVQUFVO0FBQUEsTUFDakU7QUFHQSx1QkFBaUIsTUFBTSxLQUFLLG9CQUFvQixnQkFBZ0IsWUFBWSxZQUFZLGFBQWE7QUFHckcsWUFBTSxLQUFLLElBQUksTUFBTSxPQUFPLE1BQU0sY0FBYztBQUVoRCxVQUFJLE9BQU8sc0NBQXNDO0FBQ2pELGdCQUFVO0FBQUEsSUFDZCxTQUFTLE9BQU87QUFDWixjQUFRLE1BQU0sa0NBQWtDLEtBQUs7QUFDckQsVUFBSSxPQUFPLDBCQUEwQixNQUFNLE9BQU8sSUFBSSxHQUFJO0FBQUEsSUFDOUQsVUFBRTtBQUNFLGlCQUFLLGFBQUwsbUJBQWUsSUFBSSxPQUFPLEVBQUUsR0FBRyxTQUFTLFFBQVE7QUFBQSxJQUNwRDtBQUFBLEVBQ0o7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLG9CQUFvQixTQUFTLFlBQVk7QUFDckMsVUFBTSxhQUFhLE9BQU8sVUFBVTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBNEJwQyxVQUFNLGVBQWU7QUFDckIsVUFBTSxRQUFRLFFBQVEsTUFBTSxZQUFZO0FBRXhDLFFBQUksT0FBTztBQUNQLFlBQU0sWUFBWSxNQUFNLFFBQVEsTUFBTSxDQUFDLEVBQUU7QUFDekMsYUFBTyxRQUFRLE1BQU0sR0FBRyxTQUFTLElBQUksT0FBTyxhQUFhLFFBQVEsTUFBTSxTQUFTO0FBQUEsSUFDcEY7QUFHQSxXQUFPLFVBQVUsU0FBUztBQUFBLEVBQzlCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsTUFBTSxvQkFBb0IsU0FBUyxZQUFZLFlBQVksZ0JBQWdCLE1BQU07QUFFN0UsVUFBTSxpQkFBaUIsSUFBSTtBQUFBLE1BQ3ZCLFFBQVEsS0FBSyxZQUFZLFVBQVUsQ0FBQztBQUFBLE1BQ3BDO0FBQUEsSUFDSjtBQUNBLFVBQU0sUUFBUSxRQUFRLE1BQU0sY0FBYztBQUUxQyxRQUFJLENBQUMsT0FBTztBQUNSLFVBQUksS0FBSyxTQUFTLFlBQVksa0JBQWtCO0FBQUUsZ0JBQVEsS0FBSyxxQ0FBcUMsVUFBVSxFQUFFO0FBQUEsTUFBRztBQUNuSCxhQUFPO0FBQUEsSUFDWDtBQUVBLFFBQUksY0FBYyxNQUFNLENBQUM7QUFJekIsVUFBTSxrQkFBa0IsTUFBTSxLQUFLLHNCQUFzQixZQUFZLGFBQWE7QUFDbEYsa0JBQWMsS0FBSyxrQkFBa0IsYUFBYSxZQUFZLGVBQWU7QUFHN0UsVUFBTSxpQkFBaUIsS0FBSyxxQkFBcUIsVUFBVTtBQUMzRCxrQkFBYyxLQUFLLGtCQUFrQixhQUFhLDJCQUEyQixjQUFjO0FBSzNGLFdBQU8sUUFBUSxNQUFNLEdBQUcsTUFBTSxLQUFLLElBQUksTUFBTSxDQUFDLElBQUksY0FBYyxRQUFRLE1BQU0sTUFBTSxRQUFRLE1BQU0sQ0FBQyxFQUFFLE1BQU07QUFBQSxFQUMvRztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0Esa0JBQWtCLE1BQU0sYUFBYSxZQUFZO0FBQzdDLFVBQU0sVUFBVSxJQUFJO0FBQUEsTUFDaEIsWUFBWSxXQUFXO0FBQUEsTUFDdkI7QUFBQSxJQUNKO0FBQ0EsVUFBTSxRQUFRLEtBQUssTUFBTSxPQUFPO0FBRWhDLFFBQUksT0FBTztBQUNQLFlBQU0sU0FBUyxNQUFNLENBQUM7QUFDdEIsWUFBTSxVQUFVLE1BQU0sQ0FBQztBQUN2QixZQUFNLFlBQVksTUFBTSxDQUFDO0FBQ3pCLFlBQU0sVUFBVSxNQUFNLENBQUM7QUFFdkIsYUFBTyxLQUFLLE1BQU0sR0FBRyxNQUFNLEtBQUssSUFDekIsU0FBUyxVQUFVLFlBQVksT0FBTyxhQUFhLE9BQU8sVUFDMUQsS0FBSyxNQUFNLE1BQU0sUUFBUSxNQUFNLENBQUMsRUFBRSxNQUFNO0FBQUEsSUFDbkQ7QUFFQSxXQUFPO0FBQUEsRUFDWDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBTSxzQkFBc0IsWUFBWSxnQkFBZ0IsTUFBTTtBQXBqRGxFO0FBcWpEUSxVQUFNLFNBQVEsVUFBSyxhQUFMLG1CQUFlLE1BQU07QUFDbkMsVUFBTSxRQUFRLENBQUMsa0VBQWtFLEVBQUU7QUFHbkYsVUFBTSxjQUFjO0FBQUEsTUFDaEIsR0FBRyxXQUFXO0FBQUEsTUFDZCxHQUFHLFdBQVc7QUFBQSxNQUNkLEdBQUcsV0FBVztBQUFBLE1BQ2QsR0FBRyxXQUFXO0FBQUEsSUFDbEI7QUFHQSxVQUFNLGlCQUFpQixLQUFLLGtCQUFrQixXQUFXLE1BQU0sQ0FBQztBQUdoRSxVQUFNLGFBQWEsb0JBQUksSUFBSTtBQUczQixlQUFXLFFBQVEsYUFBYTtBQUM1QixZQUFNLFlBQVksS0FBSyxNQUFNLG1CQUFtQjtBQUNoRCxVQUFJLFdBQVc7QUFDWCxtQkFBVyxRQUFRLFdBQVc7QUFDMUIsZ0JBQU0sY0FBYyxLQUFLLE1BQU0sR0FBRyxFQUFFO0FBR3BDLGNBQUksZUFBZTtBQUNmLGtCQUFNLGNBQWMsS0FBSyxJQUFJLE1BQU0sc0JBQXNCLEdBQUcsYUFBYSxJQUFJLFdBQVcsS0FBSztBQUM3RixnQkFBSSxDQUFDLFlBQWE7QUFBQSxVQUN0QjtBQUVBLGNBQUksQ0FBQyxXQUFXLElBQUksSUFBSSxHQUFHO0FBQ3ZCLHVCQUFXLElBQUksTUFBTSxFQUFFLE1BQU0sQ0FBQyxHQUFHLFdBQVcsQ0FBQyxFQUFFLENBQUM7QUFBQSxVQUNwRDtBQUNBLHFCQUFXLElBQUksSUFBSSxFQUFFLEtBQUssS0FBSyxJQUFJO0FBQUEsUUFDdkM7QUFBQSxNQUNKO0FBQUEsSUFDSjtBQUdBLGVBQVcsUUFBUSxnQkFBZ0I7QUFDL0IsWUFBTSxZQUFZLEtBQUssTUFBTSxtQkFBbUI7QUFDaEQsVUFBSSxXQUFXO0FBQ1gsbUJBQVcsUUFBUSxXQUFXO0FBQzFCLGdCQUFNLGNBQWMsS0FBSyxNQUFNLEdBQUcsRUFBRTtBQUdwQyxjQUFJLGVBQWU7QUFDZixrQkFBTSxjQUFjLEtBQUssSUFBSSxNQUFNLHNCQUFzQixHQUFHLGFBQWEsSUFBSSxXQUFXLEtBQUs7QUFDN0YsZ0JBQUksQ0FBQyxZQUFhO0FBQUEsVUFDdEI7QUFFQSxjQUFJLENBQUMsV0FBVyxJQUFJLElBQUksR0FBRztBQUN2Qix1QkFBVyxJQUFJLE1BQU0sRUFBRSxNQUFNLENBQUMsR0FBRyxXQUFXLENBQUMsRUFBRSxDQUFDO0FBQUEsVUFDcEQ7QUFDQSxxQkFBVyxJQUFJLElBQUksRUFBRSxVQUFVLEtBQUssSUFBSTtBQUFBLFFBQzVDO0FBQUEsTUFDSjtBQUFBLElBQ0o7QUFHQSxRQUFJLGVBQWU7QUFDZixZQUFNLFFBQVEsS0FBSyxJQUFJLE1BQU0saUJBQWlCLEVBQ3pDLE9BQU8sVUFBUSxLQUFLLEtBQUssV0FBVyxnQkFBZ0IsR0FBRyxDQUFDO0FBRTdELGlCQUFXLFFBQVEsT0FBTztBQUN0QixjQUFNLFVBQVUsTUFBTSxLQUFLLElBQUksTUFBTSxLQUFLLElBQUk7QUFDOUMsY0FBTSxPQUFPLEtBQUssS0FBSyxRQUFRO0FBRS9CLFlBQUksQ0FBQyxXQUFXLElBQUksSUFBSSxHQUFHO0FBQ3ZCLHFCQUFXLElBQUksTUFBTSxFQUFFLE1BQU0sQ0FBQyxHQUFHLFdBQVcsQ0FBQyxFQUFFLENBQUM7QUFBQSxRQUNwRDtBQUdBLGNBQU0sWUFBWTtBQUNsQixjQUFNLFVBQVUsQ0FBQyxHQUFHLFFBQVEsU0FBUyxTQUFTLENBQUM7QUFFL0MsbUJBQVcsU0FBUyxTQUFTO0FBQ3pCLGdCQUFNLFdBQVcsTUFBTSxDQUFDO0FBQ3hCLGdCQUFNLGNBQWMsU0FBUyxLQUFLLFFBQVE7QUFFMUMsY0FBSSxhQUFhO0FBRWIsa0JBQU0sWUFBWSxTQUFTLE1BQU0sNkJBQTZCO0FBQzlELGdCQUFJLFdBQVc7QUFDWCxvQkFBTSxXQUFXLElBQUksS0FBSyxVQUFVLENBQUMsR0FBRyxVQUFVLENBQUMsSUFBSSxHQUFHLFVBQVUsQ0FBQyxDQUFDO0FBQ3RFLG9CQUFNLGFBQWEsb0JBQUksS0FBSztBQUM1Qix5QkFBVyxRQUFRLFdBQVcsUUFBUSxJQUFJLENBQUM7QUFFM0Msa0JBQUksWUFBWSxZQUFZO0FBQ3hCLDJCQUFXLElBQUksSUFBSSxFQUFFLFVBQVUsS0FBSyxRQUFRO0FBQUEsY0FDaEQ7QUFBQSxZQUNKO0FBQUEsVUFDSixPQUFPO0FBQ0gsdUJBQVcsSUFBSSxJQUFJLEVBQUUsS0FBSyxLQUFLLFFBQVE7QUFBQSxVQUMzQztBQUFBLFFBQ0o7QUFBQSxNQUNKO0FBQUEsSUFDSjtBQUdBLFFBQUksV0FBVyxPQUFPLEdBQUc7QUFDckIsWUFBTSxpQkFBaUIsTUFBTSxLQUFLLFdBQVcsS0FBSyxDQUFDLEVBQUUsS0FBSztBQUUxRCxpQkFBVyxlQUFlLGdCQUFnQjtBQUN0QyxjQUFNLFFBQVEsV0FBVyxJQUFJLFdBQVc7QUFHeEMsWUFBSSxNQUFNLEtBQUssU0FBUyxLQUFLLE1BQU0sVUFBVSxTQUFTLEdBQUc7QUFDckQsZ0JBQU0sS0FBSyxFQUFFO0FBQ2IsZ0JBQU0sS0FBSyxLQUFLLFdBQVcsSUFBSTtBQUcvQixxQkFBVyxRQUFRLE1BQU0sTUFBTTtBQUMzQixrQkFBTSxLQUFLLElBQUk7QUFBQSxVQUNuQjtBQUdBLHFCQUFXLFFBQVEsTUFBTSxXQUFXO0FBQ2hDLGtCQUFNLEtBQUssSUFBSTtBQUFBLFVBQ25CO0FBQUEsUUFDSjtBQUFBLE1BQ0o7QUFHQSxZQUFNLG9CQUFvQixDQUFDO0FBQzNCLGlCQUFXLFFBQVEsZ0JBQWdCO0FBQy9CLGNBQU0sWUFBWSxLQUFLLE1BQU0sbUJBQW1CO0FBQ2hELFlBQUksQ0FBQyxhQUFhLFVBQVUsV0FBVyxHQUFHO0FBQ3RDLDRCQUFrQixLQUFLLElBQUk7QUFBQSxRQUMvQjtBQUFBLE1BQ0o7QUFFQSxVQUFJLGtCQUFrQixTQUFTLEdBQUc7QUFDOUIsY0FBTSxLQUFLLEVBQUU7QUFDYixjQUFNLEtBQUssaUVBQWlFO0FBQzVFLG1CQUFXLFFBQVEsbUJBQW1CO0FBQ2xDLGdCQUFNLEtBQUssSUFBSTtBQUFBLFFBQ25CO0FBQUEsTUFDSjtBQUFBLElBQ0osT0FBTztBQUNILFlBQU0sS0FBSyxvQ0FBb0M7QUFBQSxJQUNuRDtBQUVBLFVBQU0sU0FBUyxNQUFNLEtBQUssSUFBSTtBQUM5QixlQUFLLGFBQUwsbUJBQWUsSUFBSSxPQUFPLEVBQUUsZUFBZSxjQUFjLFdBQVcsS0FBSztBQUN6RSxXQUFPO0FBQUEsRUFDWDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EscUJBQXFCLFlBQVk7QUFDN0IsVUFBTSxRQUFRLENBQUMsMkRBQTJELEVBQUU7QUFFNUUsUUFBSSxXQUFXLFFBQVEsU0FBUyxHQUFHO0FBQy9CLGlCQUFXLFFBQVEsV0FBVyxTQUFTO0FBRW5DLGNBQU0sT0FBTyxLQUFLLFFBQVEscUJBQXFCLEVBQUU7QUFDakQsY0FBTSxLQUFLLEtBQUssSUFBSSxFQUFFO0FBQUEsTUFDMUI7QUFBQSxJQUNKLE9BQU87QUFDSCxZQUFNLEtBQUssWUFBWTtBQUFBLElBQzNCO0FBRUEsV0FBTyxNQUFNLEtBQUssSUFBSTtBQUFBLEVBQzFCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSx3QkFBd0IsWUFBWTtBQUNoQyxVQUFNLFFBQVEsQ0FBQywyREFBMkQsRUFBRTtBQUU1RSxRQUFJLFdBQVcsS0FBSyxTQUFTLEdBQUc7QUFFNUIsWUFBTSxjQUFjLEtBQUssa0JBQWtCLFdBQVcsTUFBTSxDQUFDO0FBQzdELFVBQUksWUFBWSxTQUFTLEdBQUc7QUFDeEIsY0FBTSxLQUFLLEdBQUcsWUFBWSxNQUFNLEdBQUcsRUFBRSxDQUFDO0FBQUEsTUFDMUMsT0FBTztBQUNILGNBQU0sS0FBSyxvQ0FBb0M7QUFBQSxNQUNuRDtBQUFBLElBQ0osT0FBTztBQUNILFlBQU0sS0FBSyxvQ0FBb0M7QUFBQSxJQUNuRDtBQUVBLFdBQU8sTUFBTSxLQUFLLElBQUk7QUFBQSxFQUMxQjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0Esa0JBQWtCLE9BQU8sTUFBTTtBQUMzQixVQUFNLGFBQWEsb0JBQUksS0FBSztBQUM1QixlQUFXLFFBQVEsV0FBVyxRQUFRLElBQUksSUFBSTtBQUU5QyxXQUFPLE1BQU0sT0FBTyxVQUFRO0FBQ3hCLFlBQU0sWUFBWSxLQUFLLE1BQU0sNkJBQTZCO0FBQzFELFVBQUksV0FBVztBQUNYLGNBQU0sV0FBVyxJQUFJLEtBQUssVUFBVSxDQUFDLEdBQUcsVUFBVSxDQUFDLElBQUksR0FBRyxVQUFVLENBQUMsQ0FBQztBQUN0RSxlQUFPLFlBQVk7QUFBQSxNQUN2QjtBQUNBLGFBQU87QUFBQSxJQUNYLENBQUM7QUFBQSxFQUNMO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQU0sOEJBQThCLGVBQWU7QUFDL0MsVUFBTSxjQUFjLENBQUM7QUFDckIsVUFBTSxpQkFBaUIsQ0FBQztBQUV4QixRQUFJO0FBRUEsWUFBTSxRQUFRLEtBQUssSUFBSSxNQUFNLGlCQUFpQixFQUN6QyxPQUFPLFVBQVEsS0FBSyxLQUFLLFdBQVcsZ0JBQWdCLEdBQUcsQ0FBQztBQUU3RCxpQkFBVyxRQUFRLE9BQU87QUFDdEIsY0FBTSxVQUFVLE1BQU0sS0FBSyxJQUFJLE1BQU0sS0FBSyxJQUFJO0FBRzlDLGNBQU0sWUFBWTtBQUNsQixjQUFNLFVBQVUsQ0FBQyxHQUFHLFFBQVEsU0FBUyxTQUFTLENBQUM7QUFFL0MsbUJBQVcsU0FBUyxTQUFTO0FBQ3pCLGdCQUFNLFdBQVcsTUFBTSxDQUFDO0FBQ3hCLGdCQUFNLGNBQWMsU0FBUyxLQUFLLFFBQVE7QUFFMUMsY0FBSSxhQUFhO0FBQ2IsMkJBQWUsS0FBSyxRQUFRO0FBQUEsVUFDaEMsT0FBTztBQUNILHdCQUFZLEtBQUssUUFBUTtBQUFBLFVBQzdCO0FBQUEsUUFDSjtBQUFBLE1BQ0o7QUFBQSxJQUNKLFNBQVMsT0FBTztBQUNaLGNBQVEsTUFBTSwrQkFBK0IsYUFBYSxLQUFLLEtBQUs7QUFBQSxJQUN4RTtBQUVBLFdBQU8sRUFBRSxhQUFhLGVBQWU7QUFBQSxFQUN6QztBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsWUFBWSxLQUFLO0FBQ2IsV0FBTyxJQUFJLFFBQVEsdUJBQXVCLE1BQU07QUFBQSxFQUNwRDtBQUNKO0FBTUEsSUFBTSxjQUFOLE1BQWtCO0FBQUEsRUFDZCxZQUFZLEtBQUssVUFBVSxVQUFVO0FBQ2pDLFNBQUssTUFBTTtBQUNYLFNBQUssV0FBVztBQUNoQixTQUFLLFdBQVc7QUFBQSxFQUNwQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLE1BQU0sa0JBQWtCLE1BQU07QUFoMERsQztBQWkwRFEsUUFBSSxDQUFDLEtBQU0sUUFBTyxFQUFFLFVBQVUsT0FBTyxXQUFXLEVBQUU7QUFFbEQsVUFBTSxVQUFTLFVBQUssYUFBTCxtQkFBZSxNQUFNO0FBRXBDLFFBQUk7QUFDQSxZQUFNLFVBQVUsTUFBTSxLQUFLLElBQUksTUFBTSxLQUFLLElBQUk7QUFDOUMsWUFBTSxRQUFRLFFBQVEsTUFBTSxJQUFJO0FBQ2hDLFVBQUksV0FBVztBQUNmLFVBQUksWUFBWTtBQUVoQixZQUFNLFdBQVcsTUFBTSxJQUFJLFVBQVE7QUFVL0IsY0FBTSxZQUFZLEtBQUssTUFBTSw0QkFBNEI7QUFFekQsWUFBSSxXQUFXO0FBQ1g7QUFDQSxxQkFBVztBQUNYLGdCQUFNLENBQUMsRUFBRSxRQUFRLFFBQVEsUUFBUSxJQUFJO0FBR3JDLGlCQUFPLEdBQUcsTUFBTSxHQUFHLE1BQU0sT0FBTyxRQUFRO0FBQUEsUUFDNUM7QUFFQSxlQUFPO0FBQUEsTUFDWCxDQUFDO0FBRUQsVUFBSSxVQUFVO0FBQ1YsY0FBTSxLQUFLLElBQUksTUFBTSxPQUFPLE1BQU0sU0FBUyxLQUFLLElBQUksQ0FBQztBQUFBLE1BQ3pEO0FBRUEsaUJBQUssYUFBTCxtQkFBZSxJQUFJLFFBQVEsRUFBRSxNQUFNLEtBQUssTUFBTSxXQUFXLFNBQVM7QUFFbEUsYUFBTyxFQUFFLFVBQVUsVUFBVTtBQUFBLElBQ2pDLFNBQVMsT0FBTztBQUNaLGNBQVEsTUFBTSx5Q0FBeUMsS0FBSyxJQUFJLEtBQUssS0FBSztBQUMxRSxpQkFBSyxhQUFMLG1CQUFlLElBQUk7QUFDbkIsYUFBTyxFQUFFLFVBQVUsT0FBTyxXQUFXLEdBQUcsTUFBTTtBQUFBLElBQ2xEO0FBQUEsRUFDSjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsTUFBTSxxQkFBcUI7QUFwM0QvQjtBQXEzRFEsVUFBTSxVQUFTLFVBQUssYUFBTCxtQkFBZSxNQUFNO0FBQ3BDLFVBQU0sc0JBQW9CLFVBQUssU0FBUyxnQkFBZCxtQkFBMkIsWUFBVztBQUdoRSxVQUFNLFdBQVcsS0FBSyxJQUFJLE1BQU0saUJBQWlCO0FBQ2pELFVBQU0sZUFBZSxTQUFTO0FBQUEsTUFBTyxVQUNqQyxLQUFLLEtBQUssV0FBVyxvQkFBb0IsR0FBRyxLQUFLLEtBQUssU0FBUztBQUFBLElBQ25FO0FBRUEsUUFBSSxhQUFhLFdBQVcsR0FBRztBQUMzQixVQUFJLE9BQU8scUJBQXFCLGlCQUFpQixFQUFFO0FBQ25ELGlCQUFLLGFBQUwsbUJBQWUsSUFBSTtBQUNuQjtBQUFBLElBQ0o7QUFFQSxRQUFJLE9BQU8sWUFBWSxhQUFhLE1BQU0sc0JBQXNCO0FBRWhFLFFBQUksZ0JBQWdCO0FBQ3BCLFFBQUksc0JBQXNCO0FBQzFCLFVBQU0sU0FBUyxDQUFDO0FBRWhCLGVBQVcsUUFBUSxjQUFjO0FBQzdCLFlBQU0sU0FBUyxNQUFNLEtBQUssa0JBQWtCLElBQUk7QUFFaEQsVUFBSSxPQUFPLE9BQU87QUFDZCxlQUFPLEtBQUssRUFBRSxNQUFNLEtBQUssTUFBTSxPQUFPLE9BQU8sTUFBTSxDQUFDO0FBQUEsTUFDeEQsV0FBVyxPQUFPLFVBQVU7QUFDeEI7QUFDQSwrQkFBdUIsT0FBTztBQUFBLE1BQ2xDO0FBQUEsSUFDSjtBQUdBLFFBQUksT0FBTyxTQUFTLEdBQUc7QUFDbkIsVUFBSTtBQUFBLFFBQ0EsMEJBQTBCLGFBQWEsbUJBQ3BDLG1CQUFtQixxQkFBcUIsT0FBTyxNQUFNO0FBQUEsTUFDNUQ7QUFDQSxjQUFRLE1BQU0sZ0RBQWdELE1BQU07QUFBQSxJQUN4RSxPQUFPO0FBQ0gsVUFBSTtBQUFBLFFBQ0EsNEJBQTRCLG1CQUFtQixhQUFhLGFBQWE7QUFBQSxNQUM3RTtBQUFBLElBQ0o7QUFFQSxlQUFLLGFBQUwsbUJBQWUsSUFBSSxRQUFRO0FBQUEsTUFDdkIsY0FBYyxhQUFhO0FBQUEsTUFDM0I7QUFBQSxNQUNBO0FBQUEsTUFDQSxRQUFRLE9BQU87QUFBQSxJQUNuQjtBQUVBLFFBQUksS0FBSyxTQUFTLFlBQVksa0JBQWtCO0FBQUUsY0FBUSxJQUFJLG9EQUFvRCxhQUFhLFdBQVcsbUJBQW1CLFFBQVE7QUFBQSxJQUFHO0FBQUEsRUFDNUs7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE1BQU0seUJBQXlCO0FBLzZEbkM7QUFnN0RRLFVBQU0sVUFBUyxVQUFLLGFBQUwsbUJBQWUsTUFBTTtBQUNwQyxVQUFNLE9BQU8sS0FBSyxJQUFJLFVBQVUsY0FBYztBQUU5QyxRQUFJLENBQUMsTUFBTTtBQUNQLFVBQUksT0FBTyxnQkFBZ0I7QUFDM0IsaUJBQUssYUFBTCxtQkFBZSxJQUFJO0FBQ25CO0FBQUEsSUFDSjtBQUVBLFVBQU0sU0FBUyxNQUFNLEtBQUssa0JBQWtCLElBQUk7QUFFaEQsUUFBSSxPQUFPLE9BQU87QUFDZCxVQUFJLE9BQU8sMkJBQTJCLE9BQU8sTUFBTSxPQUFPLEVBQUU7QUFBQSxJQUNoRSxXQUFXLE9BQU8sVUFBVTtBQUN4QixVQUFJLE9BQU8sYUFBYSxPQUFPLFNBQVMsYUFBYSxLQUFLLElBQUksRUFBRTtBQUFBLElBQ3BFLE9BQU87QUFDSCxVQUFJLE9BQU8scUNBQXFDO0FBQUEsSUFDcEQ7QUFFQSxlQUFLLGFBQUwsbUJBQWUsSUFBSTtBQUFBLEVBQ3ZCO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxNQUFNLGlDQUFpQztBQXo4RDNDO0FBMDhEUSxVQUFNLFVBQVMsVUFBSyxhQUFMLG1CQUFlLE1BQU07QUFDcEMsVUFBTSxzQkFBb0IsVUFBSyxTQUFTLGdCQUFkLG1CQUEyQixZQUFXO0FBRWhFLFVBQU0sV0FBVyxLQUFLLElBQUksTUFBTSxpQkFBaUI7QUFDakQsVUFBTSxlQUFlLFNBQVM7QUFBQSxNQUFPLFVBQ2pDLEtBQUssS0FBSyxXQUFXLG9CQUFvQixHQUFHLEtBQUssS0FBSyxTQUFTO0FBQUEsSUFDbkU7QUFFQSxRQUFJLGFBQWEsV0FBVyxHQUFHO0FBQzNCLFVBQUksT0FBTyxxQkFBcUIsaUJBQWlCLEVBQUU7QUFDbkQsaUJBQUssYUFBTCxtQkFBZSxJQUFJO0FBQ25CO0FBQUEsSUFDSjtBQUVBLFFBQUksYUFBYTtBQUNqQixVQUFNLGlCQUFpQixDQUFDO0FBRXhCLGVBQVcsUUFBUSxjQUFjO0FBQzdCLFlBQU0sVUFBVSxNQUFNLEtBQUssSUFBSSxNQUFNLEtBQUssSUFBSTtBQUM5QyxZQUFNLGNBQWMsUUFBUSxNQUFNLDhCQUE4QjtBQUVoRSxVQUFJLGVBQWUsWUFBWSxTQUFTLEdBQUc7QUFDdkMsc0JBQWMsWUFBWTtBQUMxQix1QkFBZSxLQUFLO0FBQUEsVUFDaEIsTUFBTSxLQUFLO0FBQUEsVUFDWCxNQUFNLEtBQUs7QUFBQSxVQUNYLFdBQVcsWUFBWTtBQUFBLFFBQzNCLENBQUM7QUFBQSxNQUNMO0FBQUEsSUFDSjtBQUVBLFFBQUksZUFBZSxHQUFHO0FBQ2xCLFVBQUksT0FBTyx1Q0FBdUM7QUFBQSxJQUN0RCxPQUFPO0FBQ0gsVUFBSSxLQUFLLFNBQVMsWUFBWSxrQkFBa0I7QUFDNUMsZ0JBQVEsSUFBSSxxQ0FBcUM7QUFBQSxVQUM3QyxZQUFZLGFBQWE7QUFBQSxVQUN6QixnQkFBZ0IsZUFBZTtBQUFBLFVBQy9CLGdCQUFnQjtBQUFBLFVBQ2hCLE9BQU87QUFBQSxRQUNYLENBQUM7QUFBQSxNQUNMO0FBRUEsVUFBSTtBQUFBLFFBQ0EsWUFBWSxVQUFVLHdCQUF3QixlQUFlLE1BQU07QUFBQSxNQUV2RTtBQUFBLElBQ0o7QUFFQSxlQUFLLGFBQUwsbUJBQWUsSUFBSSxRQUFRO0FBQUEsTUFDdkI7QUFBQSxNQUNBLGdCQUFnQixlQUFlO0FBQUEsSUFDbkM7QUFBQSxFQUNKO0FBQ0o7QUFNQSxJQUFNLHNCQUFOLGNBQWtDLGlCQUFpQjtBQUFBLEVBQy9DLFlBQVksS0FBSyxRQUFRO0FBQ3JCLFVBQU0sS0FBSyxNQUFNO0FBQ2pCLFNBQUssU0FBUztBQUFBLEVBQ2xCO0FBQUEsRUFFQSxVQUFVO0FBQ04sVUFBTSxFQUFFLFlBQVksSUFBSTtBQUN4QixnQkFBWSxNQUFNO0FBRWxCLGdCQUFZLFNBQVMsTUFBTSxFQUFFLE1BQU0sc0JBQXNCLENBQUM7QUFHMUQsZ0JBQVksU0FBUyxLQUFLO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04sS0FBSztBQUFBLElBQ1QsQ0FBQztBQUVELGdCQUFZLFNBQVMsS0FBSztBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLEtBQUs7QUFBQSxJQUNULENBQUM7QUFFRCxnQkFBWSxTQUFTLElBQUk7QUFHekIsUUFBSSxRQUFRLFdBQVcsRUFBRSxRQUFRLGVBQWUsRUFBRSxXQUFXO0FBRTdELFFBQUksUUFBUSxXQUFXLEVBQ2xCLFFBQVEsNEJBQXFCLEVBQzdCLFFBQVEsZ0dBQWdHLEVBQ3hHLFVBQVUsWUFBVSxPQUNoQixjQUFjLGtCQUFrQixFQUNoQyxPQUFPLEVBQ1AsUUFBUSxZQUFZO0FBQ2pCLFlBQU0sS0FBSyxPQUFPLG9CQUFvQixlQUFlO0FBQUEsSUFDekQsQ0FBQyxDQUFDO0FBRVYsUUFBSSxRQUFRLFdBQVcsRUFDbEIsUUFBUSw4QkFBdUIsRUFDL0IsUUFBUSx5SEFBeUgsRUFDakksVUFBVSxZQUFVLE9BQ2hCLGNBQWMsb0JBQW9CLEVBQ2xDLFFBQVEsWUFBWTtBQUNqQixZQUFNLEtBQUssT0FBTyxrQkFBa0IsSUFBSTtBQUFBLElBQzVDLENBQUMsQ0FBQztBQUVWLFFBQUksUUFBUSxXQUFXLEVBQ2xCLFFBQVEsc0NBQTBCLEVBQ2xDLFFBQVEsMkZBQTJGLEVBQ25HLFVBQVUsWUFBVSxPQUNoQixjQUFjLGlCQUFpQixFQUMvQixRQUFRLFlBQVk7QUFDakIsWUFBTSxLQUFLLE9BQU8sZUFBZSxlQUFlO0FBQUEsSUFDcEQsQ0FBQyxDQUFDO0FBRVYsUUFBSSxRQUFRLFdBQVcsRUFDbEIsUUFBUSxpQ0FBMEIsRUFDbEMsUUFBUSxzV0FBc1csRUFDOVcsVUFBVSxZQUFVLE9BQ2hCLGNBQWMsa0JBQWtCLEVBQ2hDLFFBQVEsWUFBWTtBQUNqQixZQUFNLEtBQUssT0FBTyxnQkFBZ0IsbUJBQW1CO0FBQUEsSUFDekQsQ0FBQyxDQUFDO0FBRVYsUUFBSSxRQUFRLFdBQVcsRUFDbEIsUUFBUSw2QkFBd0IsRUFDaEMsUUFBUSxrSEFBa0gsRUFDMUgsVUFBVSxZQUFVLE9BQ2hCLGNBQWMsc0JBQXNCLEVBQ3BDLFdBQVcsRUFDWCxRQUFRLFlBQVk7QUFDakIsVUFBSSxRQUFRLGtKQUFrSixHQUFHO0FBQzdKLGNBQU0sS0FBSyxPQUFPLFlBQVksbUJBQW1CO0FBQUEsTUFDckQ7QUFBQSxJQUNKLENBQUMsQ0FBQztBQUdWLFFBQUksUUFBUSxXQUFXLEVBQUUsUUFBUSx1QkFBdUIsRUFBRSxXQUFXO0FBRXJFLFVBQU0sZ0JBQWdCLFlBQVksU0FBUyxPQUFPLEVBQUUsS0FBSywyQkFBMkIsQ0FBQztBQUNyRixrQkFBYyxXQUFXLFNBQVM7QUFDbEMsa0JBQWMsU0FBUyxVQUFVLEVBQUUsTUFBTSxZQUFZLENBQUM7QUFDdEQsa0JBQWMsV0FBVyxpREFBaUQ7QUFDMUUsa0JBQWMsU0FBUyxLQUFLLEVBQUUsTUFBTSxrQ0FBa0MsTUFBTSwrQ0FBK0MsQ0FBQztBQUU1SCxVQUFNLFlBQVksWUFBWSxTQUFTLE9BQU8sRUFBRSxLQUFLLDJCQUEyQixDQUFDO0FBQ2pGLGNBQVUsV0FBVyxTQUFTO0FBQzlCLGNBQVUsU0FBUyxVQUFVLEVBQUUsTUFBTSxRQUFRLENBQUM7QUFDOUMsY0FBVSxXQUFXLDJDQUEyQztBQUNoRSxjQUFVLFNBQVMsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLE1BQU0sa0RBQWtELENBQUM7QUFFM0gsZ0JBQVksU0FBUyxJQUFJO0FBR3pCLFFBQUksUUFBUSxXQUFXLEVBQUUsUUFBUSwyQkFBMkIsRUFBRSxXQUFXO0FBQ3pFLGdCQUFZLFNBQVMsS0FBSztBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLEtBQUs7QUFBQSxJQUNULENBQUM7QUFFRCxnQkFBWSxTQUFTLEtBQUs7QUFBQSxNQUN0QixNQUFNO0FBQUEsTUFDTixLQUFLO0FBQUEsSUFDVCxDQUFDO0FBR0QsVUFBTSxVQUFVLEtBQUssSUFBSSxNQUFNLGtCQUFrQixFQUM1QyxPQUFPLE9BQUssRUFBRSxhQUFhLE1BQVMsRUFDcEMsSUFBSSxPQUFLLEVBQUUsSUFBSSxFQUNmLEtBQUs7QUFDVixVQUFNLGFBQWE7QUFDbkIsVUFBTSxXQUFXLFlBQVksU0FBUyxZQUFZLEVBQUUsTUFBTSxFQUFFLElBQUksV0FBVyxFQUFFLENBQUM7QUFDOUUsWUFBUSxRQUFRLFlBQVU7QUFDdEIsZUFBUyxTQUFTLFVBQVUsRUFBRSxPQUFPLE9BQU8sQ0FBQztBQUFBLElBQ2pELENBQUM7QUFFRCxVQUFNLGVBQWUsSUFBSSxRQUFRLFdBQVcsRUFDdkMsUUFBUSxjQUFjLEVBQ3RCLFFBQVEsa0NBQWtDO0FBQy9DLFVBQU0sYUFBYSxhQUFhLFVBQVUsU0FBUyxTQUFTO0FBQUEsTUFDeEQsTUFBTTtBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsT0FBTyxLQUFLLE9BQU8sU0FBUyxZQUFZO0FBQUEsTUFDeEMsTUFBTSxFQUFFLE1BQU0sV0FBVztBQUFBLElBQzdCLENBQUM7QUFDRCxlQUFXLE1BQU0sUUFBUTtBQUN6QixlQUFXLGlCQUFpQixTQUFTLE9BQU8sTUFBTTtBQUM5QyxXQUFLLE9BQU8sU0FBUyxZQUFZLFFBQVEsRUFBRSxPQUFPLE1BQU0sS0FBSztBQUM3RCxZQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsSUFDbkMsQ0FBQztBQUVELFVBQU0sa0JBQWtCLElBQUksUUFBUSxXQUFXLEVBQzFDLFFBQVEsaUJBQWlCLEVBQ3pCLFFBQVEsc0NBQXNDO0FBQ25ELFVBQU0sZ0JBQWdCLGdCQUFnQixVQUFVLFNBQVMsU0FBUztBQUFBLE1BQzlELE1BQU07QUFBQSxNQUNOLGFBQWE7QUFBQSxNQUNiLE9BQU8sS0FBSyxPQUFPLFNBQVMsWUFBWTtBQUFBLE1BQ3hDLE1BQU0sRUFBRSxNQUFNLFdBQVc7QUFBQSxJQUM3QixDQUFDO0FBQ0Qsa0JBQWMsTUFBTSxRQUFRO0FBQzVCLGtCQUFjLGlCQUFpQixTQUFTLE9BQU8sTUFBTTtBQUNqRCxXQUFLLE9BQU8sU0FBUyxZQUFZLFdBQVcsRUFBRSxPQUFPLE1BQU0sS0FBSztBQUNoRSxZQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsSUFDbkMsQ0FBQztBQUVELFVBQU0sZUFBZSxJQUFJLFFBQVEsV0FBVyxFQUN2QyxRQUFRLGNBQWMsRUFDdEIsUUFBUSxvQ0FBb0M7QUFDakQsVUFBTSxhQUFhLGFBQWEsVUFBVSxTQUFTLFNBQVM7QUFBQSxNQUN4RCxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixPQUFPLEtBQUssT0FBTyxTQUFTLFlBQVk7QUFBQSxNQUN4QyxNQUFNLEVBQUUsTUFBTSxXQUFXO0FBQUEsSUFDN0IsQ0FBQztBQUNELGVBQVcsTUFBTSxRQUFRO0FBQ3pCLGVBQVcsaUJBQWlCLFNBQVMsT0FBTyxNQUFNO0FBQzlDLFdBQUssT0FBTyxTQUFTLFlBQVksUUFBUSxFQUFFLE9BQU8sTUFBTSxLQUFLO0FBQzdELFlBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxJQUNuQyxDQUFDO0FBRUQsVUFBTSxtQkFBbUIsSUFBSSxRQUFRLFdBQVcsRUFDM0MsUUFBUSxrQkFBa0IsRUFDMUIsUUFBUSwwQ0FBMEM7QUFDdkQsVUFBTSxpQkFBaUIsaUJBQWlCLFVBQVUsU0FBUyxTQUFTO0FBQUEsTUFDaEUsTUFBTTtBQUFBLE1BQ04sYUFBYTtBQUFBLE1BQ2IsT0FBTyxLQUFLLE9BQU8sU0FBUyxZQUFZO0FBQUEsTUFDeEMsTUFBTSxFQUFFLE1BQU0sV0FBVztBQUFBLElBQzdCLENBQUM7QUFDRCxtQkFBZSxNQUFNLFFBQVE7QUFDN0IsbUJBQWUsaUJBQWlCLFNBQVMsT0FBTyxNQUFNO0FBQ2xELFdBQUssT0FBTyxTQUFTLFlBQVksWUFBWSxFQUFFLE9BQU8sTUFBTSxLQUFLO0FBQ2pFLFlBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxJQUNuQyxDQUFDO0FBRUQsVUFBTSxpQkFBaUIsSUFBSSxRQUFRLFdBQVcsRUFDekMsUUFBUSxnQkFBZ0IsRUFDeEIsUUFBUSxxQ0FBcUM7QUFDbEQsVUFBTSxlQUFlLGVBQWUsVUFBVSxTQUFTLFNBQVM7QUFBQSxNQUM1RCxNQUFNO0FBQUEsTUFDTixhQUFhO0FBQUEsTUFDYixPQUFPLEtBQUssT0FBTyxTQUFTLFlBQVk7QUFBQSxNQUN4QyxNQUFNLEVBQUUsTUFBTSxXQUFXO0FBQUEsSUFDN0IsQ0FBQztBQUNELGlCQUFhLE1BQU0sUUFBUTtBQUMzQixpQkFBYSxpQkFBaUIsU0FBUyxPQUFPLE1BQU07QUFDaEQsV0FBSyxPQUFPLFNBQVMsWUFBWSxVQUFVLEVBQUUsT0FBTyxNQUFNLEtBQUs7QUFDL0QsWUFBTSxLQUFLLE9BQU8sYUFBYTtBQUFBLElBQ25DLENBQUM7QUFFRCxnQkFBWSxTQUFTLElBQUk7QUFHekIsUUFBSSxRQUFRLFdBQVcsRUFBRSxRQUFRLDRCQUE0QixFQUFFLFdBQVc7QUFFMUUsZ0JBQVksU0FBUyxLQUFLO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04sS0FBSztBQUFBLElBQ1QsQ0FBQztBQUVELFFBQUksUUFBUSxXQUFXLEVBQ2xCLFFBQVEseUJBQXlCLEVBQ2pDLFFBQVEsMElBQTBJLEVBQ2xKLFVBQVUsWUFBVSxPQUNoQixTQUFTLEtBQUssT0FBTyxTQUFTLFFBQVEsb0JBQW9CLEVBQzFELFNBQVMsT0FBTyxVQUFVO0FBQ3ZCLFdBQUssT0FBTyxTQUFTLFFBQVEsdUJBQXVCO0FBQ3BELFlBQU0sS0FBSyxPQUFPLGFBQWE7QUFBQSxJQUNuQyxDQUFDLENBQUM7QUFFVixnQkFBWSxTQUFTLElBQUk7QUFHekIsUUFBSSxRQUFRLFdBQVcsRUFBRSxRQUFRLGdCQUFnQixFQUFFLFdBQVc7QUFFOUQsZ0JBQVksU0FBUyxLQUFLO0FBQUEsTUFDdEIsTUFBTTtBQUFBLE1BQ04sS0FBSztBQUFBLElBQ1QsQ0FBQztBQUVELGdCQUFZLFNBQVMsS0FBSztBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLEtBQUs7QUFBQSxJQUNULENBQUM7QUFFRCxRQUFJLFFBQVEsV0FBVyxFQUNsQixRQUFRLHVCQUF1QixFQUMvQixRQUFRLG9EQUFvRCxFQUM1RCxVQUFVLFlBQVUsT0FDaEIsU0FBUyxLQUFLLE9BQU8sU0FBUyxVQUFVLGlCQUFpQixFQUN6RCxTQUFTLE9BQU8sVUFBVTtBQUN2QixXQUFLLE9BQU8sU0FBUyxVQUFVLG9CQUFvQjtBQUNuRCxZQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsSUFDbkMsQ0FBQyxDQUFDO0FBRVYsUUFBSSxRQUFRLFdBQVcsRUFDbEIsUUFBUSxzQkFBc0IsRUFDOUIsUUFBUSx3TkFBeU4sRUFDak8sVUFBVSxZQUFVLE9BQ2hCLGNBQWMsaUJBQWlCLEVBQy9CLFFBQVEsWUFBWTtBQUNqQixZQUFNLEtBQUssT0FBTyxlQUFlLG1CQUFtQjtBQUFBLElBQ3hELENBQUMsQ0FBQztBQUVWLGdCQUFZLFNBQVMsSUFBSTtBQUd6QixRQUFJLFFBQVEsV0FBVyxFQUFFLFFBQVEseUJBQXlCLEVBQUUsV0FBVztBQUN2RSxnQkFBWSxTQUFTLEtBQUs7QUFBQSxNQUN0QixNQUFNO0FBQUEsTUFDTixLQUFLO0FBQUEsSUFDVCxDQUFDO0FBRUQsUUFBSSxRQUFRLFdBQVcsRUFDbEIsUUFBUSx1QkFBdUIsRUFDL0IsUUFBUSxnR0FBZ0csRUFDeEcsVUFBVSxZQUFVLE9BQ2hCLFNBQVMsS0FBSyxPQUFPLFNBQVMsWUFBWSxnQkFBZ0IsRUFDMUQsU0FBUyxPQUFPLFVBQVU7QUFDdkIsV0FBSyxPQUFPLFNBQVMsWUFBWSxtQkFBbUI7QUFDcEQsWUFBTSxLQUFLLE9BQU8sYUFBYTtBQUUvQixVQUFJLENBQUMsU0FBUyxLQUFLLE9BQU8sU0FBUyxZQUFZLG9CQUFvQjtBQUMvRCxhQUFLLE9BQU8sdUJBQXVCLG9CQUFvQjtBQUFBLE1BQzNEO0FBRUEsV0FBSyxPQUFPLHNCQUFzQjtBQUFBLElBQ3RDLENBQUMsQ0FBQztBQUVWLFFBQUksUUFBUSxXQUFXLEVBQ2xCLFFBQVEsK0JBQStCLEVBQ3ZDLFFBQVEsb0VBQW9FLEVBQzVFLFFBQVEsVUFBUSxLQUNaLGVBQWUsS0FBSyxFQUNwQixTQUFTLE9BQU8sS0FBSyxPQUFPLFNBQVMsWUFBWSx3QkFBd0IsQ0FBQyxFQUMxRSxTQUFTLE9BQU8sVUFBVTtBQUN2QixZQUFNLFNBQVMsT0FBTyxLQUFLO0FBQzNCLFVBQUksQ0FBQyxPQUFPLE1BQU0sTUFBTSxLQUFLLFNBQVMsR0FBRztBQUNyQyxhQUFLLE9BQU8sU0FBUyxZQUFZLDJCQUEyQjtBQUM1RCxjQUFNLEtBQUssT0FBTyxhQUFhO0FBQy9CLGFBQUssT0FBTyxzQkFBc0I7QUFBQSxNQUN0QztBQUFBLElBQ0osQ0FBQyxDQUFDO0FBRVYsUUFBSSxRQUFRLFdBQVcsRUFDbEIsUUFBUSx1QkFBdUIsRUFDL0IsUUFBUSw0RkFBNEYsRUFDcEcsVUFBVSxZQUFVLE9BQ2hCLFNBQVMsS0FBSyxPQUFPLFNBQVMsWUFBWSxrQkFBa0IsRUFDNUQsU0FBUyxPQUFPLFVBQVU7QUFDdkIsV0FBSyxPQUFPLFNBQVMsWUFBWSxxQkFBcUI7QUFDdEQsWUFBTSxLQUFLLE9BQU8sYUFBYTtBQUFBLElBQ25DLENBQUMsQ0FBQztBQUVWLFFBQUksUUFBUSxXQUFXLEVBQ2xCLFFBQVEsa0JBQWtCLEVBQzFCLFFBQVEsbUVBQW1FLEVBQzNFLFVBQVUsWUFBVSxPQUNoQixjQUFjLGNBQWMsRUFDNUIsUUFBUSxNQUFNO0FBQ1gsVUFBSSxDQUFDLEtBQUssT0FBTyxTQUFTLFlBQVksa0JBQWtCO0FBQ3BELFlBQUksT0FBTyw2Q0FBNkM7QUFDeEQ7QUFBQSxNQUNKO0FBQ0EsV0FBSyxPQUFPLHVCQUF1QixnQkFBZ0I7QUFBQSxJQUN2RCxDQUFDLENBQUM7QUFFVixRQUFJLFFBQVEsV0FBVyxFQUNsQixRQUFRLHlCQUF5QixFQUNqQyxRQUFRLHVFQUF1RSxFQUMvRSxVQUFVLFlBQVUsT0FDaEIsY0FBYyxnQkFBZ0IsRUFDOUIsUUFBUSxNQUFNO0FBQ1gsVUFBSSxLQUFLLE9BQU8sVUFBVTtBQUN0QixhQUFLLE9BQU8sU0FBUyxNQUFNO0FBQzNCLFlBQUksT0FBTywwQkFBMEI7QUFBQSxNQUN6QztBQUFBLElBQ0osQ0FBQyxDQUFDO0FBRVYsZ0JBQVksU0FBUyxJQUFJO0FBR3pCLFFBQUksUUFBUSxXQUFXLEVBQUUsUUFBUSxpQkFBaUIsRUFBRSxXQUFXO0FBQy9ELGdCQUFZLFNBQVMsS0FBSztBQUFBLE1BQ3RCLE1BQU07QUFBQSxNQUNOLEtBQUs7QUFBQSxJQUNULENBQUM7QUFFRCxRQUFJLFFBQVEsV0FBVyxFQUNsQixRQUFRLDJDQUEyQyxFQUNuRCxRQUFRLHNIQUFpSCxFQUN6SCxVQUFVLFlBQVUsT0FDaEIsU0FBUyxLQUFLLE9BQU8sU0FBUyxNQUFNLG1CQUFtQixFQUN2RCxTQUFTLE9BQU8sVUFBVTtBQUN2QixXQUFLLE9BQU8sU0FBUyxNQUFNLHNCQUFzQjtBQUNqRCxZQUFNLEtBQUssT0FBTyxhQUFhO0FBQUEsSUFDbkMsQ0FBQyxDQUFDO0FBRVYsUUFBSSxRQUFRLFdBQVcsRUFDbEIsUUFBUSx1Q0FBdUMsRUFDL0MsUUFBUSxnRkFBZ0YsRUFDeEYsVUFBVSxZQUFVLE9BQ2hCLFNBQVMsS0FBSyxPQUFPLFNBQVMsTUFBTSx1QkFBdUIsRUFDM0QsU0FBUyxPQUFPLFVBQVU7QUFDdkIsV0FBSyxPQUFPLFNBQVMsTUFBTSwwQkFBMEI7QUFDckQsWUFBTSxLQUFLLE9BQU8sYUFBYTtBQUFBLElBQ25DLENBQUMsQ0FBQztBQUVWLFFBQUksUUFBUSxXQUFXLEVBQUUsUUFBUSx3QkFBd0IsRUFBRSxXQUFXO0FBRXRFLFFBQUksUUFBUSxXQUFXLEVBQ2xCLFFBQVEsaUNBQTBCLEVBQ2xDLFFBQVEsaUZBQWlGLEVBQ3pGLFVBQVUsWUFBVSxPQUNoQixjQUFjLFNBQVMsRUFDdkIsUUFBUSxZQUFZO0FBQ2pCLFlBQU0sS0FBSyxPQUFPLFlBQVksK0JBQStCO0FBQUEsSUFDakUsQ0FBQyxDQUFDO0FBRVYsUUFBSSxRQUFRLFdBQVcsRUFDbEIsUUFBUSw2QkFBd0IsRUFDaEMsUUFBUSwrSEFBK0gsRUFDdkksVUFBVSxZQUFVLE9BQ2hCLGNBQWMsc0JBQXNCLEVBQ3BDLFdBQVcsRUFDWCxRQUFRLFlBQVk7QUFDakIsVUFBSSxRQUFRLGtKQUFrSixHQUFHO0FBQzdKLGNBQU0sS0FBSyxPQUFPLFlBQVksbUJBQW1CO0FBQUEsTUFDckQ7QUFBQSxJQUNKLENBQUMsQ0FBQztBQUVWLFFBQUksUUFBUSxXQUFXLEVBQ2xCLFFBQVEsa0NBQTZCLEVBQ3JDLFFBQVEsb0RBQW9ELEVBQzVELFVBQVUsWUFBVSxPQUNoQixjQUFjLHFCQUFxQixFQUNuQyxRQUFRLFlBQVk7QUFDakIsWUFBTSxLQUFLLE9BQU8sWUFBWSx1QkFBdUI7QUFBQSxJQUN6RCxDQUFDLENBQUM7QUFFVixnQkFBWSxTQUFTLEtBQUs7QUFBQSxNQUN0QixNQUFNO0FBQUEsTUFDTixLQUFLO0FBQUEsSUFDVCxDQUFDO0FBRUQsZ0JBQVksU0FBUyxJQUFJO0FBR3pCLFFBQUksUUFBUSxXQUFXLEVBQUUsUUFBUSxtQkFBbUIsRUFBRSxXQUFXO0FBRWpFLFFBQUksUUFBUSxXQUFXLEVBQ2xCLFFBQVEsbUJBQW1CLEVBQzNCLFFBQVEsb01BQTBMLEVBQ2xNLFVBQVUsWUFBVSxPQUNoQixjQUFjLG9CQUFvQixFQUNsQyxXQUFXLEVBQ1gsUUFBUSxZQUFZO0FBQ2pCLFVBQUksUUFBUSwwUEFBZ1AsR0FBRztBQUUzUCxhQUFLLE9BQU8sV0FBVyxPQUFPLE9BQU8sQ0FBQyxHQUFHLGdCQUFnQjtBQUN6RCxjQUFNLEtBQUssT0FBTyxhQUFhO0FBRy9CLGNBQU0sS0FBSyxPQUFPLGdCQUFnQiw0QkFBNEI7QUFHOUQsYUFBSyxRQUFRO0FBQUEsTUFDakI7QUFBQSxJQUNKLENBQUMsQ0FBQztBQUFBLEVBQ2Q7QUFDSjtBQU1BLE9BQU8sVUFBVSxNQUFNLHdCQUF3QixPQUFPO0FBQUEsRUFDbEQsTUFBTSxTQUFTO0FBejZFbkI7QUEyNkVRLFVBQU0sS0FBSyxhQUFhO0FBQ3hCLFNBQUssbUJBQW1CO0FBQ3hCLFVBQU0sZUFBYyxVQUFLLGFBQUwsbUJBQWUsTUFBTTtBQUd6QyxTQUFLLG9CQUFvQixJQUFJLGtCQUFrQixLQUFLLEdBQUc7QUFDdkQsU0FBSyxzQkFBc0IsSUFBSSxvQkFBb0IsS0FBSyxLQUFLLEtBQUssUUFBUTtBQUMxRSxTQUFLLGNBQWMsSUFBSSxZQUFZLEtBQUssS0FBSyxLQUFLLFVBQVUsS0FBSyxRQUFRO0FBQ3pFLFNBQUssaUJBQWlCLElBQUksZUFBZSxLQUFLLEtBQUssS0FBSyxVQUFVLEtBQUssVUFBVSxLQUFLLFdBQVc7QUFDakcsU0FBSyxnQkFBZ0IsSUFBSSxjQUFjLEtBQUssS0FBSyxLQUFLLFVBQVUsS0FBSyxRQUFRO0FBQzdFLFNBQUssa0JBQWtCLElBQUksZ0JBQWdCLEtBQUssS0FBSyxLQUFLLFVBQVUsS0FBSyxRQUFRO0FBR2pGLFVBQU0sS0FBSyxrQkFBa0I7QUFHN0IsU0FBSztBQUFBLE1BQ0QsS0FBSyxJQUFJLE1BQU0sR0FBRyxVQUFVLE9BQU8sTUFBTSxZQUFZO0FBNTdFakUsWUFBQUMsS0FBQUMsS0FBQTtBQTY3RWdCLFlBQUksS0FBSyxjQUFjLEtBQU07QUFDN0IsWUFBSSxZQUFZLEtBQUssTUFBTTtBQUN2QixXQUFBRCxNQUFBLEtBQUssYUFBTCxnQkFBQUEsSUFBZSxVQUFVO0FBQ3pCLGdCQUFNLFVBQVNDLE1BQUEsS0FBSyxhQUFMLGdCQUFBQSxJQUFlLE1BQU07QUFDcEMsY0FBSTtBQUNBLGtCQUFNLEtBQUssZUFBZSxlQUFlLElBQUk7QUFBQSxVQUNqRCxVQUFFO0FBQ0UsdUJBQUssYUFBTCxtQkFBZSxJQUFJLFFBQVEsRUFBRSxNQUFNLEtBQUssS0FBSztBQUFBLFVBQ2pEO0FBQUEsUUFDSjtBQUFBLE1BQ0osQ0FBQztBQUFBLElBQ0w7QUFFQSxTQUFLO0FBQUEsTUFDRCxLQUFLLElBQUksTUFBTSxHQUFHLFVBQVUsT0FBTyxTQUFTO0FBMzhFeEQsWUFBQUQ7QUE0OEVnQixZQUFJLEtBQUssY0FBYyxLQUFNO0FBQzdCLFNBQUFBLE1BQUEsS0FBSyxhQUFMLGdCQUFBQSxJQUFlLFVBQVU7QUFFekIsbUJBQVcsWUFBWTtBQS84RXZDLGNBQUFBLEtBQUFDO0FBZzlFb0IsZ0JBQU0sVUFBU0QsTUFBQSxLQUFLLGFBQUwsZ0JBQUFBLElBQWUsTUFBTTtBQUNwQyxjQUFJO0FBQ0Esa0JBQU0sS0FBSyxlQUFlLGVBQWUsSUFBSTtBQUFBLFVBQ2pELFVBQUU7QUFDRSxhQUFBQyxNQUFBLEtBQUssYUFBTCxnQkFBQUEsSUFBZSxJQUFJLFFBQVEsRUFBRSxNQUFNLEtBQUssS0FBSztBQUFBLFVBQ2pEO0FBQUEsUUFDSixHQUFHLEdBQUc7QUFBQSxNQUNWLENBQUM7QUFBQSxJQUNMO0FBR0EsU0FBSztBQUFBLE1BQ0QsS0FBSyxJQUFJLE1BQU0sR0FBRyxVQUFVLE9BQU8sU0FBUztBQTU5RXhELFlBQUFELEtBQUFDLEtBQUE7QUE2OUVnQixZQUFJLEtBQUssY0FBYyxLQUFNO0FBQzdCLFNBQUFELE1BQUEsS0FBSyxhQUFMLGdCQUFBQSxJQUFlLFVBQVU7QUFHekIsY0FBTSxRQUFPQyxNQUFBLEtBQUssU0FBTCxPQUFBQSxNQUFhLE1BQU0sS0FBSyxJQUFJLE1BQU0sUUFBUSxLQUFLLEtBQUssSUFBSTtBQUNyRSxjQUFNLFVBQVUsS0FBSyxJQUFJLElBQUksS0FBSztBQUVsQyxZQUFJLFVBQVUsS0FBTTtBQUNoQixnQkFBTSxVQUFTLFVBQUssYUFBTCxtQkFBZSxNQUFNO0FBQ3BDLGNBQUk7QUFDQSxrQkFBTSxLQUFLLGVBQWUsZUFBZSxJQUFJO0FBQUEsVUFDakQsVUFBRTtBQUNFLHVCQUFLLGFBQUwsbUJBQWUsSUFBSSxRQUFRLEVBQUUsTUFBTSxLQUFLLE1BQU0sUUFBUTtBQUFBLFVBQzFEO0FBQUEsUUFDSixPQUFPO0FBQ0gscUJBQUssYUFBTCxtQkFBZSxVQUFVO0FBQUEsUUFDN0I7QUFBQSxNQUNKLENBQUM7QUFBQSxJQUNMO0FBR0EsU0FBSyxXQUFXO0FBQUEsTUFDWixJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixVQUFVLFlBQVk7QUFDbEIsY0FBTSxLQUFLLG9CQUFvQixlQUFlO0FBQUEsTUFDbEQ7QUFBQSxJQUNKLENBQUM7QUFFRCxTQUFLLFdBQVc7QUFBQSxNQUNaLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFVBQVUsWUFBWTtBQUNsQixjQUFNLE9BQU8sS0FBSyxJQUFJLFVBQVUsY0FBYztBQUM5QyxZQUFJLE1BQU07QUFDTixnQkFBTSxLQUFLLGVBQWUsZUFBZSxJQUFJO0FBQzdDLGNBQUksT0FBTyxvQkFBb0I7QUFBQSxRQUNuQyxPQUFPO0FBQ0gsY0FBSSxPQUFPLGdCQUFnQjtBQUFBLFFBQy9CO0FBQUEsTUFDSjtBQUFBLElBQ0osQ0FBQztBQUVELFNBQUssV0FBVztBQUFBLE1BQ1osSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sVUFBVSxZQUFZO0FBQ2xCLGNBQU0sS0FBSyxlQUFlLGVBQWU7QUFBQSxNQUM3QztBQUFBLElBQ0osQ0FBQztBQUVELFNBQUssV0FBVztBQUFBLE1BQ1osSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sVUFBVSxZQUFZO0FBQ2xCLGNBQU0sS0FBSyxnQkFBZ0IsbUJBQW1CO0FBQUEsTUFDbEQ7QUFBQSxJQUNKLENBQUM7QUFFRCxTQUFLLFdBQVc7QUFBQSxNQUNaLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFVBQVUsWUFBWTtBQUNsQixjQUFNLEtBQUssZUFBZSxtQkFBbUI7QUFBQSxNQUNqRDtBQUFBLElBQ0osQ0FBQztBQUVELFNBQUssV0FBVztBQUFBLE1BQ1osSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sVUFBVSxNQUFNO0FBbmlGNUIsWUFBQUQ7QUFvaUZnQixZQUFJLEdBQUNBLE1BQUEsS0FBSyxTQUFTLGdCQUFkLGdCQUFBQSxJQUEyQixtQkFBa0I7QUFDOUMsY0FBSSxPQUFPLHlEQUF5RDtBQUNwRTtBQUFBLFFBQ0o7QUFDQSxhQUFLLHVCQUF1QixTQUFTO0FBQUEsTUFDekM7QUFBQSxJQUNKLENBQUM7QUFFRCxTQUFLLFdBQVc7QUFBQSxNQUNaLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFVBQVUsWUFBWTtBQUNsQixjQUFNLEtBQUssa0JBQWtCLElBQUk7QUFBQSxNQUNyQztBQUFBLElBQ0osQ0FBQztBQUVELFNBQUssV0FBVztBQUFBLE1BQ1osSUFBSTtBQUFBLE1BQ0osTUFBTTtBQUFBLE1BQ04sVUFBVSxZQUFZO0FBQ2xCLGNBQU0sS0FBSyxZQUFZLG1CQUFtQjtBQUFBLE1BQzlDO0FBQUEsSUFDSixDQUFDO0FBRUQsU0FBSyxXQUFXO0FBQUEsTUFDWixJQUFJO0FBQUEsTUFDSixNQUFNO0FBQUEsTUFDTixVQUFVLFlBQVk7QUFDbEIsY0FBTSxLQUFLLFlBQVksdUJBQXVCO0FBQUEsTUFDbEQ7QUFBQSxJQUNKLENBQUM7QUFFRCxTQUFLLFdBQVc7QUFBQSxNQUNaLElBQUk7QUFBQSxNQUNKLE1BQU07QUFBQSxNQUNOLFVBQVUsWUFBWTtBQUNsQixjQUFNLEtBQUssWUFBWSwrQkFBK0I7QUFBQSxNQUMxRDtBQUFBLElBQ0osQ0FBQztBQUdELFNBQUssY0FBYyxJQUFJLG9CQUFvQixLQUFLLEtBQUssSUFBSSxDQUFDO0FBRzFELFFBQUksS0FBSyxTQUFTLFVBQVU7QUFDeEIsWUFBTSxLQUFLLGVBQWU7QUFBQSxJQUM5QjtBQUVBLGVBQUssYUFBTCxtQkFBZSxJQUFJLGFBQWEsRUFBRSxRQUFRLFNBQVM7QUFBQSxFQUN2RDtBQUFBLEVBRUEscUJBQXFCO0FBdmxGekI7QUF3bEZRLFNBQUssV0FBVyxJQUFJLG9CQUFvQjtBQUFBLE1BQ3BDLFVBQVMsZ0JBQUssYUFBTCxtQkFBZSxnQkFBZixtQkFBNEI7QUFBQSxNQUNyQyxnQkFBZSxnQkFBSyxhQUFMLG1CQUFlLGdCQUFmLG1CQUE0QjtBQUFBLElBQy9DLENBQUM7QUFBQSxFQUNMO0FBQUEsRUFFQSx3QkFBd0I7QUE5bEY1QjtBQStsRlEsUUFBSSxDQUFDLEtBQUssVUFBVTtBQUNoQixXQUFLLG1CQUFtQjtBQUN4QjtBQUFBLElBQ0o7QUFFQSxTQUFLLFNBQVMsVUFBVTtBQUFBLE1BQ3BCLGdCQUFlLGdCQUFLLGFBQUwsbUJBQWUsZ0JBQWYsbUJBQTRCO0FBQUEsSUFDL0MsQ0FBQztBQUNELFNBQUssU0FBUyxZQUFXLGdCQUFLLGFBQUwsbUJBQWUsZ0JBQWYsbUJBQTRCLGdCQUFnQjtBQUFBLEVBQ3pFO0FBQUEsRUFFQSx1QkFBdUIsU0FBUyxVQUFVO0FBQ3RDLFFBQUksQ0FBQyxLQUFLLFVBQVU7QUFDaEIsY0FBUSxLQUFLLHNDQUFzQztBQUNuRDtBQUFBLElBQ0o7QUFFQSxTQUFLLFNBQVMsV0FBVyxNQUFNO0FBQUEsRUFDbkM7QUFBQSxFQUVBLE1BQU0sa0JBQWtCLGFBQWEsT0FBTztBQUN4QyxVQUFNLFNBQVMsTUFBTSxLQUFLLGtCQUFrQixrQkFBa0I7QUFFOUQsUUFBSSxDQUFDLE9BQU8sUUFBUTtBQUNoQixVQUFJLFlBQVk7QUFDWixjQUFNLEtBQUssa0JBQWtCLHNCQUFzQixPQUFPLE9BQU87QUFBQSxNQUNyRTtBQUNBLGNBQVEsS0FBSyw2Q0FBNkMsT0FBTyxPQUFPO0FBQUEsSUFDNUUsV0FBVyxZQUFZO0FBQ25CLFVBQUksT0FBTyxpQ0FBaUM7QUFBQSxJQUNoRDtBQUVBLFdBQU87QUFBQSxFQUNYO0FBQUEsRUFFQSxNQUFNLGlCQUFpQjtBQUVuQixlQUFXLFlBQVk7QUFDbkIsVUFBSSxPQUFPLDBEQUEwRDtBQUdyRSxXQUFLLFNBQVMsV0FBVztBQUN6QixZQUFNLEtBQUssYUFBYTtBQUFBLElBQzVCLEdBQUcsR0FBSTtBQUFBLEVBQ1g7QUFBQSxFQUVBLE1BQU0sZUFBZTtBQTdvRnpCO0FBOG9GUSxTQUFLLFdBQVcsT0FBTyxPQUFPLENBQUMsR0FBRyxrQkFBa0IsTUFBTSxLQUFLLFNBQVMsQ0FBQztBQUd6RSxRQUFJLEtBQUssU0FBUyxvQkFBb0IsQ0FBQyxLQUFLLFNBQVMsZ0JBQWdCO0FBQ2pFLFdBQUksVUFBSyxTQUFTLGdCQUFkLG1CQUEyQixrQkFBa0I7QUFBRSxnQkFBUSxJQUFJLDJEQUEyRDtBQUFBLE1BQUc7QUFDN0gsV0FBSyxTQUFTLGlCQUFpQjtBQUFBLFFBQzNCLFNBQVMsS0FBSyxTQUFTLGlCQUFpQixXQUFXO0FBQUEsUUFDbkQsWUFBWSxLQUFLLFNBQVMsaUJBQWlCLGNBQWM7QUFBQSxRQUN6RCxTQUFTLENBQUM7QUFBQSxNQUNkO0FBQUEsSUFFSjtBQUdBLFFBQUksQ0FBQyxLQUFLLFNBQVMsZ0JBQWdCO0FBQy9CLFdBQUssU0FBUyxpQkFBaUIsaUJBQWlCO0FBQUEsSUFDcEQ7QUFHQSxRQUFJLENBQUMsS0FBSyxTQUFTLGVBQWUsWUFBWTtBQUMxQyxXQUFLLFNBQVMsZUFBZSxhQUFhO0FBQUEsSUFDOUM7QUFHQSxRQUFJLEtBQUssU0FBUyxXQUFXLEtBQUssU0FBUyxRQUFRLG1CQUFtQixRQUFXO0FBQzdFLGFBQU8sS0FBSyxTQUFTLFFBQVE7QUFBQSxJQUNqQztBQUVBLFFBQUksQ0FBQyxLQUFLLFNBQVMsYUFBYTtBQUM1QixXQUFLLFNBQVMsY0FBYyxFQUFFLEdBQUcsaUJBQWlCLFlBQVk7QUFBQSxJQUNsRSxPQUFPO0FBQ0gsV0FBSyxTQUFTLGNBQWMsT0FBTyxPQUFPLENBQUMsR0FBRyxpQkFBaUIsYUFBYSxLQUFLLFNBQVMsV0FBVztBQUFBLElBQ3pHO0FBQUEsRUFDSjtBQUFBLEVBRUEsTUFBTSxlQUFlO0FBQ2pCLFVBQU0sS0FBSyxTQUFTLEtBQUssUUFBUTtBQUFBLEVBQ3JDO0FBQUEsRUFFQSxXQUFXO0FBcnJGZjtBQXNyRlEsVUFBSSxnQkFBSyxhQUFMLG1CQUFlLGdCQUFmLG1CQUE0QixxQkFBb0IsS0FBSyxTQUFTLFlBQVksb0JBQW9CO0FBQzlGLFdBQUssdUJBQXVCLGVBQWU7QUFBQSxJQUMvQztBQUFBLEVBQ0o7QUFDSjsiLAogICJuYW1lcyI6IFsiZXhwb3J0cyIsICJtb2R1bGUiLCAiUGVyZm9ybWFuY2VQcm9maWxlciIsICJfYSIsICJfYiJdCn0K
