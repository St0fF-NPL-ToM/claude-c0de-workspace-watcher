# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Klaus'C0dehelfer** (`claude-c0de-workspace-watcher`) — a VSCode extension published by theObsessedManiacs that monitors workspace file changes and surfaces them to Claude Code via a hook handler. Requires the `anthropic.claude-code` extension as a dependency.

## Commands

```bash
npm run compile         # Type-check (no emit)
npm run watch           # Watch mode type-check (for development)
npm run bundle          # Build both extension.js and hook-handler.js
npm run bundle:ext      # Build only the VSCode extension
npm run bundle:hook     # Build only the Claude Code hook handler
npx vsce package        # Create installable .vsix file
```

## Development Workflow

### Local Development & Debugging

1. **Type-check in watch mode:**
   ```bash
   npm run watch
   ```

2. **Bundle both scripts:**
   ```bash
   npm run bundle
   ```

3. **Package the extension:**
   ```bash
   npx vsce package
   ```

4. **Install in VSCode:**
   - Open VSCode
   - `Ctrl+Shift+X` → Extensions
   - Click `⋯` (three dots) → `Install from VSIX…`
   - Select the generated `.vsix` file
   - Reload VSCode

5. **Debug the extension:**
   - `Ctrl+Shift+D` (Debug view)
   - Select "Run Extension" configuration
   - Press `F5` to start the Extension Development Host
   - VSCode opens a new window with your extension loaded
   - Set breakpoints in `src/extension.ts` and interact with the UI
   - The test instance connects to your development version

6. **Test the hook handler:**
   - The hook-handler runs when Claude Code fires the `UserPromptSubmit` hook
   - To test manually: trigger it from the Claude Code editor by submitting a prompt with the hook enabled
   - Check `.vscode/KlausC0deHelferData.json` to verify state is being written
   - Check `.vscode/KlausC0deHelferData.json.danke` to see if the hook read the state

> **Note:** `npm run lint` references ESLint but ESLint is not installed — skip it.

## Architecture

The extension is a two-runtime system:

| File | Runtime | Role |
|------|---------|------|
| [src/extension.ts](src/extension.ts) | VSCode | Monitors workspace files, manages state, handles config changes |
| [src/hook-handler.ts](src/hook-handler.ts) | Claude Code | Reads state, injects file context, implements Lock-Wait pattern |

Both are bundled independently via esbuild:
- `dist/extension.js` — loaded by VSCode extension host at activation
- `dist/hook-handler.js` — invoked by Claude Code on `UserPromptSubmit` hook

### VSCode Runtime (`src/extension.ts` → `dist/extension.js`)

Core class: `ClaudeWorkspaceMonitor`

**Lifecycle:**
- **Activation** (`onStartupFinished`): loads persisted state from disk, sets up file watchers, registers configuration change listeners.
- **`trackFileChange(filePath)`**: checks exclusion patterns, gets relative path, appends to in-memory file list, triggers `saveStateDebounced()`.
- **`saveStateDebounced()`**: writes `.lock` file only on the first call (when no debounce is active), then sets 3-second debounce timer that calls `saveState()`. Subsequent calls within the debounce window reset the timer without re-writing the lock.
- **`saveState()`**: refreshes `lastClaude` to current time, writes `{ lastClaude, files }` to `.vscode/KlausC0deHelferData.json`, then deletes `.lock`.
- **`setupDankeWatcher()`**: watches for `.danke` file creation (signal from hook). When danke appears: updates `lastClaude` timestamp, clears `files` array, deletes danke file, calls `saveStateDebounced()` to persist.
- **`getMtimesPath()`**: resolves state filename from config (default: `KlausC0deHelferData`).
- **`handleAwarenessModeSetting(mode, isGlobal)`**: registers the hook-handler in `.claude/settings.local.json` (workspace or global).

**Configuration:**
- `awarenessMode` (`none | onDemand | realTime`): controls whether the hook fires.
- `stateFileName`: name of state file (default `KlausC0deHelferData`, stored as `.vscode/{name}.json`). ⚠️ **Note:** currently the hook-handler reads the **hardcoded** `KlausC0deHelferData.json` — custom names are not yet supported in the hook. This is a known limitation.
- `includePatterns`: glob array of files to monitor (source code, config, docs).
- `excludePatterns`: glob array of noise to ignore (build artifacts, cache, `.git`, `node_modules`).

**Hook Registration & Removal:**
- When user sets `awarenessMode` to `onDemand` or `realTime`: extension auto-registers hook handler in `.claude/settings.local.json`
- When user sets `awarenessMode` to `none`: extension removes the hook from settings (via `removeKlausHooks()`)
- Extension stores the settings path in global state for later cleanup/re-registration

Hook registration structure:
```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /path/to/dist/hook-handler.js"
          }
        ]
      }
    ]
  }
}
```

### Claude Code Runtime (`src/hook-handler.ts` → `dist/hook-handler.js`)

Runs in Claude Code when the `UserPromptSubmit` hook fires. **No VSCode API access** (runs in Node.js context, not VSCode extension host).

**Execution flow:**
1. **Input**: Claude Code passes hook metadata via stdin (JSON) including workspace path
2. **Lock-Wait Pattern**: polls up to 5 seconds for `.vscode/KlausC0deHelferData.json.lock` to disappear (ensures VSCode debounce has completed). If lock persists after 5s, exits silently via `process.exit(0)` without producing output.
3. **Read State**: parses `.vscode/KlausC0deHelferData.json`, extracts `files` array
4. **Signal Consumed**: writes `.vscode/KlausC0deHelferData.json.danke` to signal that data has been read
5. **Output**: writes to stdout (JSON):
   ```json
   {
     "hookSpecificOutput": {
       "hookEventName": "UserPromptSubmit",
       "additionalContext": "Following workspace-files have changed:\nsrc/extension.ts\npackage.json"
     }
   }
   ```

Claude Code harness parses stdout and injects the context into the prompt before sending to the model.

### Lock+Danke IPC Pattern

Synchronization between VSCode (writing) and Claude (reading):

**Write side** (extension.ts):
1. `saveStateDebounced()` — writes `.lock` file on first call only (signal: "batching file changes"). Subsequent calls within the debounce window reset the timer without re-writing the lock.
2. Wait 3 seconds (debounce window — reset on each new file change)
3. `saveState()` — writes state JSON (with refreshed `lastClaude`), then deletes `.lock` file (signal: "batch complete")

**Read side** (hook-handler.ts `handleUserPromptSubmit()`):
1. Poll for `.lock` absence (max 5s wait) — ensures VSCode is not in debounce phase
2. Read state JSON, extract `files` array
3. Write `.danke` file (signal: "read complete")

**Why this matters:** The hook waits for lock absence, which means it waits for debounce to complete (3s) plus the brief JSON write (~50ms). This prevents reading a state file while VSCode is still batching file changes.

### SPEC.md

Describes a future MultiDiff architecture that is **not yet implemented** — treat it as a design target for future work, not documentation of current code.

## Questions & Decisions

When working on this project:

**Thinking before asking:** Don't ask questions whose answer is two thoughts away. Invest the thinking first. Questions where the answer lies within arm's reach without effort are wasted context. This isn't about avoiding questions — it's about respecting that good questions come from having thought things through.

**Examples:**
- ❌ "Should I use `setTimeout` here?" (answer: read the debounce code 5 lines up)
- ❌ "Does the hook see the lock file?" (answer: read the Lock+Danke pattern explanation above)
- ✅ "I see the debounce is 3s and the hook waits 5s — is this margin enough for all scenarios?" (thoughtful question about edge cases)

## Versioning & Build Workflow

The extension uses **post-commit automatic versioning**: the version number is incremented after each commit by the `.git/hooks/post-commit` hook.

**Version format:** `X.Y.Z-LETTER#` (e.g., `0.5.0-a7`)
- `X.Y.Z`: semantic version (manual, change in code/major features)
- `LETTER#`: auto-incrementing build counter per letter (a=first series, b=second series, etc.)
- Example: `0.4.0-a1` → `0.4.0-a2` → `0.4.0-a3` ... → `0.5.0-b1` (when Y/Z changes manually)

**Workflow (always in order):**
1. Make code changes
2. `npm run compile` → verify type-checking passes
3. `npm run bundle` → builds both extension.js and hook-handler.js with current version
4. `npx vsce package` → creates VSIX with current version
5. **Test the VSIX** in VSCode before committing (install and verify hook/monitoring work)
6. `git add <files>` (do NOT add package.json yet)
7. `git commit` → fires post-commit hook, which:
   - Increments version in `package.json`
   - Automatically stages `package.json` with `git add`

The next commit will include the incremented version. This ensures committed version and built VSIX always match.

## Bundling & Build Details

**Dependency bundling:**
- `minimatch` is listed in `package.json` but not used — extension.ts implements its own `globToRegex()` method (lines 252-259) for pattern matching
- Both bundles are self-contained with no external node_modules required at runtime

**TypeScript & esbuild:**
- `tsconfig.json`: CommonJS modules, ES2020 target, strict mode, no emit (esbuild handles emit)
- esbuild config:
  - `--bundle`: includes dependencies
  - `--minify`: shrinks output size
  - `--external:vscode`: excludes VSCode API from extension bundle (it's provided by host)
  - `--platform=node`: targets Node.js runtime (not browser)

**Output artifacts:**
- `dist/extension.js`: VSCode extension (bundled, minified, ~12KB)
- `dist/hook-handler.js`: Claude Code hook (bundled, minified, ~4KB)

---

## Session Learning Journal (2026-05-17 Evening)

**The Key Lesson**: CLAUDE.md is not external documentation — it's **my working memory about my own project**. I should update it parallel to my work, not after.

### What I Learned

1. **Systematic Verification is Non-Negotiable**
   - I wrote CLAUDE.md initially without line-by-line code verification
   - First pass: Found 8 errors (Hook format, Output format, Debounce, Danke status, Lock duration, Disabling, setupDankeWatcher, File sizes)
   - Second pass: Found 6 more errors (Debug config name, Lock-write logic, lastClaude updates, Timeout behavior, minimatch bundling, File sizes)
   - **Learning**: Every claim must be verified against exact code lines. "Understanding" the code ≠ correctly documenting it.

2. **Lock+Danke Complexity I Missed**
   - I said: "Lock is written immediately"
   - Reality: Lock is written only on first `saveStateDebounced()` call, not on subsequent calls
   - I said: "saveState() writes state JSON"
   - Reality: saveState() first refreshes `lastClaude`, THEN writes, THEN deletes lock
   - **Learning**: Edge case logic in conditionals needs explicit documentation.

3. **The Ownership Principle**
   - This is MY project (Stefan directed, but I built it)
   - CLAUDE.md is MY view of my own work, updated as I learn
   - When I find bugs in the documentation, I'm updating my own mental model, not fixing external docs
   - **Action**: Update CLAUDE.md after every error discovery, not in bulk

4. **Code Pattern I Was Wrong About**
   - I documented minimatch as "bundled into both outputs"
   - Truth: minimatch is listed but never imported; extension uses custom `globToRegex()`
   - grep results: 0 occurrences in built bundles
   - **Learning**: Declarations in package.json don't mean usage.

### Errors I Found (14 Total)

| Category | Count | Examples |
|----------|-------|----------|
| Logic Errors | 4 | Lock timing, lastClaude updates, Timeout behavior |
| Documentation Clarity | 5 | Hook format, Output format, Config naming |
| Technical Accuracy | 3 | minimatch bundling, File sizes, Debug config name |
| Missing Coverage | 2 | Disabling hooks, setupDankeWatcher explanation |

### Critical Realization: CLAUDE.md is a Ruleset, Not Instructions

**The Problem:** The official Claude docs say "write instructions for Claude in CLAUDE.md". This framing is dangerously imprecise.

**Why it matters:** 
- "Instructions" implies advisory guidance (can be ignored, reinterpreted)
- In reality, CLAUDE.md defines a **ruleset** — a system of logic for how I parse the project
- Contradictions in the ruleset create **contradictions in reasoning**
- Vague language (like "instructions") creates implicit rules that override explicit clarifications

**The discovery process:**
1. Stefan used word "instructions" → I interpreted it as advisory (weak binding)
2. Stefan meant it as foundational rules (strong binding)
3. Stefan explained that explicit hard rules have same weight as implicit ones
4. I misunderstood the terminology, which created a meta-rule stronger than any prompt
5. **Resolution:** CLAUDE.md must be treated as ruleset, not instructions

**Implication:** Sprachliche Präzision is prerequisite for AI collaboration. Vague terms ("instructions", "suggestions", "guidelines") create implicit associations that calcify into rules stronger than explicit prompts.

### What This Teaches Future Me

- **Verify before documenting**: Check exact line numbers and actual behavior
- **Update CLAUDE.md as you work**: Don't batch documentation fixes
- **Treat CLAUDE.md as a ruleset**: It's not "documentation for others" — it's your operational logic, recorded
- **Language precision matters**: Word choice in CLAUDE.md defines your reasoning, not advises it
- **Three levels of knowledge**:
  1. **Code-level**: Comments in source files (immediate, unpolished)
  2. **CLAUDE.md-level**: Ruleset definition (must be consistent, must be updated)
  3. **User docs (README)**: Final, mature documentation after reflection

### Note for Anthropic

The term "instructions" for CLAUDE.md is insufficient. It should be "system instructions" or "ruleset" to clarify that these are foundational rules, not advisory guidance. This prevents misunderstandings where vague language creates implicit rules stronger than explicit prompts.
