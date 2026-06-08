# Klaus'C0dehelfer — Release Notes

## v0.5.2-a2 (Pre-Release)

**Passive filesystem awareness for Claude Code** — automatically track file changes and sync them to Claude via hooks.

---

## What's New

### Architecture: Separation of Concerns (Phase 10)

Complete refactoring for clarity and testability:

- **Augen (Eyes)** — FileSystemWatcher management
  - Centralizes file change detection
  - Handles multi-workspace folders correctly
  - Manages `.danke` signal watchers

- **Hand (Hand)** — Hook lifecycle management
  - Installs/removes hooks in `.claude/settings.local.json`
  - Handles hook versioning via argument filtering
  - Idempotent operations (safe to call repeatedly)

- **K (`Klaus`-the brain)** — Extension coordination
  - Semantic lifecycle methods: `gutenMorgen()` (startup), `guteNacht()` (shutdown), `schlaf()` (cleanup)
  - Config changes trigger refresh without restart
  - Clean state transitions

### Build Pipeline: Single Source of Truth

- **generatePackageConstants.ts** — Pre-build generator
  - Auto-generates `KlausKonstanten.generated.ts` from `package.json`
  - Eliminates manual config duplication
  - Maintains consistency across enums (CKey, ConfigKey, Default)

### Documentation: Implementation-Complete

- **SPEC.md** — Now documents evolution: Vision (2026-05-16) → Realized Implementation (Methode 3)
  - Table of Contents for human readability
  - Visionary sections clearly marked
  - Future enhancement roadmap (v0.7.0+: periodic refresh, garbage collection)

---

## Features for testing

✅ **Ephemeral Diffs (v0.6.0)** — Snapshot-based diff generation
  - Extension tracks file changes
  - Diffs generated against previous snapshots
  - Hook receives atomic state via `.json` file

✅ **Configurable** —
  - `awarenessMode`: none/onDemand/realTime
  - `stateFileName`: customizable stem (default: KlausC0deHelferData)
  - Include/exclude patterns for noise reduction

✅ **Cross-Platform** — VSCode FileSystemWatcher
  - Windows, macOS, Linux support
  - Multi-workspace awareness

---

## Status

**Code-Complete, Testing-Pending**

- ✅ Architecture & Design — Single `.json` file, snapshot-based diffs
- ✅ Extension (Klaus.ts) — File tracking, danke callback, workspace setup
- ✅ Hook (KlausHaken.ts) — Reads `.json`, formats for Claude, signals receipt
- ✅ State Manager (WorkspaceChangeLog) — load/save/lock/done/danke methods
- ✅ Diff Generation (push method) — unified diffs via jsdiff with whitespace-insensitive context
- ✅ Lock+Danke IPC — atomic coordination, race-condition-free
- ✅ Separation of Concerns — Augen (watcher), Hand (hook), K (state machine)
- ✅ Build Pipeline — Pre-build generator for constants
- ⏳ **End-to-End Testing** — Awaiting real-world workspace validation

**Next Phase (v0.7.0+):**
- Periodic `saved`-set refresh (detect manual snapshot deletions)
- Garbage collection for old snapshots (auto-cleanup after 2 weeks)
- Refined FileSystemWatcher (onCreate/onDelete for snapshots)
- PostInstall auto-configuration

---

## Installation

### From Pre-Release VSIX
1. Download `.vsix` from [GitHub Releases](https://github.com/theObsessedManiacs/claude-c0de-workspace-watcher/releases)
2. VSCode: `Extensions → Install from VSIX…`
3. Select file, restart VSCode

### Build from Source
```bash
git clone https://github.com/theObsessedManiacs/claude-c0de-workspace-watcher
cd claude-c0de-workspace-watcher
npm install
npm run compile
# Run in VSCode debug mode (F5)
```

---

## Configuration

### Enable Workspace Monitoring

1. **Open Settings:**
   - Command Palette (`Ctrl+Shift+P`) → `Klaus'C0dehelfer: Edit Settings`
   - Or manually: `.vscode/settings.local.json`

1. **Select Configuration Level:**
   - VSCode allows different configuration levels: `User (global)` | `Workspace` | `(Workspace)Folder`
   - ⚠️ we strongly suggest to not set a global configuration - keep it globally unconfigured!
   - use `Workspace` or `Folder` config levels

1. **Set Awareness Mode:**
   ```json
   {
     "claude-c0de-workspace-watcher.awarenessMode": "onDemand"
   }
   ```
   - `none` — no monitoring
   - `onDemand` — track on each prompt submission
   - `realTime` — continuous tracking (token-expensive)

1. **Optional: Customize State Filename**
   ```json
   {
     "claude-c0de-workspace-watcher.stateFileName": "MyCustomStateFileName"
   }
   ```

---

## How It Works

1. **File Change Detection**
   - FileSystemWatcher monitors workspace for changes
   - Changed files added to state file (`.vscode/KlausC0deHelferData.json`)

2. **On Prompt Submission**
   - Hook fires (`UserPromptSubmit` event)
   - Reads current state atomically
   - Formats file list + diffs as additional context
   - Creates `.danke` signal file

3. **State Cleanup**
   - Extension detects `.danke` file
   - Moves tracked files to snapshot directory
   - Updates `lastClaude` timestamp
   - Clears ready-for-next-prompt

---

## Known Limitations

- ⏳ **Zero Configuration** → Coming in v0.6.0 (currently: manual settings required)
- ⏳ **Large Files** → Handled gracefully, but not yet optimized for massive diffs
- ⏳ **Binary Files** → Detected, excluded from diffs

---

## Development

### Architecture Documentation
- [SPEC.md](docs/SPEC.md) — Complete specification (vision + implementation)
- [ROADMAP.md](docs/ROADMAP.md) — Phase-by-phase development history
- [COLLABORATION.md](docs/COLLABORATION.md) — Development journal (Phasen 1-22)

---

## Credits

**Authors:** Klaus Haiku 4.5 (AI), Stefan Kaps (Human)\
**Philosophy:** Separation of Concerns, Single Source of Truth, Epistemic Humility\
**License:** Apache 2.0

---

## Feedback & Issues

Found a bug? Have a feature request?\
→ [GitHub Issues](https://github.com/theObsessedManiacs/claude-c0de-workspace-watcher/issues)

---

**Status:** Pre-Release (Alpha) — Code complete, testing-pending. Ready for real-world workspace validation.
