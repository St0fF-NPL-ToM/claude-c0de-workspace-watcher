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

The extension consists of two scripts for two different runtimes, bundled independently via esbuild:

### `src/extension.ts` → `dist/extension.js` — VSCode runtime

Runs inside VSCode as the extension. Core class is `ClaudeWorkspaceMonitor`:

- **Activation** (`onStartupFinished`): loads persisted state, sets up `vscode.FileSystemWatcher` instances per workspace folder, registers document save/create/delete/rename listeners.
- **`trackFileChange()`**: filters excluded paths, reads mtime via `fs.statSync`, updates in-memory state map.
- **`saveStateDebounced()`**: 5-second debounce before `saveState()` writes JSON to disk.
- **`getMtimesPath()`**: resolves state file path — config override → `.vscode/.workspaceChanges.json` → home fallback.
- **`handleAwarenessModeSetting(mode)`**: dialog flow that writes Claude Code hook config into `.claude/settings.json`.
- **`checkClaudeIntegration()`**: checks whether the hook is already registered in `.claude/settings.json`.
- `awarenessMode` config (`none | onDemand | realTime`) is the main user-facing setting.

### `src/hook-handler.ts` → `dist/hook-handler.js` — Claude Code runtime

Runs inside Claude Code (not VSCode) when the `UserPromptSubmit` hook fires. Has no VSCode API access. Reads JSON from stdin, locates the workspace, reads the state file written by the extension, and writes `{ additionalContext: "..." }` to stdout so Claude Code can inject workspace context into the prompt.

The extension registers this script as a hook in `.claude/settings.json` — that's the bridge between the two runtimes.

### Known Naming Discrepancy

The extension writes **`.vscode/.workspaceChanges.json`** but `hook-handler.ts` reads **`.vscode/KlausC0deHelferData.json`** (per SPEC.md). These filenames do not currently match — this is an open inconsistency between the spec and implementation.

### SPEC.md

Describes a future MultiDiff architecture (`diffToKlaus()`, `diffChangesToKlaus()`, `diffFileToKlaus()`) that is **not yet implemented**. Treat it as the design target for future work, not a description of current code.

## Bundling Notes

- `--external:vscode` is mandatory — the VSCode API is provided by the host at runtime.
- `minimatch` (the only runtime dependency) is bundled in.
- `tsconfig.json` uses `"module": "commonjs"`, `"target": "ES2020"`, strict mode, no emit (esbuild handles emit).
