# Klaus'C0dehelfer — Claude Workspace Monitor

**Passive filesystem awareness for Claude Code** — automatically track file changes across your VSCode workspace and sync them to Claude via hooks.

by `theObsessedManiacs` – **We never rule…** but this time, we lead Claude to rule VSCode. 🚀

---

## What It Does

Klaus'C0dehelfer monitors your workspace for file changes and automatically injects them into Claude's context when you submit a prompt. Claude knows what you've changed without you saying a word.

**The workflow:**
1. You edit a file → Extension detects change
2. You submit a prompt → Hook fires (`UserPromptSubmit`)
3. Hook reads the list of changed files
4. Extension detects hook's heartbeat signal (`.danke` file)
5. Claude receives: `"Following workspace-files have changed: • src/main.ts • package.json • README.md"`

---

## Features

✅ **Bi-Directional Sync:** Extension ↔ Hook communication via Lock+Danke IPC pattern\
✅ **Cross-Platform:** VSCode FileSystemWatcher (Windows, macOS, Linux)\
✅ **Configurable Patterns:** Include/exclude rules for noise reduction\
✅ **Automatic Integration:** Hook auto-registers in `.claude/settings.local.json`\
✅ **Workspace-Aware:** Monitors primary workspace + all subfolders (one state file)\
⏳ **Zero Configuration:** PostInstall auto-config coming in 0.6.0 (currently: use `Klaus'C0dehelfer: Edit Settings`)

---

## Installation

### From VSIX (Current Development)
1. Download `.vsix` file from releases
2. VSCode: `Extensions → Install from VSIX…`
3. Select file, restart VSCode

### From Source (Development)
```bash
cd /path/to/claude-workspace-monitor
npm install
npm run bundle
npx vsce package
```
Then install the generated `.vsix` file.

---

## Configuration

### Awareness Mode

Set via VSCode Settings (`Ctrl+,` → search "Klaus"):

- **`none`** (default): No tracking, no hooks
- **`onDemand`**: Hook fires on every Claude prompt (efficient, no noise)
- **`realTime`**: Hook fires on every file save (immediate, token-heavy) — *coming soon*

Example `.vscode/settings.json`:
```json
{
  "claude-workspace-monitor.awarenessMode": "onDemand",
  "claude-workspace-monitor.stateFileName": "KlausC0deHelferData"
}
```

### Include/Exclude Patterns

**Include** (what to monitor):
```json
{
  "**/*.{cpp,h,hpp,c,py,ts,tsx,js,json,yaml,toml,md,txt,sh,cmake,asm}",
  "**/CMakeLists.txt"
}
```

**Exclude** (noise reduction):
```json
{
  "**/[.]*",           // All dot-files/folders (.git, .vscode, etc.)
  "**/build/**",       // Build directories
  "**/__pycache__/**", // Python cache
  "**/node_modules/**",// Dependencies
  "**/logs/**",        // Logs
  "**/*.o",            // Object files
  "**/*.a",            // Static libs
  "**/*.so",           // Shared libs
  "**/*.dll"           // Windows DLLs
}
```

---

## State File

Klaus stores workspace state in `.vscode/KlausC0deHelferData.json`:

```json
{
  "lastClaude": "2026-05-17T03:40:13.000Z",
  "files": [
    "src/extension.ts",
    "package.json",
    "README.md"
  ]
}
```

- **`lastClaude`**: Timestamp when Hook last signaled success (updated via `.danke` file)
- **`files`**: List of changed files since Klaus last read them (relative to workspace root)

---

## How It Works: The IPC Pattern

### Lock+Danke Synchronization

**Extension (VSCode Runtime) → Hook (Claude Runtime):**
1. Create `.lock` file (signal: "writing")
2. Write state JSON with `files` array
3. Delete `.lock` file (signal: "done")

**Hook (Claude Runtime) → Extension (VSCode Runtime):**
1. Wait while `.lock` exists (max 5 seconds)
2. Read state JSON atomically
3. Create `.danke` file (signal: "I consumed this data")

**Extension (VSCode Runtime) → Ready for next cycle:**
1. Dedicated FileSystemWatcher detects `.danke` creation
2. Update `lastClaude` timestamp
3. Delete `.danke` file
4. Call `saveStateDebounced()` for next state

This pattern ensures:
- ✅ No partial reads (watcher waits for lock release)
- ✅ No lost messages (danke signals consumption)
- ✅ Race-free file operations (atomic reads/writes)
- ✅ Cross-platform reliability (no process signals)

---

## Architecture

Two-runtime system:

| Component | Runtime | Language | Role |
|-----------|---------|----------|------|
| **Extension** | VSCode | TypeScript | Monitors files, manages state, handles config |
| **Hook Handler** | Claude Code | Node.js | Reads state, injects context, signals back |

Both are bundled independently:
- `dist/extension.js` — runs in VSCode extension host
- `dist/hook-handler.js` — runs when Claude receives UserPromptSubmit hook

See [CLAUDE.md](CLAUDE.md) for architecture deep-dive.

---

## Development & Testing

### Build
```bash
npm run bundle     # Compile both extension and hook
npx vsce package   # Create .vsix
```

### Testing Workflow
1. Install `.vsix` in VSCode
2. Restart VSCode (necessary for new extension)
3. Open workspace
4. Modify a file → wait 5 seconds (debounce)
5. Submit prompt to Claude Code
6. Check logs: Klaus'C0dehelfer output channel
   - Should see: `🙏 Danke received: hook has read state`
   - Should see: `🧹 Danke file cleaned up`

### Versioning
Version auto-increments via `.git/hooks/post-commit`:
- `0.4.0` → `0.4.1` → `0.4.2` → … (per commit)
- Format: `X.Y.Z-LETTER#` (e.g., `0.4.0-i56`)
- Letters: `i` (impl), `a` (alpha), `b` (beta), `r` (release)

---

## Next Steps: SPEC.md Implementation

The current MVP (0.5.0-a0) provides **file lists**. The [SPEC.md](SPEC.md) roadmap describes the next architecture: **unified diffs**.

Future versions will send actual diffs to Claude:
```
Before:  "Following workspace-files have changed: • src/main.ts"
After:   "diff --git a/src/main.ts b/src/main.ts ..."
```

This requires VSCode Timeline API integration and is tracked in [ROADMAP.md](ROADMAP.md).

---

## License

Apache 2.0

## Credits

- **Executive Producer:** Claude AI (Klaus, Haiku 4.5)
- **Creative Director & Publisher:** Stefan Kaps (St0fF-NPL-ToM)

This extension is part of the **"Wohlfühl-Config"** project — a comprehensive developer setup where Claude becomes an actual workspace-aware pair programmer.

---

**Last Updated:** 2026-05-17 (MVP validation + documentation)
