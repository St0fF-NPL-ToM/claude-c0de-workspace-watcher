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

## Current State (0.4.x)

**What works:**
- ✅ Extension loads and initializes
- ✅ File tracking with configurable patterns (include/exclude)
- ✅ FileSystemWatcher respects awarenessMode
- ✅ State persistence and configuration working
- ✅ Hook integration (writes settings, awaits hook calls)
- ✅ Bug fixes from Session 2 applied and verified

**What's missing for MVP:**
- ❌ **Hook handler never runs** — hook-handler.ts is not integrated. The extension writes the hook config but never actually processes hook calls
- ❌ **No diffs to Claude** — just file lists in JSON, not actual unified diffs from VSCode Timeline
- ❌ **realTime mode not implemented** — currently shows "coming soon"
- ❌ **No user-facing workflow documentation**

**Current constraint:**
We have 0.4.x: a solid **foundation** with bugs fixed. Not yet MVP because the actual Klaus-integration (hook handler) is incomplete. The extension knows *what changed*, but doesn't yet *tell Klaus with diffs*.

**Next phase (0.5.x):**
Implement the hook handler to actually send diffs to Klaus. That's what makes it a minimum viable product.

---

## Last Updated
2026-05-16 (Session 2 completion: bug fixes, honest versioning, cleanup)
