# CLAUDE.md

> **See [AGENTS.md](./AGENTS.md)** for complete project instructions.

This file provides Claude Code (claude.ai/code) specific guidance for working with the Quick PARA Plugin.

## Quick Start

```bash
# Build and test
npm run build

# Development with auto-rebuild
npm run dev
```

## Claude-Specific Notes

### MCP Servers Available

Claude Code has access to the following MCP servers that may be useful for this project:

**obsidian-vault** - Direct access to Obsidian vault files
- Can read/write vault notes for testing
- Useful for validating plugin behavior on actual vault content

**cli-agent** - Multi-LLM code review
- Query other models (Gemini, Codex) for code review
- Get alternative perspectives on architecture decisions
- Available as MCP tool or HTTP endpoint at `http://localhost:3001`

### TodoWrite Usage

Use the TodoWrite tool to track multi-step tasks:

**When to use:**
- Implementing new features with 3+ steps
- Complex refactoring across multiple modules
- Bug fixes requiring investigation + fix + testing

**When NOT to use:**
- Single-file edits
- Trivial changes (typo fixes, comment updates)
- Simple build/test operations

**Example workflow:**
```
1. Investigate bug in tagging.js - in_progress
2. Implement fix with null check - pending
3. Add test case for edge case - pending
4. Update CHANGELOG.md - pending
```

Mark tasks as `in_progress` when starting, `completed` when finished. Only one task should be `in_progress` at a time.

### Agent Attribution in Commits

Include agent name in commit messages for tracking:

```
feat: Add task preview mode

[Agent: Main Assistant]

Added dry-run functionality to show affected tasks
before cancellation. Helps users review changes safely.
```

See `/Users/mriechers/Developer/the-lodge/conventions/COMMIT_CONVENTIONS.md` for complete format.

### Obsidian Plugin Testing

When making changes:
1. Build with `npm run build`
2. Copy `main.js`, `manifest.json`, `styles.css` to test vault
3. Reload Obsidian (Cmd+R) or toggle plugin off/on
4. Test feature in actual vault environment
5. Check Obsidian console (Cmd+Option+I) for errors

### Common Pitfalls

- **Forgetting to build**: Changes to `src/` files don't take effect until `npm run build`
- **Version mismatch**: Keep `manifest.json` and `package.json` versions in sync
- **Frontmatter corruption**: Always use `app.fileManager.processFrontMatter()`, never regex
- **Missing null checks**: Vault files may have unexpected structure, always validate
- **Breaking user data**: Use preview modes and confirmations for destructive operations

---

**For complete documentation, architecture, and coding conventions, see [AGENTS.md](./AGENTS.md).**
