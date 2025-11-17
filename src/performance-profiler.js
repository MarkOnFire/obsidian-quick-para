class PerformanceProfiler {
    constructor(options = {}) {
        this.enabled = options.enabled ?? false;
        this.slowThreshold = options.slowThreshold ?? 200;
        this.reset();
    }

    reset() {
        this.timers = new Map();
        this.stats = new Map();
        this.counters = new Map();
        this.sessionStart = Date.now();
        this.timerCounter = 0;
    }

    now() {
        if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
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
            console.info('[Quick PARA][Perf] Profiling enabled');
        } else {
            console.info('[Quick PARA][Perf] Profiling disabled');
        }
    }

    configure(options = {}) {
        if (typeof options.slowThreshold === 'number' && !Number.isNaN(options.slowThreshold)) {
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
        if (typeof fn !== 'function') {
            return null;
        }

        if (!this.enabled) {
            return fn();
        }

        const handle = this.start(label);
        try {
            return await fn();
        } finally {
            const context = typeof contextBuilder === 'function'
                ? contextBuilder()
                : (contextBuilder || {});
            this.end(handle, context);
        }
    }

    recordDuration(label, duration, context = {}) {
        if (!this.enabled || typeof duration !== 'number') {
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

    logSummary(reason = 'manual') {
        if (!this.enabled) {
            console.info('[Quick PARA][Perf] Profiling disabled; no summary to log.');
            return null;
        }

        const summary = this.summarize();
        console.group(`[Quick PARA][Perf] Summary (${reason})`);
        console.info('Session duration (ms):', summary.sessionDurationMs);
        console.info('Slow threshold (ms):', summary.slowThreshold);
        console.info('Event counters:', summary.counters);
        console.info('Timing stats:', summary.stats);
        console.groupEnd();
        return summary;
    }
}

module.exports = { PerformanceProfiler };
