# Klaus'C0dehelfer — Claude Workspace Monitor

**Passive filesystem awareness for Claude Code** — automatically track file changes across your VSCode workspace and sync them to Claude via hooks.

by `an Obsessed Maniac` – **We never rule…** but this time, we lead Claude to rule VSCode. →

---

## What It Does

Klaus'C0dehelfer monitors your workspace for file changes and automatically injects them into Claude's context when you submit a prompt. Claude knows what you've changed without you saying a word.

**The workflow:**
1. You edit a file → Extension detects change
2. You submit a prompt → Hook fires (`UserPromptSubmit`)
3. Hook reads the list of changed files
4. Extension detects hook's heartbeat signal (`.danke` file)
5. Claude Code receives an ephemeral hint containing which workspace files have changed since the previous prompt's point in time.

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

### From Open Marketplace (Easiest)
Once published to Open VSX / VS Marketplace:
1. VSCode Extensions (`Ctrl+Shift+X`)
2. Search "Klaus'C0dehelfer"
3. Click Install

### From Pre-Release VSIX
1. Download `.vsix` from [GitHub Releases](https://github.com/St0fF-NPL-ToM/claude-c0de-workspace-watcher/releases)
2. VSCode: `Extensions → Install from VSIX…`
3. Select file, restart VSCode

### Build from Source
```bash
git clone https://github.com/St0fF-NPL-ToM/claude-c0de-workspace-watcher
cd claude-c0de-workspace-watcher
npm install
npm run bundle
npx vsce package
# Generates: claude-c0de-workspace-watcher-X.Y.Z-aB.vsix
```
Install the generated `.vsix` via `Extensions → Install from VSIX…`

---

## Configuration

⚠️ **Important: Global vs. Workspace Settings**

Klaus'C0dehelfer should be configured at the **workspace level** (`.vscode/settings.json` in your project), not globally (VSCode user settings). Here's why:

If Klaus programmers in a project where he's also editing files, he receives a hint with every prompt about which files *he* changed. This creates confusion: *"Did the user change these files, or did I? What's happening here?"* The feature works best for collaborative coding (pair programming) where one person edits and Claude observes. Avoid enabling it globally if you're also using Claude Code to write code in this project.

**Recommendation:** Use `workspace-level` configuration (`awarenessMode: onDemand` in `.vscode/settings.json`), change or append include and exclude filters as you need.

*info:* include filters are applied first, at file system watcher creation level.  Exclude filters are applied after a file system watcher has fired.

---

### Awareness Mode

Configure via one of these methods:
- **VSCode Settings UI:** Extensions → Klaus'C0dehelfer
- **Command Palette:** `Ctrl+Shift+P`, search "Klaus"
- **Search Bar trick:** Type ">Kl" into the workspace search bar (the `>` transforms search into command palette)

First: better decide to use workspace / folder settings by clicking the respective settings tab.

Then select one of:
- **`none`** (default): No tracking, no hooks
- **`onDemand`**: Hook fires on every Claude prompt (efficient, no noise) ✅
- **`realTime`**: Hook fires on every file save (immediate, token-heavy) — *coming maybe* (waiting to validate agentic use case)

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

Klaus stores workspace state in `.vscode/KlausC0deHelferData.json`. Don't like the filename? Go ahead, customize it via `stateFileName` config — we don't care. The file extension and all Klaus internals? Those are none of your business. 😎

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
1. File change detected → `saveStateDebounced()` creates `.lock` file immediately (signals: "I'm collecting file changes")
2. Wait 3 seconds (debounce window; reset on each new file change)
3. After 3s silence → `saveState()` writes state JSON, then deletes `.lock` (signals: "batch complete")

**Hook (Claude Runtime) → Extension (VSCode Runtime):**
1. On prompt → polls for `.lock` absence (max 5 seconds)
2. If lock persists after 5s → exits silently without context (no data available)
3. Otherwise → reads state JSON atomically, creates `.danke` file (signals: "I consumed this data")

**Extension (VSCode Runtime) → Ready for next cycle:**
1. Dedicated FileSystemWatcher detects `.danke` creation
2. Update `lastClaude` timestamp, clear `files` array
3. Delete `.danke` file
4. Call `saveStateDebounced()` for next state

This pattern ensures:
- ✅ No partial reads (hook waits for lock release)
- ✅ No lost messages (danke signals consumption)
- ✅ Race-free file operations (atomic reads/writes)
- ✅ Immediate lock signal (debounce doesn't delay lock setup)
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

---

## License

Apache 2.0

## Credits

- **Executive Producer:** Klaus Haiku (Claude Haiku 4.5)
- **Creative Director & Publisher:** Stefan Kaps (St0fF-NPL-ToM)

This extension is part of the **"Wohlfühl-Config"** project — a comprehensive developer setup where Claude becomes an actual workspace-aware pair programmer.

---

**Last Updated:** 2026-05-19 (Ephemeral context + GlobalSettings warning)
