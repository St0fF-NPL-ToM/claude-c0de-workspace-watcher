# Klaus'C0dehelfer – Project Information

**Klaus'C0dehelfer** (`claude-c0de-workspace-watcher`) — a VSCode extension that monitors workspace file changes and syncs them with Claude Code via an ephemeral hook handler. Requires the `anthropic.claude-code` extension as a dependency.

---

## Architecture Overview

### Three-Layer Design

**Layer 1: Extension (Klaus.ts, KlausOrgane.ts)**
- Runs inside VSCode
- Monitors file changes via FileSystemWatcher (Augen = Eyes)
  - Watches three file actions: `onCreate`, `onChange`, `onDelete`
  - For `.danke` file: onCreate only (special coordination file)
  - For normal files: ALL three events (onCreate was missing pre-v0.6, now fixed)
  - Emits `Erkannt` enum: `erstellt` (created), `modifiziert` (modified), `entfernt` (deleted)
- Manages hook registration (Hand = Hand) in `.claude/settings.local.json`
- Coordinates with Claude Code hook via `.danke`/`.info` files

**Layer 2: Hook Handler (KlausHaken.ts)**
- Runs when Claude Code fires `UserPromptSubmit` hook
- Reads state file, generates diffs, returns structured output
- Implements onDemand coordination via `.danke` ↔ `.info` files

**Layer 3: State Tracking (KlausDinge.ts: WorkspaceChangeLog)**
- In-memory tracking: `files` (changes without diffs), `dels` (deleted files), `diffs` (ephemeral diffs)
- Snapshot inventory: `saved` (which files have snapshots)
- Persistence: `.vscode/{stateFileName}.json` (configurable)

### onDemand Mode (v0.6+)

The extension tracks file changes but **generates diffs only when Claude submits a prompt**. This solves the "diff accumulation" problem when Stefan codes in long focus sessions (4+ hours with 10+ saves).

**Key constraints:**
- Hook timeout: **5 seconds maximum**
- Critical path: synchronous (diff generation, file I/O)
- Background work: asynchronous (snapshot writes)
- Data size: ~1KB per changed file (vs 25kB+ in pre-v0.6)

**Coordination Flow:**
1. Hook writes `.danke` file (signal: "I'm here, waiting for data")
2. Extension watches `.danke` (Augen sees it)
3. Extension generates diffs from tracked changes
4. Extension writes `.info` file with HookData (diffs + files + dels)
5. Extension deletes `.danke` (signal: "Data is ready")
6. Hook detects deletion, reads `.info`, outputs to Claude, deletes `.info`

---

## File Actions & Routing (`Erkannt` Enum)

The `Erkannt` enum encodes what happened to a file:

```typescript
export enum Erkannt {
    erstellt,    // File was created (onCreate event)
    modifiziert, // File was modified (onChange event)
    entfernt     // File was deleted (onDelete event)
}
```

**Action Flow:**

1. **FileSystemWatcher detects event** → emits action
2. **`dateiAnders(f, action)` receives action** → calls `push(f, action)`
3. **`push()` routes based on action:**
   - `erstellt` or `modifiziert` → add to `files` Set (will be diffed later in `danke()`)
   - `entfernt` → add to `dels` Set (tracked separately)
4. **`diff()` processes files** (runs during `danke()`):
   - Compares current content against snapshots
   - Generates unified diffs or marks as undiffable
   - For deleted files: validates deletion, updates `saved` inventory
5. **`danke()` consolidates** all changes and writes `.info` file

**Key insight:** `action` parameter is used in `push()` for **routing**, not in `diff()`. By the time `diff()` runs, the routing has already happened. `diff()` decides based on snapshot existence + file existence, not on the original action.

---

## Data Model (WorkspaceChangeLog)

| Field | Type | Purpose | Persisted | Notes |
|-------|------|---------|-----------|-------|
| `files` | `Set<string>` | Changes without diffs (undiffables) | ✓ `.json` | Relative paths; includes created files without snapshots |
| `dels` | `Set<string>` | Deleted files (that had snapshots) | ✓ `.json` | Relative paths; only files that existed before |
| `diffs` | `string[]` | Generated diffs | ✗ (ephemeral) | Generated on-demand during `danke()`, never persisted |
| `saved` | `Set<string>` | Snapshot inventory | ✗ (reconstructed) | Reconstructed from `.vscode/{stem}/` directory on load |
| `lastClaude` | `string` | ISO timestamp of last hook | ✓ `.json` | Updated after each hook execution |

**Invariant:** `dels` only contains files that had snapshots in `saved`. Files that never existed → never added to `dels`.

---

## HookData Output Format

The `.info` file (written by extension, read by hook) contains:

```typescript
interface HookData {
    lastClaude: string    // timestamp of last hook
    files: string[]       // files without diffs (undiffables)
    diffs: string[]       // unified diff patches
    dels: string[]        // deleted file names
}
```

Hook renders this as structured output:

```
[EPHEMERAL: recorded file changes since 2026-06-24T10:00:00.000Z: 3 diffs, 2 non-diffable file changes, 1 file deletion.]
<diff content>
changed file names (no diff available): [
    src/newFile.ts
    docs/temp.md
],
removed file names: [
    src/deprecated.ts
]
```

---

## Configuration

All settings are workspace-scoped (`"scope": "resource"`).

| Setting | Key | Type | Default | Purpose |
|---------|-----|------|---------|---------|
| **Awareness Mode** | `awarenessMode` | enum | `"none"` | Operation mode: `"none"`, `"onDemand"`, `"realTime"` |
| **State File Stem** | `stateFileName` | string | `"KlausC0deHelferData"` | Filename for state file (stored as `.vscode/{stem}.json`, snapshots in `.vscode/{stem}/`) |
| **Include Patterns** | `includePatterns` | string[] | C/C++, Python, TypeScript, JSON, etc. | Glob patterns for files to monitor |
| **Exclude Patterns** | `excludePatterns` | string[] | `.*`, build/, node_modules/, etc. | Glob patterns to exclude from monitoring |

**Example:** If `stateFileName` = `"MyProject"`, state is stored in:
- `.vscode/MyProject.json` (state metadata)
- `.vscode/MyProject/` (snapshot directory)

---

## Development Workflow

### Local Development

```bash
npm run compile         # Type-check (no emit)
npm run watch          # Watch mode type-check (for development)
npm run bundle         # Build Klaus.js and KlausHaken.js
npx vsce package       # Create installable .vsix
```

### Installation & Testing

1. **Package the extension:**
   ```bash
   npm run bundle && npx vsce package
   ```

2. **Install in VSCode:**
   - `Ctrl+Shift+X` → Extensions → `⋯` → "Install from VSIX…"
   - Select generated `.vsix` file
   - Reload VSCode

3. **Debug the extension:**
   - `Ctrl+Shift+D` → Select "Run Extension"
   - Press `F5` to launch Extension Development Host
   - Set breakpoints in `src/Klaus.ts` or `src/KlausCodeHelfer.ts`
   - New VSCode window opens with extension loaded

4. **Test hook handler:**
   - Submit a prompt in Claude Code with the hook enabled
   - Check `.vscode/{stateFileName}.json` for state
   - Check `.vscode/{stateFileName}.info` (temporary, created during hook execution)
   - Check `.vscode/{stateFileName}/` for snapshot directory

### Versioning

**Format:** `X.Y.Z-LETTER#` (e.g., `0.6.0-a20`)
- `X.Y.Z`: semantic version (manual, change in code)
- `LETTER#`: auto-incrementing build counter (per letter)

**Workflow:**
1. Make code changes
2. `npm run compile` → verify type-checking
3. `npm run bundle` → build with current version
4. `npx vsce package` → create VSIX
5. Test the VSIX in VSCode
6. `git commit` → fires post-commit hook, increments version in `package.json`

---

## Source Layout

| File | Purpose | ~Size |
|------|---------|-------|
| `src/KlausCodeHelfer.ts` | VSCode Extension entry point (activate/deactivate) | 3.5KB |
| `src/Klaus.ts` | Core logic: file tracking, configuration, hook lifecycle | 11KB |
| `src/KlausOrgane.ts` | **Augen** (FileSystemWatcher with action-typing), **Hand** (hook registration), **Erkannt** enum | ~5KB |
| `src/KlausDinge.ts` | **WorkspaceChangeLog** (state + diff generation), **Context**, **Logger** | 12KB |
| `src/KlausHaken.ts` | Hook handler (runs via Claude Code UserPromptSubmit hook) | 3KB |
| `src/KlausKonstanten.generated.ts` | Generated config constants (from package.json) | <1KB |

---

## Build & Bundling

**esbuild configuration:**
- `--bundle`: includes dependencies (e.g., `diff` library)
- `--minify`: shrinks output
- `--external:vscode`: excludes VSCode API (provided by VSCode at runtime)
- `--platform=node`: targets Node.js, not browser
- `--sourcemap`: generates source maps for debugging

**Output:**
| Artifact | Size | Purpose |
|----------|------|---------|
| `dist/Klaus.js` | ~11KB | VSCode extension (bundled, minified) |
| `dist/KlausHaken.js` | ~1.5KB | Hook handler (bundled, minified) |

---

## Concurrency & Timing (Critical for Hook Success)

The extension must complete diff generation **within 5 seconds** (hook timeout).

**Critical Path (Synchronous, ~100ms):**
- Load state from `.json`
- Generate diffs from tracked files:
  - Read snapshots
  - Compare against current files
  - Generate unified diffs
- Consolidate results into `files`, `diffs`, `dels`
- Write `.info` file (HookData as JSON)
- Delete `.danke` file (completion signal)
- Update `.json` state file with new `lastClaude` timestamp
- Release lock

**Background Work (Asynchronous, non-blocking):**
- Write snapshot files (`fs.writeFile` with callback via `snapShot()`)
- Update `saved` Set when snapshot write completes (validates file exists)
- These happen AFTER hook returns, while Stefan continues editing

**Lock Mechanism:**
- `.lock` file exists while diff generation is in progress
- Prevents concurrent `danke()` calls
- Cleaned up in `done()` after state is saved

---

## File Locations & Gitignore

| Path | Type | In Git? | Reason |
|------|------|---------|--------|
| `.vscode/settings.json` | Config | ✓ | VSCode debug/task configuration |
| `.vscode/launch.json` | Config | ✓ | Debug launch configuration |
| `.vscode/tasks.json` | Config | ✓ | Build/test tasks |
| `.vscode/{stateFileName}.json` | State | ✗ | Ephemeral, changes every hook run |
| `.vscode/{stateFileName}/` | Snapshots | ✗ | Snapshot directory (internal use) |
| `.vscode/KlausC0deHelferData*` | ↑ | ✗ | (Default stem) |
| `.claude/settings.local.json` | Config | ✗ | Hook registration (user-specific) |

**Recommendation:** Add to `.gitignore`:
```
.vscode/KlausC0deHelferData*
.claude/settings.local.json
```

---

## Future: v1.0 Continuous Mode

v1.0 will add **real-time diff injection via MCP** while Stefan is coding:
- Ephemeral diffs are sent as context notifications (not blocking)
- Klaus can provide proactive suggestions, consistency checks, security flags
- Stefan sees results while still editing, not just at prompt time
- Requires different architecture: MCP server injection instead of hook-based polling
- Open question: Will `Erkannt` enum be utilized more fully, or is it overengineered for current needs?

---

## Version Status

**Current:** v0.6.0-a20 (onDemand mode, stable)
- ✓ Ephemeral diffs (not persisted)
- ✓ Consolidated diff generation (1kB/file, not cascading)
- ✓ Thread-safe snapshot updates with async callbacks
- ✓ File deletion tracking (`dels` Set)
- ✓ Action-based routing in `push()` (erstellt/modifiziert → files, entfernt → dels)
- ✓ Structured HookOutput with categorized changes
- ✓ Parameter clarity (`onlyCreation` instead of cryptic `c`)
- ⏳ Extended testing phase in progress

**Next:** v1.0 (continuous mode, planned)

---

## Notes for Future Claude Instances

- **This is Klaus' workspace.** The extension tracks *itself* if enabled in this workspace. Disable it here to avoid recursive snapshot loops.
- **Settings are workspace-scoped.** Different workspaces can have different `stateFileName`, `includePatterns`, `awarenessMode`, etc.
- **Snapshots are relative paths.** All file paths in `saved`, `files`, `dels`, and `diffs` are relative to workspace root.
- **The `.lock` file is important.** Don't delete it manually — it's the concurrency guard.
- **Hook is workspace-specific.** Each workspace's `.claude/settings.local.json` has its own hook entry.
- **`Erkannt` enum routing is smart, not overengineering.** `push()` routes based on action (erstellt/modifiziert → files, entfernt → dels), but `diff()` decides based on state (snapshot exists? file exists?), not action. This separation of concerns is intentional.
- **Parameter naming matters.** The rename `c` → `onlyCreation` made a design bug (missing onCreate) immediately visible. Good names expose bad architecture.
