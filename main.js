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
  projectUpdates: {
    enabled: false,
    // Disabled by default
    kanbanFile: "0 - INBOX/Project Dashboard.md",
    configs: []
    // User configures specific project folders
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
      },
      "obsidian-kanban": {
        name: "Kanban",
        description: "Required for Project Dashboard and project updates",
        url: "https://github.com/mgmeyers/obsidian-kanban"
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
var ProjectUpdateConfigModal = class extends Modal {
  constructor(app, plugin, existingConfig = null, onSave) {
    super(app);
    this.plugin = plugin;
    this.existingConfig = existingConfig;
    this.onSave = onSave;
    this.config = existingConfig ? { ...existingConfig } : {
      name: "",
      projectFolder: "",
      schedule: "weekly",
      dayOfWeek: "Monday",
      timeOfDay: "09:00",
      enabled: true
    };
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", {
      text: this.existingConfig ? "Edit Project Update" : "Add Project Update"
    });
    contentEl.createEl("p", {
      text: 'Configure automatic status report generation for a project folder. Reports will be created in your Inbox with the format "UPDATE \u2014 [Project Name].md".',
      cls: "setting-item-description"
    });
    new Setting(contentEl).setName("Project Name").setDesc('Display name for this project update (e.g., "PBSWI", "Personal Projects")').addText((text) => text.setPlaceholder("Project Name").setValue(this.config.name).onChange((value) => {
      this.config.name = value.trim();
    }));
    const folderSetting = new Setting(contentEl).setName("Project Folder Path").setDesc('Path to the project folder to track (e.g., "1 - PROJECTS/PBSWI")');
    const folderInput = folderSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: "1 - PROJECTS/Subfolder",
      value: this.config.projectFolder
    });
    folderInput.addClass("folder-suggest-input");
    folderInput.style.width = "100%";
    const folders = this.app.vault.getAllLoadedFiles().filter((f) => f.children !== void 0).map((f) => f.path).sort();
    const datalistId = "folder-suggest-" + Math.random().toString(36).substr(2, 9);
    const datalist = contentEl.createEl("datalist", { attr: { id: datalistId } });
    folders.forEach((folder) => {
      datalist.createEl("option", { value: folder });
    });
    folderInput.setAttribute("list", datalistId);
    folderInput.addEventListener("input", (e) => {
      this.config.projectFolder = e.target.value.trim();
    });
    new Setting(contentEl).setName("Update Frequency").setDesc("How often to generate project updates").addDropdown((dropdown) => dropdown.addOption("daily", "Daily").addOption("weekly", "Weekly").addOption("monthly", "Monthly").setValue(this.config.schedule).onChange((value) => {
      this.config.schedule = value;
    }));
    const dayOfWeekSetting = new Setting(contentEl).setName("Day of Week").setDesc("Which day to generate the weekly update").addDropdown((dropdown) => dropdown.addOption("Monday", "Monday").addOption("Tuesday", "Tuesday").addOption("Wednesday", "Wednesday").addOption("Thursday", "Thursday").addOption("Friday", "Friday").addOption("Saturday", "Saturday").addOption("Sunday", "Sunday").setValue(this.config.dayOfWeek || "Monday").onChange((value) => {
      this.config.dayOfWeek = value;
    }));
    dayOfWeekSetting.settingEl.style.display = this.config.schedule === "weekly" ? "" : "none";
    new Setting(contentEl).setName("Time of Day").setDesc("What time to generate the update (24-hour format)").addText((text) => text.setPlaceholder("09:00").setValue(this.config.timeOfDay || "09:00").onChange((value) => {
      this.config.timeOfDay = value.trim();
    }).inputEl.setAttribute("type", "time"));
    new Setting(contentEl).setName("Enabled").setDesc("Turn this project update on or off").addToggle((toggle) => toggle.setValue(this.config.enabled).onChange((value) => {
      this.config.enabled = value;
    }));
    const buttonContainer = contentEl.createEl("div", { cls: "modal-button-container" });
    const saveButton = buttonContainer.createEl("button", {
      text: "Save",
      cls: "mod-cta"
    });
    saveButton.addEventListener("click", () => {
      if (this.validateConfig()) {
        this.onSave(this.config);
        this.close();
      }
    });
    const cancelButton = buttonContainer.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.close());
  }
  validateConfig() {
    if (!this.config.name) {
      new Notice("Please enter a project name");
      return false;
    }
    if (!this.config.projectFolder) {
      new Notice("Please enter a project folder path");
      return false;
    }
    const folder = this.app.vault.getAbstractFileByPath(this.config.projectFolder);
    if (!folder) {
      new Notice(`Folder not found: ${this.config.projectFolder}. Please create it first or check the path.`, 5e3);
      return false;
    }
    if (this.config.timeOfDay && !/^\d{2}:\d{2}$/.test(this.config.timeOfDay)) {
      new Notice("Please enter a valid time in HH:MM format (e.g., 09:00)");
      return false;
    }
    return true;
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _i;
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
      console.log(`Quick PARA: Updated tags for ${file.name} - PARA: ${paraLocation}, Subfolders: ${subfolderTags.join(", ")}`);
      (_g = this.profiler) == null ? void 0 : _g.increment("tagging:updated");
    } catch (error) {
      console.error("Error updating PARA tags:", error);
      (_h = this.profiler) == null ? void 0 : _h.increment("tagging:errors");
    } finally {
      (_i = this.profiler) == null ? void 0 : _i.end(timer, { ...context, paraLocation });
    }
  }
  async bulkUpdateTags(preview = true) {
    var _a, _b;
    const files = this.app.vault.getMarkdownFiles();
    const timer = (_a = this.profiler) == null ? void 0 : _a.start("tagging:bulk-update");
    let updated = 0;
    try {
      if (preview) {
        new Notice(`Preview mode not yet implemented. Will update ${files.length} files.`);
      }
      new Notice(`Updating PARA tags for ${files.length} files...`);
      for (const file of files) {
        await this.updateParaTags(file);
        updated++;
      }
      new Notice(`Updated PARA tags for ${updated} files!`);
    } finally {
      (_b = this.profiler) == null ? void 0 : _b.end(timer, { totalFiles: files.length, updated });
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
      text: "Quick PARA helps you organize your Obsidian vault using the PARA method (Projects, Areas, Resources, Archive). This plugin automates folder setup, template deployment, and project update generation.",
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
    new Setting(containerEl).setName("\u{1F50D} Check Dependencies").setDesc("Verify that required plugins (Templater, Tasks, Kanban) are installed. Make sure each plugin is also active after installation.").addButton((button) => button.setButtonText("Check Dependencies").onClick(async () => {
      await this.plugin.checkDependencies(true);
    }));
    new Setting(containerEl).setName("\u{1F3F7}\uFE0F Update All PARA Tags").setDesc("Bulk update PARA tags for all files in your vault to match their current folder locations").addButton((button) => button.setButtonText("Update All Tags").onClick(async () => {
      await this.plugin.taggingManager.bulkUpdateTags();
    }));
    new Setting(containerEl).setName("\u{1F4DD} Deploy PARA Templates").setDesc("Install default templates for notes in each PARA folder (inbox, projects, areas, resources, archive), plus the Project Dashboard and PARA Method Overview guide. These are starting points you can customize to your liking. Set these templates in Templater plugin settings to use them when creating new notes. Only creates missing templates, will not overwrite your customizations.").addButton((button) => button.setButtonText("Deploy Templates").onClick(async () => {
      await this.plugin.templateManager.deployAllTemplates();
    }));
    containerEl.createEl("h4", { text: "Required Dependencies" });
    const templaterLink = containerEl.createEl("div", { cls: "setting-item-description" });
    templaterLink.innerHTML = '\u2022 <strong>Templater</strong>: Required for template variable substitution. <a href="obsidian://show-plugin?id=templater-obsidian">Install from Community Plugins</a>';
    const tasksLink = containerEl.createEl("div", { cls: "setting-item-description" });
    tasksLink.innerHTML = '\u2022 <strong>Tasks</strong>: Required for task management features. <a href="obsidian://show-plugin?id=obsidian-tasks-plugin">Install from Community Plugins</a>';
    const kanbanLink = containerEl.createEl("div", { cls: "setting-item-description" });
    kanbanLink.innerHTML = '\u2022 <strong>Kanban</strong>: Required for Project Dashboard and project update generation. This plugin visualizes your active work and enables the automated update workflow. <a href="obsidian://show-plugin?id=obsidian-kanban">Install from Community Plugins</a>';
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
    containerEl.createEl("h3", { text: "Project Update Generation" });
    containerEl.createEl("p", {
      text: 'Automatically generate recurring status reports for any project folder. Each project can have its own schedule (daily, weekly, or monthly). All update notes are created in your Inbox folder with names like "UPDATE \u2014 [PROJECT NAME].md".',
      cls: "setting-item-description"
    });
    containerEl.createEl("p", {
      text: `The Kanban plugin (required dependency) provides the Project Dashboard that tracks your active work. If a Kanban board doesn't exist at the path below, deploy the Project Dashboard template using the "Deploy PARA Templates" button. You can change the board path if needed.`,
      cls: "setting-item-description"
    });
    new Setting(containerEl).setName("Enable Project Updates").setDesc("Turn on scheduled project update generation. When disabled, no automatic updates will be created.").addToggle((toggle) => toggle.setValue(this.plugin.settings.projectUpdates.enabled).onChange(async (value) => {
      this.plugin.settings.projectUpdates.enabled = value;
      await this.plugin.saveSettings();
    }));
    const kanbanSetting = new Setting(containerEl).setName("Kanban Board File").setDesc("Path to your Project Dashboard kanban board. If this file doesn't exist, it will be created in your Inbox when you enable Project Updates.");
    const files = this.app.vault.getMarkdownFiles().map((f) => f.path).sort();
    const filesDatalistId = "kanban-file-suggest";
    const filesDatalist = containerEl.createEl("datalist", { attr: { id: filesDatalistId } });
    files.forEach((file) => {
      filesDatalist.createEl("option", { value: file });
    });
    const kanbanInput = kanbanSetting.controlEl.createEl("input", {
      type: "text",
      placeholder: "0 - INBOX/Project Dashboard.md",
      value: this.plugin.settings.projectUpdates.kanbanFile || "0 - INBOX/Project Dashboard.md",
      attr: { list: filesDatalistId }
    });
    kanbanInput.style.width = "100%";
    kanbanInput.addEventListener("input", async (e) => {
      this.plugin.settings.projectUpdates.kanbanFile = e.target.value.trim();
      await this.plugin.saveSettings();
    });
    if (this.plugin.settings.projectUpdates.configs.length === 0) {
      containerEl.createEl("p", {
        text: 'No project updates configured. Click "Add Project Update" to create your first automated status report.',
        cls: "setting-item-description"
      });
    } else {
      this.plugin.settings.projectUpdates.configs.forEach((config, index) => {
        let scheduleDesc = config.schedule;
        if (config.schedule === "weekly" && config.dayOfWeek) {
          scheduleDesc = `${config.dayOfWeek}s`;
        }
        if (config.timeOfDay) {
          scheduleDesc += ` at ${config.timeOfDay}`;
        }
        const fullDesc = `${scheduleDesc} \u2022 ${config.projectFolder}${config.enabled ? "" : " (disabled)"}`;
        new Setting(containerEl).setName(config.name || "Unnamed Project Update").setDesc(fullDesc).addButton((button) => button.setButtonText("Edit").onClick(() => {
          this.plugin.openProjectUpdateConfigModal(config, index);
        })).addButton((button) => button.setButtonText("Delete").setWarning().onClick(async () => {
          this.plugin.settings.projectUpdates.configs.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        }));
      });
    }
    new Setting(containerEl).setName("Add Project Update").setDesc("Configure a new automated project update").addButton((button) => button.setButtonText("+ Add Project Update").onClick(() => {
      this.plugin.openProjectUpdateConfigModal();
    }));
    new Setting(containerEl).setName("Generate Updates Now").setDesc("Manually generate project updates for all enabled configurations right now").addButton((button) => button.setButtonText("Generate Now").setCta().onClick(async () => {
      await this.plugin.generateAllProjectUpdates();
    }));
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
    this.taggingManager = new TaggingManager(this.app, this.settings, this.profiler);
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
      id: "generate-project-updates",
      name: "Generate all project updates now",
      callback: async () => {
        var _a2, _b2;
        if (!((_a2 = this.settings.projectUpdates) == null ? void 0 : _a2.enabled)) {
          new Notice("Project updates are disabled in settings. Enable them first.");
          return;
        }
        if (!((_b2 = this.settings.projectUpdates) == null ? void 0 : _b2.configs) || this.settings.projectUpdates.configs.length === 0) {
          new Notice("No project updates configured. Add one in settings first.");
          return;
        }
        await this.generateAllProjectUpdates();
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
    this.addRibbonIcon("layout-grid", "Quick PARA Setup", async () => {
      await this.provisioningManager.runSetupWizard();
    });
    this.addRibbonIcon("calendar-check", "Generate Project Updates", async () => {
      var _a2, _b2;
      if (!((_a2 = this.settings.projectUpdates) == null ? void 0 : _a2.enabled)) {
        new Notice("Project updates are disabled. Enable them in settings first.");
        return;
      }
      if (!((_b2 = this.settings.projectUpdates) == null ? void 0 : _b2.configs) || this.settings.projectUpdates.configs.length === 0) {
        new Notice("No project updates configured. Add one in settings first.");
        return;
      }
      await this.generateAllProjectUpdates();
    });
    this.addRibbonIcon("tags", "Update PARA tags for all files", async () => {
      await this.taggingManager.bulkUpdateTags();
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
          this.settings.projectUpdates.configs[configIndex] = config;
        } else {
          this.settings.projectUpdates.configs.push(config);
        }
        await this.saveSettings();
        const settingsTab = this.app.setting.pluginTabs.find((tab) => tab instanceof QuickParaSettingTab);
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
    var _a, _b, _c;
    const enabledConfigs = this.settings.projectUpdates.configs.filter((c) => c.enabled);
    const timer = (_a = this.profiler) == null ? void 0 : _a.start("project-updates:generate-all");
    if (enabledConfigs.length === 0) {
      new Notice("No enabled project updates found.");
      (_b = this.profiler) == null ? void 0 : _b.end(timer, { total: 0, successCount: 0 });
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
        new Notice(`Error generating update for ${config.name}: ${error.message}`, 5e3);
      }
    }
    new Notice(`Generated ${successCount} of ${enabledConfigs.length} project update(s) successfully!`);
    (_c = this.profiler) == null ? void 0 : _c.end(timer, { total: enabledConfigs.length, successCount });
  }
  /**
   * Generate a single project update
   * @param {Object} config - Project update configuration
   */
  async generateProjectUpdate(config) {
    var _a, _b, _c, _d;
    const timer = (_a = this.profiler) == null ? void 0 : _a.start("project-updates:generate");
    const context = { configName: config == null ? void 0 : config.name, projectFolder: config == null ? void 0 : config.projectFolder };
    const inboxFolder = this.settings.paraFolders.inbox || "0 - INBOX";
    const updateFileName = `UPDATE \u2014 ${config.name}.md`;
    const updatePath = `${inboxFolder}/${updateFileName}`;
    context.updatePath = updatePath;
    let created = false;
    let success = false;
    try {
      let updateFile = this.app.vault.getAbstractFileByPath(updatePath);
      if (!updateFile) {
        const initialContent = `---
tags:
  - all
  - project-updates
para: inbox
created: ${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}
project_folder: ${config.projectFolder}
---

# ${updateFileName.replace(".md", "")}

## Notes

`;
        updateFile = await this.app.vault.create(updatePath, initialContent);
        console.log(`Quick PARA: Created new project update file: ${updatePath}`);
        created = true;
      }
      const kanbanPath = this.settings.projectUpdates.kanbanFile;
      await this.agendaManager.updateProjectAgenda(updatePath, kanbanPath, config.projectFolder);
      console.log(`Quick PARA: Updated project agenda for ${config.name}`);
      success = true;
    } finally {
      (_b = this.profiler) == null ? void 0 : _b.end(timer, { ...context, created, success });
      if (success) {
        (_c = this.profiler) == null ? void 0 : _c.increment("project-updates:success");
      } else {
        (_d = this.profiler) == null ? void 0 : _d.increment("project-updates:errors");
      }
    }
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsic3JjL3BlcmZvcm1hbmNlLXByb2ZpbGVyLmpzIiwgInNyYy9pbmRleC5qcyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY2xhc3MgUGVyZm9ybWFuY2VQcm9maWxlciB7XG4gICAgY29uc3RydWN0b3Iob3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIHRoaXMuZW5hYmxlZCA9IG9wdGlvbnMuZW5hYmxlZCA/PyBmYWxzZTtcbiAgICAgICAgdGhpcy5zbG93VGhyZXNob2xkID0gb3B0aW9ucy5zbG93VGhyZXNob2xkID8/IDIwMDtcbiAgICAgICAgdGhpcy5yZXNldCgpO1xuICAgIH1cblxuICAgIHJlc2V0KCkge1xuICAgICAgICB0aGlzLnRpbWVycyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5zdGF0cyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5jb3VudGVycyA9IG5ldyBNYXAoKTtcbiAgICAgICAgdGhpcy5zZXNzaW9uU3RhcnQgPSBEYXRlLm5vdygpO1xuICAgICAgICB0aGlzLnRpbWVyQ291bnRlciA9IDA7XG4gICAgfVxuXG4gICAgbm93KCkge1xuICAgICAgICBpZiAodHlwZW9mIHBlcmZvcm1hbmNlICE9PSAndW5kZWZpbmVkJyAmJiB0eXBlb2YgcGVyZm9ybWFuY2Uubm93ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gcGVyZm9ybWFuY2Uubm93KCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIERhdGUubm93KCk7XG4gICAgfVxuXG4gICAgc2V0RW5hYmxlZChlbmFibGVkKSB7XG4gICAgICAgIGlmICh0aGlzLmVuYWJsZWQgPT09IGVuYWJsZWQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuZW5hYmxlZCA9IGVuYWJsZWQ7XG4gICAgICAgIGlmIChlbmFibGVkKSB7XG4gICAgICAgICAgICB0aGlzLnJlc2V0KCk7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ1tRdWljayBQQVJBXVtQZXJmXSBQcm9maWxpbmcgZW5hYmxlZCcpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZS5pbmZvKCdbUXVpY2sgUEFSQV1bUGVyZl0gUHJvZmlsaW5nIGRpc2FibGVkJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb25maWd1cmUob3B0aW9ucyA9IHt9KSB7XG4gICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucy5zbG93VGhyZXNob2xkID09PSAnbnVtYmVyJyAmJiAhTnVtYmVyLmlzTmFOKG9wdGlvbnMuc2xvd1RocmVzaG9sZCkpIHtcbiAgICAgICAgICAgIHRoaXMuc2xvd1RocmVzaG9sZCA9IG9wdGlvbnMuc2xvd1RocmVzaG9sZDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHN0YXJ0KGxhYmVsKSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8ICFsYWJlbCkge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBoYW5kbGUgPSBgJHtsYWJlbH06JHt0aGlzLnRpbWVyQ291bnRlcisrfWA7XG4gICAgICAgIHRoaXMudGltZXJzLnNldChoYW5kbGUsIHtcbiAgICAgICAgICAgIGxhYmVsLFxuICAgICAgICAgICAgc3RhcnQ6IHRoaXMubm93KClcbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiBoYW5kbGU7XG4gICAgfVxuXG4gICAgZW5kKGhhbmRsZSwgY29udGV4dCA9IHt9KSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8ICFoYW5kbGUpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnRpbWVycy5nZXQoaGFuZGxlKTtcbiAgICAgICAgaWYgKCF0aW1lcikge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBkdXJhdGlvbiA9IHRoaXMubm93KCkgLSB0aW1lci5zdGFydDtcbiAgICAgICAgdGhpcy50aW1lcnMuZGVsZXRlKGhhbmRsZSk7XG4gICAgICAgIHRoaXMucmVjb3JkRHVyYXRpb24odGltZXIubGFiZWwsIGR1cmF0aW9uLCBjb250ZXh0KTtcbiAgICAgICAgcmV0dXJuIGR1cmF0aW9uO1xuICAgIH1cblxuICAgIGFzeW5jIHRpbWUobGFiZWwsIGZuLCBjb250ZXh0QnVpbGRlcikge1xuICAgICAgICBpZiAodHlwZW9mIGZuICE9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkKSB7XG4gICAgICAgICAgICByZXR1cm4gZm4oKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGhhbmRsZSA9IHRoaXMuc3RhcnQobGFiZWwpO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgcmV0dXJuIGF3YWl0IGZuKCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBjb25zdCBjb250ZXh0ID0gdHlwZW9mIGNvbnRleHRCdWlsZGVyID09PSAnZnVuY3Rpb24nXG4gICAgICAgICAgICAgICAgPyBjb250ZXh0QnVpbGRlcigpXG4gICAgICAgICAgICAgICAgOiAoY29udGV4dEJ1aWxkZXIgfHwge30pO1xuICAgICAgICAgICAgdGhpcy5lbmQoaGFuZGxlLCBjb250ZXh0KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJlY29yZER1cmF0aW9uKGxhYmVsLCBkdXJhdGlvbiwgY29udGV4dCA9IHt9KSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8IHR5cGVvZiBkdXJhdGlvbiAhPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHN0YXRzID0gdGhpcy5zdGF0cy5nZXQobGFiZWwpIHx8IHtcbiAgICAgICAgICAgIGNvdW50OiAwLFxuICAgICAgICAgICAgdG90YWxNczogMCxcbiAgICAgICAgICAgIG1heE1zOiAwLFxuICAgICAgICAgICAgbWluTXM6IG51bGwsXG4gICAgICAgICAgICBsYXN0Q29udGV4dDogbnVsbFxuICAgICAgICB9O1xuXG4gICAgICAgIHN0YXRzLmNvdW50ICs9IDE7XG4gICAgICAgIHN0YXRzLnRvdGFsTXMgKz0gZHVyYXRpb247XG4gICAgICAgIHN0YXRzLm1heE1zID0gTWF0aC5tYXgoc3RhdHMubWF4TXMsIGR1cmF0aW9uKTtcbiAgICAgICAgc3RhdHMubWluTXMgPSBzdGF0cy5taW5NcyA9PT0gbnVsbCA/IGR1cmF0aW9uIDogTWF0aC5taW4oc3RhdHMubWluTXMsIGR1cmF0aW9uKTtcbiAgICAgICAgc3RhdHMubGFzdENvbnRleHQgPSBjb250ZXh0O1xuXG4gICAgICAgIHRoaXMuc3RhdHMuc2V0KGxhYmVsLCBzdGF0cyk7XG5cbiAgICAgICAgY29uc3QgZHVyYXRpb25MYWJlbCA9IGR1cmF0aW9uLnRvRml4ZWQoMik7XG4gICAgICAgIGlmIChkdXJhdGlvbiA+PSB0aGlzLnNsb3dUaHJlc2hvbGQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgW1F1aWNrIFBBUkFdW1BlcmZdICR7bGFiZWx9IHRvb2sgJHtkdXJhdGlvbkxhYmVsfW1zYCwgY29udGV4dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zb2xlLmRlYnVnKGBbUXVpY2sgUEFSQV1bUGVyZl0gJHtsYWJlbH06ICR7ZHVyYXRpb25MYWJlbH1tc2AsIGNvbnRleHQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaW5jcmVtZW50KGxhYmVsKSB7XG4gICAgICAgIGlmICghdGhpcy5lbmFibGVkIHx8ICFsYWJlbCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgY291bnQgPSAodGhpcy5jb3VudGVycy5nZXQobGFiZWwpIHx8IDApICsgMTtcbiAgICAgICAgdGhpcy5jb3VudGVycy5zZXQobGFiZWwsIGNvdW50KTtcbiAgICAgICAgcmV0dXJuIGNvdW50O1xuICAgIH1cblxuICAgIHN1bW1hcml6ZSgpIHtcbiAgICAgICAgY29uc3Qgc3RhdHMgPSB7fTtcbiAgICAgICAgZm9yIChjb25zdCBbbGFiZWwsIGVudHJ5XSBvZiB0aGlzLnN0YXRzLmVudHJpZXMoKSkge1xuICAgICAgICAgICAgc3RhdHNbbGFiZWxdID0ge1xuICAgICAgICAgICAgICAgIGNvdW50OiBlbnRyeS5jb3VudCxcbiAgICAgICAgICAgICAgICB0b3RhbE1zOiBOdW1iZXIoZW50cnkudG90YWxNcy50b0ZpeGVkKDIpKSxcbiAgICAgICAgICAgICAgICBhdmdNczogZW50cnkuY291bnQgPyBOdW1iZXIoKGVudHJ5LnRvdGFsTXMgLyBlbnRyeS5jb3VudCkudG9GaXhlZCgyKSkgOiAwLFxuICAgICAgICAgICAgICAgIG1heE1zOiBOdW1iZXIoZW50cnkubWF4TXMudG9GaXhlZCgyKSksXG4gICAgICAgICAgICAgICAgbWluTXM6IGVudHJ5Lm1pbk1zID09PSBudWxsID8gbnVsbCA6IE51bWJlcihlbnRyeS5taW5Ncy50b0ZpeGVkKDIpKVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNvdW50ZXJzID0ge307XG4gICAgICAgIGZvciAoY29uc3QgW2xhYmVsLCBjb3VudF0gb2YgdGhpcy5jb3VudGVycy5lbnRyaWVzKCkpIHtcbiAgICAgICAgICAgIGNvdW50ZXJzW2xhYmVsXSA9IGNvdW50O1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGVuYWJsZWQ6IHRoaXMuZW5hYmxlZCxcbiAgICAgICAgICAgIHNsb3dUaHJlc2hvbGQ6IHRoaXMuc2xvd1RocmVzaG9sZCxcbiAgICAgICAgICAgIHNlc3Npb25TdGFydDogdGhpcy5zZXNzaW9uU3RhcnQsXG4gICAgICAgICAgICBzZXNzaW9uRHVyYXRpb25NczogRGF0ZS5ub3coKSAtIHRoaXMuc2Vzc2lvblN0YXJ0LFxuICAgICAgICAgICAgc3RhdHMsXG4gICAgICAgICAgICBjb3VudGVyc1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIGxvZ1N1bW1hcnkocmVhc29uID0gJ21hbnVhbCcpIHtcbiAgICAgICAgaWYgKCF0aGlzLmVuYWJsZWQpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuaW5mbygnW1F1aWNrIFBBUkFdW1BlcmZdIFByb2ZpbGluZyBkaXNhYmxlZDsgbm8gc3VtbWFyeSB0byBsb2cuJyk7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IHN1bW1hcnkgPSB0aGlzLnN1bW1hcml6ZSgpO1xuICAgICAgICBjb25zb2xlLmdyb3VwKGBbUXVpY2sgUEFSQV1bUGVyZl0gU3VtbWFyeSAoJHtyZWFzb259KWApO1xuICAgICAgICBjb25zb2xlLmluZm8oJ1Nlc3Npb24gZHVyYXRpb24gKG1zKTonLCBzdW1tYXJ5LnNlc3Npb25EdXJhdGlvbk1zKTtcbiAgICAgICAgY29uc29sZS5pbmZvKCdTbG93IHRocmVzaG9sZCAobXMpOicsIHN1bW1hcnkuc2xvd1RocmVzaG9sZCk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnRXZlbnQgY291bnRlcnM6Jywgc3VtbWFyeS5jb3VudGVycyk7XG4gICAgICAgIGNvbnNvbGUuaW5mbygnVGltaW5nIHN0YXRzOicsIHN1bW1hcnkuc3RhdHMpO1xuICAgICAgICBjb25zb2xlLmdyb3VwRW5kKCk7XG4gICAgICAgIHJldHVybiBzdW1tYXJ5O1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7IFBlcmZvcm1hbmNlUHJvZmlsZXIgfTtcbiIsICJjb25zdCB7IFBsdWdpbiwgTm90aWNlLCBNb2RhbCwgUGx1Z2luU2V0dGluZ1RhYiwgU2V0dGluZyB9ID0gcmVxdWlyZSgnb2JzaWRpYW4nKTtcbmNvbnN0IHsgUGVyZm9ybWFuY2VQcm9maWxlciB9ID0gcmVxdWlyZSgnLi9wZXJmb3JtYW5jZS1wcm9maWxlcicpO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBERUZBVUxUIFNFVFRJTkdTXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNvbnN0IERFRkFVTFRfU0VUVElOR1MgPSB7XG4gICAgZmlyc3RSdW46IHRydWUsXG4gICAgcGFyYUZvbGRlcnM6IHtcbiAgICAgICAgaW5ib3g6IFwiMCAtIElOQk9YXCIsXG4gICAgICAgIHByb2plY3RzOiBcIjEgLSBQUk9KRUNUU1wiLFxuICAgICAgICBhcmVhczogXCIyIC0gQVJFQVNcIixcbiAgICAgICAgcmVzb3VyY2VzOiBcIjMgLSBSRVNPVVJDRVNcIixcbiAgICAgICAgYXJjaGl2ZTogXCI0IC0gQVJDSElWRVwiXG4gICAgfSxcbiAgICBwcm9qZWN0VXBkYXRlczoge1xuICAgICAgICBlbmFibGVkOiBmYWxzZSwgIC8vIERpc2FibGVkIGJ5IGRlZmF1bHRcbiAgICAgICAga2FuYmFuRmlsZTogXCIwIC0gSU5CT1gvUHJvamVjdCBEYXNoYm9hcmQubWRcIixcbiAgICAgICAgY29uZmlnczogW10gICAgICAvLyBVc2VyIGNvbmZpZ3VyZXMgc3BlY2lmaWMgcHJvamVjdCBmb2xkZXJzXG4gICAgfSxcbiAgICB0ZW1wbGF0ZXM6IHtcbiAgICAgICAgYXV0b0RlcGxveU9uU2V0dXA6IHRydWUsXG4gICAgICAgIGJhY2t1cEJlZm9yZU92ZXJ3cml0ZTogdHJ1ZVxuICAgIH0sXG4gICAgdGFnZ2luZzoge1xuICAgICAgICBwcm9wZXJ0eU5hbWU6IFwicGFyYVwiLCAgLy8gTG9ja2VkIC0gbm90IHVzZXItY29uZmlndXJhYmxlXG4gICAgICAgIHBlcnNpc3RTdWJmb2xkZXJUYWdzOiB0cnVlXG4gICAgfSxcbiAgICBkaWFnbm9zdGljczoge1xuICAgICAgICBwcm9maWxpbmdFbmFibGVkOiBmYWxzZSxcbiAgICAgICAgc2xvd09wZXJhdGlvblRocmVzaG9sZE1zOiAyMDAsXG4gICAgICAgIGxvZ1N1bW1hcnlPblVubG9hZDogdHJ1ZVxuICAgIH1cbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIERFUEVOREVOQ1kgTUFOQUdFUlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jbGFzcyBEZXBlbmRlbmN5TWFuYWdlciB7XG4gICAgY29uc3RydWN0b3IoYXBwKSB7XG4gICAgICAgIHRoaXMuYXBwID0gYXBwO1xuICAgICAgICB0aGlzLnJlcXVpcmVkUGx1Z2lucyA9IHtcbiAgICAgICAgICAgICd0ZW1wbGF0ZXItb2JzaWRpYW4nOiB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ1RlbXBsYXRlcicsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZXF1aXJlZCBmb3IgdGVtcGxhdGUgdmFyaWFibGUgc3Vic3RpdHV0aW9uJyxcbiAgICAgICAgICAgICAgICB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vU2lsZW50Vm9pZDEzL1RlbXBsYXRlcidcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAnb2JzaWRpYW4tdGFza3MtcGx1Z2luJzoge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdUYXNrcycsXG4gICAgICAgICAgICAgICAgZGVzY3JpcHRpb246ICdSZXF1aXJlZCBmb3IgdGFzayBtYW5hZ2VtZW50JyxcbiAgICAgICAgICAgICAgICB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vb2JzaWRpYW4tdGFza3MtZ3JvdXAvb2JzaWRpYW4tdGFza3MnXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ29ic2lkaWFuLWthbmJhbic6IHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnS2FuYmFuJyxcbiAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogJ1JlcXVpcmVkIGZvciBQcm9qZWN0IERhc2hib2FyZCBhbmQgcHJvamVjdCB1cGRhdGVzJyxcbiAgICAgICAgICAgICAgICB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWdtZXllcnMvb2JzaWRpYW4ta2FuYmFuJ1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXMub3B0aW9uYWxQbHVnaW5zID0ge307XG4gICAgfVxuXG4gICAgYXN5bmMgY2hlY2tEZXBlbmRlbmNpZXMoKSB7XG4gICAgICAgIGNvbnN0IG1pc3NpbmcgPSBbXTtcbiAgICAgICAgY29uc3QgaW5zdGFsbGVkID0gW107XG5cbiAgICAgICAgZm9yIChjb25zdCBbcGx1Z2luSWQsIGluZm9dIG9mIE9iamVjdC5lbnRyaWVzKHRoaXMucmVxdWlyZWRQbHVnaW5zKSkge1xuICAgICAgICAgICAgaWYgKHRoaXMuaXNQbHVnaW5FbmFibGVkKHBsdWdpbklkKSkge1xuICAgICAgICAgICAgICAgIGluc3RhbGxlZC5wdXNoKGluZm8ubmFtZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIG1pc3NpbmcucHVzaCh7IC4uLmluZm8sIHBsdWdpbklkLCByZXF1aXJlZDogdHJ1ZSB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGZvciAoY29uc3QgW3BsdWdpbklkLCBpbmZvXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLm9wdGlvbmFsUGx1Z2lucykpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLmlzUGx1Z2luRW5hYmxlZChwbHVnaW5JZCkpIHtcbiAgICAgICAgICAgICAgICBpbnN0YWxsZWQucHVzaChpbmZvLm5hbWUpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBtaXNzaW5nLnB1c2goeyAuLi5pbmZvLCBwbHVnaW5JZCwgcmVxdWlyZWQ6IGZhbHNlIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGFsbE1ldDogbWlzc2luZy5maWx0ZXIocCA9PiBwLnJlcXVpcmVkKS5sZW5ndGggPT09IDAsXG4gICAgICAgICAgICBpbnN0YWxsZWQsXG4gICAgICAgICAgICBtaXNzaW5nXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgaXNQbHVnaW5JbnN0YWxsZWQocGx1Z2luSWQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXBwLnBsdWdpbnMubWFuaWZlc3RzW3BsdWdpbklkXSAhPT0gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGlzUGx1Z2luRW5hYmxlZChwbHVnaW5JZCkge1xuICAgICAgICByZXR1cm4gdGhpcy5hcHAucGx1Z2lucy5lbmFibGVkUGx1Z2lucy5oYXMocGx1Z2luSWQpO1xuICAgIH1cblxuICAgIGFzeW5jIHNob3dEZXBlbmRlbmN5V2FybmluZyhtaXNzaW5nKSB7XG4gICAgICAgIGNvbnN0IG1vZGFsID0gbmV3IERlcGVuZGVuY3lXYXJuaW5nTW9kYWwodGhpcy5hcHAsIG1pc3NpbmcpO1xuICAgICAgICBtb2RhbC5vcGVuKCk7XG4gICAgfVxufVxuXG5jbGFzcyBEZXBlbmRlbmN5V2FybmluZ01vZGFsIGV4dGVuZHMgTW9kYWwge1xuICAgIGNvbnN0cnVjdG9yKGFwcCwgbWlzc2luZykge1xuICAgICAgICBzdXBlcihhcHApO1xuICAgICAgICB0aGlzLm1pc3NpbmcgPSBtaXNzaW5nO1xuICAgIH1cblxuICAgIG9uT3BlbigpIHtcbiAgICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuXG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdQbHVnaW4gRGVwZW5kZW5jaWVzJyB9KTtcblxuICAgICAgICBjb25zdCByZXF1aXJlZCA9IHRoaXMubWlzc2luZy5maWx0ZXIocCA9PiBwLnJlcXVpcmVkKTtcbiAgICAgICAgY29uc3Qgb3B0aW9uYWwgPSB0aGlzLm1pc3NpbmcuZmlsdGVyKHAgPT4gIXAucmVxdWlyZWQpO1xuXG4gICAgICAgIGlmIChyZXF1aXJlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnUmVxdWlyZWQgUGx1Z2lucyAoTWlzc2luZyknIH0pO1xuICAgICAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgICAgIHRleHQ6ICdUaGVzZSBwbHVnaW5zIGFyZSByZXF1aXJlZCBmb3IgUXVpY2sgUEFSQSB0byBmdW5jdGlvbiBwcm9wZXJseS4nLFxuICAgICAgICAgICAgICAgIGNsczogJ21vZC13YXJuaW5nJ1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IHJlcUxpc3QgPSBjb250ZW50RWwuY3JlYXRlRWwoJ3VsJyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHBsdWdpbiBvZiByZXF1aXJlZCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpID0gcmVxTGlzdC5jcmVhdGVFbCgnbGknKTtcbiAgICAgICAgICAgICAgICBsaS5jcmVhdGVFbCgnc3Ryb25nJywgeyB0ZXh0OiBwbHVnaW4ubmFtZSB9KTtcbiAgICAgICAgICAgICAgICBsaS5hcHBlbmRUZXh0KGA6ICR7cGx1Z2luLmRlc2NyaXB0aW9ufWApO1xuICAgICAgICAgICAgICAgIGxpLmNyZWF0ZUVsKCdicicpO1xuICAgICAgICAgICAgICAgIGxpLmNyZWF0ZUVsKCdhJywgeyB0ZXh0OiAnSW5zdGFsbCcsIGhyZWY6IHBsdWdpbi51cmwgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAob3B0aW9uYWwubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ09wdGlvbmFsIFBsdWdpbnMgKE1pc3NpbmcpJyB9KTtcbiAgICAgICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgICAgICB0ZXh0OiAnVGhlc2UgcGx1Z2lucyBlbmhhbmNlIFF1aWNrIFBBUkEgYnV0IGFyZSBub3QgcmVxdWlyZWQuJ1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIGNvbnN0IG9wdExpc3QgPSBjb250ZW50RWwuY3JlYXRlRWwoJ3VsJyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHBsdWdpbiBvZiBvcHRpb25hbCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IGxpID0gb3B0TGlzdC5jcmVhdGVFbCgnbGknKTtcbiAgICAgICAgICAgICAgICBsaS5jcmVhdGVFbCgnc3Ryb25nJywgeyB0ZXh0OiBwbHVnaW4ubmFtZSB9KTtcbiAgICAgICAgICAgICAgICBsaS5hcHBlbmRUZXh0KGA6ICR7cGx1Z2luLmRlc2NyaXB0aW9ufWApO1xuICAgICAgICAgICAgICAgIGxpLmNyZWF0ZUVsKCdicicpO1xuICAgICAgICAgICAgICAgIGxpLmNyZWF0ZUVsKCdhJywgeyB0ZXh0OiAnSW5zdGFsbCcsIGhyZWY6IHBsdWdpbi51cmwgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5taXNzaW5nLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiAnQWxsIGRlcGVuZGVuY2llcyBhcmUgaW5zdGFsbGVkIScgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBidXR0b25Db250YWluZXIgPSBjb250ZW50RWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnbW9kYWwtYnV0dG9uLWNvbnRhaW5lcicgfSk7XG4gICAgICAgIGNvbnN0IGNsb3NlQnV0dG9uID0gYnV0dG9uQ29udGFpbmVyLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdDbG9zZScgfSk7XG4gICAgICAgIGNsb3NlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5jbG9zZSgpKTtcbiAgICB9XG5cbiAgICBvbkNsb3NlKCkge1xuICAgICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBQUk9KRUNUIFVQREFURSBDT05GSUdVUkFUSU9OIE1PREFMXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNsYXNzIFByb2plY3RVcGRhdGVDb25maWdNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgICBjb25zdHJ1Y3RvcihhcHAsIHBsdWdpbiwgZXhpc3RpbmdDb25maWcgPSBudWxsLCBvblNhdmUpIHtcbiAgICAgICAgc3VwZXIoYXBwKTtcbiAgICAgICAgdGhpcy5wbHVnaW4gPSBwbHVnaW47XG4gICAgICAgIHRoaXMuZXhpc3RpbmdDb25maWcgPSBleGlzdGluZ0NvbmZpZztcbiAgICAgICAgdGhpcy5vblNhdmUgPSBvblNhdmU7XG5cbiAgICAgICAgLy8gSW5pdGlhbGl6ZSB3aXRoIGV4aXN0aW5nIGNvbmZpZyBvciBkZWZhdWx0c1xuICAgICAgICB0aGlzLmNvbmZpZyA9IGV4aXN0aW5nQ29uZmlnID8geyAuLi5leGlzdGluZ0NvbmZpZyB9IDoge1xuICAgICAgICAgICAgbmFtZTogJycsXG4gICAgICAgICAgICBwcm9qZWN0Rm9sZGVyOiAnJyxcbiAgICAgICAgICAgIHNjaGVkdWxlOiAnd2Vla2x5JyxcbiAgICAgICAgICAgIGRheU9mV2VlazogJ01vbmRheScsXG4gICAgICAgICAgICB0aW1lT2ZEYXk6ICcwOTowMCcsXG4gICAgICAgICAgICBlbmFibGVkOiB0cnVlXG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgb25PcGVuKCkge1xuICAgICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XG5cbiAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdoMicsIHtcbiAgICAgICAgICAgIHRleHQ6IHRoaXMuZXhpc3RpbmdDb25maWcgPyAnRWRpdCBQcm9qZWN0IFVwZGF0ZScgOiAnQWRkIFByb2plY3QgVXBkYXRlJ1xuICAgICAgICB9KTtcblxuICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICB0ZXh0OiAnQ29uZmlndXJlIGF1dG9tYXRpYyBzdGF0dXMgcmVwb3J0IGdlbmVyYXRpb24gZm9yIGEgcHJvamVjdCBmb2xkZXIuIFJlcG9ydHMgd2lsbCBiZSBjcmVhdGVkIGluIHlvdXIgSW5ib3ggd2l0aCB0aGUgZm9ybWF0IFwiVVBEQVRFIFx1MjAxNCBbUHJvamVjdCBOYW1lXS5tZFwiLicsXG4gICAgICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFByb2plY3QgTmFtZVxuICAgICAgICBuZXcgU2V0dGluZyhjb250ZW50RWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnUHJvamVjdCBOYW1lJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdEaXNwbGF5IG5hbWUgZm9yIHRoaXMgcHJvamVjdCB1cGRhdGUgKGUuZy4sIFwiUEJTV0lcIiwgXCJQZXJzb25hbCBQcm9qZWN0c1wiKScpXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcbiAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJ1Byb2plY3QgTmFtZScpXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMuY29uZmlnLm5hbWUpXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKHZhbHVlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcubmFtZSA9IHZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgLy8gUHJvamVjdCBGb2xkZXJcbiAgICAgICAgY29uc3QgZm9sZGVyU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRlbnRFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdQcm9qZWN0IEZvbGRlciBQYXRoJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdQYXRoIHRvIHRoZSBwcm9qZWN0IGZvbGRlciB0byB0cmFjayAoZS5nLiwgXCIxIC0gUFJPSkVDVFMvUEJTV0lcIiknKTtcblxuICAgICAgICAvLyBDcmVhdGUgdGV4dCBpbnB1dCB3aXRoIGZvbGRlciBzdWdnZXN0aW9uc1xuICAgICAgICBjb25zdCBmb2xkZXJJbnB1dCA9IGZvbGRlclNldHRpbmcuY29udHJvbEVsLmNyZWF0ZUVsKCdpbnB1dCcsIHtcbiAgICAgICAgICAgIHR5cGU6ICd0ZXh0JyxcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyOiAnMSAtIFBST0pFQ1RTL1N1YmZvbGRlcicsXG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5jb25maWcucHJvamVjdEZvbGRlclxuICAgICAgICB9KTtcbiAgICAgICAgZm9sZGVySW5wdXQuYWRkQ2xhc3MoJ2ZvbGRlci1zdWdnZXN0LWlucHV0Jyk7XG4gICAgICAgIGZvbGRlcklucHV0LnN0eWxlLndpZHRoID0gJzEwMCUnO1xuXG4gICAgICAgIC8vIEdldCBhbGwgZm9sZGVycyBpbiB2YXVsdFxuICAgICAgICBjb25zdCBmb2xkZXJzID0gdGhpcy5hcHAudmF1bHQuZ2V0QWxsTG9hZGVkRmlsZXMoKVxuICAgICAgICAgICAgLmZpbHRlcihmID0+IGYuY2hpbGRyZW4gIT09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIC5tYXAoZiA9PiBmLnBhdGgpXG4gICAgICAgICAgICAuc29ydCgpO1xuXG4gICAgICAgIC8vIEFkZCBkYXRhbGlzdCBmb3IgYXV0b2NvbXBsZXRlXG4gICAgICAgIGNvbnN0IGRhdGFsaXN0SWQgPSAnZm9sZGVyLXN1Z2dlc3QtJyArIE1hdGgucmFuZG9tKCkudG9TdHJpbmcoMzYpLnN1YnN0cigyLCA5KTtcbiAgICAgICAgY29uc3QgZGF0YWxpc3QgPSBjb250ZW50RWwuY3JlYXRlRWwoJ2RhdGFsaXN0JywgeyBhdHRyOiB7IGlkOiBkYXRhbGlzdElkIH0gfSk7XG4gICAgICAgIGZvbGRlcnMuZm9yRWFjaChmb2xkZXIgPT4ge1xuICAgICAgICAgICAgZGF0YWxpc3QuY3JlYXRlRWwoJ29wdGlvbicsIHsgdmFsdWU6IGZvbGRlciB9KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGZvbGRlcklucHV0LnNldEF0dHJpYnV0ZSgnbGlzdCcsIGRhdGFsaXN0SWQpO1xuXG4gICAgICAgIC8vIFVwZGF0ZSBjb25maWcgb24gY2hhbmdlXG4gICAgICAgIGZvbGRlcklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgKGUpID0+IHtcbiAgICAgICAgICAgIHRoaXMuY29uZmlnLnByb2plY3RGb2xkZXIgPSBlLnRhcmdldC52YWx1ZS50cmltKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIFNjaGVkdWxlIEZyZXF1ZW5jeVxuICAgICAgICBuZXcgU2V0dGluZyhjb250ZW50RWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnVXBkYXRlIEZyZXF1ZW5jeScpXG4gICAgICAgICAgICAuc2V0RGVzYygnSG93IG9mdGVuIHRvIGdlbmVyYXRlIHByb2plY3QgdXBkYXRlcycpXG4gICAgICAgICAgICAuYWRkRHJvcGRvd24oZHJvcGRvd24gPT4gZHJvcGRvd25cbiAgICAgICAgICAgICAgICAuYWRkT3B0aW9uKCdkYWlseScsICdEYWlseScpXG4gICAgICAgICAgICAgICAgLmFkZE9wdGlvbignd2Vla2x5JywgJ1dlZWtseScpXG4gICAgICAgICAgICAgICAgLmFkZE9wdGlvbignbW9udGhseScsICdNb250aGx5JylcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5jb25maWcuc2NoZWR1bGUpXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKHZhbHVlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcuc2NoZWR1bGUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgLy8gRGF5IG9mIFdlZWsgKG9ubHkgZm9yIHdlZWtseSlcbiAgICAgICAgY29uc3QgZGF5T2ZXZWVrU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRlbnRFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdEYXkgb2YgV2VlaycpXG4gICAgICAgICAgICAuc2V0RGVzYygnV2hpY2ggZGF5IHRvIGdlbmVyYXRlIHRoZSB3ZWVrbHkgdXBkYXRlJylcbiAgICAgICAgICAgIC5hZGREcm9wZG93bihkcm9wZG93biA9PiBkcm9wZG93blxuICAgICAgICAgICAgICAgIC5hZGRPcHRpb24oJ01vbmRheScsICdNb25kYXknKVxuICAgICAgICAgICAgICAgIC5hZGRPcHRpb24oJ1R1ZXNkYXknLCAnVHVlc2RheScpXG4gICAgICAgICAgICAgICAgLmFkZE9wdGlvbignV2VkbmVzZGF5JywgJ1dlZG5lc2RheScpXG4gICAgICAgICAgICAgICAgLmFkZE9wdGlvbignVGh1cnNkYXknLCAnVGh1cnNkYXknKVxuICAgICAgICAgICAgICAgIC5hZGRPcHRpb24oJ0ZyaWRheScsICdGcmlkYXknKVxuICAgICAgICAgICAgICAgIC5hZGRPcHRpb24oJ1NhdHVyZGF5JywgJ1NhdHVyZGF5JylcbiAgICAgICAgICAgICAgICAuYWRkT3B0aW9uKCdTdW5kYXknLCAnU3VuZGF5JylcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5jb25maWcuZGF5T2ZXZWVrIHx8ICdNb25kYXknKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZSh2YWx1ZSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuY29uZmlnLmRheU9mV2VlayA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAvLyBTaG93L2hpZGUgZGF5IG9mIHdlZWsgYmFzZWQgb24gc2NoZWR1bGVcbiAgICAgICAgZGF5T2ZXZWVrU2V0dGluZy5zZXR0aW5nRWwuc3R5bGUuZGlzcGxheSA9IHRoaXMuY29uZmlnLnNjaGVkdWxlID09PSAnd2Vla2x5JyA/ICcnIDogJ25vbmUnO1xuXG4gICAgICAgIC8vIFRpbWUgb2YgRGF5XG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRlbnRFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdUaW1lIG9mIERheScpXG4gICAgICAgICAgICAuc2V0RGVzYygnV2hhdCB0aW1lIHRvIGdlbmVyYXRlIHRoZSB1cGRhdGUgKDI0LWhvdXIgZm9ybWF0KScpXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcbiAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJzA5OjAwJylcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5jb25maWcudGltZU9mRGF5IHx8ICcwOTowMCcpXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKHZhbHVlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcudGltZU9mRGF5ID0gdmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgLmlucHV0RWwuc2V0QXR0cmlidXRlKCd0eXBlJywgJ3RpbWUnKSk7XG5cbiAgICAgICAgLy8gRW5hYmxlL0Rpc2FibGVcbiAgICAgICAgbmV3IFNldHRpbmcoY29udGVudEVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0VuYWJsZWQnKVxuICAgICAgICAgICAgLnNldERlc2MoJ1R1cm4gdGhpcyBwcm9qZWN0IHVwZGF0ZSBvbiBvciBvZmYnKVxuICAgICAgICAgICAgLmFkZFRvZ2dsZSh0b2dnbGUgPT4gdG9nZ2xlXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKHRoaXMuY29uZmlnLmVuYWJsZWQpXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKHZhbHVlID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb25maWcuZW5hYmxlZCA9IHZhbHVlO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICAvLyBCdXR0b25zXG4gICAgICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdtb2RhbC1idXR0b24tY29udGFpbmVyJyB9KTtcblxuICAgICAgICBjb25zdCBzYXZlQnV0dG9uID0gYnV0dG9uQ29udGFpbmVyLmNyZWF0ZUVsKCdidXR0b24nLCB7XG4gICAgICAgICAgICB0ZXh0OiAnU2F2ZScsXG4gICAgICAgICAgICBjbHM6ICdtb2QtY3RhJ1xuICAgICAgICB9KTtcbiAgICAgICAgc2F2ZUJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgIGlmICh0aGlzLnZhbGlkYXRlQ29uZmlnKCkpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uU2F2ZSh0aGlzLmNvbmZpZyk7XG4gICAgICAgICAgICAgICAgdGhpcy5jbG9zZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBjYW5jZWxCdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ0NhbmNlbCcgfSk7XG4gICAgICAgIGNhbmNlbEJ1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHRoaXMuY2xvc2UoKSk7XG4gICAgfVxuXG4gICAgdmFsaWRhdGVDb25maWcoKSB7XG4gICAgICAgIGlmICghdGhpcy5jb25maWcubmFtZSkge1xuICAgICAgICAgICAgbmV3IE5vdGljZSgnUGxlYXNlIGVudGVyIGEgcHJvamVjdCBuYW1lJyk7XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoIXRoaXMuY29uZmlnLnByb2plY3RGb2xkZXIpIHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1BsZWFzZSBlbnRlciBhIHByb2plY3QgZm9sZGVyIHBhdGgnKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIGZvbGRlciBleGlzdHNcbiAgICAgICAgY29uc3QgZm9sZGVyID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKHRoaXMuY29uZmlnLnByb2plY3RGb2xkZXIpO1xuICAgICAgICBpZiAoIWZvbGRlcikge1xuICAgICAgICAgICAgbmV3IE5vdGljZShgRm9sZGVyIG5vdCBmb3VuZDogJHt0aGlzLmNvbmZpZy5wcm9qZWN0Rm9sZGVyfS4gUGxlYXNlIGNyZWF0ZSBpdCBmaXJzdCBvciBjaGVjayB0aGUgcGF0aC5gLCA1MDAwKTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFZhbGlkYXRlIHRpbWUgZm9ybWF0XG4gICAgICAgIGlmICh0aGlzLmNvbmZpZy50aW1lT2ZEYXkgJiYgIS9eXFxkezJ9OlxcZHsyfSQvLnRlc3QodGhpcy5jb25maWcudGltZU9mRGF5KSkge1xuICAgICAgICAgICAgbmV3IE5vdGljZSgnUGxlYXNlIGVudGVyIGEgdmFsaWQgdGltZSBpbiBISDpNTSBmb3JtYXQgKGUuZy4sIDA5OjAwKScpO1xuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgb25DbG9zZSgpIHtcbiAgICAgICAgY29uc3QgeyBjb250ZW50RWwgfSA9IHRoaXM7XG4gICAgICAgIGNvbnRlbnRFbC5lbXB0eSgpO1xuICAgIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUFJPVklTSU9OSU5HIE1BTkFHRVJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY2xhc3MgUHJvdmlzaW9uaW5nTWFuYWdlciB7XG4gICAgY29uc3RydWN0b3IoYXBwLCBzZXR0aW5ncykge1xuICAgICAgICB0aGlzLmFwcCA9IGFwcDtcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHNldHRpbmdzO1xuICAgIH1cblxuICAgIGFzeW5jIGRldGVjdEV4aXN0aW5nU3RydWN0dXJlKCkge1xuICAgICAgICBjb25zdCBkZXRlY3RlZCA9IHt9O1xuICAgICAgICBjb25zdCBmb2xkZXJzID0gdGhpcy5hcHAudmF1bHQuZ2V0QWxsTG9hZGVkRmlsZXMoKVxuICAgICAgICAgICAgLmZpbHRlcihmID0+IGYuY2hpbGRyZW4gIT09IHVuZGVmaW5lZCk7IC8vIE9ubHkgZm9sZGVyc1xuXG4gICAgICAgIGZvciAoY29uc3QgW2xvY2F0aW9uLCBmb2xkZXJOYW1lXSBvZiBPYmplY3QuZW50cmllcyh0aGlzLnNldHRpbmdzLnBhcmFGb2xkZXJzKSkge1xuICAgICAgICAgICAgY29uc3QgZXhpc3RzID0gZm9sZGVycy5zb21lKGYgPT4gZi5wYXRoID09PSBmb2xkZXJOYW1lKTtcbiAgICAgICAgICAgIGRldGVjdGVkW2xvY2F0aW9uXSA9IHsgZXhpc3RzLCBwYXRoOiBmb2xkZXJOYW1lIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZGV0ZWN0ZWQ7XG4gICAgfVxuXG4gICAgYXN5bmMgcHJvdmlzaW9uRm9sZGVycyhjcmVhdGVNaXNzaW5nT25seSA9IHRydWUpIHtcbiAgICAgICAgY29uc3Qgc3RydWN0dXJlID0gYXdhaXQgdGhpcy5kZXRlY3RFeGlzdGluZ1N0cnVjdHVyZSgpO1xuICAgICAgICBjb25zdCBjcmVhdGVkID0gW107XG4gICAgICAgIGNvbnN0IHNraXBwZWQgPSBbXTtcblxuICAgICAgICBmb3IgKGNvbnN0IFtsb2NhdGlvbiwgaW5mb10gb2YgT2JqZWN0LmVudHJpZXMoc3RydWN0dXJlKSkge1xuICAgICAgICAgICAgaWYgKGluZm8uZXhpc3RzICYmIGNyZWF0ZU1pc3NpbmdPbmx5KSB7XG4gICAgICAgICAgICAgICAgc2tpcHBlZC5wdXNoKGluZm8ucGF0aCk7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKGluZm8ucGF0aCk7XG4gICAgICAgICAgICAgICAgY3JlYXRlZC5wdXNoKGluZm8ucGF0aCk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdhbHJlYWR5IGV4aXN0cycpKSB7XG4gICAgICAgICAgICAgICAgICAgIHNraXBwZWQucHVzaChpbmZvLnBhdGgpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byBjcmVhdGUgZm9sZGVyICR7aW5mby5wYXRofTpgLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHsgY3JlYXRlZCwgc2tpcHBlZCB9O1xuICAgIH1cblxuICAgIGFzeW5jIHJ1blNldHVwV2l6YXJkKCkge1xuICAgICAgICBjb25zdCBtb2RhbCA9IG5ldyBTZXR1cFdpemFyZE1vZGFsKHRoaXMuYXBwLCB0aGlzKTtcbiAgICAgICAgbW9kYWwub3BlbigpO1xuICAgIH1cbn1cblxuY2xhc3MgU2V0dXBXaXphcmRNb2RhbCBleHRlbmRzIE1vZGFsIHtcbiAgICBjb25zdHJ1Y3RvcihhcHAsIHByb3Zpc2lvbmluZ01hbmFnZXIpIHtcbiAgICAgICAgc3VwZXIoYXBwKTtcbiAgICAgICAgdGhpcy5wcm92aXNpb25pbmdNYW5hZ2VyID0gcHJvdmlzaW9uaW5nTWFuYWdlcjtcbiAgICAgICAgdGhpcy5zdGVwID0gMTtcbiAgICAgICAgdGhpcy50b3RhbFN0ZXBzID0gMztcbiAgICB9XG5cbiAgICBvbk9wZW4oKSB7XG4gICAgICAgIHRoaXMucmVuZGVyU3RlcCgpO1xuICAgIH1cblxuICAgIHJlbmRlclN0ZXAoKSB7XG4gICAgICAgIGNvbnN0IHsgY29udGVudEVsIH0gPSB0aGlzO1xuICAgICAgICBjb250ZW50RWwuZW1wdHkoKTtcblxuICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gyJywgeyB0ZXh0OiBgUXVpY2sgUEFSQSBTZXR1cCAoU3RlcCAke3RoaXMuc3RlcH0vJHt0aGlzLnRvdGFsU3RlcHN9KWAgfSk7XG5cbiAgICAgICAgc3dpdGNoICh0aGlzLnN0ZXApIHtcbiAgICAgICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlcldlbGNvbWVTdGVwKGNvbnRlbnRFbCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJGb2xkZXJTdGVwKGNvbnRlbnRFbCk7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIDM6XG4gICAgICAgICAgICAgICAgdGhpcy5yZW5kZXJDb25maXJtU3RlcChjb250ZW50RWwpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmVuZGVyV2VsY29tZVN0ZXAoY29udGVudEVsKSB7XG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ1dlbGNvbWUgdG8gUXVpY2sgUEFSQSEgVGhpcyB3aXphcmQgd2lsbCBoZWxwIHlvdSBzZXQgdXAgeW91ciB2YXVsdCB3aXRoIHRoZSBQQVJBIG1ldGhvZC4nIH0pO1xuXG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdXaGF0IGlzIFBBUkE/JyB9KTtcbiAgICAgICAgY29uc3QgbGlzdCA9IGNvbnRlbnRFbC5jcmVhdGVFbCgndWwnKTtcbiAgICAgICAgbGlzdC5jcmVhdGVFbCgnbGknLCB7IHRleHQ6ICdQcm9qZWN0czogQWN0aXZlIHdvcmsgd2l0aCBkZWFkbGluZXMnIH0pO1xuICAgICAgICBsaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ0FyZWFzOiBPbmdvaW5nIHJlc3BvbnNpYmlsaXRpZXMnIH0pO1xuICAgICAgICBsaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ1Jlc291cmNlczogUmVmZXJlbmNlIG1hdGVyaWFscycgfSk7XG4gICAgICAgIGxpc3QuY3JlYXRlRWwoJ2xpJywgeyB0ZXh0OiAnQXJjaGl2ZTogQ29tcGxldGVkIG9yIGluYWN0aXZlIGl0ZW1zJyB9KTtcblxuICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ3AnLCB7IHRleHQ6ICdUaGlzIHdpemFyZCB3aWxsOicgfSk7XG4gICAgICAgIGNvbnN0IHNldHVwTGlzdCA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnb2wnKTtcbiAgICAgICAgc2V0dXBMaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ0NyZWF0ZSBQQVJBIGZvbGRlciBzdHJ1Y3R1cmUnIH0pO1xuICAgICAgICBzZXR1cExpc3QuY3JlYXRlRWwoJ2xpJywgeyB0ZXh0OiAnRGVwbG95IG5vdGUgdGVtcGxhdGVzJyB9KTtcbiAgICAgICAgc2V0dXBMaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogJ0NvbmZpZ3VyZSBhdXRvbWF0aWMgdGFnZ2luZycgfSk7XG5cbiAgICAgICAgdGhpcy5yZW5kZXJCdXR0b25zKGNvbnRlbnRFbCwgZmFsc2UsIHRydWUpO1xuICAgIH1cblxuICAgIGFzeW5jIHJlbmRlckZvbGRlclN0ZXAoY29udGVudEVsKSB7XG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgncCcsIHsgdGV4dDogJ0NoZWNraW5nIGV4aXN0aW5nIGZvbGRlciBzdHJ1Y3R1cmUuLi4nIH0pO1xuXG4gICAgICAgIGNvbnN0IHN0cnVjdHVyZSA9IGF3YWl0IHRoaXMucHJvdmlzaW9uaW5nTWFuYWdlci5kZXRlY3RFeGlzdGluZ1N0cnVjdHVyZSgpO1xuXG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdQQVJBIEZvbGRlcnMnIH0pO1xuICAgICAgICBjb25zdCB0YWJsZSA9IGNvbnRlbnRFbC5jcmVhdGVFbCgndGFibGUnLCB7IGNsczogJ3BhcmEtZm9sZGVycy10YWJsZScgfSk7XG5cbiAgICAgICAgY29uc3QgaGVhZGVyID0gdGFibGUuY3JlYXRlRWwoJ3RyJyk7XG4gICAgICAgIGhlYWRlci5jcmVhdGVFbCgndGgnLCB7IHRleHQ6ICdMb2NhdGlvbicgfSk7XG4gICAgICAgIGhlYWRlci5jcmVhdGVFbCgndGgnLCB7IHRleHQ6ICdGb2xkZXIgUGF0aCcgfSk7XG4gICAgICAgIGhlYWRlci5jcmVhdGVFbCgndGgnLCB7IHRleHQ6ICdTdGF0dXMnIH0pO1xuXG4gICAgICAgIGZvciAoY29uc3QgW2xvY2F0aW9uLCBpbmZvXSBvZiBPYmplY3QuZW50cmllcyhzdHJ1Y3R1cmUpKSB7XG4gICAgICAgICAgICBjb25zdCByb3cgPSB0YWJsZS5jcmVhdGVFbCgndHInKTtcbiAgICAgICAgICAgIHJvdy5jcmVhdGVFbCgndGQnLCB7IHRleHQ6IGxvY2F0aW9uLmNoYXJBdCgwKS50b1VwcGVyQ2FzZSgpICsgbG9jYXRpb24uc2xpY2UoMSkgfSk7XG4gICAgICAgICAgICByb3cuY3JlYXRlRWwoJ3RkJywgeyB0ZXh0OiBpbmZvLnBhdGggfSk7XG4gICAgICAgICAgICBjb25zdCBzdGF0dXNDZWxsID0gcm93LmNyZWF0ZUVsKCd0ZCcpO1xuICAgICAgICAgICAgc3RhdHVzQ2VsbC5jcmVhdGVFbCgnc3BhbicsIHtcbiAgICAgICAgICAgICAgICB0ZXh0OiBpbmZvLmV4aXN0cyA/ICdFeGlzdHMnIDogJ1dpbGwgY3JlYXRlJyxcbiAgICAgICAgICAgICAgICBjbHM6IGluZm8uZXhpc3RzID8gJ3BhcmEtZXhpc3RzJyA6ICdwYXJhLWNyZWF0ZSdcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgdGV4dDogJ0V4aXN0aW5nIGZvbGRlcnMgd2lsbCBub3QgYmUgbW9kaWZpZWQuIE9ubHkgbWlzc2luZyBmb2xkZXJzIHdpbGwgYmUgY3JlYXRlZC4nLFxuICAgICAgICAgICAgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJ1xuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnJlbmRlckJ1dHRvbnMoY29udGVudEVsLCB0cnVlLCB0cnVlKTtcbiAgICB9XG5cbiAgICBhc3luYyByZW5kZXJDb25maXJtU3RlcChjb250ZW50RWwpIHtcbiAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdwJywgeyB0ZXh0OiAnQ3JlYXRpbmcgZm9sZGVycy4uLicgfSk7XG5cbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5wcm92aXNpb25pbmdNYW5hZ2VyLnByb3Zpc2lvbkZvbGRlcnModHJ1ZSk7XG5cbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgICAgIGNvbnRlbnRFbC5jcmVhdGVFbCgnaDInLCB7IHRleHQ6ICdTZXR1cCBDb21wbGV0ZSEnIH0pO1xuXG4gICAgICAgIGlmIChyZXN1bHQuY3JlYXRlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnQ3JlYXRlZCBGb2xkZXJzJyB9KTtcbiAgICAgICAgICAgIGNvbnN0IGNyZWF0ZWRMaXN0ID0gY29udGVudEVsLmNyZWF0ZUVsKCd1bCcpO1xuICAgICAgICAgICAgZm9yIChjb25zdCBmb2xkZXIgb2YgcmVzdWx0LmNyZWF0ZWQpIHtcbiAgICAgICAgICAgICAgICBjcmVhdGVkTGlzdC5jcmVhdGVFbCgnbGknLCB7IHRleHQ6IGZvbGRlciB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChyZXN1bHQuc2tpcHBlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBjb250ZW50RWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnRXhpc3RpbmcgRm9sZGVycyAoU2tpcHBlZCknIH0pO1xuICAgICAgICAgICAgY29uc3Qgc2tpcHBlZExpc3QgPSBjb250ZW50RWwuY3JlYXRlRWwoJ3VsJyk7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZvbGRlciBvZiByZXN1bHQuc2tpcHBlZCkge1xuICAgICAgICAgICAgICAgIHNraXBwZWRMaXN0LmNyZWF0ZUVsKCdsaScsIHsgdGV4dDogZm9sZGVyIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgY29udGVudEVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ05leHQgU3RlcHMnIH0pO1xuICAgICAgICBjb25zdCBuZXh0U3RlcHMgPSBjb250ZW50RWwuY3JlYXRlRWwoJ29sJyk7XG4gICAgICAgIG5leHRTdGVwcy5jcmVhdGVFbCgnbGknLCB7IHRleHQ6ICdJbnN0YWxsIFRlbXBsYXRlciBhbmQgVGFza3MgcGx1Z2lucyAoaWYgbm90IGFscmVhZHkgaW5zdGFsbGVkKScgfSk7XG4gICAgICAgIG5leHRTdGVwcy5jcmVhdGVFbCgnbGknLCB7IHRleHQ6ICdEZXBsb3kgdGVtcGxhdGVzIHVzaW5nIHRoZSBcIkRlcGxveSBQQVJBIHRlbXBsYXRlc1wiIGNvbW1hbmQnIH0pO1xuICAgICAgICBuZXh0U3RlcHMuY3JlYXRlRWwoJ2xpJywgeyB0ZXh0OiAnU3RhcnQgY3JlYXRpbmcgbm90ZXMgaW4geW91ciBQQVJBIGZvbGRlcnMhJyB9KTtcblxuICAgICAgICB0aGlzLnJlbmRlckJ1dHRvbnMoY29udGVudEVsLCBmYWxzZSwgZmFsc2UsIHRydWUpO1xuICAgIH1cblxuICAgIHJlbmRlckJ1dHRvbnMoY29udGVudEVsLCBzaG93QmFjaywgc2hvd05leHQsIHNob3dDbG9zZSA9IGZhbHNlKSB7XG4gICAgICAgIGNvbnN0IGJ1dHRvbkNvbnRhaW5lciA9IGNvbnRlbnRFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdtb2RhbC1idXR0b24tY29udGFpbmVyJyB9KTtcblxuICAgICAgICBpZiAoc2hvd0JhY2spIHtcbiAgICAgICAgICAgIGNvbnN0IGJhY2tCdXR0b24gPSBidXR0b25Db250YWluZXIuY3JlYXRlRWwoJ2J1dHRvbicsIHsgdGV4dDogJ0JhY2snIH0pO1xuICAgICAgICAgICAgYmFja0J1dHRvbi5hZGRFdmVudExpc3RlbmVyKCdjbGljaycsICgpID0+IHtcbiAgICAgICAgICAgICAgICB0aGlzLnN0ZXAtLTtcbiAgICAgICAgICAgICAgICB0aGlzLnJlbmRlclN0ZXAoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHNob3dOZXh0KSB7XG4gICAgICAgICAgICBjb25zdCBuZXh0QnV0dG9uID0gYnV0dG9uQ29udGFpbmVyLmNyZWF0ZUVsKCdidXR0b24nLCB7IHRleHQ6ICdOZXh0JywgY2xzOiAnbW9kLWN0YScgfSk7XG4gICAgICAgICAgICBuZXh0QnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4ge1xuICAgICAgICAgICAgICAgIHRoaXMuc3RlcCsrO1xuICAgICAgICAgICAgICAgIHRoaXMucmVuZGVyU3RlcCgpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoc2hvd0Nsb3NlKSB7XG4gICAgICAgICAgICBjb25zdCBjbG9zZUJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnQ2xvc2UnLCBjbHM6ICdtb2QtY3RhJyB9KTtcbiAgICAgICAgICAgIGNsb3NlQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5jbG9zZSgpKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGNhbmNlbEJ1dHRvbiA9IGJ1dHRvbkNvbnRhaW5lci5jcmVhdGVFbCgnYnV0dG9uJywgeyB0ZXh0OiAnQ2FuY2VsJyB9KTtcbiAgICAgICAgY2FuY2VsQnV0dG9uLmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgKCkgPT4gdGhpcy5jbG9zZSgpKTtcbiAgICB9XG5cbiAgICBvbkNsb3NlKCkge1xuICAgICAgICBjb25zdCB7IGNvbnRlbnRFbCB9ID0gdGhpcztcbiAgICAgICAgY29udGVudEVsLmVtcHR5KCk7XG4gICAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBUQUdHSU5HIE1BTkFHRVJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuY2xhc3MgVGFnZ2luZ01hbmFnZXIge1xuICAgIGNvbnN0cnVjdG9yKGFwcCwgc2V0dGluZ3MsIHByb2ZpbGVyKSB7XG4gICAgICAgIHRoaXMuYXBwID0gYXBwO1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gc2V0dGluZ3M7XG4gICAgICAgIHRoaXMucHJvZmlsZXIgPSBwcm9maWxlcjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBEZXRlcm1pbmUgUEFSQSBsb2NhdGlvbiBhbmQgc3ViZm9sZGVyIHRhZyhzKSBiYXNlZCBvbiBmaWxlIHBhdGhcbiAgICAgKlxuICAgICAqIExvZ2ljOlxuICAgICAqIC0gUEFSQSBsb2NhdGlvbiBpcyBzdG9yZWQgYXMgYSBwcm9wZXJ0eSAoZS5nLiwgcGFyYTogXCJwcm9qZWN0c1wiKVxuICAgICAqIC0gU3ViZm9sZGVyIHRhZ3MgYXJlIGFwcGxpZWQgc2VwYXJhdGVseSBhbmQgcGVyc2lzdCBhY3Jvc3MgbW92ZXNcbiAgICAgKiAtIEV4YW1wbGU6IFwiMSAtIFByb2plY3RzL1BCU1dJL1NvbWUgUHJvamVjdC5tZFwiXG4gICAgICogICBSZXN1bHRzIGluOiBwYXJhIHByb3BlcnR5ID0gXCJwcm9qZWN0c1wiLCB0YWdzIGluY2x1ZGUgXCJwYnN3aVwiXG4gICAgICovXG4gICAgZ2V0VGFnc0Zyb21QYXRoKGZpbGVQYXRoKSB7XG4gICAgICAgIGxldCBwYXJhTG9jYXRpb24gPSBudWxsO1xuICAgICAgICBjb25zdCBzdWJmb2xkZXJUYWdzID0gW107XG5cbiAgICAgICAgLy8gRmluZCBtYXRjaGluZyBQQVJBIHJvb3QgZm9sZGVyIChjYXNlLWluc2Vuc2l0aXZlKVxuICAgICAgICBmb3IgKGNvbnN0IFtsb2NhdGlvbiwgZm9sZGVyTmFtZV0gb2YgT2JqZWN0LmVudHJpZXModGhpcy5zZXR0aW5ncy5wYXJhRm9sZGVycykpIHtcbiAgICAgICAgICAgIGNvbnN0IGxvd2VyRmlsZVBhdGggPSBmaWxlUGF0aC50b0xvd2VyQ2FzZSgpO1xuICAgICAgICAgICAgY29uc3QgbG93ZXJGb2xkZXJOYW1lID0gZm9sZGVyTmFtZS50b0xvd2VyQ2FzZSgpO1xuXG4gICAgICAgICAgICBpZiAobG93ZXJGaWxlUGF0aC5zdGFydHNXaXRoKGxvd2VyRm9sZGVyTmFtZSArICcvJykgfHwgbG93ZXJGaWxlUGF0aCA9PT0gbG93ZXJGb2xkZXJOYW1lKSB7XG4gICAgICAgICAgICAgICAgcGFyYUxvY2F0aW9uID0gbG9jYXRpb247XG5cbiAgICAgICAgICAgICAgICAvLyBFeHRyYWN0IHN1YmZvbGRlciBwYXRoIGFmdGVyIHRoZSBQQVJBIHJvb3QgKHVzZSBvcmlnaW5hbCBjYXNlIGZvciBleHRyYWN0aW9uKVxuICAgICAgICAgICAgICAgIGNvbnN0IHJlbWFpbmluZ1BhdGggPSBmaWxlUGF0aC5zdWJzdHJpbmcoZm9sZGVyTmFtZS5sZW5ndGggKyAxKTtcbiAgICAgICAgICAgICAgICBjb25zdCBwYXRoUGFydHMgPSByZW1haW5pbmdQYXRoLnNwbGl0KCcvJyk7XG5cbiAgICAgICAgICAgICAgICAvLyBJZiB0aGVyZSBhcmUgc3ViZm9sZGVycyAobm90IGp1c3QgdGhlIGZpbGVuYW1lKSwgYWRkIHRoZW0gYXMgdGFnc1xuICAgICAgICAgICAgICAgIGlmIChwYXRoUGFydHMubGVuZ3RoID4gMSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaXJzdCBzdWJmb2xkZXIgYmVjb21lcyBhIHRhZyAobG93ZXJjYXNlLCBubyBzcGFjZXMpXG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHN1YmZvbGRlciA9IHBhdGhQYXJ0c1swXTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHN1YmZvbGRlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ29udmVydCB0byBsb3dlcmNhc2Uga2ViYWItY2FzZVxuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3Qgc3ViZm9sZGVyVGFnID0gc3ViZm9sZGVyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnRvTG93ZXJDYXNlKClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxzKy9nLCAnLScpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1teYS16MC05XFwtXS9nLCAnJyk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChzdWJmb2xkZXJUYWcpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdWJmb2xkZXJUYWdzLnB1c2goc3ViZm9sZGVyVGFnKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHsgcGFyYUxvY2F0aW9uLCBzdWJmb2xkZXJUYWdzIH07XG4gICAgfVxuXG4gICAgYXN5bmMgdXBkYXRlUGFyYVRhZ3MoZmlsZSkge1xuICAgICAgICBpZiAoIWZpbGUpIHJldHVybjtcblxuICAgICAgICBjb25zdCBmaWxlUGF0aCA9IGZpbGUucGF0aDtcbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgndGFnZ2luZzp1cGRhdGUnKTtcbiAgICAgICAgY29uc3QgY29udGV4dCA9IHsgcGF0aDogZmlsZVBhdGggfTtcblxuICAgICAgICAvLyBTa2lwIGZpbGVzIGluIFRFTVBMQVRFUyBmb2xkZXIgLSB0ZW1wbGF0ZXMgc2hvdWxkbid0IGdldCBQQVJBIHByb3BlcnRpZXNcbiAgICAgICAgaWYgKGZpbGVQYXRoLmluY2x1ZGVzKCcvVEVNUExBVEVTLycpIHx8IGZpbGVQYXRoLnN0YXJ0c1dpdGgoJ1RFTVBMQVRFUy8nKSkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJ1F1aWNrIFBBUkE6IFNraXBwaW5nIHRlbXBsYXRlIGZpbGU6JywgZmlsZVBhdGgpO1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uaW5jcmVtZW50KCd0YWdnaW5nOnNraXA6dGVtcGxhdGVzJyk7XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQodGltZXIsIHsgLi4uY29udGV4dCwgcmVhc29uOiAndGVtcGxhdGUnIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRGV0ZXJtaW5lIFBBUkEgbG9jYXRpb24gYW5kIHN1YmZvbGRlciB0YWdzXG4gICAgICAgIGNvbnN0IHsgcGFyYUxvY2F0aW9uLCBzdWJmb2xkZXJUYWdzIH0gPSB0aGlzLmdldFRhZ3NGcm9tUGF0aChmaWxlUGF0aCk7XG5cbiAgICAgICAgLy8gSWYgZmlsZSBpcyBub3QgaW4gYSBQQVJBIGZvbGRlciwgc2tpcFxuICAgICAgICBpZiAoIXBhcmFMb2NhdGlvbikge1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uaW5jcmVtZW50KCd0YWdnaW5nOnNraXA6bm9uLXBhcmEnKTtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyAuLi5jb250ZXh0LCByZWFzb246ICdvdXRzaWRlLXBhcmEnIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IGNyZWF0ZWREYXRlID0gbnVsbDtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIFVzZSBjYWNoZWQgc3RhdCBmaXJzdDsgZmFsbCBiYWNrIHRvIGFkYXB0ZXIuc3RhdCB3aGljaCBpcyBhc3luY1xuICAgICAgICAgICAgY29uc3Qgc3RhdCA9IGZpbGUuc3RhdCA/PyBhd2FpdCB0aGlzLmFwcC52YXVsdC5hZGFwdGVyLnN0YXQoZmlsZS5wYXRoKTtcbiAgICAgICAgICAgIGlmIChzdGF0Py5jdGltZSkge1xuICAgICAgICAgICAgICAgIGNyZWF0ZWREYXRlID0gbmV3IERhdGUoc3RhdC5jdGltZSkudG9JU09TdHJpbmcoKS5zcGxpdCgnVCcpWzBdO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGNhdGNoIChzdGF0RXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ1F1aWNrIFBBUkE6IEZhaWxlZCB0byByZWFkIGZpbGUgc3RhdCBkYXRhJywgc3RhdEVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGFyY2hpdmVEYXRlID0gcGFyYUxvY2F0aW9uID09PSAnYXJjaGl2ZSdcbiAgICAgICAgICAgID8gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLnNwbGl0KCdUJylbMF1cbiAgICAgICAgICAgIDogbnVsbDtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBmcm9udG1hdHRlclxuICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAuZmlsZU1hbmFnZXIucHJvY2Vzc0Zyb250TWF0dGVyKGZpbGUsIChmcm9udG1hdHRlcikgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHJhd1RhZ3MgPSBBcnJheS5pc0FycmF5KGZyb250bWF0dGVyLnRhZ3MpXG4gICAgICAgICAgICAgICAgICAgID8gZnJvbnRtYXR0ZXIudGFncy5tYXAodGFnID0+IHRhZy50b1N0cmluZygpKVxuICAgICAgICAgICAgICAgICAgICA6IGZyb250bWF0dGVyLnRhZ3NcbiAgICAgICAgICAgICAgICAgICAgICAgID8gW2Zyb250bWF0dGVyLnRhZ3MudG9TdHJpbmcoKV1cbiAgICAgICAgICAgICAgICAgICAgICAgIDogW107XG5cbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgb2xkIFBBUkEgdGFncyAoaW4gY2FzZSB0aGV5IGV4aXN0IGZyb20gb2xkIHBsdWdpbiB2ZXJzaW9uKVxuICAgICAgICAgICAgICAgIC8vIEtlZXAgYWxsIG90aGVyIHRhZ3MgKGluY2x1ZGluZyBzdWJmb2xkZXIgdGFncyBmcm9tIHByZXZpb3VzIGxvY2F0aW9ucylcbiAgICAgICAgICAgICAgICBsZXQgZmlsdGVyZWRUYWdzID0gcmF3VGFncy5maWx0ZXIodGFnID0+ICF0YWcuc3RhcnRzV2l0aCgncGFyYS8nKSk7XG5cbiAgICAgICAgICAgICAgICAvLyBSZW1vdmUgdGVtcGxhdGUtc3BlY2lmaWMgdGFncyB0aGF0IHNob3VsZG4ndCBwcm9wYWdhdGVcbiAgICAgICAgICAgICAgICBmaWx0ZXJlZFRhZ3MgPSBmaWx0ZXJlZFRhZ3MuZmlsdGVyKHRhZyA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IHRhZ1N0ciA9IFN0cmluZyh0YWcpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0YWdTdHIgIT09ICd0ZW1wbGF0ZXMnICYmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICB0YWdTdHIgIT09ICd0ZW1wbGF0ZScgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhZ1N0ciAhPT0gJ3Jlc291cmNlcycgJiZcbiAgICAgICAgICAgICAgICAgICAgICAgICAgIHRhZ1N0ciAhPT0gJ2FsbCc7ICAvLyBXZSdsbCByZS1hZGQgJ2FsbCcgbGF0ZXJcbiAgICAgICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgICAgIC8vIE9wdGlvbmFsbHkgbWlncmF0ZSBvbGQgdGFnc1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLnNldHRpbmdzLnRhZ2dpbmcubWlncmF0ZU9sZFRhZ3MpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTWlncmF0aW9uIGFscmVhZHkgaGFwcGVucyBhYm92ZSBieSByZW1vdmluZyBwYXJhLyogdGFnc1xuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmxvZygnUXVpY2sgUEFSQTogTWlncmF0ZWQgb2xkIHBhcmEvKiB0YWdzJyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQnVpbGQgbmV3IHRhZyBsaXN0XG4gICAgICAgICAgICAgICAgY29uc3QgbmV4dFRhZ3MgPSBBcnJheS5mcm9tKG5ldyBTZXQoZmlsdGVyZWRUYWdzKSk7XG5cbiAgICAgICAgICAgICAgICAvLyBBZGQgc3ViZm9sZGVyIHRhZ3MgKHRoZXNlIHBlcnNpc3QgZXZlbiBhZnRlciBtb3ZpbmcsIGlmIGVuYWJsZWQpXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MudGFnZ2luZy5wZXJzaXN0U3ViZm9sZGVyVGFncykge1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHN1YmZvbGRlclRhZyBvZiBzdWJmb2xkZXJUYWdzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAoIW5leHRUYWdzLmluY2x1ZGVzKHN1YmZvbGRlclRhZykpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBuZXh0VGFncy5wdXNoKHN1YmZvbGRlclRhZyk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBBbHdheXMgaW5jbHVkZSAnYWxsJyB0YWcgZmlyc3RcbiAgICAgICAgICAgICAgICBmcm9udG1hdHRlci50YWdzID0gWydhbGwnLCAuLi5uZXh0VGFnc107XG5cbiAgICAgICAgICAgICAgICAvLyBTZXQgUEFSQSBsb2NhdGlvbiBhcyBhIHByb3BlcnR5IChjb25maWd1cmFibGUgbmFtZSlcbiAgICAgICAgICAgICAgICBjb25zdCBwcm9wZXJ0eU5hbWUgPSB0aGlzLnNldHRpbmdzLnRhZ2dpbmcucHJvcGVydHlOYW1lIHx8ICdwYXJhJztcbiAgICAgICAgICAgICAgICBmcm9udG1hdHRlcltwcm9wZXJ0eU5hbWVdID0gcGFyYUxvY2F0aW9uO1xuXG4gICAgICAgICAgICAgICAgLy8gQWRkIGFyY2hpdmVkIGRhdGUgaWYgbW92aW5nIHRvIGFyY2hpdmVcbiAgICAgICAgICAgICAgICBpZiAoYXJjaGl2ZURhdGUgJiYgIWZyb250bWF0dGVyLmFyY2hpdmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGZyb250bWF0dGVyLmFyY2hpdmVkID0gYXJjaGl2ZURhdGU7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gQWRkIGNyZWF0ZWQgZGF0ZSBpZiBtaXNzaW5nXG4gICAgICAgICAgICAgICAgaWYgKCFmcm9udG1hdHRlci5jcmVhdGVkICYmIGNyZWF0ZWREYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgIGZyb250bWF0dGVyLmNyZWF0ZWQgPSBjcmVhdGVkRGF0ZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgY29uc29sZS5sb2coYFF1aWNrIFBBUkE6IFVwZGF0ZWQgdGFncyBmb3IgJHtmaWxlLm5hbWV9IC0gUEFSQTogJHtwYXJhTG9jYXRpb259LCBTdWJmb2xkZXJzOiAke3N1YmZvbGRlclRhZ3Muam9pbignLCAnKX1gKTtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmluY3JlbWVudCgndGFnZ2luZzp1cGRhdGVkJyk7XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKCdFcnJvciB1cGRhdGluZyBQQVJBIHRhZ3M6JywgZXJyb3IpO1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uaW5jcmVtZW50KCd0YWdnaW5nOmVycm9ycycpO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKHRpbWVyLCB7IC4uLmNvbnRleHQsIHBhcmFMb2NhdGlvbiB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIGJ1bGtVcGRhdGVUYWdzKHByZXZpZXcgPSB0cnVlKSB7XG4gICAgICAgIGNvbnN0IGZpbGVzID0gdGhpcy5hcHAudmF1bHQuZ2V0TWFya2Rvd25GaWxlcygpO1xuICAgICAgICBjb25zdCB0aW1lciA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCd0YWdnaW5nOmJ1bGstdXBkYXRlJyk7XG4gICAgICAgIGxldCB1cGRhdGVkID0gMDtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKHByZXZpZXcpIHtcbiAgICAgICAgICAgICAgICAvLyBUT0RPOiBJbXBsZW1lbnQgcHJldmlldyBtb2RlXG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgUHJldmlldyBtb2RlIG5vdCB5ZXQgaW1wbGVtZW50ZWQuIFdpbGwgdXBkYXRlICR7ZmlsZXMubGVuZ3RofSBmaWxlcy5gKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgbmV3IE5vdGljZShgVXBkYXRpbmcgUEFSQSB0YWdzIGZvciAke2ZpbGVzLmxlbmd0aH0gZmlsZXMuLi5gKTtcblxuICAgICAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVQYXJhVGFncyhmaWxlKTtcbiAgICAgICAgICAgICAgICB1cGRhdGVkKys7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIG5ldyBOb3RpY2UoYFVwZGF0ZWQgUEFSQSB0YWdzIGZvciAke3VwZGF0ZWR9IGZpbGVzIWApO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKHRpbWVyLCB7IHRvdGFsRmlsZXM6IGZpbGVzLmxlbmd0aCwgdXBkYXRlZCB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFzeW5jIG1pZ3JhdGVPbGRUYWdzKCkge1xuICAgICAgICAvLyBFbmFibGUgbWlncmF0aW9uIHNldHRpbmdcbiAgICAgICAgdGhpcy5zZXR0aW5ncy50YWdnaW5nLm1pZ3JhdGVPbGRUYWdzID0gdHJ1ZTtcblxuICAgICAgICAvLyBSdW4gYnVsayB1cGRhdGVcbiAgICAgICAgYXdhaXQgdGhpcy5idWxrVXBkYXRlVGFncyhmYWxzZSk7XG5cbiAgICAgICAgLy8gRGlzYWJsZSBtaWdyYXRpb24gc2V0dGluZ1xuICAgICAgICB0aGlzLnNldHRpbmdzLnRhZ2dpbmcubWlncmF0ZU9sZFRhZ3MgPSBmYWxzZTtcblxuICAgICAgICBuZXcgTm90aWNlKCdNaWdyYXRpb24gY29tcGxldGUhIE9sZCBwYXJhLyogdGFncyBoYXZlIGJlZW4gY29udmVydGVkIHRvIHByb3BlcnRpZXMuJyk7XG4gICAgfVxuXG4gICAgYXN5bmMgY2xlYW5UZW1wbGF0ZUZpbGVzKCkge1xuICAgICAgICAvLyBGaW5kIGFsbCBmaWxlcyBpbiBURU1QTEFURVMgZm9sZGVyc1xuICAgICAgICBjb25zdCBmaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKS5maWx0ZXIoZiA9PlxuICAgICAgICAgICAgZi5wYXRoLmluY2x1ZGVzKCcvVEVNUExBVEVTLycpIHx8IGYucGF0aC5zdGFydHNXaXRoKCdURU1QTEFURVMvJylcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAoZmlsZXMubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKCdObyB0ZW1wbGF0ZSBmaWxlcyBmb3VuZCB0byBjbGVhbi4nKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIG5ldyBOb3RpY2UoYENsZWFuaW5nICR7ZmlsZXMubGVuZ3RofSB0ZW1wbGF0ZSBmaWxlcy4uLmApO1xuICAgICAgICBsZXQgY2xlYW5lZCA9IDA7XG5cbiAgICAgICAgZm9yIChjb25zdCBmaWxlIG9mIGZpbGVzKSB7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLmZpbGVNYW5hZ2VyLnByb2Nlc3NGcm9udE1hdHRlcihmaWxlLCAoZnJvbnRtYXR0ZXIpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgbGV0IG1vZGlmaWVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIHBhcmEgcHJvcGVydHlcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZyb250bWF0dGVyLnBhcmEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0ZSBmcm9udG1hdHRlci5wYXJhO1xuICAgICAgICAgICAgICAgICAgICAgICAgbW9kaWZpZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gUmVtb3ZlIHBhcmEvKiB0YWdzXG4gICAgICAgICAgICAgICAgICAgIGlmIChmcm9udG1hdHRlci50YWdzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCByYXdUYWdzID0gQXJyYXkuaXNBcnJheShmcm9udG1hdHRlci50YWdzKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgID8gZnJvbnRtYXR0ZXIudGFnc1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogW2Zyb250bWF0dGVyLnRhZ3NdO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjbGVhbmVkVGFncyA9IHJhd1RhZ3MuZmlsdGVyKHRhZyA9PiAhU3RyaW5nKHRhZykuc3RhcnRzV2l0aCgncGFyYS8nKSk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjbGVhbmVkVGFncy5sZW5ndGggIT09IHJhd1RhZ3MubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZnJvbnRtYXR0ZXIudGFncyA9IGNsZWFuZWRUYWdzO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1vZGlmaWVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFJlbW92ZSBhcmNoaXZlZCBkYXRlICh0ZW1wbGF0ZXMgc2hvdWxkbid0IGhhdmUgdGhpcylcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZyb250bWF0dGVyLmFyY2hpdmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWxldGUgZnJvbnRtYXR0ZXIuYXJjaGl2ZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBtb2RpZmllZCA9IHRydWU7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBpZiAobW9kaWZpZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuZWQrKztcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKGBRdWljayBQQVJBOiBDbGVhbmVkIHRlbXBsYXRlIGZpbGU6ICR7ZmlsZS5wYXRofWApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIGNsZWFuaW5nIHRlbXBsYXRlICR7ZmlsZS5wYXRofTpgLCBlcnJvcik7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBuZXcgTm90aWNlKGBDbGVhbmVkICR7Y2xlYW5lZH0gdGVtcGxhdGUgZmlsZXMhYCk7XG4gICAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBURU1QTEFURSBNQU5BR0VSXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNsYXNzIFRlbXBsYXRlTWFuYWdlciB7XG4gICAgY29uc3RydWN0b3IoYXBwLCBzZXR0aW5ncywgcHJvZmlsZXIpIHtcbiAgICAgICAgdGhpcy5hcHAgPSBhcHA7XG4gICAgICAgIHRoaXMuc2V0dGluZ3MgPSBzZXR0aW5ncztcbiAgICAgICAgdGhpcy5wcm9maWxlciA9IHByb2ZpbGVyO1xuXG4gICAgICAgIC8vIEVtYmVkZGVkIHRlbXBsYXRlcyAtIHRoZXNlIHdpbGwgYmUgZGVwbG95ZWQgdG8gdGhlIHZhdWx0XG4gICAgICAgIHRoaXMudGVtcGxhdGVzID0ge1xuICAgICAgICAgICAgJ2RlZmF1bHQtdGVtcGxhdGUubWQnOiBgLS0tXG50YWdzOlxuICAtIGFsbFxuY3JlYXRlZDogPCUgdHAuZmlsZS5jcmVhdGlvbl9kYXRlKCkgJT5cbi0tLVxuXG4jIyBcdUQ4M0RcdURERDIgVGFza3MgaW4gdGhpcyBub3RlXG5cXGBcXGBcXGB0YXNrc1xucGF0aCBpbmNsdWRlcyB7e3F1ZXJ5LmZpbGUucGF0aH19XG5ub3QgZG9uZVxuc29ydCBieSBkdWVcbnNvcnQgYnkgcHJpb3JpdHlcblxuXG5cXGBcXGBcXGBcblxuLS0tXG4jIyBSZXNvdXJjZXNcbipBZGQgbGlua3MgdG8gZnJlcXVlbnQgcmVmZXJlbmNlIG9yIHdvcmtpbmcgZG9jdW1lbnRzKlxuXG5cblxuXG4tLS1cbiMjIE5vdGVzXG4qVG8gZG8gaXRlbXMgd2lsbCBhbGwgYmUgY29sbGVjdGVkIGF0IHRoZSB0b3Agb2YgdGhlIG5vdGUuKlxuLSBbIF0gU3RhcnQgbm90ZXNcbi0gWyBdXG5cblxuYCxcbiAgICAgICAgICAgICdpbmJveC10ZW1wbGF0ZS5tZCc6IGAtLS1cbnRhZ3M6XG4gIC0gYWxsXG5jcmVhdGVkOiA8JSB0cC5maWxlLmNyZWF0aW9uX2RhdGUoKSAlPlxuLS0tXG5cbiMjIFx1RDgzRFx1REREMiBUYXNrcyBpbiB0aGlzIG5vdGVcblxcYFxcYFxcYHRhc2tzXG5wYXRoIGluY2x1ZGVzIHt7cXVlcnkuZmlsZS5wYXRofX1cbm5vdCBkb25lXG5zb3J0IGJ5IGR1ZVxuc29ydCBieSBwcmlvcml0eVxuXG5cblxcYFxcYFxcYFxuXG4tLS1cbiMjIFJlc291cmNlc1xuKkFkZCBsaW5rcyB0byBmcmVxdWVudCByZWZlcmVuY2Ugb3Igd29ya2luZyBkb2N1bWVudHMqXG5cblxuXG5cbi0tLVxuIyMgTm90ZXNcbipUbyBkbyBpdGVtcyB3aWxsIGFsbCBiZSBjb2xsZWN0ZWQgYXQgdGhlIHRvcCBvZiB0aGUgbm90ZS4qXG4tIFsgXSBTdGFydCBub3Rlc1xuLSBbIF1cbmAsXG4gICAgICAgICAgICAncHJvamVjdHMtdGVtcGxhdGUubWQnOiBgLS0tXG50YWdzOlxuICAtIGFsbFxuY3JlYXRlZDogPCUgdHAuZmlsZS5jcmVhdGlvbl9kYXRlKCkgJT5cbi0tLVxuXG4jIyBcdUQ4M0RcdURERDIgVGFza3MgaW4gdGhpcyBub3RlXG5cXGBcXGBcXGB0YXNrc1xucGF0aCBpbmNsdWRlcyB7e3F1ZXJ5LmZpbGUucGF0aH19XG5ub3QgZG9uZVxuc29ydCBieSBkdWVcbnNvcnQgYnkgcHJpb3JpdHlcblxuXG5cXGBcXGBcXGBcblxuLS0tXG4jIyBSZXNvdXJjZXNcbipBZGQgbGlua3MgdG8gZnJlcXVlbnQgcmVmZXJlbmNlIG9yIHdvcmtpbmcgZG9jdW1lbnRzKlxuXG5cblxuXG4tLS1cbiMjIE5vdGVzXG4qVG8gZG8gaXRlbXMgd2lsbCBhbGwgYmUgY29sbGVjdGVkIGF0IHRoZSB0b3Agb2YgdGhlIG5vdGUuKlxuLSBbIF0gU3RhcnQgbm90ZXNcbi0gWyBdXG5gLFxuICAgICAgICAgICAgJ2FyZWFzLXRlbXBsYXRlLm1kJzogYC0tLVxudGFnczpcbiAgLSBhbGxcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG4tLS1cblxuIyMgXHVEODNEXHVEREQyIFRhc2tzIGluIHRoaXMgbm90ZVxuXFxgXFxgXFxgdGFza3NcbnBhdGggaW5jbHVkZXMge3txdWVyeS5maWxlLnBhdGh9fVxubm90IGRvbmVcbnNvcnQgYnkgZHVlXG5zb3J0IGJ5IHByaW9yaXR5XG5cblxuXFxgXFxgXFxgXG5cbi0tLVxuIyMgUmVzb3VyY2VzXG4qQWRkIGxpbmtzIHRvIGZyZXF1ZW50IHJlZmVyZW5jZSBvciB3b3JraW5nIGRvY3VtZW50cypcblxuXG5cblxuLS0tXG4jIyBOb3Rlc1xuKlRvIGRvIGl0ZW1zIHdpbGwgYWxsIGJlIGNvbGxlY3RlZCBhdCB0aGUgdG9wIG9mIHRoZSBub3RlLipcbi0gWyBdIFN0YXJ0IG5vdGVzXG4tIFsgXVxuYCxcbiAgICAgICAgICAgICdyZXNvdXJjZXMtdGVtcGxhdGUubWQnOiBgLS0tXG50YWdzOlxuICAtIGFsbFxuY3JlYXRlZDogPCUgdHAuZmlsZS5jcmVhdGlvbl9kYXRlKCkgJT5cbi0tLVxuXG4jIyBcdUQ4M0RcdURERDIgVGFza3MgaW4gdGhpcyBub3RlXG5cXGBcXGBcXGB0YXNrc1xucGF0aCBpbmNsdWRlcyB7e3F1ZXJ5LmZpbGUucGF0aH19XG5ub3QgZG9uZVxuc29ydCBieSBkdWVcbnNvcnQgYnkgcHJpb3JpdHlcblxuXG5cXGBcXGBcXGBcblxuLS0tXG4jIyBSZXNvdXJjZXNcbipBZGQgbGlua3MgdG8gZnJlcXVlbnQgcmVmZXJlbmNlIG9yIHdvcmtpbmcgZG9jdW1lbnRzKlxuXG5cblxuXG4tLS1cbiMjIE5vdGVzXG4qVG8gZG8gaXRlbXMgd2lsbCBhbGwgYmUgY29sbGVjdGVkIGF0IHRoZSB0b3Agb2YgdGhlIG5vdGUuKlxuLSBbIF0gU3RhcnQgbm90ZXNcbi0gWyBdXG5gLFxuICAgICAgICAgICAgJ2FyY2hpdmUtdGVtcGxhdGUubWQnOiBgLS0tXG50YWdzOlxuICAtIGFsbFxuY3JlYXRlZDogPCUgdHAuZmlsZS5jcmVhdGlvbl9kYXRlKCkgJT5cbmFyY2hpdmVkOiA8JSB0cC5maWxlLmNyZWF0aW9uX2RhdGUoKSAlPlxuLS0tXG5cbiMjIFx1RDgzRFx1REREMiBUYXNrcyBpbiB0aGlzIG5vdGVcblxcYFxcYFxcYHRhc2tzXG5wYXRoIGluY2x1ZGVzIHt7cXVlcnkuZmlsZS5wYXRofX1cbm5vdCBkb25lXG5zb3J0IGJ5IGR1ZVxuc29ydCBieSBwcmlvcml0eVxuXG5cblxcYFxcYFxcYFxuXG4tLS1cbiMjIFJlc291cmNlc1xuKkFkZCBsaW5rcyB0byBmcmVxdWVudCByZWZlcmVuY2Ugb3Igd29ya2luZyBkb2N1bWVudHMqXG5cblxuXG5cbi0tLVxuIyMgTm90ZXNcbipUbyBkbyBpdGVtcyB3aWxsIGFsbCBiZSBjb2xsZWN0ZWQgYXQgdGhlIHRvcCBvZiB0aGUgbm90ZS4qXG4tIFsgXSBTdGFydCBub3Rlc1xuLSBbIF1cblxuYCxcbiAgICAgICAgICAgICdQcm9qZWN0IERhc2hib2FyZC5tZCc6IGAtLS1cbmthbmJhbi1wbHVnaW46IGJvYXJkXG50YWdzOlxuICAtIGFsbFxuY3JlYXRlZDogPCUgdHAuZmlsZS5jcmVhdGlvbl9kYXRlKCkgJT5cbi0tLVxuXG4jIyBJTkJPWFxuXG5cblxuIyMgQkFDS0JVUk5FUlxuXG5cblxuIyMgTkVYVCBXRUVLXG5cblxuXG4jIyBUSElTIFdFRUtcblxuXG5cbiMjIEJsb2NrZWRcblxuXG5cbiMjIFRPTU9SUk9XXG5cblxuXG4jIyBUT0RBWVxuXG4tIFsgXSAjIyMgW1tEYWlseSBhbmQgV2Vla2x5IFRhc2tzXV0gXHUyMDE0IGRvIHRoZXNlIFRPREFZIVxuXG5cXGBcXGBcXGB0YXNrc1xucGF0aCBpbmNsdWRlcyBEYWlseSBhbmQgV2Vla2x5IFRhc2tzXG5ub3QgZG9uZVxuKGR1ZSB0b2RheSkgT1IgKGR1ZSBiZWZvcmUgdG9tb3Jyb3cpXG5oaWRlIHJlY3VycmVuY2UgcnVsZVxuaGlkZSBlZGl0IGJ1dHRvblxuc29ydCBieSBkZXNjcmlwdGlvblxuXFxgXFxgXFxgXG5cblxuIyMgRG9pbmdcblxuXG5cbiMjIERvbmVcblxuKipDb21wbGV0ZSoqXG5cbmAsXG4gICAgICAgICAgICAnUEFSQSBNZXRob2QgT3ZlcnZpZXcubWQnOiBgLS0tXG50YWdzOlxuICAtIGFsbFxuICAtIHBhcmEtbWV0aG9kb2xvZ3lcbmNyZWF0ZWQ6IDwlIHRwLmZpbGUuY3JlYXRpb25fZGF0ZSgpICU+XG5wYXJhOiByZXNvdXJjZXNcbi0tLVxuXG4jIFBBUkEgTWV0aG9kIE92ZXJ2aWV3XG5cbldlbGNvbWUgdG8geW91ciBQQVJBLW9yZ2FuaXplZCB2YXVsdCEgVGhpcyBub3RlIGV4cGxhaW5zIHRoZSBQQVJBIG1ldGhvZCBhbmQgaG93IHRoZSBRdWljayBQQVJBIHBsdWdpbiBpbXBsZW1lbnRzIGl0LlxuXG4jIyBXaGF0IGlzIFBBUkE/XG5cblBBUkEgaXMgYW4gb3JnYW5pemF0aW9uYWwgc3lzdGVtIGNyZWF0ZWQgYnkgVGlhZ28gRm9ydGUgdGhhdCBkaXZpZGVzIGFsbCBpbmZvcm1hdGlvbiBpbnRvIGZvdXIgY2F0ZWdvcmllcyBiYXNlZCBvbiAqKmFjdGlvbmFiaWxpdHkqKiBhbmQgKip0aW1lIGhvcml6b24qKi5cblxuIyMjIFRoZSBGb3VyIENhdGVnb3JpZXNcblxuIyMjIyBcdUQ4M0RcdURDRTUgKipQcm9qZWN0cyoqIChcXGAxIC0gUFJPSkVDVFNcXGApXG4qKkRlZmluaXRpb24qKjogU2hvcnQtdGVybSBlZmZvcnRzIHdpdGggYSBzcGVjaWZpYyBnb2FsIGFuZCBkZWFkbGluZS5cblxuKipDaGFyYWN0ZXJpc3RpY3MqKjpcbi0gSGFzIGEgY2xlYXIgZW5kIHN0YXRlIG9yIGRlbGl2ZXJhYmxlXG4tIFRpbWUtYm91bmQgKGRlYWRsaW5lIG9yIHRhcmdldCBkYXRlKVxuLSBSZXF1aXJlcyBtdWx0aXBsZSBzdGVwcyB0byBjb21wbGV0ZVxuLSBBY3RpdmUgd29yayBpbiBwcm9ncmVzc1xuXG4qKkV4YW1wbGVzKio6XG4tIFBsYW4gUTQgbWFya2V0aW5nIGNhbXBhaWduXG4tIFdyaXRlIGFubnVhbCByZXBvcnRcbi0gT3JnYW5pemUgdGVhbSBvZmZzaXRlXG4tIExhdW5jaCBuZXcgd2Vic2l0ZSBmZWF0dXJlXG5cbioqUXVpY2sgUEFSQSBCZWhhdmlvcioqOlxuLSBOb3RlcyBpbiBQcm9qZWN0cyBnZXQgXFxgcGFyYTogcHJvamVjdHNcXGAgcHJvcGVydHlcbi0gU3ViZm9sZGVyIG5hbWVzIGJlY29tZSBwZXJzaXN0ZW50IHRhZ3MgKGUuZy4sIFxcYHBic3dpXFxgLCBcXGBwZXJzb25hbFxcYClcbi0gV2hlbiBtb3ZlZCB0byBBcmNoaXZlLCBwcm9qZWN0cyBnZXQgXFxgYXJjaGl2ZWRcXGAgZGF0ZSBwcm9wZXJ0eVxuXG4tLS1cblxuIyMjIyBcdUQ4M0NcdURGQUYgKipBcmVhcyoqIChcXGAyIC0gQVJFQVNcXGApXG4qKkRlZmluaXRpb24qKjogT25nb2luZyByZXNwb25zaWJpbGl0aWVzIHRoYXQgcmVxdWlyZSByZWd1bGFyIGF0dGVudGlvbiBidXQgaGF2ZSBubyBlbmQgZGF0ZS5cblxuKipDaGFyYWN0ZXJpc3RpY3MqKjpcbi0gTm8gZGVmaW5lZCBlbmRwb2ludCAtIGNvbnRpbnVlcyBpbmRlZmluaXRlbHlcbi0gU3RhbmRhcmRzIHRvIG1haW50YWluIHJhdGhlciB0aGFuIGdvYWxzIHRvIGFjaGlldmVcbi0gUmVxdWlyZXMgY29uc2lzdGVudCwgcmVjdXJyaW5nIGF0dGVudGlvblxuLSBTdWNjZXNzID0gbWFpbnRhaW5pbmcgYSBzdGFuZGFyZCBvdmVyIHRpbWVcblxuKipFeGFtcGxlcyoqOlxuLSBIZWFsdGggJiBmaXRuZXNzXG4tIFByb2Zlc3Npb25hbCBkZXZlbG9wbWVudFxuLSBUZWFtIG1hbmFnZW1lbnRcbi0gRmluYW5jaWFsIHBsYW5uaW5nXG4tIFJlbGF0aW9uc2hpcHNcblxuKipRdWljayBQQVJBIEJlaGF2aW9yKio6XG4tIE5vdGVzIGluIEFyZWFzIGdldCBcXGBwYXJhOiBhcmVhc1xcYCBwcm9wZXJ0eVxuLSBBcmVhcyByZXByZXNlbnQgbG9uZy10ZXJtIGNvbW1pdG1lbnRzXG4tIE1vdmluZyBiZXR3ZWVuIFByb2plY3RzIGFuZCBBcmVhcyBjaGFuZ2VzIHRoZSBwcm9wZXJ0eSBidXQgcHJlc2VydmVzIGNvbnRleHQgdGFnc1xuXG4tLS1cblxuIyMjIyBcdUQ4M0RcdURDREEgKipSZXNvdXJjZXMqKiAoXFxgMyAtIFJFU09VUkNFU1xcYClcbioqRGVmaW5pdGlvbioqOiBSZWZlcmVuY2UgbWF0ZXJpYWxzIGFuZCBpbmZvcm1hdGlvbiB5b3Ugd2FudCB0byBrZWVwIGZvciBmdXR1cmUgdXNlLlxuXG4qKkNoYXJhY3RlcmlzdGljcyoqOlxuLSBOb3QgY3VycmVudGx5IGFjdGlvbmFibGVcbi0gVmFsdWFibGUgZm9yIHJlZmVyZW5jZSBvciBpbnNwaXJhdGlvblxuLSBDb3VsZCBiZWNvbWUgcmVsZXZhbnQgdG8gUHJvamVjdHMgb3IgQXJlYXMgbGF0ZXJcbi0gT3JnYW5pemVkIGJ5IHRvcGljIG9yIHRoZW1lXG5cbioqRXhhbXBsZXMqKjpcbi0gUmVzZWFyY2ggYXJ0aWNsZXNcbi0gVGVtcGxhdGVzXG4tIEhvdy10byBndWlkZXNcbi0gTWVldGluZyBub3RlcyBhcmNoaXZlXG4tIERvY3VtZW50YXRpb25cbi0gTGVhcm5pbmcgbWF0ZXJpYWxzXG5cbioqUXVpY2sgUEFSQSBCZWhhdmlvcioqOlxuLSBOb3RlcyBpbiBSZXNvdXJjZXMgZ2V0IFxcYHBhcmE6IHJlc291cmNlc1xcYCBwcm9wZXJ0eVxuLSBUZW1wbGF0ZXMgc3RvcmVkIGluIFxcYFRFTVBMQVRFUy9cXGAgc3ViZm9sZGVyIGFyZSBleGNsdWRlZCBmcm9tIGF1dG8tdGFnZ2luZ1xuLSBUaGlzIGlzIHdoZXJlIHlvdSBrZWVwIHJldXNhYmxlIGFzc2V0c1xuXG4tLS1cblxuIyMjIyBcdUQ4M0RcdURDRTYgKipBcmNoaXZlKiogKFxcYDQgLSBBUkNISVZFXFxgKVxuKipEZWZpbml0aW9uKio6IENvbXBsZXRlZCBwcm9qZWN0cyBhbmQgaW5hY3RpdmUgaXRlbXMgZnJvbSBvdGhlciBjYXRlZ29yaWVzLlxuXG4qKkNoYXJhY3RlcmlzdGljcyoqOlxuLSBObyBsb25nZXIgYWN0aXZlIG9yIHJlbGV2YW50XG4tIEtlcHQgZm9yIGhpc3RvcmljYWwgcmVmZXJlbmNlXG4tIE91dCBvZiBzaWdodCBidXQgcmV0cmlldmFibGUgaWYgbmVlZGVkXG4tIE9yZ2FuaXplZCBieSBvcmlnaW5hbCBjYXRlZ29yeVxuXG4qKkV4YW1wbGVzKio6XG4tIENvbXBsZXRlZCBwcm9qZWN0c1xuLSBPbGQgYXJlYXMgeW91J3JlIG5vIGxvbmdlciByZXNwb25zaWJsZSBmb3Jcbi0gT3V0ZGF0ZWQgcmVzb3VyY2VzXG4tIFBhc3QgbWVldGluZyBub3Rlc1xuXG4qKlF1aWNrIFBBUkEgQmVoYXZpb3IqKjpcbi0gTm90ZXMgbW92ZWQgdG8gQXJjaGl2ZSBnZXQgXFxgcGFyYTogYXJjaGl2ZVxcYCBwcm9wZXJ0eVxuLSBBdXRvbWF0aWNhbGx5IGFkZHMgXFxgYXJjaGl2ZWQ6IFlZWVktTU0tRERcXGAgZGF0ZSBwcm9wZXJ0eVxuLSBQcmV2aW91cyBjb250ZXh0IHRhZ3MgcGVyc2lzdCBmb3Igc2VhcmNoYWJpbGl0eVxuXG4tLS1cblxuIyMgSG93IFF1aWNrIFBBUkEgSW1wbGVtZW50cyBUaGlzXG5cbiMjIyBBdXRvbWF0aWMgUHJvcGVydGllc1xuXG5UaGUgcGx1Z2luIGF1dG9tYXRpY2FsbHkgbWFpbnRhaW5zIGEgXFxgcGFyYVxcYCBwcm9wZXJ0eSBpbiBldmVyeSBub3RlJ3MgZnJvbnRtYXR0ZXIgdGhhdCByZWZsZWN0cyBpdHMgY3VycmVudCBQQVJBIGxvY2F0aW9uLlxuXG4qKlZhbHVlcyoqOiBcXGBpbmJveFxcYCwgXFxgcHJvamVjdHNcXGAsIFxcYGFyZWFzXFxgLCBcXGByZXNvdXJjZXNcXGAsIFxcYGFyY2hpdmVcXGBcblxuIyMjIFBlcnNpc3RlbnQgQ29udGV4dCBUYWdzXG5cbkFzIG5vdGVzIG1vdmUgZGVlcGVyIGludG8gc3ViZm9sZGVycywgdGhlIHBsdWdpbiBjcmVhdGVzICoqcGVyc2lzdGVudCB0YWdzKiogZnJvbSBmb2xkZXIgbmFtZXMuXG5cbioqV2hlbiB5b3UgbW92ZSB0aGlzIG5vdGUgdG8gQXJjaGl2ZSoqLCBpdCBiZWNvbWVzOlxuLSBQcm9wZXJ0eTogXFxgcGFyYTogYXJjaGl2ZVxcYCAodXBkYXRlZClcbi0gVGFncyBwcmVzZXJ2ZSBwcm9qZWN0IGNvbnRleHRcblxuVGhpcyBwcmVzZXJ2ZXMgcHJvamVjdCBjb250ZXh0IGV2ZW4gYWZ0ZXIgYXJjaGl2aW5nLlxuXG4jIyMgVGhlIEluYm94XG5cblRoZSBcXGAwIC0gSU5CT1hcXGAgZm9sZGVyIGlzIGEgc3BlY2lhbCBzdGFnaW5nIGFyZWE6XG5cbioqUHVycG9zZSoqOiBDYXB0dXJlIGlkZWFzIHF1aWNrbHkgd2l0aG91dCBkZWNpZGluZyB3aGVyZSB0aGV5IGJlbG9uZ1xuXG4qKldvcmtmbG93Kio6XG4xLiBDcmVhdGUgbmV3IG5vdGVzIGluIEluYm94XG4yLiBQcm9jZXNzIHJlZ3VsYXJseSAoZGFpbHkvd2Vla2x5KVxuMy4gTW92ZSB0byBhcHByb3ByaWF0ZSBQQVJBIGNhdGVnb3J5IG9uY2UgeW91IGtub3cgd2hhdCBpdCBpc1xuXG4qKlByb2plY3QgVXBkYXRlcyoqOiBBdXRvbWF0aWMgcHJvamVjdCBzdGF0dXMgcmVwb3J0cyBhcmUgY3JlYXRlZCBoZXJlIGZvciBwcm9jZXNzaW5nLlxuXG4tLS1cblxuIyMgUEFSQSBXb3JrZmxvd1xuXG4jIyMgRGFpbHkvV2Vla2x5IFByb2Nlc3NpbmdcblxuKipSZXZpZXcgeW91ciBJbmJveCoqOlxuMS4gSWRlbnRpZnkgd2hpY2ggY2F0ZWdvcnkgZWFjaCBpdGVtIGJlbG9uZ3MgdG9cbjIuIE1vdmUgbm90ZXMgdG8gUHJvamVjdHMsIEFyZWFzLCBSZXNvdXJjZXMsIG9yIEFyY2hpdmVcbjMuIEtlZXAgSW5ib3ggYXMgY2xvc2UgdG8gZW1wdHkgYXMgcG9zc2libGVcblxuKipVc2UgdGhlIFByb2plY3QgRGFzaGJvYXJkKio6XG4tIEthbmJhbiBib2FyZCBpbiBJbmJveCBmb3IgdHJhY2tpbmcgYWN0aXZlIHdvcmtcbi0gVmlzdWFsaXplIHdoYXQncyBUT0RBWSwgVE9NT1JST1csIFRISVMgV0VFS1xuLSBTZWUgQkxPQ0tFRCBpdGVtcyB0aGF0IG5lZWQgYXR0ZW50aW9uXG5cbi0tLVxuXG4jIyBMZWFybmluZyBNb3JlXG5cbiMjIyBPZmZpY2lhbCBQQVJBIFJlc291cmNlc1xuXG4qKlRpYWdvIEZvcnRlJ3MgT3JpZ2luYWwgQXJ0aWNsZSoqOlxuaHR0cHM6Ly9mb3J0ZWxhYnMuY29tL2Jsb2cvcGFyYS9cblxuKipCdWlsZGluZyBhIFNlY29uZCBCcmFpbioqOlxuQm9vayBieSBUaWFnbyBGb3J0ZSBjb3ZlcmluZyBQQVJBIGFuZCBwZXJzb25hbCBrbm93bGVkZ2UgbWFuYWdlbWVudFxuaHR0cHM6Ly93d3cuYnVpbGRpbmdhc2Vjb25kYnJhaW4uY29tL1xuXG4qKkZvcnRlIExhYnMgQmxvZyoqOlxuaHR0cHM6Ly9mb3J0ZWxhYnMuY29tL2Jsb2cvXG5cbiMjIyBXaXRoaW4gWW91ciBWYXVsdFxuXG4qKlRlbXBsYXRlcyoqOiBTZWUgXFxgMyAtIFJFU09VUkNFUy9URU1QTEFURVMvXFxgIGZvciBhbGwgYXZhaWxhYmxlIHRlbXBsYXRlc1xuXG4qKlByb2plY3QgRGFzaGJvYXJkKio6IEV4YW1wbGUga2FuYmFuIGJvYXJkIGluIFxcYDAgLSBJTkJPWC9Qcm9qZWN0IERhc2hib2FyZC5tZFxcYFxuXG4qKlBsdWdpbiBEb2N1bWVudGF0aW9uKio6IENoZWNrIHRoZSBRdWljayBQQVJBIHBsdWdpbiBSRUFETUUgZm9yIHRlY2huaWNhbCBkZXRhaWxzXG5cbi0tLVxuXG4qKkxhc3QgVXBkYXRlZCoqOiAyMDI1LTExLTA1XG4qKlBsdWdpbiBWZXJzaW9uKio6IDAuMi4wXG4qKk1ldGhvZCBTb3VyY2UqKjogRm9ydGUgTGFicyBQQVJBIFN5c3RlbVxuYFxuICAgICAgICB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIExpc3QgYWxsIGF2YWlsYWJsZSB0ZW1wbGF0ZXNcbiAgICAgKi9cbiAgICBsaXN0QXZhaWxhYmxlVGVtcGxhdGVzKCkge1xuICAgICAgICByZXR1cm4gT2JqZWN0LmtleXModGhpcy50ZW1wbGF0ZXMpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdldCB0ZW1wbGF0ZSBjb250ZW50XG4gICAgICovXG4gICAgZ2V0VGVtcGxhdGUodGVtcGxhdGVOYW1lKSB7XG4gICAgICAgIHJldHVybiB0aGlzLnRlbXBsYXRlc1t0ZW1wbGF0ZU5hbWVdO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIERlcGxveSBhIHNpbmdsZSB0ZW1wbGF0ZSB0byB0aGUgdmF1bHRcbiAgICAgKiBTbWFydCByZWdlbmVyYXRpb246IE9ubHkgY3JlYXRlcyBtaXNzaW5nIGZpbGVzLCBuZXZlciBvdmVyd3JpdGVzIGV4aXN0aW5nIHRlbXBsYXRlc1xuICAgICAqL1xuICAgIGFzeW5jIGRlcGxveVRlbXBsYXRlKHRlbXBsYXRlTmFtZSwgZGVzdGluYXRpb24pIHtcbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgndGVtcGxhdGVzOmRlcGxveScpO1xuICAgICAgICBjb25zdCBjb250ZXh0ID0geyB0ZW1wbGF0ZU5hbWUsIGRlc3RpbmF0aW9uIH07XG4gICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLmdldFRlbXBsYXRlKHRlbXBsYXRlTmFtZSk7XG5cbiAgICAgICAgaWYgKCFjb250ZW50KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFRlbXBsYXRlIG5vdCBmb3VuZDogJHt0ZW1wbGF0ZU5hbWV9YCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFbnN1cmUgZGVzdGluYXRpb24gZm9sZGVyIGV4aXN0c1xuICAgICAgICBjb25zdCBmb2xkZXJQYXRoID0gZGVzdGluYXRpb24uc3Vic3RyaW5nKDAsIGRlc3RpbmF0aW9uLmxhc3RJbmRleE9mKCcvJykpO1xuICAgICAgICBpZiAoZm9sZGVyUGF0aCAmJiAhdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGZvbGRlclBhdGgpKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGVGb2xkZXIoZm9sZGVyUGF0aCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiBmaWxlIGFscmVhZHkgZXhpc3RzXG4gICAgICAgIGNvbnN0IGV4aXN0aW5nRmlsZSA9IHRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChkZXN0aW5hdGlvbik7XG5cbiAgICAgICAgbGV0IHJlc3VsdCA9IHsgc3RhdHVzOiAnc2tpcHBlZCcsIHJlYXNvbjogJ2V4aXN0cycgfTtcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIGlmIChleGlzdGluZ0ZpbGUpIHtcbiAgICAgICAgICAgICAgICAvLyBGaWxlIGV4aXN0cyAtIHNraXAgdG8gcHJlc2VydmUgdXNlciBjdXN0b21pemF0aW9uc1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHsgc3RhdHVzOiAnc2tpcHBlZCcsIHJlYXNvbjogJ2V4aXN0cycgfTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gRmlsZSBkb2Vzbid0IGV4aXN0IC0gY3JlYXRlIGZyb20gdGVtcGxhdGVcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5jcmVhdGUoZGVzdGluYXRpb24sIGNvbnRlbnQpO1xuICAgICAgICAgICAgICAgIHJlc3VsdCA9IHsgc3RhdHVzOiAnY3JlYXRlZCcgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQodGltZXIsIHsgLi4uY29udGV4dCwgc3RhdHVzOiByZXN1bHQuc3RhdHVzIH0pO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRGVwbG95IGFsbCB0ZW1wbGF0ZXMgdG8gZGVmYXVsdCBsb2NhdGlvbnNcbiAgICAgKiBVc2VzIHNtYXJ0IHJlZ2VuZXJhdGlvbjogb25seSBjcmVhdGVzIG1pc3NpbmcgdGVtcGxhdGVzXG4gICAgICovXG4gICAgYXN5bmMgZGVwbG95QWxsVGVtcGxhdGVzKCkge1xuICAgICAgICBjb25zdCB0aW1lciA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCd0ZW1wbGF0ZXM6ZGVwbG95LWFsbCcpO1xuICAgICAgICBsZXQgY3JlYXRlZCA9IDA7XG4gICAgICAgIGxldCBza2lwcGVkID0gMDtcbiAgICAgICAgbGV0IGVycm9ycyA9IDA7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ0RlcGxveWluZyBQQVJBIHRlbXBsYXRlcy4uLicpO1xuXG4gICAgICAgICAgICBjb25zdCBkZWZhdWx0RGVzdGluYXRpb25zID0ge1xuICAgICAgICAgICAgICAgICdkZWZhdWx0LXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL2RlZmF1bHQtdGVtcGxhdGUubWQnLFxuICAgICAgICAgICAgICAgICdpbmJveC10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9pbmJveC10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ3Byb2plY3RzLXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL3Byb2plY3RzLXRlbXBsYXRlLm1kJyxcbiAgICAgICAgICAgICAgICAnYXJlYXMtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvYXJlYXMtdGVtcGxhdGUubWQnLFxuICAgICAgICAgICAgICAgICdyZXNvdXJjZXMtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvcmVzb3VyY2VzLXRlbXBsYXRlLm1kJyxcbiAgICAgICAgICAgICAgICAnYXJjaGl2ZS10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9hcmNoaXZlLXRlbXBsYXRlLm1kJyxcbiAgICAgICAgICAgICAgICAnUHJvamVjdCBEYXNoYm9hcmQubWQnOiAnMCAtIElOQk9YL1Byb2plY3QgRGFzaGJvYXJkLm1kJyxcbiAgICAgICAgICAgICAgICAnUEFSQSBNZXRob2QgT3ZlcnZpZXcubWQnOiAnMyAtIFJFU09VUkNFUy9QQVJBIE1ldGhvZCBPdmVydmlldy5tZCdcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgW3RlbXBsYXRlTmFtZSwgZGVzdGluYXRpb25dIG9mIE9iamVjdC5lbnRyaWVzKGRlZmF1bHREZXN0aW5hdGlvbnMpKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5kZXBsb3lUZW1wbGF0ZSh0ZW1wbGF0ZU5hbWUsIGRlc3RpbmF0aW9uKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdGF0dXMgPT09ICdjcmVhdGVkJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgY3JlYXRlZCsrO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdC5zdGF0dXMgPT09ICdza2lwcGVkJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgc2tpcHBlZCsrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGRlcGxveSAke3RlbXBsYXRlTmFtZX06YCwgZXJyb3IpO1xuICAgICAgICAgICAgICAgICAgICBlcnJvcnMrKztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFJlcG9ydCByZXN1bHRzXG4gICAgICAgICAgICBjb25zdCBwYXJ0cyA9IFtdO1xuICAgICAgICAgICAgaWYgKGNyZWF0ZWQgPiAwKSBwYXJ0cy5wdXNoKGAke2NyZWF0ZWR9IGNyZWF0ZWRgKTtcbiAgICAgICAgICAgIGlmIChza2lwcGVkID4gMCkgcGFydHMucHVzaChgJHtza2lwcGVkfSBza2lwcGVkYCk7XG4gICAgICAgICAgICBpZiAoZXJyb3JzID4gMCkgcGFydHMucHVzaChgJHtlcnJvcnN9IGVycm9yc2ApO1xuXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBUZW1wbGF0ZXM6ICR7cGFydHMuam9pbignLCAnKX1gKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGRlcGxveWluZyB0ZW1wbGF0ZXM6JywgZXJyb3IpO1xuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgZGVwbG95aW5nIHRlbXBsYXRlczogJHtlcnJvci5tZXNzYWdlfWAsIDUwMDApO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKHRpbWVyLCB7IGNyZWF0ZWQsIHNraXBwZWQsIGVycm9ycyB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZvcmNlIHJlZ2VuZXJhdGUgYWxsIHRlbXBsYXRlcyAoY2FsbGVkIGJ5IFJlc2V0IFNldHRpbmdzKVxuICAgICAqIFRoaXMgaXMgdGhlIE9OTFkgbWV0aG9kIHRoYXQgb3ZlcndyaXRlcyBleGlzdGluZyB0ZW1wbGF0ZXNcbiAgICAgKi9cbiAgICBhc3luYyBmb3JjZVJlZ2VuZXJhdGVBbGxUZW1wbGF0ZXMoKSB7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ3RlbXBsYXRlczpmb3JjZS1yZWdlbmVyYXRlJyk7XG4gICAgICAgIGxldCByZWdlbmVyYXRlZCA9IDA7XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1JlZ2VuZXJhdGluZyBhbGwgdGVtcGxhdGVzIGZyb20gZGVmYXVsdHMuLi4nKTtcblxuICAgICAgICAgICAgY29uc3QgZGVmYXVsdERlc3RpbmF0aW9ucyA9IHtcbiAgICAgICAgICAgICAgICAnZGVmYXVsdC10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9kZWZhdWx0LXRlbXBsYXRlLm1kJyxcbiAgICAgICAgICAgICAgICAnaW5ib3gtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvaW5ib3gtdGVtcGxhdGUubWQnLFxuICAgICAgICAgICAgICAgICdwcm9qZWN0cy10ZW1wbGF0ZS5tZCc6ICczIC0gUkVTT1VSQ0VTL1RFTVBMQVRFUy9wcm9qZWN0cy10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ2FyZWFzLXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL2FyZWFzLXRlbXBsYXRlLm1kJyxcbiAgICAgICAgICAgICAgICAncmVzb3VyY2VzLXRlbXBsYXRlLm1kJzogJzMgLSBSRVNPVVJDRVMvVEVNUExBVEVTL3Jlc291cmNlcy10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ2FyY2hpdmUtdGVtcGxhdGUubWQnOiAnMyAtIFJFU09VUkNFUy9URU1QTEFURVMvYXJjaGl2ZS10ZW1wbGF0ZS5tZCcsXG4gICAgICAgICAgICAgICAgJ1Byb2plY3QgRGFzaGJvYXJkLm1kJzogJzAgLSBJTkJPWC9Qcm9qZWN0IERhc2hib2FyZC5tZCcsXG4gICAgICAgICAgICAgICAgJ1BBUkEgTWV0aG9kIE92ZXJ2aWV3Lm1kJzogJzMgLSBSRVNPVVJDRVMvUEFSQSBNZXRob2QgT3ZlcnZpZXcubWQnXG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IFt0ZW1wbGF0ZU5hbWUsIGRlc3RpbmF0aW9uXSBvZiBPYmplY3QuZW50cmllcyhkZWZhdWx0RGVzdGluYXRpb25zKSkge1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSB0aGlzLmdldFRlbXBsYXRlKHRlbXBsYXRlTmFtZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gRW5zdXJlIGZvbGRlciBleGlzdHNcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZm9sZGVyUGF0aCA9IGRlc3RpbmF0aW9uLnN1YnN0cmluZygwLCBkZXN0aW5hdGlvbi5sYXN0SW5kZXhPZignLycpKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGZvbGRlclBhdGggJiYgIXRoaXMuYXBwLnZhdWx0LmdldEFic3RyYWN0RmlsZUJ5UGF0aChmb2xkZXJQYXRoKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlRm9sZGVyKGZvbGRlclBhdGgpO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZXhpc3RpbmdGaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGRlc3RpbmF0aW9uKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoZXhpc3RpbmdGaWxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBPdmVyd3JpdGUgZXhpc3RpbmdcbiAgICAgICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuYXBwLnZhdWx0Lm1vZGlmeShleGlzdGluZ0ZpbGUsIGNvbnRlbnQpO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ3JlYXRlIG5ld1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5hcHAudmF1bHQuY3JlYXRlKGRlc3RpbmF0aW9uLCBjb250ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICByZWdlbmVyYXRlZCsrO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEZhaWxlZCB0byByZWdlbmVyYXRlICR7dGVtcGxhdGVOYW1lfTpgLCBlcnJvcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBuZXcgTm90aWNlKGBSZWdlbmVyYXRlZCAke3JlZ2VuZXJhdGVkfSB0ZW1wbGF0ZXMgZnJvbSBkZWZhdWx0cyFgKTtcbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHJlZ2VuZXJhdGluZyB0ZW1wbGF0ZXM6JywgZXJyb3IpO1xuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgcmVnZW5lcmF0aW5nIHRlbXBsYXRlczogJHtlcnJvci5tZXNzYWdlfWAsIDUwMDApO1xuICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKHRpbWVyLCB7IHJlZ2VuZXJhdGVkIH0pO1xuICAgICAgICB9XG4gICAgfVxufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBBR0VOREEgTUFOQUdFUlxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5jbGFzcyBBZ2VuZGFNYW5hZ2VyIHtcbiAgICBjb25zdHJ1Y3RvcihhcHAsIHNldHRpbmdzLCBwcm9maWxlcikge1xuICAgICAgICB0aGlzLmFwcCA9IGFwcDtcbiAgICAgICAgdGhpcy5zZXR0aW5ncyA9IHNldHRpbmdzO1xuICAgICAgICB0aGlzLnByb2ZpbGVyID0gcHJvZmlsZXI7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2V0IHRoZSBkYXRlIG9mIHRoZSB1cGNvbWluZyBNb25kYXkgaW4gTU0vREQvWVkgZm9ybWF0XG4gICAgICogSWYgdG9kYXkgaXMgTW9uZGF5LCByZXR1cm5zIHRvZGF5J3MgZGF0ZVxuICAgICAqL1xuICAgIGdldE5leHRNb25kYXlEYXRlKCkge1xuICAgICAgICBjb25zdCB0b2RheSA9IG5ldyBEYXRlKCk7XG4gICAgICAgIGNvbnN0IGRheU9mV2VlayA9IHRvZGF5LmdldERheSgpOyAvLyAwID0gU3VuZGF5LCAxID0gTW9uZGF5LCBldGMuXG5cbiAgICAgICAgbGV0IGRheXNVbnRpbE1vbmRheTtcbiAgICAgICAgaWYgKGRheU9mV2VlayA9PT0gMSkge1xuICAgICAgICAgICAgLy8gVG9kYXkgaXMgTW9uZGF5XG4gICAgICAgICAgICBkYXlzVW50aWxNb25kYXkgPSAwO1xuICAgICAgICB9IGVsc2UgaWYgKGRheU9mV2VlayA9PT0gMCkge1xuICAgICAgICAgICAgLy8gVG9kYXkgaXMgU3VuZGF5LCBuZXh0IE1vbmRheSBpcyAxIGRheSBhd2F5XG4gICAgICAgICAgICBkYXlzVW50aWxNb25kYXkgPSAxO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gQ2FsY3VsYXRlIGRheXMgdW50aWwgbmV4dCBNb25kYXlcbiAgICAgICAgICAgIGRheXNVbnRpbE1vbmRheSA9IDggLSBkYXlPZldlZWs7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBtb25kYXkgPSBuZXcgRGF0ZSh0b2RheSk7XG4gICAgICAgIG1vbmRheS5zZXREYXRlKHRvZGF5LmdldERhdGUoKSArIGRheXNVbnRpbE1vbmRheSk7XG5cbiAgICAgICAgY29uc3QgbW9udGggPSBTdHJpbmcobW9uZGF5LmdldE1vbnRoKCkgKyAxKS5wYWRTdGFydCgyLCAnMCcpO1xuICAgICAgICBjb25zdCBkYXkgPSBTdHJpbmcobW9uZGF5LmdldERhdGUoKSkucGFkU3RhcnQoMiwgJzAnKTtcbiAgICAgICAgY29uc3QgeWVhciA9IFN0cmluZyhtb25kYXkuZ2V0RnVsbFllYXIoKSkuc2xpY2UoLTIpO1xuXG4gICAgICAgIHJldHVybiBgJHttb250aH0vJHtkYXl9LyR7eWVhcn1gO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFBhcnNlIHRoZSBQcm9qZWN0IERhc2hib2FyZCBrYW5iYW4gYm9hcmRcbiAgICAgKiBSZXR1cm5zIHNlY3Rpb25zOiBkb25lLCBkb2luZywgdG9kYXksIHRvbW9ycm93LCB0aGlzX3dlZWssIGJsb2NrZWRcbiAgICAgKi9cbiAgICBhc3luYyBwYXJzZUthbmJhbkJvYXJkKGthbmJhblBhdGgpIHtcbiAgICAgICAgLy8gVXNlIHByb3ZpZGVkIHBhdGggb3IgZmFsbCBiYWNrIHRvIHNldHRpbmdzXG4gICAgICAgIGNvbnN0IGJvYXJkUGF0aCA9IGthbmJhblBhdGggfHwgdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcz8ua2FuYmFuRmlsZSB8fCAnMCAtIElOQk9YL1Byb2plY3QgRGFzaGJvYXJkLm1kJztcbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgnYWdlbmRhOnBhcnNlLWthbmJhbicpO1xuICAgICAgICBjb25zdCBjb250ZXh0ID0geyBib2FyZFBhdGggfTtcbiAgICAgICAgbGV0IGZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoYm9hcmRQYXRoKTtcbiAgICAgICAgbGV0IHNlY3Rpb25zID0gbnVsbDtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgICAgICAgLy8gVHJ5IHRvIHJlY3JlYXRlIGZyb20gdGVtcGxhdGVcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCdQcm9qZWN0IERhc2hib2FyZCBub3QgZm91bmQuIENyZWF0aW5nIGZyb20gdGVtcGxhdGUuLi4nKTtcbiAgICAgICAgICAgICAgICBjb25zdCB0ZW1wbGF0ZU1hbmFnZXIgPSBuZXcgVGVtcGxhdGVNYW5hZ2VyKHRoaXMuYXBwLCB0aGlzLnNldHRpbmdzLCB0aGlzLnByb2ZpbGVyKTtcblxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRlbXBsYXRlTWFuYWdlci5kZXBsb3lUZW1wbGF0ZSgnUHJvamVjdCBEYXNoYm9hcmQubWQnLCBib2FyZFBhdGgpO1xuICAgICAgICAgICAgICAgICAgICBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGJvYXJkUGF0aCk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEZhaWxlZCB0byBjcmVhdGUga2FuYmFuIGJvYXJkIGF0OiAke2JvYXJkUGF0aH1gKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoJ1Byb2plY3QgRGFzaGJvYXJkIGNyZWF0ZWQgc3VjY2Vzc2Z1bGx5IScpO1xuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNyZWF0aW5nIFByb2plY3QgRGFzaGJvYXJkOicsIGVycm9yKTtcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBLYW5iYW4gYm9hcmQgbm90IGZvdW5kIGFuZCBjb3VsZCBub3QgYmUgY3JlYXRlZDogJHtib2FyZFBhdGh9YCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcblxuICAgICAgICAgICAgc2VjdGlvbnMgPSB7XG4gICAgICAgICAgICAgICAgZG9uZTogW10sXG4gICAgICAgICAgICAgICAgZG9pbmc6IFtdLFxuICAgICAgICAgICAgICAgIHRvZGF5OiBbXSxcbiAgICAgICAgICAgICAgICB0b21vcnJvdzogW10sXG4gICAgICAgICAgICAgICAgdGhpc193ZWVrOiBbXSxcbiAgICAgICAgICAgICAgICBibG9ja2VkOiBbXVxuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gRXh0cmFjdCBzZWN0aW9ucyB1c2luZyByZWdleFxuICAgICAgICAgICAgLy8gUGF0dGVybjogIyMgU0VDVElPTl9OQU1FIGZvbGxvd2VkIGJ5IGNvbnRlbnQgdW50aWwgbmV4dCAjIyBvciBlbmRcbiAgICAgICAgICAgIGNvbnN0IHNlY3Rpb25SZWdleCA9IC9eIyNcXHMrKC4rPykkXFxuKC4qPykoPz1eIyN8XFxaKS9nbXM7XG4gICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwoc2VjdGlvblJlZ2V4KV07XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHNlY3Rpb25OYW1lID0gbWF0Y2hbMV0udHJpbSgpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgICAgICAgICAgY29uc3Qgc2VjdGlvbkNvbnRlbnQgPSBtYXRjaFsyXTtcblxuICAgICAgICAgICAgICAgIC8vIE1hcCBzZWN0aW9uIG5hbWVzIHRvIG91ciBrZXlzXG4gICAgICAgICAgICAgICAgbGV0IGtleSA9IG51bGw7XG4gICAgICAgICAgICAgICAgaWYgKHNlY3Rpb25OYW1lID09PSAnZG9uZScpIGtleSA9ICdkb25lJztcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzZWN0aW9uTmFtZSA9PT0gJ2RvaW5nJykga2V5ID0gJ2RvaW5nJztcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzZWN0aW9uTmFtZSA9PT0gJ3RvZGF5Jykga2V5ID0gJ3RvZGF5JztcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzZWN0aW9uTmFtZSA9PT0gJ3RvbW9ycm93Jykga2V5ID0gJ3RvbW9ycm93JztcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChzZWN0aW9uTmFtZSA9PT0gJ3RoaXMgd2VlaycpIGtleSA9ICd0aGlzX3dlZWsnO1xuICAgICAgICAgICAgICAgIGVsc2UgaWYgKHNlY3Rpb25OYW1lID09PSAnYmxvY2tlZCcpIGtleSA9ICdibG9ja2VkJztcblxuICAgICAgICAgICAgICAgIGlmIChrZXkpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VjdGlvbnNba2V5XSA9IHRoaXMuZXh0cmFjdFRhc2tzKHNlY3Rpb25Db250ZW50KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gc2VjdGlvbnM7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBjb25zdCBzZWN0aW9uQ291bnQgPSBzZWN0aW9ucyA/IE9iamVjdC5rZXlzKHNlY3Rpb25zKS5sZW5ndGggOiAwO1xuICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKHRpbWVyLCB7IC4uLmNvbnRleHQsIHNlY3Rpb25Db3VudCB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEV4dHJhY3QgdGFzayBpdGVtcyBmcm9tIHNlY3Rpb24gY29udGVudFxuICAgICAqL1xuICAgIGV4dHJhY3RUYXNrcyhzZWN0aW9uQ29udGVudCkge1xuICAgICAgICBjb25zdCB0YXNrcyA9IFtdO1xuICAgICAgICBjb25zdCBsaW5lcyA9IHNlY3Rpb25Db250ZW50LnNwbGl0KCdcXG4nKTtcblxuICAgICAgICBmb3IgKGNvbnN0IGxpbmUgb2YgbGluZXMpIHtcbiAgICAgICAgICAgIC8vIE1hdGNoIGNoZWNrYm94IGl0ZW1zOiAtIFsgXSBvciAtIFt4XVxuICAgICAgICAgICAgaWYgKC9eXFxzKi1cXHMrXFxbWyB4XVxcXS9pLnRlc3QobGluZSkpIHtcbiAgICAgICAgICAgICAgICB0YXNrcy5wdXNoKGxpbmUudHJpbSgpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB0YXNrcztcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGUgYSBwcm9qZWN0IHVwZGF0ZSBhZ2VuZGEgd2l0aCBkYXRhIGZyb20ga2FuYmFuIGJvYXJkXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge3N0cmluZ30gYWdlbmRhUGF0aCAtIFBhdGggdG8gdGhlIGFnZW5kYSBmaWxlIChlLmcuLCBcIjAgLSBJTkJPWC9VUERBVEUgXHUyMDE0IFByb2plY3QgTmFtZS5tZFwiKVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBrYW5iYW5QYXRoIC0gT3B0aW9uYWwgcGF0aCB0byBrYW5iYW4gYm9hcmQgKGRlZmF1bHRzIHRvIHNldHRpbmdzKVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBwcm9qZWN0Rm9sZGVyIC0gT3B0aW9uYWwgcHJvamVjdCBmb2xkZXIgdG8gZmlsdGVyIHRhc2tzIChkZWZhdWx0cyB0byBhbGwgcHJvamVjdHMpXG4gICAgICovXG4gICAgYXN5bmMgdXBkYXRlUHJvamVjdEFnZW5kYShhZ2VuZGFQYXRoLCBrYW5iYW5QYXRoID0gbnVsbCwgcHJvamVjdEZvbGRlciA9IG51bGwpIHtcbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgnYWdlbmRhOnVwZGF0ZScpO1xuICAgICAgICBjb25zdCBjb250ZXh0ID0ge1xuICAgICAgICAgICAgYWdlbmRhUGF0aCxcbiAgICAgICAgICAgIGthbmJhblBhdGg6IGthbmJhblBhdGggfHwgdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcz8ua2FuYmFuRmlsZSxcbiAgICAgICAgICAgIHByb2plY3RGb2xkZXJcbiAgICAgICAgfTtcbiAgICAgICAgbGV0IHN1Y2Nlc3MgPSBmYWxzZTtcblxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgbmV3IE5vdGljZSgnVXBkYXRpbmcgcHJvamVjdCBhZ2VuZGEuLi4nKTtcblxuICAgICAgICAgICAgLy8gUGFyc2Uga2FuYmFuIGJvYXJkXG4gICAgICAgICAgICBjb25zdCBrYW5iYW5EYXRhID0gYXdhaXQgdGhpcy5wYXJzZUthbmJhbkJvYXJkKGthbmJhblBhdGgpO1xuXG4gICAgICAgICAgICAvLyBHZXQgbmV4dCBNb25kYXkgZGF0ZVxuICAgICAgICAgICAgY29uc3QgbW9uZGF5RGF0ZSA9IHRoaXMuZ2V0TmV4dE1vbmRheURhdGUoKTtcblxuICAgICAgICAgICAgLy8gR2V0IGFnZW5kYSBmaWxlXG4gICAgICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAudmF1bHQuZ2V0QWJzdHJhY3RGaWxlQnlQYXRoKGFnZW5kYVBhdGgpO1xuXG4gICAgICAgICAgICBpZiAoIWZpbGUpIHtcbiAgICAgICAgICAgICAgICBuZXcgTm90aWNlKGBBZ2VuZGEgZmlsZSBub3QgZm91bmQ6ICR7YWdlbmRhUGF0aH1gLCA1MDAwKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuXG4gICAgICAgICAgICAvLyBDaGVjayBpZiBNb25kYXkgc2VjdGlvbiBleGlzdHNcbiAgICAgICAgICAgIGNvbnN0IG1vbmRheVBhdHRlcm4gPSBuZXcgUmVnRXhwKGAjIyMgJHt0aGlzLmVzY2FwZVJlZ2V4KG1vbmRheURhdGUpfWApO1xuICAgICAgICAgICAgY29uc3QgaGFzTW9uZGF5U2VjdGlvbiA9IG1vbmRheVBhdHRlcm4udGVzdChjb250ZW50KTtcblxuICAgICAgICAgICAgbGV0IHVwZGF0ZWRDb250ZW50ID0gY29udGVudDtcblxuICAgICAgICAgICAgaWYgKCFoYXNNb25kYXlTZWN0aW9uKSB7XG4gICAgICAgICAgICAgICAgLy8gQ3JlYXRlIG5ldyBNb25kYXkgc2VjdGlvblxuICAgICAgICAgICAgICAgIHVwZGF0ZWRDb250ZW50ID0gdGhpcy5jcmVhdGVNb25kYXlTZWN0aW9uKGNvbnRlbnQsIG1vbmRheURhdGUpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBVcGRhdGUgdGhlIE1vbmRheSBzZWN0aW9uIHdpdGgga2FuYmFuIGRhdGEgKG5vdyBhc3luYylcbiAgICAgICAgICAgIHVwZGF0ZWRDb250ZW50ID0gYXdhaXQgdGhpcy51cGRhdGVNb25kYXlTZWN0aW9uKHVwZGF0ZWRDb250ZW50LCBtb25kYXlEYXRlLCBrYW5iYW5EYXRhLCBwcm9qZWN0Rm9sZGVyKTtcblxuICAgICAgICAgICAgLy8gV3JpdGUgYmFjayB0byBmaWxlXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmFwcC52YXVsdC5tb2RpZnkoZmlsZSwgdXBkYXRlZENvbnRlbnQpO1xuXG4gICAgICAgICAgICBuZXcgTm90aWNlKCdQcm9qZWN0IGFnZW5kYSB1cGRhdGVkIHN1Y2Nlc3NmdWxseSEnKTtcbiAgICAgICAgICAgIHN1Y2Nlc3MgPSB0cnVlO1xuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgdXBkYXRpbmcgcHJvamVjdCBhZ2VuZGE6JywgZXJyb3IpO1xuICAgICAgICAgICAgbmV3IE5vdGljZShgRXJyb3IgdXBkYXRpbmcgYWdlbmRhOiAke2Vycm9yLm1lc3NhZ2V9YCwgNTAwMCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQodGltZXIsIHsgLi4uY29udGV4dCwgc3VjY2VzcyB9KTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIENyZWF0ZSBhIG5ldyBNb25kYXkgc2VjdGlvbiBpbiB0aGUgYWdlbmRhXG4gICAgICovXG4gICAgY3JlYXRlTW9uZGF5U2VjdGlvbihjb250ZW50LCBtb25kYXlEYXRlKSB7XG4gICAgICAgIGNvbnN0IG5ld1NlY3Rpb24gPSBgIyMjICR7bW9uZGF5RGF0ZX1cblxuIyMjIyBQcm9qZWN0c1xuPCEtLSBBVVRPLU1BTkFHRUQgLS0+XG4qQXV0by11cGRhdGVkIGZyb20gUHJvamVjdCBEYXNoYm9hcmQqXG5cbjwhLS0gRU5EIEFVVE8tTUFOQUdFRCAtLT5cblxuIyMjIyBCbG9ja2VkL2ZlZWRiYWNrIG5lZWRlZFxuPCEtLSBBVVRPLU1BTkFHRUQgLS0+XG4qQXV0by11cGRhdGVkIGZyb20gUHJvamVjdCBEYXNoYm9hcmQgXCJCbG9ja2VkXCIgc2VjdGlvbipcblxuPCEtLSBFTkQgQVVUTy1NQU5BR0VEIC0tPlxuXG4jIyMjIERhaWx5IEhpZ2hsaWdodHMgKFRoaXMgV2VlaylcbjwhLS0gQVVUTy1NQU5BR0VEIC0tPlxuKkNvbXBsZXRlZCB0YXNrcyBmcm9tIFByb2plY3QgRGFzaGJvYXJkIFwiRG9uZVwiIHNlY3Rpb24qXG5cbjwhLS0gRU5EIEFVVE8tTUFOQUdFRCAtLT5cblxuIyMjIyBGZWVkYmFjay91cGRhdGVzL25vdGVzIGZyb20gbWVldGluZ1xuICAqICooYWRkIGFueSBub3RlcyBhbmQgYWN0aW9uIGl0ZW1zIGhlcmUgYWZ0ZXIgdGhlIG1lZXRpbmcpKlxuXG4tLS1cblxuYDtcblxuICAgICAgICAvLyBJbnNlcnQgYWZ0ZXIgXCIjIyBOb3Rlc1wiIHNlY3Rpb25cbiAgICAgICAgY29uc3Qgbm90ZXNQYXR0ZXJuID0gLygjIyBOb3Rlcy4qP1xcbi4qP1xcbikvcztcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBjb250ZW50Lm1hdGNoKG5vdGVzUGF0dGVybik7XG5cbiAgICAgICAgaWYgKG1hdGNoKSB7XG4gICAgICAgICAgICBjb25zdCBpbnNlcnRQb3MgPSBtYXRjaC5pbmRleCArIG1hdGNoWzBdLmxlbmd0aDtcbiAgICAgICAgICAgIHJldHVybiBjb250ZW50LnNsaWNlKDAsIGluc2VydFBvcykgKyAnXFxuJyArIG5ld1NlY3Rpb24gKyBjb250ZW50LnNsaWNlKGluc2VydFBvcyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGYWxsYmFjazogYXBwZW5kIGF0IGVuZFxuICAgICAgICByZXR1cm4gY29udGVudCArICdcXG5cXG4nICsgbmV3U2VjdGlvbjtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBVcGRhdGUgdGhlIE1vbmRheSBzZWN0aW9uIHdpdGgga2FuYmFuIGRhdGFcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBjb250ZW50IC0gRnVsbCBhZ2VuZGEgZmlsZSBjb250ZW50XG4gICAgICogQHBhcmFtIHtzdHJpbmd9IG1vbmRheURhdGUgLSBGb3JtYXR0ZWQgTW9uZGF5IGRhdGVcbiAgICAgKiBAcGFyYW0ge09iamVjdH0ga2FuYmFuRGF0YSAtIFBhcnNlZCBrYW5iYW4gYm9hcmQgZGF0YVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBwcm9qZWN0Rm9sZGVyIC0gT3B0aW9uYWwgcHJvamVjdCBmb2xkZXIgdG8gZmlsdGVyIHRhc2tzXG4gICAgICovXG4gICAgYXN5bmMgdXBkYXRlTW9uZGF5U2VjdGlvbihjb250ZW50LCBtb25kYXlEYXRlLCBrYW5iYW5EYXRhLCBwcm9qZWN0Rm9sZGVyID0gbnVsbCkge1xuICAgICAgICAvLyBGaW5kIHRoZSBNb25kYXkgc2VjdGlvblxuICAgICAgICBjb25zdCBzZWN0aW9uUGF0dGVybiA9IG5ldyBSZWdFeHAoXG4gICAgICAgICAgICBgKCMjIyAke3RoaXMuZXNjYXBlUmVnZXgobW9uZGF5RGF0ZSl9XFxcXHMqXFxcXG4pKC4qPykoPz1cXFxcbiMjIyB8XFxcXG4tLS18XFxcXFopYCxcbiAgICAgICAgICAgICdzJ1xuICAgICAgICApO1xuICAgICAgICBjb25zdCBtYXRjaCA9IGNvbnRlbnQubWF0Y2goc2VjdGlvblBhdHRlcm4pO1xuXG4gICAgICAgIGlmICghbWF0Y2gpIHtcbiAgICAgICAgICAgIGNvbnNvbGUud2FybihgQ291bGQgbm90IGZpbmQgTW9uZGF5IHNlY3Rpb24gZm9yICR7bW9uZGF5RGF0ZX1gKTtcbiAgICAgICAgICAgIHJldHVybiBjb250ZW50O1xuICAgICAgICB9XG5cbiAgICAgICAgbGV0IHNlY3Rpb25Cb2R5ID0gbWF0Y2hbMl07XG5cbiAgICAgICAgLy8gVXBkYXRlIFByb2plY3RzIHNlY3Rpb24gd2l0aCBvcHRpb25hbCBmb2xkZXIgZmlsdGVyIChub3cgYXN5bmMpXG4gICAgICAgIC8vIFByb2plY3RzIHNlY3Rpb24gbm93IGluY2x1ZGVzIGJvdGggb3BlbiBhbmQgY29tcGxldGVkIHRhc2tzIGdyb3VwZWQgYnkgcHJvamVjdFxuICAgICAgICBjb25zdCBwcm9qZWN0c0NvbnRlbnQgPSBhd2FpdCB0aGlzLmZvcm1hdFByb2plY3RzU2VjdGlvbihrYW5iYW5EYXRhLCBwcm9qZWN0Rm9sZGVyKTtcbiAgICAgICAgc2VjdGlvbkJvZHkgPSB0aGlzLnVwZGF0ZUF1dG9TZWN0aW9uKHNlY3Rpb25Cb2R5LCAnUHJvamVjdHMnLCBwcm9qZWN0c0NvbnRlbnQpO1xuXG4gICAgICAgIC8vIFVwZGF0ZSBCbG9ja2VkIHNlY3Rpb25cbiAgICAgICAgY29uc3QgYmxvY2tlZENvbnRlbnQgPSB0aGlzLmZvcm1hdEJsb2NrZWRTZWN0aW9uKGthbmJhbkRhdGEpO1xuICAgICAgICBzZWN0aW9uQm9keSA9IHRoaXMudXBkYXRlQXV0b1NlY3Rpb24oc2VjdGlvbkJvZHksICdCbG9ja2VkL2ZlZWRiYWNrIG5lZWRlZCcsIGJsb2NrZWRDb250ZW50KTtcblxuICAgICAgICAvLyBOb3RlOiBEYWlseSBIaWdobGlnaHRzIHNlY3Rpb24gcmVtb3ZlZCAtIGNvbXBsZXRlZCB0YXNrcyBub3cgaW50ZWdyYXRlZCB1bmRlciB0aGVpciBwcm9qZWN0c1xuXG4gICAgICAgIC8vIFJlY29uc3RydWN0IGNvbnRlbnRcbiAgICAgICAgcmV0dXJuIGNvbnRlbnQuc2xpY2UoMCwgbWF0Y2guaW5kZXgpICsgbWF0Y2hbMV0gKyBzZWN0aW9uQm9keSArIGNvbnRlbnQuc2xpY2UobWF0Y2guaW5kZXggKyBtYXRjaFswXS5sZW5ndGgpO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIFVwZGF0ZSBhbiBhdXRvLW1hbmFnZWQgc2VjdGlvblxuICAgICAqL1xuICAgIHVwZGF0ZUF1dG9TZWN0aW9uKGJvZHksIHNlY3Rpb25OYW1lLCBuZXdDb250ZW50KSB7XG4gICAgICAgIGNvbnN0IHBhdHRlcm4gPSBuZXcgUmVnRXhwKFxuICAgICAgICAgICAgYCgjIyMjXFxcXHMrJHtzZWN0aW9uTmFtZX1cXFxccypcXFxcbikoLio/KSg8IS0tXFxcXHMqQVVUTy1NQU5BR0VEXFxcXHMqLS0+KSguKj8pKDwhLS1cXFxccypFTkQgQVVUTy1NQU5BR0VEXFxcXHMqLS0+KWAsXG4gICAgICAgICAgICAncydcbiAgICAgICAgKTtcbiAgICAgICAgY29uc3QgbWF0Y2ggPSBib2R5Lm1hdGNoKHBhdHRlcm4pO1xuXG4gICAgICAgIGlmIChtYXRjaCkge1xuICAgICAgICAgICAgY29uc3QgaGVhZGVyID0gbWF0Y2hbMV07XG4gICAgICAgICAgICBjb25zdCBwcmVBdXRvID0gbWF0Y2hbMl07XG4gICAgICAgICAgICBjb25zdCBhdXRvU3RhcnQgPSBtYXRjaFszXTtcbiAgICAgICAgICAgIGNvbnN0IGF1dG9FbmQgPSBtYXRjaFs1XTtcblxuICAgICAgICAgICAgcmV0dXJuIGJvZHkuc2xpY2UoMCwgbWF0Y2guaW5kZXgpICtcbiAgICAgICAgICAgICAgICAgICBoZWFkZXIgKyBwcmVBdXRvICsgYXV0b1N0YXJ0ICsgJ1xcbicgKyBuZXdDb250ZW50ICsgJ1xcbicgKyBhdXRvRW5kICtcbiAgICAgICAgICAgICAgICAgICBib2R5LnNsaWNlKG1hdGNoLmluZGV4ICsgbWF0Y2hbMF0ubGVuZ3RoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBib2R5O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZvcm1hdCB0aGUgUHJvamVjdHMgc2VjdGlvbiBjb250ZW50XG4gICAgICpcbiAgICAgKiBAcGFyYW0ge09iamVjdH0ga2FuYmFuRGF0YSAtIFBhcnNlZCBrYW5iYW4gYm9hcmQgZGF0YVxuICAgICAqIEBwYXJhbSB7c3RyaW5nfSBwcm9qZWN0Rm9sZGVyIC0gT3B0aW9uYWwgcHJvamVjdCBmb2xkZXIgcGF0aCB0byBmaWx0ZXIgdGFza3NcbiAgICAgKi9cbiAgICBhc3luYyBmb3JtYXRQcm9qZWN0c1NlY3Rpb24oa2FuYmFuRGF0YSwgcHJvamVjdEZvbGRlciA9IG51bGwpIHtcbiAgICAgICAgY29uc3QgdGltZXIgPSB0aGlzLnByb2ZpbGVyPy5zdGFydCgnYWdlbmRhOmZvcm1hdC1wcm9qZWN0cycpO1xuICAgICAgICBjb25zdCBsaW5lcyA9IFsnKkF1dG8tdXBkYXRlZCBmcm9tIFByb2plY3QgRGFzaGJvYXJkIGFuZCBwcm9qZWN0IGZvbGRlciB0YXNrcyonLCAnJ107XG5cbiAgICAgICAgLy8gQ29tYmluZSBhY3RpdmUgd29yayBzZWN0aW9ucyBmcm9tIGthbmJhblxuICAgICAgICBjb25zdCBhY3RpdmVUYXNrcyA9IFtcbiAgICAgICAgICAgIC4uLmthbmJhbkRhdGEuZG9pbmcsXG4gICAgICAgICAgICAuLi5rYW5iYW5EYXRhLnRvZGF5LFxuICAgICAgICAgICAgLi4ua2FuYmFuRGF0YS50b21vcnJvdyxcbiAgICAgICAgICAgIC4uLmthbmJhbkRhdGEudGhpc193ZWVrXG4gICAgICAgIF07XG5cbiAgICAgICAgLy8gR2V0IGNvbXBsZXRlZCB0YXNrcyBmcm9tIGthbmJhbiBcIkRvbmVcIiBzZWN0aW9uXG4gICAgICAgIGNvbnN0IGNvbXBsZXRlZFRhc2tzID0gdGhpcy5maWx0ZXJSZWNlbnRUYXNrcyhrYW5iYW5EYXRhLmRvbmUsIDcpO1xuXG4gICAgICAgIC8vIEJ1aWxkIG1hcCBvZiBwcm9qZWN0IG5vdGVzIHdpdGggdGhlaXIgdGFza3NcbiAgICAgICAgY29uc3QgcHJvamVjdE1hcCA9IG5ldyBNYXAoKTsgLy8gcHJvamVjdCB3aWtpbGluayAtPiB7b3BlbjogW10sIGNvbXBsZXRlZDogW119XG5cbiAgICAgICAgLy8gUHJvY2VzcyBhY3RpdmUgdGFza3MgZnJvbSBrYW5iYW5cbiAgICAgICAgZm9yIChjb25zdCB0YXNrIG9mIGFjdGl2ZVRhc2tzKSB7XG4gICAgICAgICAgICBjb25zdCB3aWtpbGlua3MgPSB0YXNrLm1hdGNoKC9cXFtcXFsoW15cXF1dKylcXF1cXF0vZyk7XG4gICAgICAgICAgICBpZiAod2lraWxpbmtzKSB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBsaW5rIG9mIHdpa2lsaW5rcykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9qZWN0TmFtZSA9IGxpbmsuc2xpY2UoMiwgLTIpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHByb2plY3QgZXhpc3RzIGluIGZvbGRlclxuICAgICAgICAgICAgICAgICAgICBpZiAocHJvamVjdEZvbGRlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvamVjdEZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoYCR7cHJvamVjdEZvbGRlcn0vJHtwcm9qZWN0TmFtZX0ubWRgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcHJvamVjdEZpbGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwcm9qZWN0TWFwLmhhcyhsaW5rKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvamVjdE1hcC5zZXQobGluaywgeyBvcGVuOiBbXSwgY29tcGxldGVkOiBbXSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBwcm9qZWN0TWFwLmdldChsaW5rKS5vcGVuLnB1c2godGFzayk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUHJvY2VzcyBjb21wbGV0ZWQgdGFza3MgZnJvbSBrYW5iYW5cbiAgICAgICAgZm9yIChjb25zdCB0YXNrIG9mIGNvbXBsZXRlZFRhc2tzKSB7XG4gICAgICAgICAgICBjb25zdCB3aWtpbGlua3MgPSB0YXNrLm1hdGNoKC9cXFtcXFsoW15cXF1dKylcXF1cXF0vZyk7XG4gICAgICAgICAgICBpZiAod2lraWxpbmtzKSB7XG4gICAgICAgICAgICAgICAgZm9yIChjb25zdCBsaW5rIG9mIHdpa2lsaW5rcykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBwcm9qZWN0TmFtZSA9IGxpbmsuc2xpY2UoMiwgLTIpO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIENoZWNrIGlmIHByb2plY3QgZXhpc3RzIGluIGZvbGRlclxuICAgICAgICAgICAgICAgICAgICBpZiAocHJvamVjdEZvbGRlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29uc3QgcHJvamVjdEZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgoYCR7cHJvamVjdEZvbGRlcn0vJHtwcm9qZWN0TmFtZX0ubWRgKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghcHJvamVjdEZpbGUpIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFwcm9qZWN0TWFwLmhhcyhsaW5rKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcHJvamVjdE1hcC5zZXQobGluaywgeyBvcGVuOiBbXSwgY29tcGxldGVkOiBbXSB9KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBwcm9qZWN0TWFwLmdldChsaW5rKS5jb21wbGV0ZWQucHVzaCh0YXNrKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBJZiBwcm9qZWN0Rm9sZGVyIHNwZWNpZmllZCwgYWxzbyBleHRyYWN0IHRhc2tzIGRpcmVjdGx5IGZyb20gcHJvamVjdCBub3Rlc1xuICAgICAgICBpZiAocHJvamVjdEZvbGRlcikge1xuICAgICAgICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKClcbiAgICAgICAgICAgICAgICAuZmlsdGVyKGZpbGUgPT4gZmlsZS5wYXRoLnN0YXJ0c1dpdGgocHJvamVjdEZvbGRlciArICcvJykpO1xuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IGZpbGUgb2YgZmlsZXMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgdGhpcy5hcHAudmF1bHQucmVhZChmaWxlKTtcbiAgICAgICAgICAgICAgICBjb25zdCBsaW5rID0gYFtbJHtmaWxlLmJhc2VuYW1lfV1dYDtcblxuICAgICAgICAgICAgICAgIGlmICghcHJvamVjdE1hcC5oYXMobGluaykpIHtcbiAgICAgICAgICAgICAgICAgICAgcHJvamVjdE1hcC5zZXQobGluaywgeyBvcGVuOiBbXSwgY29tcGxldGVkOiBbXSB9KTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAvLyBFeHRyYWN0IHRhc2tzIGZyb20gbm90ZVxuICAgICAgICAgICAgICAgIGNvbnN0IHRhc2tSZWdleCA9IC9eW1xccy1dKlxcW1sgeFhdXFxdXFxzKyguKykkL2dtO1xuICAgICAgICAgICAgICAgIGNvbnN0IG1hdGNoZXMgPSBbLi4uY29udGVudC5tYXRjaEFsbCh0YXNrUmVnZXgpXTtcblxuICAgICAgICAgICAgICAgIGZvciAoY29uc3QgbWF0Y2ggb2YgbWF0Y2hlcykge1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBmdWxsTGluZSA9IG1hdGNoWzBdO1xuICAgICAgICAgICAgICAgICAgICBjb25zdCBpc0NvbXBsZXRlZCA9IC9cXFt4XFxdL2kudGVzdChmdWxsTGluZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzQ29tcGxldGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBDaGVjayBpZiBjb21wbGV0ZWQgcmVjZW50bHlcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnN0IGRhdGVNYXRjaCA9IGZ1bGxMaW5lLm1hdGNoKC9cdTI3MDVcXHMrKFxcZHs0fSktKFxcZHsyfSktKFxcZHsyfSkvKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChkYXRlTWF0Y2gpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCB0YXNrRGF0ZSA9IG5ldyBEYXRlKGRhdGVNYXRjaFsxXSwgZGF0ZU1hdGNoWzJdIC0gMSwgZGF0ZU1hdGNoWzNdKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjb25zdCBjdXRvZmZEYXRlID0gbmV3IERhdGUoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjdXRvZmZEYXRlLnNldERhdGUoY3V0b2ZmRGF0ZS5nZXREYXRlKCkgLSA3KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0YXNrRGF0ZSA+PSBjdXRvZmZEYXRlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHByb2plY3RNYXAuZ2V0KGxpbmspLmNvbXBsZXRlZC5wdXNoKGZ1bGxMaW5lKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBwcm9qZWN0TWFwLmdldChsaW5rKS5vcGVuLnB1c2goZnVsbExpbmUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gRm9ybWF0IG91dHB1dCBncm91cGVkIGJ5IHByb2plY3RcbiAgICAgICAgaWYgKHByb2plY3RNYXAuc2l6ZSA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IHNvcnRlZFByb2plY3RzID0gQXJyYXkuZnJvbShwcm9qZWN0TWFwLmtleXMoKSkuc29ydCgpO1xuXG4gICAgICAgICAgICBmb3IgKGNvbnN0IHByb2plY3RMaW5rIG9mIHNvcnRlZFByb2plY3RzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdGFza3MgPSBwcm9qZWN0TWFwLmdldChwcm9qZWN0TGluayk7XG5cbiAgICAgICAgICAgICAgICAvLyBPbmx5IHNob3cgcHJvamVjdHMgd2l0aCB0YXNrc1xuICAgICAgICAgICAgICAgIGlmICh0YXNrcy5vcGVuLmxlbmd0aCA+IDAgfHwgdGFza3MuY29tcGxldGVkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgbGluZXMucHVzaCgnJyk7XG4gICAgICAgICAgICAgICAgICAgIGxpbmVzLnB1c2goYCoqJHtwcm9qZWN0TGlua30qKmApO1xuXG4gICAgICAgICAgICAgICAgICAgIC8vIFNob3cgb3BlbiB0YXNrc1xuICAgICAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2YgdGFza3Mub3Blbikge1xuICAgICAgICAgICAgICAgICAgICAgICAgbGluZXMucHVzaCh0YXNrKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIFNob3cgY29tcGxldGVkIHRhc2tzXG4gICAgICAgICAgICAgICAgICAgIGZvciAoY29uc3QgdGFzayBvZiB0YXNrcy5jb21wbGV0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGxpbmVzLnB1c2godGFzayk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIENhdGNoLWFsbCBzZWN0aW9uIGZvciBvcnBoYW5lZCBjb21wbGV0ZWQgdGFza3NcbiAgICAgICAgICAgIGNvbnN0IG9ycGhhbmVkQ29tcGxldGVkID0gW107XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2YgY29tcGxldGVkVGFza3MpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB3aWtpbGlua3MgPSB0YXNrLm1hdGNoKC9cXFtcXFsoW15cXF1dKylcXF1cXF0vZyk7XG4gICAgICAgICAgICAgICAgaWYgKCF3aWtpbGlua3MgfHwgd2lraWxpbmtzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICBvcnBoYW5lZENvbXBsZXRlZC5wdXNoKHRhc2spO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKG9ycGhhbmVkQ29tcGxldGVkLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKCcnKTtcbiAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKCcqT3RoZXIgY29tcGxldGVkIGl0ZW1zIChub3QgbGlua2VkIHRvIHNwZWNpZmljIHByb2plY3Qgbm90ZXMpOionKTtcbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2Ygb3JwaGFuZWRDb21wbGV0ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgbGluZXMucHVzaCh0YXNrKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKCctICoobm8gYWN0aXZlIHByb2plY3RzIHRoaXMgd2VlaykqJyk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCByZXN1bHQgPSBsaW5lcy5qb2luKCdcXG4nKTtcbiAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKHRpbWVyLCB7IHByb2plY3RGb2xkZXIsIHByb2plY3RDb3VudDogcHJvamVjdE1hcC5zaXplIH0pO1xuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEZvcm1hdCB0aGUgQmxvY2tlZCBzZWN0aW9uIGNvbnRlbnRcbiAgICAgKi9cbiAgICBmb3JtYXRCbG9ja2VkU2VjdGlvbihrYW5iYW5EYXRhKSB7XG4gICAgICAgIGNvbnN0IGxpbmVzID0gWycqQXV0by11cGRhdGVkIGZyb20gUHJvamVjdCBEYXNoYm9hcmQgXCJCbG9ja2VkXCIgc2VjdGlvbionLCAnJ107XG5cbiAgICAgICAgaWYgKGthbmJhbkRhdGEuYmxvY2tlZC5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICBmb3IgKGNvbnN0IHRhc2sgb2Yga2FuYmFuRGF0YS5ibG9ja2VkKSB7XG4gICAgICAgICAgICAgICAgLy8gUmVtb3ZlIGNoZWNrYm94IGFuZCBmb3JtYXRcbiAgICAgICAgICAgICAgICBjb25zdCB0ZXh0ID0gdGFzay5yZXBsYWNlKC9eLVxccytcXFtbIHhdXFxdXFxzKy9pLCAnJyk7XG4gICAgICAgICAgICAgICAgbGluZXMucHVzaChgLSAke3RleHR9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKCctICoobm9uZSkqJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRm9ybWF0IHRoZSBIaWdobGlnaHRzIHNlY3Rpb24gY29udGVudFxuICAgICAqL1xuICAgIGZvcm1hdEhpZ2hsaWdodHNTZWN0aW9uKGthbmJhbkRhdGEpIHtcbiAgICAgICAgY29uc3QgbGluZXMgPSBbJypDb21wbGV0ZWQgdGFza3MgZnJvbSBQcm9qZWN0IERhc2hib2FyZCBcIkRvbmVcIiBzZWN0aW9uKicsICcnXTtcblxuICAgICAgICBpZiAoa2FuYmFuRGF0YS5kb25lLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIEdldCB0YXNrcyBmcm9tIGxhc3QgNyBkYXlzXG4gICAgICAgICAgICBjb25zdCByZWNlbnRUYXNrcyA9IHRoaXMuZmlsdGVyUmVjZW50VGFza3Moa2FuYmFuRGF0YS5kb25lLCA3KTtcbiAgICAgICAgICAgIGlmIChyZWNlbnRUYXNrcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgbGluZXMucHVzaCguLi5yZWNlbnRUYXNrcy5zbGljZSgwLCAxMCkpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBsaW5lcy5wdXNoKCctICoobm8gY29tcGxldGVkIHRhc2tzIHRoaXMgd2VlaykqJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBsaW5lcy5wdXNoKCctICoobm8gY29tcGxldGVkIHRhc2tzIHRoaXMgd2VlaykqJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbGluZXMuam9pbignXFxuJyk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogRmlsdGVyIHRhc2tzIGNvbXBsZXRlZCBpbiB0aGUgbGFzdCBOIGRheXNcbiAgICAgKi9cbiAgICBmaWx0ZXJSZWNlbnRUYXNrcyh0YXNrcywgZGF5cykge1xuICAgICAgICBjb25zdCBjdXRvZmZEYXRlID0gbmV3IERhdGUoKTtcbiAgICAgICAgY3V0b2ZmRGF0ZS5zZXREYXRlKGN1dG9mZkRhdGUuZ2V0RGF0ZSgpIC0gZGF5cyk7XG5cbiAgICAgICAgcmV0dXJuIHRhc2tzLmZpbHRlcih0YXNrID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGVNYXRjaCA9IHRhc2subWF0Y2goL1x1MjcwNVxccysoXFxkezR9KS0oXFxkezJ9KS0oXFxkezJ9KS8pO1xuICAgICAgICAgICAgaWYgKGRhdGVNYXRjaCkge1xuICAgICAgICAgICAgICAgIGNvbnN0IHRhc2tEYXRlID0gbmV3IERhdGUoZGF0ZU1hdGNoWzFdLCBkYXRlTWF0Y2hbMl0gLSAxLCBkYXRlTWF0Y2hbM10pO1xuICAgICAgICAgICAgICAgIHJldHVybiB0YXNrRGF0ZSA+PSBjdXRvZmZEYXRlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHRydWU7IC8vIEluY2x1ZGUgdGFza3Mgd2l0aG91dCBkYXRlc1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBFeHRyYWN0IHRhc2tzIGZyb20gbm90ZXMgaW4gYSBwcm9qZWN0IGZvbGRlclxuICAgICAqIFJldHVybnMgYW4gb2JqZWN0IHdpdGggYWN0aXZlIGFuZCBjb21wbGV0ZWQgdGFza3NcbiAgICAgKi9cbiAgICBhc3luYyBleHRyYWN0VGFza3NGcm9tUHJvamVjdEZvbGRlcihwcm9qZWN0Rm9sZGVyKSB7XG4gICAgICAgIGNvbnN0IGFjdGl2ZVRhc2tzID0gW107XG4gICAgICAgIGNvbnN0IGNvbXBsZXRlZFRhc2tzID0gW107XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIC8vIEdldCBhbGwgbWFya2Rvd24gZmlsZXMgaW4gdGhlIHByb2plY3QgZm9sZGVyXG4gICAgICAgICAgICBjb25zdCBmaWxlcyA9IHRoaXMuYXBwLnZhdWx0LmdldE1hcmtkb3duRmlsZXMoKVxuICAgICAgICAgICAgICAgIC5maWx0ZXIoZmlsZSA9PiBmaWxlLnBhdGguc3RhcnRzV2l0aChwcm9qZWN0Rm9sZGVyICsgJy8nKSk7XG5cbiAgICAgICAgICAgIGZvciAoY29uc3QgZmlsZSBvZiBmaWxlcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCB0aGlzLmFwcC52YXVsdC5yZWFkKGZpbGUpO1xuXG4gICAgICAgICAgICAgICAgLy8gRXh0cmFjdCB0YXNrIGxpbmVzIChib3RoIGNvbXBsZXRlZCBhbmQgaW5jb21wbGV0ZSlcbiAgICAgICAgICAgICAgICBjb25zdCB0YXNrUmVnZXggPSAvXltcXHMtXSpcXFtbIHhYXVxcXVxccysoLispJC9nbTtcbiAgICAgICAgICAgICAgICBjb25zdCBtYXRjaGVzID0gWy4uLmNvbnRlbnQubWF0Y2hBbGwodGFza1JlZ2V4KV07XG5cbiAgICAgICAgICAgICAgICBmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgZnVsbExpbmUgPSBtYXRjaFswXTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaXNDb21wbGV0ZWQgPSAvXFxbeFxcXS9pLnRlc3QoZnVsbExpbmUpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChpc0NvbXBsZXRlZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY29tcGxldGVkVGFza3MucHVzaChmdWxsTGluZSk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhY3RpdmVUYXNrcy5wdXNoKGZ1bGxMaW5lKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoYEVycm9yIGV4dHJhY3RpbmcgdGFza3MgZnJvbSAke3Byb2plY3RGb2xkZXJ9OmAsIGVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7IGFjdGl2ZVRhc2tzLCBjb21wbGV0ZWRUYXNrcyB9O1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEVzY2FwZSBzcGVjaWFsIHJlZ2V4IGNoYXJhY3RlcnNcbiAgICAgKi9cbiAgICBlc2NhcGVSZWdleChzdHIpIHtcbiAgICAgICAgcmV0dXJuIHN0ci5yZXBsYWNlKC9bLiorP14ke30oKXxbXFxdXFxcXF0vZywgJ1xcXFwkJicpO1xuICAgIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gU0VUVElOR1MgVEFCXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmNsYXNzIFF1aWNrUGFyYVNldHRpbmdUYWIgZXh0ZW5kcyBQbHVnaW5TZXR0aW5nVGFiIHtcbiAgICBjb25zdHJ1Y3RvcihhcHAsIHBsdWdpbikge1xuICAgICAgICBzdXBlcihhcHAsIHBsdWdpbik7XG4gICAgICAgIHRoaXMucGx1Z2luID0gcGx1Z2luO1xuICAgIH1cblxuICAgIGRpc3BsYXkoKSB7XG4gICAgICAgIGNvbnN0IHsgY29udGFpbmVyRWwgfSA9IHRoaXM7XG4gICAgICAgIGNvbnRhaW5lckVsLmVtcHR5KCk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gxJywgeyB0ZXh0OiAnUXVpY2sgUEFSQSBTZXR0aW5ncycgfSk7XG5cbiAgICAgICAgLy8gSGVhZGVyIGRlc2NyaXB0aW9uXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgdGV4dDogJ1F1aWNrIFBBUkEgaGVscHMgeW91IG9yZ2FuaXplIHlvdXIgT2JzaWRpYW4gdmF1bHQgdXNpbmcgdGhlIFBBUkEgbWV0aG9kIChQcm9qZWN0cywgQXJlYXMsIFJlc291cmNlcywgQXJjaGl2ZSkuIFRoaXMgcGx1Z2luIGF1dG9tYXRlcyBmb2xkZXIgc2V0dXAsIHRlbXBsYXRlIGRlcGxveW1lbnQsIGFuZCBwcm9qZWN0IHVwZGF0ZSBnZW5lcmF0aW9uLicsXG4gICAgICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgdGV4dDogJ0xlYXJuIG1vcmUgYWJvdXQgUEFSQTogU2VlIHRoZSBcIlBBUkEgTWV0aG9kIE92ZXJ2aWV3XCIgbm90ZSBpbiB5b3VyIFJlc291cmNlcyBmb2xkZXIuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2hyJyk7XG5cbiAgICAgICAgLy8gQWN0aW9ucyBTZWN0aW9uIC0gQVQgVEhFIFRPUFxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdRdWljayBBY3Rpb25zJyB9KTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdcdUQ4M0RcdURFODAgUnVuIFNldHVwIFdpemFyZCcpXG4gICAgICAgICAgICAuc2V0RGVzYygnTGF1bmNoIHRoZSBzdGVwLWJ5LXN0ZXAgc2V0dXAgd2l6YXJkIHRvIGNyZWF0ZSB5b3VyIFBBUkEgZm9sZGVyIHN0cnVjdHVyZSBhbmQgZGVwbG95IHRlbXBsYXRlcycpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnUnVuIFNldHVwIFdpemFyZCcpXG4gICAgICAgICAgICAgICAgLnNldEN0YSgpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5wcm92aXNpb25pbmdNYW5hZ2VyLnJ1blNldHVwV2l6YXJkKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1x1RDgzRFx1REQwRCBDaGVjayBEZXBlbmRlbmNpZXMnKVxuICAgICAgICAgICAgLnNldERlc2MoJ1ZlcmlmeSB0aGF0IHJlcXVpcmVkIHBsdWdpbnMgKFRlbXBsYXRlciwgVGFza3MsIEthbmJhbikgYXJlIGluc3RhbGxlZC4gTWFrZSBzdXJlIGVhY2ggcGx1Z2luIGlzIGFsc28gYWN0aXZlIGFmdGVyIGluc3RhbGxhdGlvbi4nKVxuICAgICAgICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXG4gICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQoJ0NoZWNrIERlcGVuZGVuY2llcycpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5jaGVja0RlcGVuZGVuY2llcyh0cnVlKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnXHVEODNDXHVERkY3XHVGRTBGIFVwZGF0ZSBBbGwgUEFSQSBUYWdzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdCdWxrIHVwZGF0ZSBQQVJBIHRhZ3MgZm9yIGFsbCBmaWxlcyBpbiB5b3VyIHZhdWx0IHRvIG1hdGNoIHRoZWlyIGN1cnJlbnQgZm9sZGVyIGxvY2F0aW9ucycpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnVXBkYXRlIEFsbCBUYWdzJylcbiAgICAgICAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnRhZ2dpbmdNYW5hZ2VyLmJ1bGtVcGRhdGVUYWdzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1x1RDgzRFx1RENERCBEZXBsb3kgUEFSQSBUZW1wbGF0ZXMnKVxuICAgICAgICAgICAgLnNldERlc2MoJ0luc3RhbGwgZGVmYXVsdCB0ZW1wbGF0ZXMgZm9yIG5vdGVzIGluIGVhY2ggUEFSQSBmb2xkZXIgKGluYm94LCBwcm9qZWN0cywgYXJlYXMsIHJlc291cmNlcywgYXJjaGl2ZSksIHBsdXMgdGhlIFByb2plY3QgRGFzaGJvYXJkIGFuZCBQQVJBIE1ldGhvZCBPdmVydmlldyBndWlkZS4gVGhlc2UgYXJlIHN0YXJ0aW5nIHBvaW50cyB5b3UgY2FuIGN1c3RvbWl6ZSB0byB5b3VyIGxpa2luZy4gU2V0IHRoZXNlIHRlbXBsYXRlcyBpbiBUZW1wbGF0ZXIgcGx1Z2luIHNldHRpbmdzIHRvIHVzZSB0aGVtIHdoZW4gY3JlYXRpbmcgbmV3IG5vdGVzLiBPbmx5IGNyZWF0ZXMgbWlzc2luZyB0ZW1wbGF0ZXMsIHdpbGwgbm90IG92ZXJ3cml0ZSB5b3VyIGN1c3RvbWl6YXRpb25zLicpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnRGVwbG95IFRlbXBsYXRlcycpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi50ZW1wbGF0ZU1hbmFnZXIuZGVwbG95QWxsVGVtcGxhdGVzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIC8vIERlcGVuZGVuY3kgbGlua3NcbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2g0JywgeyB0ZXh0OiAnUmVxdWlyZWQgRGVwZW5kZW5jaWVzJyB9KTtcblxuICAgICAgICBjb25zdCB0ZW1wbGF0ZXJMaW5rID0gY29udGFpbmVyRWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJyB9KTtcbiAgICAgICAgdGVtcGxhdGVyTGluay5pbm5lckhUTUwgPSAnXHUyMDIyIDxzdHJvbmc+VGVtcGxhdGVyPC9zdHJvbmc+OiBSZXF1aXJlZCBmb3IgdGVtcGxhdGUgdmFyaWFibGUgc3Vic3RpdHV0aW9uLiA8YSBocmVmPVwib2JzaWRpYW46Ly9zaG93LXBsdWdpbj9pZD10ZW1wbGF0ZXItb2JzaWRpYW5cIj5JbnN0YWxsIGZyb20gQ29tbXVuaXR5IFBsdWdpbnM8L2E+JztcblxuICAgICAgICBjb25zdCB0YXNrc0xpbmsgPSBjb250YWluZXJFbC5jcmVhdGVFbCgnZGl2JywgeyBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nIH0pO1xuICAgICAgICB0YXNrc0xpbmsuaW5uZXJIVE1MID0gJ1x1MjAyMiA8c3Ryb25nPlRhc2tzPC9zdHJvbmc+OiBSZXF1aXJlZCBmb3IgdGFzayBtYW5hZ2VtZW50IGZlYXR1cmVzLiA8YSBocmVmPVwib2JzaWRpYW46Ly9zaG93LXBsdWdpbj9pZD1vYnNpZGlhbi10YXNrcy1wbHVnaW5cIj5JbnN0YWxsIGZyb20gQ29tbXVuaXR5IFBsdWdpbnM8L2E+JztcblxuICAgICAgICBjb25zdCBrYW5iYW5MaW5rID0gY29udGFpbmVyRWwuY3JlYXRlRWwoJ2RpdicsIHsgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJyB9KTtcbiAgICAgICAga2FuYmFuTGluay5pbm5lckhUTUwgPSAnXHUyMDIyIDxzdHJvbmc+S2FuYmFuPC9zdHJvbmc+OiBSZXF1aXJlZCBmb3IgUHJvamVjdCBEYXNoYm9hcmQgYW5kIHByb2plY3QgdXBkYXRlIGdlbmVyYXRpb24uIFRoaXMgcGx1Z2luIHZpc3VhbGl6ZXMgeW91ciBhY3RpdmUgd29yayBhbmQgZW5hYmxlcyB0aGUgYXV0b21hdGVkIHVwZGF0ZSB3b3JrZmxvdy4gPGEgaHJlZj1cIm9ic2lkaWFuOi8vc2hvdy1wbHVnaW4/aWQ9b2JzaWRpYW4ta2FuYmFuXCI+SW5zdGFsbCBmcm9tIENvbW11bml0eSBQbHVnaW5zPC9hPic7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2hyJyk7XG5cbiAgICAgICAgLy8gUEFSQSBGb2xkZXJzIFNlY3Rpb25cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnUEFSQSBGb2xkZXIgQ29uZmlndXJhdGlvbicgfSk7XG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgdGV4dDogJ0NvbmZpZ3VyZSB0aGUgbmFtZXMgb2YgeW91ciBmaXZlIGNvcmUgUEFSQSBmb2xkZXJzLiBUaGVzZSBmb2xkZXJzIHdpbGwgYmUgY3JlYXRlZCBhdXRvbWF0aWNhbGx5IGR1cmluZyBzZXR1cCBpZiB0aGV5IGRvblxcJ3QgZXhpc3QuIFRoZSBwbHVnaW4gdXNlcyB0aGVzZSBwYXRocyB0byBkZXRlcm1pbmUgd2hlcmUgbm90ZXMgYmVsb25nIGFuZCB3aGF0IHByb3BlcnRpZXMgdG8gYXNzaWduLicsXG4gICAgICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgdGV4dDogJ05vdGU6IEZvbGRlciBuYW1lcyBhcmUgY2FzZS1pbnNlbnNpdGl2ZS4gVGhlIHBsdWdpbiB3aWxsIG1hdGNoIFwiMSAtIHByb2plY3RzXCIsIFwiMSAtIFByb2plY3RzXCIsIG9yIFwiMSAtIFBST0pFQ1RTXCIgZXF1YWxseS4nLFxuICAgICAgICAgICAgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJ1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBDcmVhdGUgZm9sZGVyIHN1Z2dlc3Rpb25zIGRhdGFsaXN0IChzaGFyZWQgYnkgYWxsIGZvbGRlciBpbnB1dHMpXG4gICAgICAgIGNvbnN0IGZvbGRlcnMgPSB0aGlzLmFwcC52YXVsdC5nZXRBbGxMb2FkZWRGaWxlcygpXG4gICAgICAgICAgICAuZmlsdGVyKGYgPT4gZi5jaGlsZHJlbiAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgLm1hcChmID0+IGYucGF0aClcbiAgICAgICAgICAgIC5zb3J0KCk7XG4gICAgICAgIGNvbnN0IGRhdGFsaXN0SWQgPSAncGFyYS1mb2xkZXItc3VnZ2VzdCc7XG4gICAgICAgIGNvbnN0IGRhdGFsaXN0ID0gY29udGFpbmVyRWwuY3JlYXRlRWwoJ2RhdGFsaXN0JywgeyBhdHRyOiB7IGlkOiBkYXRhbGlzdElkIH0gfSk7XG4gICAgICAgIGZvbGRlcnMuZm9yRWFjaChmb2xkZXIgPT4ge1xuICAgICAgICAgICAgZGF0YWxpc3QuY3JlYXRlRWwoJ29wdGlvbicsIHsgdmFsdWU6IGZvbGRlciB9KTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgaW5ib3hTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnSW5ib3ggRm9sZGVyJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdUb3AtbGV2ZWwgZm9sZGVyIGZvciBpbmJveCBpdGVtcycpO1xuICAgICAgICBjb25zdCBpbmJveElucHV0ID0gaW5ib3hTZXR0aW5nLmNvbnRyb2xFbC5jcmVhdGVFbCgnaW5wdXQnLCB7XG4gICAgICAgICAgICB0eXBlOiAndGV4dCcsXG4gICAgICAgICAgICBwbGFjZWhvbGRlcjogJzAgLSBJTkJPWCcsXG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFyYUZvbGRlcnMuaW5ib3gsXG4gICAgICAgICAgICBhdHRyOiB7IGxpc3Q6IGRhdGFsaXN0SWQgfVxuICAgICAgICB9KTtcbiAgICAgICAgaW5ib3hJbnB1dC5zdHlsZS53aWR0aCA9ICcxMDAlJztcbiAgICAgICAgaW5ib3hJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXJhRm9sZGVycy5pbmJveCA9IGUudGFyZ2V0LnZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBwcm9qZWN0c1NldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdQcm9qZWN0cyBGb2xkZXInKVxuICAgICAgICAgICAgLnNldERlc2MoJ1RvcC1sZXZlbCBmb2xkZXIgZm9yIGFjdGl2ZSBwcm9qZWN0cycpO1xuICAgICAgICBjb25zdCBwcm9qZWN0c0lucHV0ID0gcHJvamVjdHNTZXR0aW5nLmNvbnRyb2xFbC5jcmVhdGVFbCgnaW5wdXQnLCB7XG4gICAgICAgICAgICB0eXBlOiAndGV4dCcsXG4gICAgICAgICAgICBwbGFjZWhvbGRlcjogJzEgLSBQUk9KRUNUUycsXG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFyYUZvbGRlcnMucHJvamVjdHMsXG4gICAgICAgICAgICBhdHRyOiB7IGxpc3Q6IGRhdGFsaXN0SWQgfVxuICAgICAgICB9KTtcbiAgICAgICAgcHJvamVjdHNJbnB1dC5zdHlsZS53aWR0aCA9ICcxMDAlJztcbiAgICAgICAgcHJvamVjdHNJbnB1dC5hZGRFdmVudExpc3RlbmVyKCdpbnB1dCcsIGFzeW5jIChlKSA9PiB7XG4gICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXJhRm9sZGVycy5wcm9qZWN0cyA9IGUudGFyZ2V0LnZhbHVlLnRyaW0oKTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBhcmVhc1NldHRpbmcgPSBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdBcmVhcyBGb2xkZXInKVxuICAgICAgICAgICAgLnNldERlc2MoJ1RvcC1sZXZlbCBmb2xkZXIgZm9yIG9uZ29pbmcgYXJlYXMnKTtcbiAgICAgICAgY29uc3QgYXJlYXNJbnB1dCA9IGFyZWFzU2V0dGluZy5jb250cm9sRWwuY3JlYXRlRWwoJ2lucHV0Jywge1xuICAgICAgICAgICAgdHlwZTogJ3RleHQnLFxuICAgICAgICAgICAgcGxhY2Vob2xkZXI6ICcyIC0gQVJFQVMnLFxuICAgICAgICAgICAgdmFsdWU6IHRoaXMucGx1Z2luLnNldHRpbmdzLnBhcmFGb2xkZXJzLmFyZWFzLFxuICAgICAgICAgICAgYXR0cjogeyBsaXN0OiBkYXRhbGlzdElkIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGFyZWFzSW5wdXQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgIGFyZWFzSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFyYUZvbGRlcnMuYXJlYXMgPSBlLnRhcmdldC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3QgcmVzb3VyY2VzU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1Jlc291cmNlcyBGb2xkZXInKVxuICAgICAgICAgICAgLnNldERlc2MoJ1RvcC1sZXZlbCBmb2xkZXIgZm9yIHJlZmVyZW5jZSBtYXRlcmlhbHMnKTtcbiAgICAgICAgY29uc3QgcmVzb3VyY2VzSW5wdXQgPSByZXNvdXJjZXNTZXR0aW5nLmNvbnRyb2xFbC5jcmVhdGVFbCgnaW5wdXQnLCB7XG4gICAgICAgICAgICB0eXBlOiAndGV4dCcsXG4gICAgICAgICAgICBwbGFjZWhvbGRlcjogJzMgLSBSRVNPVVJDRVMnLFxuICAgICAgICAgICAgdmFsdWU6IHRoaXMucGx1Z2luLnNldHRpbmdzLnBhcmFGb2xkZXJzLnJlc291cmNlcyxcbiAgICAgICAgICAgIGF0dHI6IHsgbGlzdDogZGF0YWxpc3RJZCB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXNvdXJjZXNJbnB1dC5zdHlsZS53aWR0aCA9ICcxMDAlJztcbiAgICAgICAgcmVzb3VyY2VzSW5wdXQuYWRkRXZlbnRMaXN0ZW5lcignaW5wdXQnLCBhc3luYyAoZSkgPT4ge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucGFyYUZvbGRlcnMucmVzb3VyY2VzID0gZS50YXJnZXQudmFsdWUudHJpbSgpO1xuICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGFyY2hpdmVTZXR0aW5nID0gbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnQXJjaGl2ZSBGb2xkZXInKVxuICAgICAgICAgICAgLnNldERlc2MoJ1RvcC1sZXZlbCBmb2xkZXIgZm9yIGFyY2hpdmVkIGl0ZW1zJyk7XG4gICAgICAgIGNvbnN0IGFyY2hpdmVJbnB1dCA9IGFyY2hpdmVTZXR0aW5nLmNvbnRyb2xFbC5jcmVhdGVFbCgnaW5wdXQnLCB7XG4gICAgICAgICAgICB0eXBlOiAndGV4dCcsXG4gICAgICAgICAgICBwbGFjZWhvbGRlcjogJzQgLSBBUkNISVZFJyxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wYXJhRm9sZGVycy5hcmNoaXZlLFxuICAgICAgICAgICAgYXR0cjogeyBsaXN0OiBkYXRhbGlzdElkIH1cbiAgICAgICAgfSk7XG4gICAgICAgIGFyY2hpdmVJbnB1dC5zdHlsZS53aWR0aCA9ICcxMDAlJztcbiAgICAgICAgYXJjaGl2ZUlucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnBhcmFGb2xkZXJzLmFyY2hpdmUgPSBlLnRhcmdldC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2hyJyk7XG5cbiAgICAgICAgLy8gUHJvamVjdCBVcGRhdGVzIFNlY3Rpb25cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnUHJvamVjdCBVcGRhdGUgR2VuZXJhdGlvbicgfSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICB0ZXh0OiAnQXV0b21hdGljYWxseSBnZW5lcmF0ZSByZWN1cnJpbmcgc3RhdHVzIHJlcG9ydHMgZm9yIGFueSBwcm9qZWN0IGZvbGRlci4gRWFjaCBwcm9qZWN0IGNhbiBoYXZlIGl0cyBvd24gc2NoZWR1bGUgKGRhaWx5LCB3ZWVrbHksIG9yIG1vbnRobHkpLiBBbGwgdXBkYXRlIG5vdGVzIGFyZSBjcmVhdGVkIGluIHlvdXIgSW5ib3ggZm9sZGVyIHdpdGggbmFtZXMgbGlrZSBcIlVQREFURSBcdTIwMTQgW1BST0pFQ1QgTkFNRV0ubWRcIi4nLFxuICAgICAgICAgICAgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJ1xuICAgICAgICB9KTtcblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdUaGUgS2FuYmFuIHBsdWdpbiAocmVxdWlyZWQgZGVwZW5kZW5jeSkgcHJvdmlkZXMgdGhlIFByb2plY3QgRGFzaGJvYXJkIHRoYXQgdHJhY2tzIHlvdXIgYWN0aXZlIHdvcmsuIElmIGEgS2FuYmFuIGJvYXJkIGRvZXNuXFwndCBleGlzdCBhdCB0aGUgcGF0aCBiZWxvdywgZGVwbG95IHRoZSBQcm9qZWN0IERhc2hib2FyZCB0ZW1wbGF0ZSB1c2luZyB0aGUgXCJEZXBsb3kgUEFSQSBUZW1wbGF0ZXNcIiBidXR0b24uIFlvdSBjYW4gY2hhbmdlIHRoZSBib2FyZCBwYXRoIGlmIG5lZWRlZC4nLFxuICAgICAgICAgICAgY2xzOiAnc2V0dGluZy1pdGVtLWRlc2NyaXB0aW9uJ1xuICAgICAgICB9KTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdFbmFibGUgUHJvamVjdCBVcGRhdGVzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdUdXJuIG9uIHNjaGVkdWxlZCBwcm9qZWN0IHVwZGF0ZSBnZW5lcmF0aW9uLiBXaGVuIGRpc2FibGVkLCBubyBhdXRvbWF0aWMgdXBkYXRlcyB3aWxsIGJlIGNyZWF0ZWQuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcy5lbmFibGVkKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvamVjdFVwZGF0ZXMuZW5hYmxlZCA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgLy8gS2FuYmFuIEJvYXJkIEZpbGUgd2l0aCBhdXRvY29tcGxldGVcbiAgICAgICAgY29uc3Qga2FuYmFuU2V0dGluZyA9IG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0thbmJhbiBCb2FyZCBGaWxlJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdQYXRoIHRvIHlvdXIgUHJvamVjdCBEYXNoYm9hcmQga2FuYmFuIGJvYXJkLiBJZiB0aGlzIGZpbGUgZG9lc25cXCd0IGV4aXN0LCBpdCB3aWxsIGJlIGNyZWF0ZWQgaW4geW91ciBJbmJveCB3aGVuIHlvdSBlbmFibGUgUHJvamVjdCBVcGRhdGVzLicpO1xuXG4gICAgICAgIC8vIENyZWF0ZSBkYXRhbGlzdCBmb3IgbWFya2Rvd24gZmlsZXNcbiAgICAgICAgY29uc3QgZmlsZXMgPSB0aGlzLmFwcC52YXVsdC5nZXRNYXJrZG93bkZpbGVzKCkubWFwKGYgPT4gZi5wYXRoKS5zb3J0KCk7XG4gICAgICAgIGNvbnN0IGZpbGVzRGF0YWxpc3RJZCA9ICdrYW5iYW4tZmlsZS1zdWdnZXN0JztcbiAgICAgICAgY29uc3QgZmlsZXNEYXRhbGlzdCA9IGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdkYXRhbGlzdCcsIHsgYXR0cjogeyBpZDogZmlsZXNEYXRhbGlzdElkIH0gfSk7XG4gICAgICAgIGZpbGVzLmZvckVhY2goZmlsZSA9PiB7XG4gICAgICAgICAgICBmaWxlc0RhdGFsaXN0LmNyZWF0ZUVsKCdvcHRpb24nLCB7IHZhbHVlOiBmaWxlIH0pO1xuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBrYW5iYW5JbnB1dCA9IGthbmJhblNldHRpbmcuY29udHJvbEVsLmNyZWF0ZUVsKCdpbnB1dCcsIHtcbiAgICAgICAgICAgIHR5cGU6ICd0ZXh0JyxcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyOiAnMCAtIElOQk9YL1Byb2plY3QgRGFzaGJvYXJkLm1kJyxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcy5rYW5iYW5GaWxlIHx8ICcwIC0gSU5CT1gvUHJvamVjdCBEYXNoYm9hcmQubWQnLFxuICAgICAgICAgICAgYXR0cjogeyBsaXN0OiBmaWxlc0RhdGFsaXN0SWQgfVxuICAgICAgICB9KTtcbiAgICAgICAga2FuYmFuSW5wdXQuc3R5bGUud2lkdGggPSAnMTAwJSc7XG4gICAgICAgIGthbmJhbklucHV0LmFkZEV2ZW50TGlzdGVuZXIoJ2lucHV0JywgYXN5bmMgKGUpID0+IHtcbiAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzLnByb2plY3RVcGRhdGVzLmthbmJhbkZpbGUgPSBlLnRhcmdldC52YWx1ZS50cmltKCk7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gUHJvamVjdCB1cGRhdGUgY29uZmlndXJhdGlvbnMgbGlzdFxuICAgICAgICBpZiAodGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvamVjdFVwZGF0ZXMuY29uZmlncy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdwJywge1xuICAgICAgICAgICAgICAgIHRleHQ6ICdObyBwcm9qZWN0IHVwZGF0ZXMgY29uZmlndXJlZC4gQ2xpY2sgXCJBZGQgUHJvamVjdCBVcGRhdGVcIiB0byBjcmVhdGUgeW91ciBmaXJzdCBhdXRvbWF0ZWQgc3RhdHVzIHJlcG9ydC4nLFxuICAgICAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MucHJvamVjdFVwZGF0ZXMuY29uZmlncy5mb3JFYWNoKChjb25maWcsIGluZGV4KSA9PiB7XG4gICAgICAgICAgICAgICAgLy8gQnVpbGQgZGVzY3JpcHRpb24gd2l0aCBzY2hlZHVsZSBkZXRhaWxzXG4gICAgICAgICAgICAgICAgbGV0IHNjaGVkdWxlRGVzYyA9IGNvbmZpZy5zY2hlZHVsZTtcbiAgICAgICAgICAgICAgICBpZiAoY29uZmlnLnNjaGVkdWxlID09PSAnd2Vla2x5JyAmJiBjb25maWcuZGF5T2ZXZWVrKSB7XG4gICAgICAgICAgICAgICAgICAgIHNjaGVkdWxlRGVzYyA9IGAke2NvbmZpZy5kYXlPZldlZWt9c2A7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGlmIChjb25maWcudGltZU9mRGF5KSB7XG4gICAgICAgICAgICAgICAgICAgIHNjaGVkdWxlRGVzYyArPSBgIGF0ICR7Y29uZmlnLnRpbWVPZkRheX1gO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBjb25zdCBmdWxsRGVzYyA9IGAke3NjaGVkdWxlRGVzY30gXHUyMDIyICR7Y29uZmlnLnByb2plY3RGb2xkZXJ9JHtjb25maWcuZW5hYmxlZCA/ICcnIDogJyAoZGlzYWJsZWQpJ31gO1xuXG4gICAgICAgICAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAgICAgICAgIC5zZXROYW1lKGNvbmZpZy5uYW1lIHx8ICdVbm5hbWVkIFByb2plY3QgVXBkYXRlJylcbiAgICAgICAgICAgICAgICAgICAgLnNldERlc2MoZnVsbERlc2MpXG4gICAgICAgICAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQoJ0VkaXQnKVxuICAgICAgICAgICAgICAgICAgICAgICAgLm9uQ2xpY2soKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLm9wZW5Qcm9qZWN0VXBkYXRlQ29uZmlnTW9kYWwoY29uZmlnLCBpbmRleCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KSlcbiAgICAgICAgICAgICAgICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXG4gICAgICAgICAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnRGVsZXRlJylcbiAgICAgICAgICAgICAgICAgICAgICAgIC5zZXRXYXJuaW5nKClcbiAgICAgICAgICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcy5jb25maWdzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5kaXNwbGF5KCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0FkZCBQcm9qZWN0IFVwZGF0ZScpXG4gICAgICAgICAgICAuc2V0RGVzYygnQ29uZmlndXJlIGEgbmV3IGF1dG9tYXRlZCBwcm9qZWN0IHVwZGF0ZScpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnKyBBZGQgUHJvamVjdCBVcGRhdGUnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ub3BlblByb2plY3RVcGRhdGVDb25maWdNb2RhbCgpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdHZW5lcmF0ZSBVcGRhdGVzIE5vdycpXG4gICAgICAgICAgICAuc2V0RGVzYygnTWFudWFsbHkgZ2VuZXJhdGUgcHJvamVjdCB1cGRhdGVzIGZvciBhbGwgZW5hYmxlZCBjb25maWd1cmF0aW9ucyByaWdodCBub3cnKVxuICAgICAgICAgICAgLmFkZEJ1dHRvbihidXR0b24gPT4gYnV0dG9uXG4gICAgICAgICAgICAgICAgLnNldEJ1dHRvblRleHQoJ0dlbmVyYXRlIE5vdycpXG4gICAgICAgICAgICAgICAgLnNldEN0YSgpXG4gICAgICAgICAgICAgICAgLm9uQ2xpY2soYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5nZW5lcmF0ZUFsbFByb2plY3RVcGRhdGVzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdocicpO1xuXG4gICAgICAgIC8vIFRhZ2dpbmcgQmVoYXZpb3IgU2VjdGlvblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdBdXRvbWF0aWMgVGFnZ2luZyBCZWhhdmlvcicgfSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICB0ZXh0OiAnQ29udHJvbCBob3cgdGhlIHBsdWdpbiBhdXRvbWF0aWNhbGx5IGFzc2lnbnMgcHJvcGVydGllcyBhbmQgdGFncyB3aGVuIHlvdSBjcmVhdGUgb3IgbW92ZSBub3Rlcy4gVGhlIFwicGFyYVwiIHByb3BlcnR5IChsb2NrZWQgdG8gdGhpcyBuYW1lKSBhbHdheXMgcmVmbGVjdHMgYSBub3RlXFwncyBjdXJyZW50IFBBUkEgbG9jYXRpb24sIHdoaWxlIHN1YmZvbGRlciB0YWdzIHByb3ZpZGUgaGlzdG9yaWNhbCBjb250ZXh0LicsXG4gICAgICAgICAgICBjbHM6ICdzZXR0aW5nLWl0ZW0tZGVzY3JpcHRpb24nXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ1ByZXNlcnZlIFN1YmZvbGRlciBUYWdzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdXaGVuIGVuYWJsZWQsIHRhZ3MgZnJvbSBzdWJmb2xkZXIgbmFtZXMgcGVyc2lzdCBldmVuIHdoZW4geW91IG1vdmUgbm90ZXMgYmV0d2VlbiBQQVJBIGZvbGRlcnMuIFRoaXMgcHJlc2VydmVzIHByb2plY3QgY29udGV4dCBvdmVyIHRpbWUuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy50YWdnaW5nLnBlcnNpc3RTdWJmb2xkZXJUYWdzKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudGFnZ2luZy5wZXJzaXN0U3ViZm9sZGVyVGFncyA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2hyJyk7XG5cbiAgICAgICAgLy8gVGVtcGxhdGUgTWFuYWdlbWVudCBTZWN0aW9uXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdoMycsIHsgdGV4dDogJ1BBUkEgVGVtcGxhdGVzJyB9KTtcblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdNYW5hZ2UgdGhlIGRlZmF1bHQgdGVtcGxhdGVzIHRoYXQgZ2V0IGRlcGxveWVkIHRvIHlvdXIgdmF1bHQuIFRlbXBsYXRlcyBhcmUgc3RvcmVkIGluIFwiMyAtIFJFU09VUkNFUy9URU1QTEFURVMvXCIgYW5kIHVzZSBUZW1wbGF0ZXIgc3ludGF4IGZvciBkeW5hbWljIGNvbnRlbnQuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ3AnLCB7XG4gICAgICAgICAgICB0ZXh0OiAnTm90ZTogVGVtcGxhdGUgZmlsZXMgdGhlbXNlbHZlcyBuZXZlciByZWNlaXZlIFBBUkEgcHJvcGVydGllcyAtIHRoZXkgcmVtYWluIFwiY2xlYW5cIiBzbyBuZXcgbm90ZXMgY3JlYXRlZCBmcm9tIHRoZW0gc3RhcnQgZnJlc2guJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnQXV0by1EZXBsb3kgVGVtcGxhdGVzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdBdXRvbWF0aWNhbGx5IGRlcGxveSB0ZW1wbGF0ZXMgZHVyaW5nIHNldHVwIHdpemFyZCcpXG4gICAgICAgICAgICAuYWRkVG9nZ2xlKHRvZ2dsZSA9PiB0b2dnbGVcbiAgICAgICAgICAgICAgICAuc2V0VmFsdWUodGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGxhdGVzLmF1dG9EZXBsb3lPblNldHVwKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MudGVtcGxhdGVzLmF1dG9EZXBsb3lPblNldHVwID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucGx1Z2luLnNhdmVTZXR0aW5ncygpO1xuICAgICAgICAgICAgICAgIH0pKTtcblxuICAgICAgICBuZXcgU2V0dGluZyhjb250YWluZXJFbClcbiAgICAgICAgICAgIC5zZXROYW1lKCdDbGVhbiBUZW1wbGF0ZSBGaWxlcycpXG4gICAgICAgICAgICAuc2V0RGVzYygnVXNlIHRoaXMgaWYgd2hlbiB5b3UgY3JlYXRlIG5ldyBub3RlcywgdGhleSBhcmUgYmVpbmcgcHJlLWFzc2lnbmVkIG9kZCB0YWdzIG9yIFBBUkEgcHJvcGVydGllcyB0aGF0IGRvblxcJ3QgbWF0Y2ggdGhlIGZvbGRlciB5b3UgcGxhY2UgdGhlbSBpbi4gVGhpcyByZXNldHMgdGVtcGxhdGUgZmlsZXMgdG8gcmVtb3ZlIGFueSBhY2NpZGVudGFsbHkgc2F2ZWQgZnJvbnRtYXR0ZXIuJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdDbGVhbiBUZW1wbGF0ZXMnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4udGFnZ2luZ01hbmFnZXIuY2xlYW5UZW1wbGF0ZUZpbGVzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIGNvbnRhaW5lckVsLmNyZWF0ZUVsKCdocicpO1xuXG4gICAgICAgIC8vIERpYWdub3N0aWNzIFNlY3Rpb25cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2gzJywgeyB0ZXh0OiAnRGlhZ25vc3RpY3MgJiBQcm9maWxpbmcnIH0pO1xuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgncCcsIHtcbiAgICAgICAgICAgIHRleHQ6ICdVc2UgdGhlc2Ugb3B0aW9ucyB3aGlsZSB3b3JraW5nIG9uIElzc3VlIEIgKG1vYmlsZSBvcHRpbWl6YXRpb24pIHRvIGNhcHR1cmUgcGVyZm9ybWFuY2UgdGltaW5ncyBhbmQgZXZlbnQgY291bnRzLiBEaXNhYmxlIHByb2ZpbGluZyB3aGVuIG5vdCBhY3RpdmVseSBiZW5jaG1hcmtpbmcuJyxcbiAgICAgICAgICAgIGNsczogJ3NldHRpbmctaXRlbS1kZXNjcmlwdGlvbidcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnRW5hYmxlIHByb2ZpbGluZyBsb2dzJylcbiAgICAgICAgICAgIC5zZXREZXNjKCdSZWNvcmRzIHRpbWluZyBkYXRhIGZvciBrZXkgb3BlcmF0aW9ucyBhbmQgd2FybnMgd2hlbiBhIGNhbGwgZXhjZWVkcyB0aGUgY29uZmlndXJlZCB0aHJlc2hvbGQuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5wcm9maWxpbmdFbmFibGVkKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4uc2V0dGluZ3MuZGlhZ25vc3RpY3MucHJvZmlsaW5nRW5hYmxlZCA9IHZhbHVlO1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblxuICAgICAgICAgICAgICAgICAgICBpZiAoIXZhbHVlICYmIHRoaXMucGx1Z2luLnNldHRpbmdzLmRpYWdub3N0aWNzLmxvZ1N1bW1hcnlPblVubG9hZCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nUGVyZm9ybWFuY2VTbmFwc2hvdCgncHJvZmlsaW5nLWRpc2FibGVkJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5hcHBseVByb2ZpbGVyU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnU2xvdyBvcGVyYXRpb24gdGhyZXNob2xkIChtcyknKVxuICAgICAgICAgICAgLnNldERlc2MoJ09wZXJhdGlvbnMgdGFraW5nIGxvbmdlciB0aGFuIHRoaXMgd2lsbCB0cmlnZ2VyIGEgY29uc29sZSB3YXJuaW5nLicpXG4gICAgICAgICAgICAuYWRkVGV4dCh0ZXh0ID0+IHRleHRcbiAgICAgICAgICAgICAgICAuc2V0UGxhY2Vob2xkZXIoJzIwMCcpXG4gICAgICAgICAgICAgICAgLnNldFZhbHVlKFN0cmluZyh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5zbG93T3BlcmF0aW9uVGhyZXNob2xkTXMpKVxuICAgICAgICAgICAgICAgIC5vbkNoYW5nZShhc3luYyAodmFsdWUpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgcGFyc2VkID0gTnVtYmVyKHZhbHVlKTtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFOdW1iZXIuaXNOYU4ocGFyc2VkKSAmJiBwYXJzZWQgPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5zbG93T3BlcmF0aW9uVGhyZXNob2xkTXMgPSBwYXJzZWQ7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLmFwcGx5UHJvZmlsZXJTZXR0aW5ncygpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0xvZyBzdW1tYXJ5IG9uIHVubG9hZCcpXG4gICAgICAgICAgICAuc2V0RGVzYygnQXV0b21hdGljYWxseSBsb2dzIGEgcHJvZmlsaW5nIHN1bW1hcnkgd2hlbiB0aGUgcGx1Z2luIHVubG9hZHMgb3IgcHJvZmlsaW5nIGlzIHR1cm5lZCBvZmYuJylcbiAgICAgICAgICAgIC5hZGRUb2dnbGUodG9nZ2xlID0+IHRvZ2dsZVxuICAgICAgICAgICAgICAgIC5zZXRWYWx1ZSh0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5sb2dTdW1tYXJ5T25VbmxvYWQpXG4gICAgICAgICAgICAgICAgLm9uQ2hhbmdlKGFzeW5jICh2YWx1ZSkgPT4ge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5sb2dTdW1tYXJ5T25VbmxvYWQgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5wbHVnaW4uc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgIG5ldyBTZXR0aW5nKGNvbnRhaW5lckVsKVxuICAgICAgICAgICAgLnNldE5hbWUoJ0xvZyBzbmFwc2hvdCBub3cnKVxuICAgICAgICAgICAgLnNldERlc2MoJ1dyaXRlcyB0aGUgY3VycmVudCBjb3VudGVycyBhbmQgdGltaW5ncyB0byB0aGUgZGV2ZWxvcGVyIGNvbnNvbGUuJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdMb2cgU25hcHNob3QnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKCF0aGlzLnBsdWdpbi5zZXR0aW5ncy5kaWFnbm9zdGljcy5wcm9maWxpbmdFbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCdFbmFibGUgcHJvZmlsaW5nIGJlZm9yZSBsb2dnaW5nIGEgc25hcHNob3QuJyk7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdGhpcy5wbHVnaW4ubG9nUGVyZm9ybWFuY2VTbmFwc2hvdCgnc2V0dGluZ3MtcGFuZWwnKTtcbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnUmVzZXQgcHJvZmlsaW5nIHNlc3Npb24nKVxuICAgICAgICAgICAgLnNldERlc2MoJ0NsZWFycyBhY2N1bXVsYXRlZCBjb3VudGVycy90aW1pbmdzIGFuZCByZXN0YXJ0cyB0aGUgcHJvZmlsaW5nIGNsb2NrLicpXG4gICAgICAgICAgICAuYWRkQnV0dG9uKGJ1dHRvbiA9PiBidXR0b25cbiAgICAgICAgICAgICAgICAuc2V0QnV0dG9uVGV4dCgnUmVzZXQgQ291bnRlcnMnKVxuICAgICAgICAgICAgICAgIC5vbkNsaWNrKCgpID0+IHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMucGx1Z2luLnByb2ZpbGVyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLnBsdWdpbi5wcm9maWxlci5yZXNldCgpO1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnUHJvZmlsaW5nIHNlc3Npb24gcmVzZXQuJyk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KSk7XG5cbiAgICAgICAgY29udGFpbmVyRWwuY3JlYXRlRWwoJ2hyJyk7XG5cbiAgICAgICAgLy8gQWR2YW5jZWQgU2VjdGlvblxuICAgICAgICBjb250YWluZXJFbC5jcmVhdGVFbCgnaDMnLCB7IHRleHQ6ICdBZHZhbmNlZCBTZXR0aW5ncycgfSk7XG5cbiAgICAgICAgbmV3IFNldHRpbmcoY29udGFpbmVyRWwpXG4gICAgICAgICAgICAuc2V0TmFtZSgnUmVzZXQgdG8gRGVmYXVsdHMnKVxuICAgICAgICAgICAgLnNldERlc2MoJ1x1MjZBMFx1RkUwRiBXQVJOSU5HOiBUaGlzIHdpbGwgcmVzdG9yZSBhbGwgc2V0dGluZ3MgdG8gZGVmYXVsdHMgQU5EIHJlZ2VuZXJhdGUgYWxsIHRlbXBsYXRlcyBmcm9tIGRlZmF1bHRzLCBvdmVyd3JpdGluZyBhbnkgY3VzdG9taXphdGlvbnMgeW91IG1hZGUuIFlvdXIgZm9sZGVycyBhbmQgbm90ZXMgd2lsbCBub3QgYmUgYWZmZWN0ZWQuJylcbiAgICAgICAgICAgIC5hZGRCdXR0b24oYnV0dG9uID0+IGJ1dHRvblxuICAgICAgICAgICAgICAgIC5zZXRCdXR0b25UZXh0KCdSZXNldCBBbGwgU2V0dGluZ3MnKVxuICAgICAgICAgICAgICAgIC5zZXRXYXJuaW5nKClcbiAgICAgICAgICAgICAgICAub25DbGljayhhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjb25maXJtKCdcdTI2QTBcdUZFMEYgV0FSTklORzogVGhpcyB3aWxsOlxcblxcbjEuIFJlc2V0IEFMTCBwbHVnaW4gc2V0dGluZ3MgdG8gZGVmYXVsdHNcXG4yLiBPVkVSV1JJVEUgYWxsIHRlbXBsYXRlcyB3aXRoIGRlZmF1bHRzICh5b3VyIGN1c3RvbSB0ZW1wbGF0ZSBjaGFuZ2VzIHdpbGwgYmUgbG9zdClcXG5cXG5Zb3VyIGZvbGRlcnMgYW5kIG5vdGVzIHdpbGwgTk9UIGJlIGFmZmVjdGVkLlxcblxcbkFyZSB5b3Ugc3VyZSB5b3Ugd2FudCB0byBjb250aW51ZT8nKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gUmVzZXQgc2V0dGluZ3NcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucGx1Z2luLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUyk7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi5zYXZlU2V0dGluZ3MoKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gRm9yY2UgcmVnZW5lcmF0ZSBhbGwgdGVtcGxhdGVzXG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnBsdWdpbi50ZW1wbGF0ZU1hbmFnZXIuZm9yY2VSZWdlbmVyYXRlQWxsVGVtcGxhdGVzKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFJlZnJlc2ggc2V0dGluZ3MgVUlcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZGlzcGxheSgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSkpO1xuICAgIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gTUFJTiBQTFVHSU4gQ0xBU1Ncbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxubW9kdWxlLmV4cG9ydHMgPSBjbGFzcyBRdWlja1BhcmFQbHVnaW4gZXh0ZW5kcyBQbHVnaW4ge1xuICAgIGFzeW5jIG9ubG9hZCgpIHtcbiAgICAgICAgY29uc29sZS5sb2coJ0xvYWRpbmcgUXVpY2sgUEFSQSBwbHVnaW4nKTtcblxuICAgICAgICAvLyBMb2FkIHNldHRpbmdzXG4gICAgICAgIGF3YWl0IHRoaXMubG9hZFNldHRpbmdzKCk7XG4gICAgICAgIHRoaXMuaW5pdGlhbGl6ZVByb2ZpbGVyKCk7XG4gICAgICAgIGNvbnN0IG9ubG9hZFRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ3BsdWdpbjpvbmxvYWQnKTtcblxuICAgICAgICAvLyBJbml0aWFsaXplIG1hbmFnZXJzXG4gICAgICAgIHRoaXMuZGVwZW5kZW5jeU1hbmFnZXIgPSBuZXcgRGVwZW5kZW5jeU1hbmFnZXIodGhpcy5hcHApO1xuICAgICAgICB0aGlzLnByb3Zpc2lvbmluZ01hbmFnZXIgPSBuZXcgUHJvdmlzaW9uaW5nTWFuYWdlcih0aGlzLmFwcCwgdGhpcy5zZXR0aW5ncyk7XG4gICAgICAgIHRoaXMudGFnZ2luZ01hbmFnZXIgPSBuZXcgVGFnZ2luZ01hbmFnZXIodGhpcy5hcHAsIHRoaXMuc2V0dGluZ3MsIHRoaXMucHJvZmlsZXIpO1xuICAgICAgICB0aGlzLmFnZW5kYU1hbmFnZXIgPSBuZXcgQWdlbmRhTWFuYWdlcih0aGlzLmFwcCwgdGhpcy5zZXR0aW5ncywgdGhpcy5wcm9maWxlcik7XG4gICAgICAgIHRoaXMudGVtcGxhdGVNYW5hZ2VyID0gbmV3IFRlbXBsYXRlTWFuYWdlcih0aGlzLmFwcCwgdGhpcy5zZXR0aW5ncywgdGhpcy5wcm9maWxlcik7XG5cbiAgICAgICAgLy8gQ2hlY2sgZGVwZW5kZW5jaWVzIG9uIGxvYWRcbiAgICAgICAgYXdhaXQgdGhpcy5jaGVja0RlcGVuZGVuY2llcygpO1xuXG4gICAgICAgIC8vIFJlZ2lzdGVyIGZpbGUgZXZlbnQgbGlzdGVuZXJzIGZvciBhdXRvLXRhZ2dpbmdcbiAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgICAgICAgdGhpcy5hcHAudmF1bHQub24oJ3JlbmFtZScsIGFzeW5jIChmaWxlLCBvbGRQYXRoKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uICE9PSAnbWQnKSByZXR1cm47XG4gICAgICAgICAgICAgICAgaWYgKG9sZFBhdGggIT09IGZpbGUucGF0aCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5pbmNyZW1lbnQoJ2V2ZW50czpyZW5hbWUnKTtcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFuZGxlID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ2V2ZW50czpyZW5hbWU6dXBkYXRlJyk7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnRhZ2dpbmdNYW5hZ2VyLnVwZGF0ZVBhcmFUYWdzKGZpbGUpO1xuICAgICAgICAgICAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKGhhbmRsZSwgeyBwYXRoOiBmaWxlLnBhdGggfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuXG4gICAgICAgIHRoaXMucmVnaXN0ZXJFdmVudChcbiAgICAgICAgICAgIHRoaXMuYXBwLnZhdWx0Lm9uKCdjcmVhdGUnLCBhc3luYyAoZmlsZSkgPT4ge1xuICAgICAgICAgICAgICAgIGlmIChmaWxlLmV4dGVuc2lvbiAhPT0gJ21kJykgcmV0dXJuO1xuICAgICAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmluY3JlbWVudCgnZXZlbnRzOmNyZWF0ZScpO1xuICAgICAgICAgICAgICAgIC8vIExvbmdlciBkZWxheSB0byBsZXQgVGVtcGxhdGVyIGZpbmlzaCB3cml0aW5nXG4gICAgICAgICAgICAgICAgc2V0VGltZW91dChhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgICAgIGNvbnN0IGhhbmRsZSA9IHRoaXMucHJvZmlsZXI/LnN0YXJ0KCdldmVudHM6Y3JlYXRlOnVwZGF0ZScpO1xuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYXdhaXQgdGhpcy50YWdnaW5nTWFuYWdlci51cGRhdGVQYXJhVGFncyhmaWxlKTtcbiAgICAgICAgICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZChoYW5kbGUsIHsgcGF0aDogZmlsZS5wYXRoIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSwgNTAwKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gQWxzbyBsaXN0ZW4gZm9yIG1vZGlmeSBldmVudHMgdG8gY2F0Y2ggVGVtcGxhdGVyIHVwZGF0ZXNcbiAgICAgICAgdGhpcy5yZWdpc3RlckV2ZW50KFxuICAgICAgICAgICAgdGhpcy5hcHAudmF1bHQub24oJ21vZGlmeScsIGFzeW5jIChmaWxlKSA9PiB7XG4gICAgICAgICAgICAgICAgaWYgKGZpbGUuZXh0ZW5zaW9uICE9PSAnbWQnKSByZXR1cm47XG4gICAgICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uaW5jcmVtZW50KCdldmVudHM6bW9kaWZ5Jyk7XG5cbiAgICAgICAgICAgICAgICAvLyBPbmx5IHByb2Nlc3MgcmVjZW50IGZpbGVzIChjcmVhdGVkIGluIGxhc3QgNSBzZWNvbmRzKVxuICAgICAgICAgICAgICAgIGNvbnN0IHN0YXQgPSBmaWxlLnN0YXQgPz8gYXdhaXQgdGhpcy5hcHAudmF1bHQuYWRhcHRlci5zdGF0KGZpbGUucGF0aCk7XG4gICAgICAgICAgICAgICAgY29uc3QgZmlsZUFnZSA9IERhdGUubm93KCkgLSBzdGF0LmN0aW1lO1xuXG4gICAgICAgICAgICAgICAgaWYgKGZpbGVBZ2UgPCA1MDAwKSB7ICAvLyBGaWxlIGNyZWF0ZWQgaW4gbGFzdCA1IHNlY29uZHNcbiAgICAgICAgICAgICAgICAgICAgY29uc3QgaGFuZGxlID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ2V2ZW50czptb2RpZnk6dXBkYXRlJyk7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnRhZ2dpbmdNYW5hZ2VyLnVwZGF0ZVBhcmFUYWdzKGZpbGUpO1xuICAgICAgICAgICAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5wcm9maWxlcj8uZW5kKGhhbmRsZSwgeyBwYXRoOiBmaWxlLnBhdGgsIGZpbGVBZ2UgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5pbmNyZW1lbnQoJ2V2ZW50czptb2RpZnk6c2tpcHBlZC1hZ2UnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIFJlZ2lzdGVyIGNvbW1hbmRzXG4gICAgICAgIHRoaXMuYWRkQ29tbWFuZCh7XG4gICAgICAgICAgICBpZDogJ3NldHVwLXBhcmEnLFxuICAgICAgICAgICAgbmFtZTogJ1J1biBQQVJBIFNldHVwIFdpemFyZCcsXG4gICAgICAgICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucHJvdmlzaW9uaW5nTWFuYWdlci5ydW5TZXR1cFdpemFyZCgpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICd1cGRhdGUtcGFyYS10YWdzJyxcbiAgICAgICAgICAgIG5hbWU6ICdVcGRhdGUgUEFSQSB0YWdzIGZvciBjdXJyZW50IGZpbGUnLFxuICAgICAgICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5hcHAud29ya3NwYWNlLmdldEFjdGl2ZUZpbGUoKTtcbiAgICAgICAgICAgICAgICBpZiAoZmlsZSkge1xuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnRhZ2dpbmdNYW5hZ2VyLnVwZGF0ZVBhcmFUYWdzKGZpbGUpO1xuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCdQQVJBIHRhZ3MgdXBkYXRlZCEnKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCdObyBhY3RpdmUgZmlsZScpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgICAgICAgIGlkOiAndXBkYXRlLWFsbC1wYXJhLXRhZ3MnLFxuICAgICAgICAgICAgbmFtZTogJ1VwZGF0ZSBQQVJBIHRhZ3MgZm9yIGFsbCBmaWxlcycsXG4gICAgICAgICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMudGFnZ2luZ01hbmFnZXIuYnVsa1VwZGF0ZVRhZ3MoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgICAgICAgIGlkOiAnZ2VuZXJhdGUtcHJvamVjdC11cGRhdGVzJyxcbiAgICAgICAgICAgIG5hbWU6ICdHZW5lcmF0ZSBhbGwgcHJvamVjdCB1cGRhdGVzIG5vdycsXG4gICAgICAgICAgICBjYWxsYmFjazogYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcz8uZW5hYmxlZCkge1xuICAgICAgICAgICAgICAgICAgICBuZXcgTm90aWNlKCdQcm9qZWN0IHVwZGF0ZXMgYXJlIGRpc2FibGVkIGluIHNldHRpbmdzLiBFbmFibGUgdGhlbSBmaXJzdC4nKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcz8uY29uZmlncyB8fCB0aGlzLnNldHRpbmdzLnByb2plY3RVcGRhdGVzLmNvbmZpZ3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoJ05vIHByb2plY3QgdXBkYXRlcyBjb25maWd1cmVkLiBBZGQgb25lIGluIHNldHRpbmdzIGZpcnN0LicpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gR2VuZXJhdGUgdXBkYXRlcyBmb3IgYWxsIGVuYWJsZWQgY29uZmlnc1xuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuZ2VuZXJhdGVBbGxQcm9qZWN0VXBkYXRlcygpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICdkZXBsb3ktdGVtcGxhdGVzJyxcbiAgICAgICAgICAgIG5hbWU6ICdEZXBsb3kgUEFSQSB0ZW1wbGF0ZXMnLFxuICAgICAgICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnRlbXBsYXRlTWFuYWdlci5kZXBsb3lBbGxUZW1wbGF0ZXMoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgICAgICAgIGlkOiAnY2xlYW4tdGVtcGxhdGUtZmlsZXMnLFxuICAgICAgICAgICAgbmFtZTogJ0NsZWFuIFBBUkEgcHJvcGVydGllcyBmcm9tIHRlbXBsYXRlIGZpbGVzJyxcbiAgICAgICAgICAgIGNhbGxiYWNrOiBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy50YWdnaW5nTWFuYWdlci5jbGVhblRlbXBsYXRlRmlsZXMoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgdGhpcy5hZGRDb21tYW5kKHtcbiAgICAgICAgICAgIGlkOiAnbG9nLXBlcmZvcm1hbmNlLXNuYXBzaG90JyxcbiAgICAgICAgICAgIG5hbWU6ICdMb2cgcHJvZmlsaW5nIHNuYXBzaG90IHRvIGNvbnNvbGUnLFxuICAgICAgICAgICAgY2FsbGJhY2s6ICgpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3M/LnByb2ZpbGluZ0VuYWJsZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnRW5hYmxlIHByb2ZpbGluZyBpbiBzZXR0aW5ncyBiZWZvcmUgbG9nZ2luZyBhIHNuYXBzaG90LicpO1xuICAgICAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHRoaXMubG9nUGVyZm9ybWFuY2VTbmFwc2hvdCgnY29tbWFuZCcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmFkZENvbW1hbmQoe1xuICAgICAgICAgICAgaWQ6ICdjaGVjay1kZXBlbmRlbmNpZXMnLFxuICAgICAgICAgICAgbmFtZTogJ0NoZWNrIHBsdWdpbiBkZXBlbmRlbmNpZXMnLFxuICAgICAgICAgICAgY2FsbGJhY2s6IGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLmNoZWNrRGVwZW5kZW5jaWVzKHRydWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICAvLyBBZGQgcmliYm9uIGljb24gZm9yIHF1aWNrIHNldHVwXG4gICAgICAgIHRoaXMuYWRkUmliYm9uSWNvbignbGF5b3V0LWdyaWQnLCAnUXVpY2sgUEFSQSBTZXR1cCcsIGFzeW5jICgpID0+IHtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMucHJvdmlzaW9uaW5nTWFuYWdlci5ydW5TZXR1cFdpemFyZCgpO1xuICAgICAgICB9KTtcblxuICAgICAgICAvLyBBZGQgcmliYm9uIGljb24gZm9yIGdlbmVyYXRpbmcgcHJvamVjdCB1cGRhdGVzXG4gICAgICAgIHRoaXMuYWRkUmliYm9uSWNvbignY2FsZW5kYXItY2hlY2snLCAnR2VuZXJhdGUgUHJvamVjdCBVcGRhdGVzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLnByb2plY3RVcGRhdGVzPy5lbmFibGVkKSB7XG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZSgnUHJvamVjdCB1cGRhdGVzIGFyZSBkaXNhYmxlZC4gRW5hYmxlIHRoZW0gaW4gc2V0dGluZ3MgZmlyc3QuJyk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MucHJvamVjdFVwZGF0ZXM/LmNvbmZpZ3MgfHwgdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcy5jb25maWdzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoJ05vIHByb2plY3QgdXBkYXRlcyBjb25maWd1cmVkLiBBZGQgb25lIGluIHNldHRpbmdzIGZpcnN0LicpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYXdhaXQgdGhpcy5nZW5lcmF0ZUFsbFByb2plY3RVcGRhdGVzKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFkZCByaWJib24gaWNvbiBmb3IgYnVsayB0YWcgdXBkYXRlXG4gICAgICAgIHRoaXMuYWRkUmliYm9uSWNvbigndGFncycsICdVcGRhdGUgUEFSQSB0YWdzIGZvciBhbGwgZmlsZXMnLCBhc3luYyAoKSA9PiB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLnRhZ2dpbmdNYW5hZ2VyLmJ1bGtVcGRhdGVUYWdzKCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIC8vIEFkZCBzZXR0aW5ncyB0YWJcbiAgICAgICAgdGhpcy5hZGRTZXR0aW5nVGFiKG5ldyBRdWlja1BhcmFTZXR0aW5nVGFiKHRoaXMuYXBwLCB0aGlzKSk7XG5cbiAgICAgICAgLy8gRmlyc3QtcnVuIGNoZWNrXG4gICAgICAgIGlmICh0aGlzLnNldHRpbmdzLmZpcnN0UnVuKSB7XG4gICAgICAgICAgICBhd2FpdCB0aGlzLmhhbmRsZUZpcnN0UnVuKCk7XG4gICAgICAgIH1cblxuICAgICAgICBjb25zb2xlLmxvZygnUXVpY2sgUEFSQSBwbHVnaW4gbG9hZGVkIHN1Y2Nlc3NmdWxseScpO1xuICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQob25sb2FkVGltZXIsIHsgc3RhdHVzOiAnbG9hZGVkJyB9KTtcbiAgICB9XG5cbiAgICBpbml0aWFsaXplUHJvZmlsZXIoKSB7XG4gICAgICAgIHRoaXMucHJvZmlsZXIgPSBuZXcgUGVyZm9ybWFuY2VQcm9maWxlcih7XG4gICAgICAgICAgICBlbmFibGVkOiB0aGlzLnNldHRpbmdzPy5kaWFnbm9zdGljcz8ucHJvZmlsaW5nRW5hYmxlZCxcbiAgICAgICAgICAgIHNsb3dUaHJlc2hvbGQ6IHRoaXMuc2V0dGluZ3M/LmRpYWdub3N0aWNzPy5zbG93T3BlcmF0aW9uVGhyZXNob2xkTXNcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgYXBwbHlQcm9maWxlclNldHRpbmdzKCkge1xuICAgICAgICBpZiAoIXRoaXMucHJvZmlsZXIpIHtcbiAgICAgICAgICAgIHRoaXMuaW5pdGlhbGl6ZVByb2ZpbGVyKCk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLnByb2ZpbGVyLmNvbmZpZ3VyZSh7XG4gICAgICAgICAgICBzbG93VGhyZXNob2xkOiB0aGlzLnNldHRpbmdzPy5kaWFnbm9zdGljcz8uc2xvd09wZXJhdGlvblRocmVzaG9sZE1zXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLnByb2ZpbGVyLnNldEVuYWJsZWQodGhpcy5zZXR0aW5ncz8uZGlhZ25vc3RpY3M/LnByb2ZpbGluZ0VuYWJsZWQpO1xuICAgIH1cblxuICAgIGxvZ1BlcmZvcm1hbmNlU25hcHNob3QocmVhc29uID0gJ21hbnVhbCcpIHtcbiAgICAgICAgaWYgKCF0aGlzLnByb2ZpbGVyKSB7XG4gICAgICAgICAgICBjb25zb2xlLmluZm8oJ1F1aWNrIFBBUkE6IFByb2ZpbGVyIG5vdCBpbml0aWFsaXplZCcpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5wcm9maWxlci5sb2dTdW1tYXJ5KHJlYXNvbik7XG4gICAgfVxuXG4gICAgYXN5bmMgY2hlY2tEZXBlbmRlbmNpZXMoc2hvd05vdGljZSA9IGZhbHNlKSB7XG4gICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuZGVwZW5kZW5jeU1hbmFnZXIuY2hlY2tEZXBlbmRlbmNpZXMoKTtcblxuICAgICAgICBpZiAoIXJlc3VsdC5hbGxNZXQpIHtcbiAgICAgICAgICAgIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5kZXBlbmRlbmN5TWFuYWdlci5zaG93RGVwZW5kZW5jeVdhcm5pbmcocmVzdWx0Lm1pc3NpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29uc29sZS53YXJuKCdRdWljayBQQVJBOiBTb21lIGRlcGVuZGVuY2llcyBhcmUgbWlzc2luZycsIHJlc3VsdC5taXNzaW5nKTtcbiAgICAgICAgfSBlbHNlIGlmIChzaG93Tm90aWNlKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKCdBbGwgZGVwZW5kZW5jaWVzIGFyZSBpbnN0YWxsZWQhJyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cblxuICAgIGFzeW5jIGhhbmRsZUZpcnN0UnVuKCkge1xuICAgICAgICAvLyBXYWl0IGEgYml0IGZvciBPYnNpZGlhbiB0byBmdWxseSBsb2FkXG4gICAgICAgIHNldFRpbWVvdXQoYXN5bmMgKCkgPT4ge1xuICAgICAgICAgICAgbmV3IE5vdGljZSgnV2VsY29tZSB0byBRdWljayBQQVJBISBDbGljayB0aGUgZ3JpZCBpY29uIHRvIHJ1biBzZXR1cC4nKTtcblxuICAgICAgICAgICAgLy8gTWFyayBmaXJzdCBydW4gYXMgY29tcGxldGVcbiAgICAgICAgICAgIHRoaXMuc2V0dGluZ3MuZmlyc3RSdW4gPSBmYWxzZTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG4gICAgICAgIH0sIDIwMDApO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIE9wZW4gdGhlIHByb2plY3QgdXBkYXRlIGNvbmZpZ3VyYXRpb24gbW9kYWxcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gZXhpc3RpbmdDb25maWcgLSBFeGlzdGluZyBjb25maWcgdG8gZWRpdCAobnVsbCBmb3IgbmV3KVxuICAgICAqIEBwYXJhbSB7bnVtYmVyfSBjb25maWdJbmRleCAtIEluZGV4IG9mIGNvbmZpZyBpbiBhcnJheSAoZm9yIGVkaXRpbmcpXG4gICAgICovXG4gICAgb3BlblByb2plY3RVcGRhdGVDb25maWdNb2RhbChleGlzdGluZ0NvbmZpZyA9IG51bGwsIGNvbmZpZ0luZGV4ID0gbnVsbCkge1xuICAgICAgICBjb25zdCBtb2RhbCA9IG5ldyBQcm9qZWN0VXBkYXRlQ29uZmlnTW9kYWwoXG4gICAgICAgICAgICB0aGlzLmFwcCxcbiAgICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgICBleGlzdGluZ0NvbmZpZyxcbiAgICAgICAgICAgIGFzeW5jIChjb25maWcpID0+IHtcbiAgICAgICAgICAgICAgICBpZiAoY29uZmlnSW5kZXggIT09IG51bGwpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRWRpdCBleGlzdGluZyBjb25maWdcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcy5jb25maWdzW2NvbmZpZ0luZGV4XSA9IGNvbmZpZztcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBBZGQgbmV3IGNvbmZpZ1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnNldHRpbmdzLnByb2plY3RVcGRhdGVzLmNvbmZpZ3MucHVzaChjb25maWcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNldHRpbmdzKCk7XG5cbiAgICAgICAgICAgICAgICAvLyBSZWZyZXNoIHNldHRpbmdzIHRhYlxuICAgICAgICAgICAgICAgIGNvbnN0IHNldHRpbmdzVGFiID0gdGhpcy5hcHAuc2V0dGluZy5wbHVnaW5UYWJzLmZpbmQodGFiID0+IHRhYiBpbnN0YW5jZW9mIFF1aWNrUGFyYVNldHRpbmdUYWIpO1xuICAgICAgICAgICAgICAgIGlmIChzZXR0aW5nc1RhYikge1xuICAgICAgICAgICAgICAgICAgICBzZXR0aW5nc1RhYi5kaXNwbGF5KCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgbmV3IE5vdGljZShgUHJvamVjdCB1cGRhdGUgXCIke2NvbmZpZy5uYW1lfVwiIHNhdmVkIWApO1xuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBtb2RhbC5vcGVuKCk7XG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogR2VuZXJhdGUgYWxsIHByb2plY3QgdXBkYXRlcyBmb3IgZW5hYmxlZCBjb25maWd1cmF0aW9uc1xuICAgICAqL1xuICAgIGFzeW5jIGdlbmVyYXRlQWxsUHJvamVjdFVwZGF0ZXMoKSB7XG4gICAgICAgIGNvbnN0IGVuYWJsZWRDb25maWdzID0gdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcy5jb25maWdzLmZpbHRlcihjID0+IGMuZW5hYmxlZCk7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ3Byb2plY3QtdXBkYXRlczpnZW5lcmF0ZS1hbGwnKTtcblxuICAgICAgICBpZiAoZW5hYmxlZENvbmZpZ3MubGVuZ3RoID09PSAwKSB7XG4gICAgICAgICAgICBuZXcgTm90aWNlKCdObyBlbmFibGVkIHByb2plY3QgdXBkYXRlcyBmb3VuZC4nKTtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyB0b3RhbDogMCwgc3VjY2Vzc0NvdW50OiAwIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgbmV3IE5vdGljZShgR2VuZXJhdGluZyAke2VuYWJsZWRDb25maWdzLmxlbmd0aH0gcHJvamVjdCB1cGRhdGUocykuLi5gKTtcblxuICAgICAgICBsZXQgc3VjY2Vzc0NvdW50ID0gMDtcbiAgICAgICAgZm9yIChjb25zdCBjb25maWcgb2YgZW5hYmxlZENvbmZpZ3MpIHtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgYXdhaXQgdGhpcy5nZW5lcmF0ZVByb2plY3RVcGRhdGUoY29uZmlnKTtcbiAgICAgICAgICAgICAgICBzdWNjZXNzQ291bnQrKztcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGdlbmVyYXRlIHVwZGF0ZSBmb3IgJHtjb25maWcubmFtZX06YCwgZXJyb3IpO1xuICAgICAgICAgICAgICAgIG5ldyBOb3RpY2UoYEVycm9yIGdlbmVyYXRpbmcgdXBkYXRlIGZvciAke2NvbmZpZy5uYW1lfTogJHtlcnJvci5tZXNzYWdlfWAsIDUwMDApO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgbmV3IE5vdGljZShgR2VuZXJhdGVkICR7c3VjY2Vzc0NvdW50fSBvZiAke2VuYWJsZWRDb25maWdzLmxlbmd0aH0gcHJvamVjdCB1cGRhdGUocykgc3VjY2Vzc2Z1bGx5IWApO1xuICAgICAgICB0aGlzLnByb2ZpbGVyPy5lbmQodGltZXIsIHsgdG90YWw6IGVuYWJsZWRDb25maWdzLmxlbmd0aCwgc3VjY2Vzc0NvdW50IH0pO1xuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEdlbmVyYXRlIGEgc2luZ2xlIHByb2plY3QgdXBkYXRlXG4gICAgICogQHBhcmFtIHtPYmplY3R9IGNvbmZpZyAtIFByb2plY3QgdXBkYXRlIGNvbmZpZ3VyYXRpb25cbiAgICAgKi9cbiAgICBhc3luYyBnZW5lcmF0ZVByb2plY3RVcGRhdGUoY29uZmlnKSB7XG4gICAgICAgIGNvbnN0IHRpbWVyID0gdGhpcy5wcm9maWxlcj8uc3RhcnQoJ3Byb2plY3QtdXBkYXRlczpnZW5lcmF0ZScpO1xuICAgICAgICBjb25zdCBjb250ZXh0ID0geyBjb25maWdOYW1lOiBjb25maWc/Lm5hbWUsIHByb2plY3RGb2xkZXI6IGNvbmZpZz8ucHJvamVjdEZvbGRlciB9O1xuXG4gICAgICAgIGNvbnN0IGluYm94Rm9sZGVyID0gdGhpcy5zZXR0aW5ncy5wYXJhRm9sZGVycy5pbmJveCB8fCAnMCAtIElOQk9YJztcbiAgICAgICAgY29uc3QgdXBkYXRlRmlsZU5hbWUgPSBgVVBEQVRFIFx1MjAxNCAke2NvbmZpZy5uYW1lfS5tZGA7XG4gICAgICAgIGNvbnN0IHVwZGF0ZVBhdGggPSBgJHtpbmJveEZvbGRlcn0vJHt1cGRhdGVGaWxlTmFtZX1gO1xuICAgICAgICBjb250ZXh0LnVwZGF0ZVBhdGggPSB1cGRhdGVQYXRoO1xuICAgICAgICBsZXQgY3JlYXRlZCA9IGZhbHNlO1xuICAgICAgICBsZXQgc3VjY2VzcyA9IGZhbHNlO1xuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICAvLyBDaGVjayBpZiB1cGRhdGUgZmlsZSBhbHJlYWR5IGV4aXN0c1xuICAgICAgICAgICAgbGV0IHVwZGF0ZUZpbGUgPSB0aGlzLmFwcC52YXVsdC5nZXRBYnN0cmFjdEZpbGVCeVBhdGgodXBkYXRlUGF0aCk7XG5cbiAgICAgICAgICAgIGlmICghdXBkYXRlRmlsZSkge1xuICAgICAgICAgICAgICAgIC8vIENyZWF0ZSBuZXcgdXBkYXRlIGZpbGVcbiAgICAgICAgICAgICAgICBjb25zdCBpbml0aWFsQ29udGVudCA9IGAtLS1cbnRhZ3M6XG4gIC0gYWxsXG4gIC0gcHJvamVjdC11cGRhdGVzXG5wYXJhOiBpbmJveFxuY3JlYXRlZDogJHtuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkuc3BsaXQoJ1QnKVswXX1cbnByb2plY3RfZm9sZGVyOiAke2NvbmZpZy5wcm9qZWN0Rm9sZGVyfVxuLS0tXG5cbiMgJHt1cGRhdGVGaWxlTmFtZS5yZXBsYWNlKCcubWQnLCAnJyl9XG5cbiMjIE5vdGVzXG5cbmA7XG4gICAgICAgICAgICAgICAgdXBkYXRlRmlsZSA9IGF3YWl0IHRoaXMuYXBwLnZhdWx0LmNyZWF0ZSh1cGRhdGVQYXRoLCBpbml0aWFsQ29udGVudCk7XG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coYFF1aWNrIFBBUkE6IENyZWF0ZWQgbmV3IHByb2plY3QgdXBkYXRlIGZpbGU6ICR7dXBkYXRlUGF0aH1gKTtcbiAgICAgICAgICAgICAgICBjcmVhdGVkID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBhZ2VuZGEgd2l0aCBrYW5iYW4gZGF0YVxuICAgICAgICAgICAgY29uc3Qga2FuYmFuUGF0aCA9IHRoaXMuc2V0dGluZ3MucHJvamVjdFVwZGF0ZXMua2FuYmFuRmlsZTtcbiAgICAgICAgICAgIGF3YWl0IHRoaXMuYWdlbmRhTWFuYWdlci51cGRhdGVQcm9qZWN0QWdlbmRhKHVwZGF0ZVBhdGgsIGthbmJhblBhdGgsIGNvbmZpZy5wcm9qZWN0Rm9sZGVyKTtcblxuICAgICAgICAgICAgY29uc29sZS5sb2coYFF1aWNrIFBBUkE6IFVwZGF0ZWQgcHJvamVjdCBhZ2VuZGEgZm9yICR7Y29uZmlnLm5hbWV9YCk7XG4gICAgICAgICAgICBzdWNjZXNzID0gdHJ1ZTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmVuZCh0aW1lciwgeyAuLi5jb250ZXh0LCBjcmVhdGVkLCBzdWNjZXNzIH0pO1xuICAgICAgICAgICAgaWYgKHN1Y2Nlc3MpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnByb2ZpbGVyPy5pbmNyZW1lbnQoJ3Byb2plY3QtdXBkYXRlczpzdWNjZXNzJyk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMucHJvZmlsZXI/LmluY3JlbWVudCgncHJvamVjdC11cGRhdGVzOmVycm9ycycpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXN5bmMgbG9hZFNldHRpbmdzKCkge1xuICAgICAgICB0aGlzLnNldHRpbmdzID0gT2JqZWN0LmFzc2lnbih7fSwgREVGQVVMVF9TRVRUSU5HUywgYXdhaXQgdGhpcy5sb2FkRGF0YSgpKTtcblxuICAgICAgICAvLyBNaWdyYXRpb246IENvbnZlcnQgb2xkIGFnZW5kYUdlbmVyYXRpb24gc2V0dGluZ3MgdG8gbmV3IHByb2plY3RVcGRhdGVzIGlmIG5lZWRlZFxuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncy5hZ2VuZGFHZW5lcmF0aW9uICYmICF0aGlzLnNldHRpbmdzLnByb2plY3RVcGRhdGVzKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnTWlncmF0aW5nIG9sZCBhZ2VuZGFHZW5lcmF0aW9uIHNldHRpbmdzIHRvIHByb2plY3RVcGRhdGVzJyk7XG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzLnByb2plY3RVcGRhdGVzID0ge1xuICAgICAgICAgICAgICAgIGVuYWJsZWQ6IHRoaXMuc2V0dGluZ3MuYWdlbmRhR2VuZXJhdGlvbi5lbmFibGVkIHx8IGZhbHNlLFxuICAgICAgICAgICAgICAgIGthbmJhbkZpbGU6IHRoaXMuc2V0dGluZ3MuYWdlbmRhR2VuZXJhdGlvbi5rYW5iYW5GaWxlIHx8ICcwIC0gSU5CT1gvUHJvamVjdCBEYXNoYm9hcmQubWQnLFxuICAgICAgICAgICAgICAgIGNvbmZpZ3M6IFtdXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgLy8gT2xkIHNldHRpbmdzIGFyZSBwcmVzZXJ2ZWQgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkgYnV0IG5vdCBhY3RpdmVseSB1c2VkXG4gICAgICAgIH1cblxuICAgICAgICAvLyBFbnN1cmUgbmV3IHNldHRpbmdzIHN0cnVjdHVyZSBleGlzdHNcbiAgICAgICAgaWYgKCF0aGlzLnNldHRpbmdzLnByb2plY3RVcGRhdGVzKSB7XG4gICAgICAgICAgICB0aGlzLnNldHRpbmdzLnByb2plY3RVcGRhdGVzID0gREVGQVVMVF9TRVRUSU5HUy5wcm9qZWN0VXBkYXRlcztcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEVuc3VyZSBrYW5iYW5GaWxlIGV4aXN0cyBpbiBwcm9qZWN0VXBkYXRlc1xuICAgICAgICBpZiAoIXRoaXMuc2V0dGluZ3MucHJvamVjdFVwZGF0ZXMua2FuYmFuRmlsZSkge1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5wcm9qZWN0VXBkYXRlcy5rYW5iYW5GaWxlID0gJzAgLSBJTkJPWC9Qcm9qZWN0IERhc2hib2FyZC5tZCc7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBSZW1vdmUgbWlncmF0ZU9sZFRhZ3MgaWYgaXQgZXhpc3RzIChubyBsb25nZXIgcmVsZXZhbnQgZm9yIG5ldyB1c2VycylcbiAgICAgICAgaWYgKHRoaXMuc2V0dGluZ3MudGFnZ2luZyAmJiB0aGlzLnNldHRpbmdzLnRhZ2dpbmcubWlncmF0ZU9sZFRhZ3MgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgZGVsZXRlIHRoaXMuc2V0dGluZ3MudGFnZ2luZy5taWdyYXRlT2xkVGFncztcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5zZXR0aW5ncy5kaWFnbm9zdGljcykge1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5kaWFnbm9zdGljcyA9IHsgLi4uREVGQVVMVF9TRVRUSU5HUy5kaWFnbm9zdGljcyB9O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zZXR0aW5ncy5kaWFnbm9zdGljcyA9IE9iamVjdC5hc3NpZ24oe30sIERFRkFVTFRfU0VUVElOR1MuZGlhZ25vc3RpY3MsIHRoaXMuc2V0dGluZ3MuZGlhZ25vc3RpY3MpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYXN5bmMgc2F2ZVNldHRpbmdzKCkge1xuICAgICAgICBhd2FpdCB0aGlzLnNhdmVEYXRhKHRoaXMuc2V0dGluZ3MpO1xuICAgIH1cblxuICAgIG9udW5sb2FkKCkge1xuICAgICAgICBpZiAodGhpcy5zZXR0aW5ncz8uZGlhZ25vc3RpY3M/LnByb2ZpbGluZ0VuYWJsZWQgJiYgdGhpcy5zZXR0aW5ncy5kaWFnbm9zdGljcy5sb2dTdW1tYXJ5T25VbmxvYWQpIHtcbiAgICAgICAgICAgIHRoaXMubG9nUGVyZm9ybWFuY2VTbmFwc2hvdCgncGx1Z2luLXVubG9hZCcpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnNvbGUubG9nKCdVbmxvYWRpbmcgUXVpY2sgUEFSQSBwbHVnaW4nKTtcbiAgICB9XG59O1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7O0FBQUE7QUFBQSxnQ0FBQUEsVUFBQUMsU0FBQTtBQUFBLFFBQU1DLHVCQUFOLE1BQTBCO0FBQUEsTUFDdEIsWUFBWSxVQUFVLENBQUMsR0FBRztBQUQ5QjtBQUVRLGFBQUssV0FBVSxhQUFRLFlBQVIsWUFBbUI7QUFDbEMsYUFBSyxpQkFBZ0IsYUFBUSxrQkFBUixZQUF5QjtBQUM5QyxhQUFLLE1BQU07QUFBQSxNQUNmO0FBQUEsTUFFQSxRQUFRO0FBQ0osYUFBSyxTQUFTLG9CQUFJLElBQUk7QUFDdEIsYUFBSyxRQUFRLG9CQUFJLElBQUk7QUFDckIsYUFBSyxXQUFXLG9CQUFJLElBQUk7QUFDeEIsYUFBSyxlQUFlLEtBQUssSUFBSTtBQUM3QixhQUFLLGVBQWU7QUFBQSxNQUN4QjtBQUFBLE1BRUEsTUFBTTtBQUNGLFlBQUksT0FBTyxnQkFBZ0IsZUFBZSxPQUFPLFlBQVksUUFBUSxZ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O0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQStCdkIscUJBQXFCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQTZCckIsd0JBQXdCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQTZCeEIscUJBQXFCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQTZCckIseUJBQXlCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQTZCekIsdUJBQXVCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsTUErQnZCLHdCQUF3QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQXNEeEIsMkJBQTJCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtB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LENBQUMsS0FBSyxTQUFTLGVBQWUsWUFBWTtBQUMxQyxXQUFLLFNBQVMsZUFBZSxhQUFhO0FBQUEsSUFDOUM7QUFHQSxRQUFJLEtBQUssU0FBUyxXQUFXLEtBQUssU0FBUyxRQUFRLG1CQUFtQixRQUFXO0FBQzdFLGFBQU8sS0FBSyxTQUFTLFFBQVE7QUFBQSxJQUNqQztBQUVBLFFBQUksQ0FBQyxLQUFLLFNBQVMsYUFBYTtBQUM1QixXQUFLLFNBQVMsY0FBYyxFQUFFLEdBQUcsaUJBQWlCLFlBQVk7QUFBQSxJQUNsRSxPQUFPO0FBQ0gsV0FBSyxTQUFTLGNBQWMsT0FBTyxPQUFPLENBQUMsR0FBRyxpQkFBaUIsYUFBYSxLQUFLLFNBQVMsV0FBVztBQUFBLElBQ3pHO0FBQUEsRUFDSjtBQUFBLEVBRUEsTUFBTSxlQUFlO0FBQ2pCLFVBQU0sS0FBSyxTQUFTLEtBQUssUUFBUTtBQUFBLEVBQ3JDO0FBQUEsRUFFQSxXQUFXO0FBOXdGZjtBQSt3RlEsVUFBSSxnQkFBSyxhQUFMLG1CQUFlLGdCQUFmLG1CQUE0QixxQkFBb0IsS0FBSyxTQUFTLFlBQVksb0JBQW9CO0FBQzlGLFdBQUssdUJBQXVCLGVBQWU7QUFBQSxJQUMvQztBQUNBLFlBQVEsSUFBSSw2QkFBNkI7QUFBQSxFQUM3QztBQUNKOyIsCiAgIm5hbWVzIjogWyJleHBvcnRzIiwgIm1vZHVsZSIsICJQZXJmb3JtYW5jZVByb2ZpbGVyIiwgIl9hIiwgIl9iIl0KfQo=
