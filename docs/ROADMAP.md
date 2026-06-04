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

### Phase 6: MVP Validation & Polish (Session 2026-05-17)
- [x] Implement dedicated `.danke` FileSystemWatcher
- [x] Fix double-path bug in loadState/saveState
- [x] Validate bi-directional sync (Lock+Danke pattern)
- [x] Verify hook receives file list in additionalContext
- [x] Test end-to-end: file change → prompt → Claude context injection
- [x] Update documentation (README.md, COLLABORATION.md, ROADMAP.md)
- [x] Bump version to 0.5.0-a0 (Alpha)
- [x] Fix race condition: Lock on debounce start (not in saveState)
- [x] Debounce: 5s → 3s (safety margin for Hook's max wait)
- [x] Token optimization: Remove bullet points from context
- [x] Documentation restructure: Create docs/ directory, move internal docs
- [x] Honest documentation: Zero Configuration → coming maybe for 0.6.0
- [x] Credits: Klaus Haiku as Author, Stefan Kaps as Co-Author

### Phase 7: Performance & UX (Session 2026-05-16+)
- [x] Deactivate FileSystemWatchers when `awarenessMode=none`
- [x] Debounce on state save (3-second debounce with immediate Lock signal)
- [x] Race-condition-free Lock+Danke IPC

### Phase 8: Documentation (Session 2026-05-17+)
- [x] Update README.md with installation instructions (three setup methods)
- [x] Document hook protocol (Lock+Danke IPC pattern, hook output schema)
- [x] Document stateFileName config (configuration section with examples)

### Phase 9: Testing & Verification (Session 2026-05-16 to 2026-05-17)
- [x] Test awarenessMode=none → no tracking
- [x] Test awarenessMode=onDemand → tracking active
- [x] Verify onDidChangeWorkspaceFolders triggers correctly
- [x] Verify awarenessMode + stateFileName config changes work together
- [x] Verify dot-file exclusion works (no .claude/*, .vscode/* tracked)

### Phase 10: Architecture Maturation & Ephemeral Diffs Implementation (2026-05-21 to 2026-06-03)
- [x] **Separation of Concerns:** Augen (file watching), Hand (hook management), K (state machine) — dedicated, testable classes
- [x] **Single Source of Truth:** `package.json` config → pre-build generator → `KlausKonstanten.generated.ts` (no duplication)
- [x] **Ephemeral Diffs (v0.6.0):** WorkspaceChangeLog.push() generates unified diffs via jsdiff.createTwoFilesPatch()
- [x] **Snapshot-based Diffs:** Files tracked → snapshots saved on `danke()` → diffs generated on next change
- [x] **Code Quality:** Refactored for readability (Singletons, proper separation, semantic function ordering)
- [ ] **End-to-end Testing:** Code complete and functional — awaiting real-world workspace testing

**Version:** v0.5.1-a0 → v0.6.0 (feature-complete, testing-pending)

---

## ⏳ Pending / Future

### v0.6.0: Ephemeral Diffs (Elegant Approach)

**Status:** ✅ Implementation complete. Awaiting real-world workspace testing.

See [PLAN_0.6.md](PLAN_0.6.md) for complete architecture details.

**What's Implemented:**
- ✅ WorkspaceChangeLog.push() generates unified diffs via jsdiff
- ✅ Snapshot-based system: files tracked → snapshots saved → diffs on next change
- ✅ Lock+Danke IPC: atomic state transitions, safe diff coordination
- ✅ HookData format: diffs[], files[], lastClaude timestamp
- ⏳ End-to-end testing: code complete, needs real workspace validation

### Publishing
- [ ] **Blocked**: theObsessedManiacs group approval before republishing to Open VSX
  - [ ] Code review
  - [ ] UX feedback on awarenessMode dialog
  - [ ] Group decision on shipping

---

## 🔗 Related Issues / Refs

- `SPEC.md`: Future MultiDiff architecture (0.6.0)
- `COLLABORATION.md`: Full development journey
- `SESSION_2025-05-15.md`: Session 2 notes (archived)
- `../CLAUDE.md`: Project instructions for Claude Code

---

---

### Future: v0.7.0 & Beyond

**v0.7.0 roadmap (post-v0.6.0):**
- UX Enhancement: PostInstall Auto-Configuration
- SPEC.md Implementation: Unified Diffs (if needed after real-world testing)
- Optimizations based on v0.6.0 testing results

---

## Last Updated
2026-06-03 Evening (Session: KlausHaken.ts refactoring, ephemeral diffs architecture designed, stateFileName config fixed)
