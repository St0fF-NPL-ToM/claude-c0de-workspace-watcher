# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Klaus'C0dehelfer** (`claude-c0de-workspace-watcher`) — a VSCode extension by theObsessedManiacs that monitors workspace file changes and surfaces them to Claude Code via a hook handler. Requires the `anthropic.claude-code` extension as a dependency.

## Commands

```bash
npm run bundle          # Build both scripts (extension + hook handler)
npm run compile         # Type-check only (no emit)
npm run watch           # Watch mode type-check
npx vsce package        # Create installable .vsix file
```

**Testing workflow:** Build the VSIX, install it in VSCode (`Extensions: Install from VSIX…`), restart VSCode. The F5 Extension Development Host is not used — a new host session can't access an existing Klaus session.

> Note: `npm run lint` references ESLint but ESLint is not installed — the script will fail. Don't invoke it.

## Architecture

The extension is a two-runtime system:

1. **VSCode Runtime** (`src/extension.ts`) — monitors files, writes state to disk
2. **Claude Code Runtime** (`src/hook-handler.ts`) — reads state, injects context via hook

Both are bundled independently via esbuild.

### VSCode Runtime (`src/extension.ts` → `dist/extension.js`)

Core class: `ClaudeWorkspaceMonitor`

- **Activation** (`onStartupFinished`): loads persisted state from disk, sets up file watchers, registers configuration change listeners.
- **`trackFileChange(filePath)`**: checks exclusion patterns, gets relative path, appends to in-memory file list, triggers `saveStateDebounced()`.
- **`saveStateDebounced()`**: 5-second debounce timer that calls `saveState()`.
- **`saveState()`**: implements **Lock+Danke IPC pattern** (see below), writes `{ lastClaude, files }` to `.vscode/KlausC0deHelferData.json`.
- **`getMtimesPath()`**: resolves state filename from config (default: `KlausC0deHelferData`).
- **`handleAwarenessModeSetting(mode, isGlobal)`**: registers the hook-handler in `.claude/settings.local.json` (workspace or global).
- **Config**:
  - `awarenessMode` (`none | onDemand | realTime`): controls whether the hook fires.
  - `stateFileName`: name of state file (default `KlausC0deHelferData`, stored as `.vscode/{name}.json`).
  - `includePatterns`: glob array of files to monitor (source code, config, docs).
  - `excludePatterns`: glob array of noise to ignore (build artifacts, cache, `.git`, `node_modules`).

### Claude Code Runtime (`src/hook-handler.ts` → `dist/hook-handler.js`)

Runs inside Claude Code when `UserPromptSubmit` hook fires. No VSCode API access.

- **Input**: hook metadata from Claude Code (workspace path, etc.) via stdin as JSON.
- **Lock-Wait Pattern**: waits up to 5 seconds for `.vscode/KlausC0deHelferData.json.lock` to disappear (ensures VSCode isn't writing).
- **Read State**: parses `.vscode/KlausC0deHelferData.json`, extracts `files` array.
- **Create Danke File**: writes `.vscode/KlausC0deHelferData.json.danke` as a timestamp marker (for future race-condition handling).
- **Output**: writes `{ additionalContext: "..." }` to stdout. Claude Code harness parses this and injects the context into the prompt.

**Known Issue**: Hook output is being written to stdout, but Claude Code harness is not injecting the `additionalContext` into the prompt. Debug checklist:
  - Verify hook command in `.claude/settings.local.json` is correct: `node /path/to/dist/hook-handler.js`
  - Check hook-handler stderr for errors via Claude Code logs
  - Verify state file has non-empty `files` array when hook fires
  - Confirm `UserPromptSubmit` hook syntax in settings is correct (see extension.ts line 368-374)

### Lock+Danke IPC Pattern

Synchronization between VSCode (writing) and Claude (reading):

**Write side** (extension.ts `saveState()`):
1. Write `.lock` file (signal: "writing in progress")
2. Write state JSON
3. Delete `.lock` file (signal: "write complete")

**Read side** (hook-handler.ts `handleUserPromptSubmit()`):
1. Poll for `.lock` absence (max 5s wait)
2. Read state JSON
3. Write `.danke` file (signal: "read complete" — currently unused but prepared for future bi-directional signaling)

This prevents reading a partially-written state file.

### SPEC.md

Describes a future MultiDiff architecture that is **not yet implemented** — treat it as a design target for future work, not documentation of current code.

## Versioning & Build Workflow

The extension uses **post-commit versioning**: the version number (e.g., `0.4.0-i47`) is automatically incremented after each commit by the `.git/hooks/post-commit` hook.

**Workflow (always follow this order):**
1. Make code changes
2. `git add` (include `package.json` — it will have the current version)
3. `git commit` → post-commit hook fires, increments version, auto-stages the updated `package.json` for the next commit
4. `npm run bundle` → builds with current version
5. `npx vsce package` → creates VSIX with current version
6. **Test the VSIX** before next commit

This ensures the committed version and the built VSIX always match. `package.json` will be dirty after each commit (post-commit hook increments it), which is normal — it's ready for the next commit.

The `.git/hooks/post-commit` script also runs `git add package.json` automatically, so the incremented version is staged for the next commit without manual intervention.

## Bundling Notes

- `--external:vscode` is mandatory for `extension.ts` only — the VSCode API is provided by the host at runtime.
- `hook-handler.ts` does NOT use `--external:vscode` — it runs in Claude Code runtime where VSCode is not available.
- `minimatch` (the only runtime dependency) is bundled in.
- `tsconfig.json` uses `"module": "commonjs"`, `"target": "ES2020"`, strict mode, no emit (esbuild handles emit).
