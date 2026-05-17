# Klaus'C0dehelfer — Roadmap & Todo

## ✅ Completed

### Phase 1: Core Architecture
- [x] VSCode Extension structure (onStartupFinished activation)
- [x] File system monitoring with FileSystemWatcher
- [x] State persistence to `.vscode/KlausC0deHelferData.json`
- [x] Logger with LogOutputChannel and log levels
- [x] Hook integration for Claude Code (UserPromptSubmit)

### Phase 2: Debug & Logging
- [x] Comprehensive debug logging throughout extension
- [x] Truthful activation messages (scharf vs. latschig)
- [x] State file path logging in all critical functions

### Phase 3: Configuration
- [x] `awarenessMode` setting (none/onDemand/realTime)
- [x] `stateFileName` config (stem-based, .json auto-appended)
- [x] ConfigurationChangeEvent handlers for both settings
- [x] Global vs. Workspace settings handling

### Phase 4: Workspace Handling
- [x] onDidChangeWorkspaceFolders listener
- [x] initializeWorkspace() function for clean initialization
- [x] State file path architecture (relative → absolute on access)
- [x] Workspace check before file operations

### Phase 5: Bug Fixes & Cleanup (Session 2026-05-16)
- [x] Remove redundant onDidSaveTextDocument listener
- [x] Enable/disable FileSystemWatchers via awarenessMode
- [x] Make include/exclude patterns configurable via settings
- [x] Remove dead code (getFileMtime, duplicate handlers)
- [x] Fix dot-file exclusion pattern (**/[.]*)
- [x] Reset version to 0.4.0 (honest status quo)
- [x] Implement automatic patch version bumping via git hook
- [x] Document Session 2 learnings in COLLABORATION.md

---

## 🔄 In Progress / Under Review

### Testing & Verification (Session 2026-05-16)
- [x] Test with awarenessMode=none → no tracking
- [x] Test with awarenessMode=onDemand → tracking active
- [x] Verify onDidChangeWorkspaceFolders triggers correctly
- [x] Verify awarenessMode + stateFileName config changes work together
- [x] Verify dot-file exclusion works (no .claude/*, .vscode/* tracked)

---

## ⏳ Pending / Future

### Hook Handler (Low Priority) Features (SPEC.md Implementation)
REWRITE!
- [ ] Implement MultiDiff architecture:
  - [ ] `diffToKlaus(filename, timestamp)` — query VSCode Timeline, generate unified diffs
  - [ ] `diffChangesToKlaus()` — Mode P (On-Demand): loop through changed files, pipe diffs
  - [ ] `diffFileToKlaus(filename)` — Mode C (Real-Time): single file notification on save
- [ ] Replace simple file list with actual diffs in hook output
- use correct API to access function of Plugin from Hook-Call executed by claude_code

### Performance & UX
- [x] Deactivate FileSystemWatchers when `awarenessMode=none` ✓ Done in Phase 5
- [x] Add debounce/throttle to setupWorkspaceWatchers if needed ✓ 5-second debounce on state save (in place)

### Documentation
- [ ] Update README.md with installation instructions (not just file-picker, but actual workflow)
  - [ ] **Blocked by**: GitHub namespace claim (theObsessedManiacs) — currently private repo
- [ ] Document hook protocol (what hook receives, what it outputs)
- [ ] Document stateFileName stem-based config with examples

### Publishing
- [ ] **Blocked**: theObsessedManiacs group approval before republishing to Open VSX
  - [ ] Code review
  - [ ] UX feedback on awarenessMode dialog
  - [ ] Group decision on shipping

---

## 📋 Open Questions / Decisions

Denk lieber nach anstelle dumme Fragen zu stellen.  Ich weiss, Fragen sind nie dumm.  Das ist nur die Theorie.  Fragen, deren Antwort 2 Gedanken entfernt liegen sind in meinen Augen dumm, weil der Frager nicht zuende gedacht hat.

## 🔗 Related Issues / Refs

- SPEC.md: Describes future MultiDiff architecture (not yet implemented)
- COLLABORATION.md: Full story of development journey
- SESSION_2025-05-15.md: Today's session notes
- CLAUDE.md: Project instructions for Claude Code

---

---

### Phase 6: MVP Integration (Session 2026-05-17)
- [x] Implement dedicated `.danke` FileSystemWatcher
- [x] Fix double-path bug in loadState/saveState
- [x] Remove debug log and dead code from trackFileChange
- [x] Validate bi-directional sync (Lock+Danke pattern)
- [x] Verify hook receives file list in additionalContext
- [x] Test end-to-end: file change → prompt → Claude context injection
- [x] Update documentation (README.md, COLLABORATION.md, ROADMAP.md)
- [x] Bump version to 0.5.0-a0 (Alpha)

---

## Current State (0.5.0-a0 — MVP)

✅ **MVP is complete and validated.**

**What works:**
- ✅ Extension loads, initializes, monitors files
- ✅ File tracking with configurable include/exclude patterns
- ✅ Hook integration: automatic config, hook fires on UserPromptSubmit
- ✅ Bi-directional sync (Lock file for write, .danke file for read signal)
- ✅ Claude receives file list in hook `additionalContext`
- ✅ State persistence, config changes, workspace switching
- ✅ Comprehensive logging and debug output
- ✅ All bug fixes from Session 2 applied

**Not yet implemented (next phase):**
- ❌ **Diffs instead of file lists** — currently sends `"Following workspace-files have changed: • src/main.ts"`. SPEC.md calls for actual unified diffs.
- ❌ **realTime mode** — awarenessMode accepts it but shows "coming soon"
- ❌ **VSCode Timeline API integration** — for efficient diff generation

---

## ⏳ Next Phase: UX Polish & SPEC.md (0.6.0)

### UX Enhancement: PostInstall Auto-Configuration
- [ ] Implement `onExtensionInstalled` hook or welcome screen
- [ ] Auto-set sensible defaults: `awarenessMode = onDemand`, hook auto-register
- [ ] Show warning if hook registration fails (e.g., no Claude Code extension)
- [ ] Link to `Klaus'C0dehelfer: Edit Settings` command for manual override

**Why:** "Zero Configuration" is a promise, not yet implemented. Users shouldn't have to manually hunt down settings after install.

### SPEC.md Implementation: Unified Diffs

The [SPEC.md](SPEC.md) roadmap describes the architecture for **unified diffs**:

Instead of:
```
Following workspace-files have changed:
  • src/main.ts
```

We'll send:
```
diff --git a/src/main.ts b/src/main.ts
index abc1234..def5678 100644
--- a/src/main.ts
+++ b/src/main.ts
@@ -42,3 +45,5 @@
 const oldCode = 1;
-const removed = 2;
+const added = 3;
```

**Required:**
- Query VSCode Timeline API for change history
- Generate unified diffs per file
- Transport diffs via hook output
- Test with realTime mode

---

## Last Updated
2026-05-17 (Session 3 completion: MVP validated, documentation updated, version bumped to 0.5.0-a0)
