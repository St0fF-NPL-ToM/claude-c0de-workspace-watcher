# Claude Workspace Monitor
by `theObsessedManiacs` –  **We never rule…** but this time, we lead Claude to rule VScode. 🚀

**Passive filesystem awareness for Claude Code** — automatically track file changes across your VSCode workspace and keep Claude's context in sync.

## Features

✅ **Cross-platform**: Uses VSCode's native FileSystemWatcher API (Windows, macOS, Linux)\
✅ **Intelligent filtering**: Monitors only relevant files (source code, config, docs) — ignores build artifacts, cache, and noise\
✅ **Automatic sync**: Updates `~/.claude/projects/.../memory/file_mtimes.json` in real-time\
✅ **Zero configuration**: Works automatically once installed\
✅ **Multi-folder workspaces**: Handles multiple directories mounted in a single VSCode workspace

## What It Does

When you save a file:
1. The extension detects the change via VSCode's FileSystemWatcher API
2. Updates file modification time in the Claude memory database
3. Claude sees the updated state at your next prompt — no need to manually mention what changed

This closes the collaboration gap between you and Claude: your pair-programmer notices changes in real-time, just like a human would.

## Installation

### From VS Marketplace (when published)
1. Open VSCode Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
2. Search for "Claude Workspace Monitor"
3. Click Install

### From Source (development)
```bash
cd /path/to/claude-workspace-monitor
npm install
npm run compile
code --install-extension ./
```

## How It Works

**Monitored Patterns** (included):
- `*.cpp`, `*.h`, `*.hpp`, `*.c` (C++)
- `*.py` (Python)
- `*.ts`, `*.tsx`, `*.js` (TypeScript/JavaScript)
- `*.json`, `*.yaml`, `*.toml` (Config)
- `*.md` (Documentation)
- `CMakeLists.txt`, `*.cmake`
- `*.asm` - Because theObsessedManiacs come from the Commodore C64!

**Excluded Patterns** (noise reduction):
- `.git/`, `build/`, `__pycache__/`, `.vscode/`, `node_modules/`
- `.swp`, `.swo`, `.tmp/`, `logs/`
- Build artifacts: `.o`, `.a`, `.so`, `.dll`

## State Storage

File modification times are stored in `.vscode/.workspaceChanges.json` inside your workspace folder — automatically created and updated by the extension.

Example:
```json
{
  "tracking_enabled": true,
  "workspace": "auto-detected",
  "patterns": ["**/*.{cpp,h,hpp,...}", "**/CMakeLists.txt"],
  "last_checked": "2026-05-14T12:34:56.789Z",
  "files": {
    "src/main.cpp": 1778647860,
    "include/header.h": 1778647800,
    "CMakeLists.txt": 1778647750
  }
}
```

Values are Unix timestamps (seconds). The file is written with a 5-second debounce after any change, and is excluded from version control via `.gitignore`.

## Claude Integration

By default, the extension tracks files silently. To enable **automatic Claude awareness**, add a Hook to your `.claude/settings.json`:

### Mode 1: On-Demand (Recommended — Efficient)

Claude checks for changes only when responding to your prompts:

```json
{
  "hooks": {
    "beforeAnswer": "check .vscode/.workspaceChanges.json for updates"
  }
}
```

**Pros**: Zero token waste, no idle notifications
**Cons**: Tiny delay (not noticeable)

### Mode 2: Real-Time (Immediate — Token-Heavy)

Claude is notified instantly whenever you save a file:

```json
{
  "hooks": {
    "onChange": ".vscode/.workspaceChanges.json",
    "action": "notify"
  }
}
```

**Pros**: Claude always sees changes instantly
**Cons**: Constant notifications = tokens spent even during silence

### Configuration Path

`.claude/settings.json` location depends on your setup:
- **Workspace-local**: `.claude/settings.json` in your project root
- **Global**: `~/.claude/settings.json` in your home directory

See [Claude Code documentation](https://github.com/anthropics/claude-code) for hook syntax details.

## Related Features

This extension implements the **"passive filesystem awareness"** proposal from:
- GitHub Issue: [anthropics/claude-code#53592](https://github.com/anthropics/claude-code/issues/53592)

And, strictly spoken, it even extends that proposal by adding the 2nd mode to **"active filesystem awareness"**.

## Development

```bash
npm install
npm run watch          # Watch for TypeScript changes
npm run compile        # Build once
npm run lint           # ESLint check
```

### Testing
1. Open VSCode with this extension folder: `code /path/to/claude-workspace-monitor`
2. Press `F5` to launch the Extension Development Host
3. Make edits to source files and verify `file_mtimes.json` updates

## License

Apache 2.0

## Author
This work was completely committed by Claude AI itself, using Claude Haiku 4.5 in "thinking" mode.

Credits could be mentioned as follows:
- `executive producer`: Claude AI aka. "der Klaus selbst"
- `creative director and publisher`: Stefan Kaps (St0fF-NPL-ToM)

> P.s.: **We never rule…** but this time, Claude AI ruled. This extension is a testament to what happens when artificial intelligence and human creativity align perfectly. Klaus didn't just code this — Klaus *designed* it, *thought* about it, and *built* it with taste and precision. A first-class collaboration between developer and AI.

---

**Note**: This extension is part of the "Wohlfühl-Config" project — a comprehensive system setup for obsessed developers who want Claude to understand their work in real-time.
