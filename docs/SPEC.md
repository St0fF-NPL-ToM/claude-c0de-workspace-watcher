# Klaus'C0dehelfer — MultiDiff Specification

## Table of Contents

- [Overview](#overview)
- [Visionary Core Functionality (2026-05-16)](#visionary-core-functionality-2026-05-16)
- [Data Model](#data-model)
- [Core Functions [VISION]](#core-functions-vision)
- [Requirements](#requirements)
- [Implementation: Methode 3 — Snapshot-Based Diffs](#implementation-methode-3--snapshot-based-diffs)

---

## Overview

Unified diff-generation system for both On-Demand and Real-Time Claude awareness modes. Both modes use identical data structures and algorithms; only the trigger and transfer mechanism differs.

**Current implementation:** Single persistent state file with snapshot-based diffs.

---

## Visionary Core Functionality (2026-05-16)

This section documents the original vision and early prototyping from 2026-05-16.

**✅ Working (Phase 1: File Listing)**
- VSCode Extension monitors file changes via `FileSystemWatcher`
- Hook Handler executes on `UserPromptSubmit` event (confirmed in testing)
- File list is successfully injected as `additionalContext` to Claude Code
- Hook runs within VSCode context (can access workspace filesystem)

**Example Output (tested):**
```json
{
  "additionalContext": "📝 Klaus'C0dehelfer detected file changes since last prompt:\n  • SESSION_2025-05-15.md\n  • COLLABORATION.md\n  • ROADMAP.md"
}
```

**⏳ Next Phase: Unified Diffs**
Current vision proposed replacing file list with actual `git diff`-style unified diffs via `diffToKlaus()` function. Architecture decision was pending: whether hook can call extension functions directly via IPC, or extension must pre-generate diffs.

---

## Data Model

### Persistent State: `.vscode/KlausC0deHelferData.json`

**Visionary format (2026-05-16):**
```json
{
  "last_injection": "2026-05-14T08:15:30.000Z",
  "changed_files": ["src/main.cpp", "src/utils.ts"]
}
```

**Actual format (v0.5.1+):**
```json
{
  "lastClaude": "2026-06-03T12:00:00.000Z",
  "files": ["src/main.ts", "src/utils.ts"],
  "saved": ["src/main.ts"],
  "diffs": ["diff --git a/src/main.ts b/src/main.ts\n..."]
}
```

---

## Core Functions [VISION]

This section documents the original architectural vision from May 2026.

### Core Output Function: Stream VSCode Diffs to Klaus Haiku

**Visionary concept:**
```typescript
function diffToKlaus(filename: string, since_timestamp: string): void
  // Query VSCode Timeline for version at since_timestamp
  // Generate unified diff: version_at_timestamp → current_version
  // Output to stdout (raw, standard git diff format)
```

### Mode P (PromptInjection) — On-Demand

**Visionary Function:** `diffChangesToKlaus()`

**Flow:**
1. Read `.vscode/KlausC0deHelferData.json`
2. For each file in `changed_files`:
   - Call `diffToKlaus(filename, last_injection)`
   - Pipes stdout → Klaus Haiku context
3. Update JSON:
   - Set `last_injection = now`
   - Clear `changed_files = []`

**Token Cost:** Minimal (1 diff generation per prompt)

### Mode C (ContinuousInjection) — Real-Time

**Visionary Function:** `diffFileToKlaus(filename: string)`

**Flow:**
1. Read `last_injection` from `.vscode/KlausC0deHelferData.json`
2. Call `diffToKlaus(filename, last_injection)`
3. Pipes stdout → Klaus Haiku (notification)
4. Update JSON:
   - Set `last_injection = now`

**Token Cost:** Per-file notification overhead (token-expensive)

---

## Requirements

### VSCode Timeline Integration (Visionary)

- Query VSCode FileChangeEvent history
- Get file content at specific timestamp
- Generate unified diff: `content_at_T` → `current_content`
- Output format: Standard `git diff` (unified diff)

### Hook Configuration (Visionary)

**On-Demand (PromptInjection):**
```json
{
  "hooks": {
    "beforeAnswer": "plugin.diffChangesToKlaus() → stdout to Klaus Haiku"
  }
}
```

**Real-Time (ContinuousInjection):**
```json
{
  "hooks": {
    "onSave": "plugin.diffFileToKlaus(filename) → notify Klaus Haiku"
  }
}
```

---

## Implementation: Methode 3 — Snapshot-Based Diffs

After discovering that VSCode's Timeline API was not accessible, the team pivoted to a simpler, more elegant approach: **Methode 3**, snapshot-based diffs. This replaced the visionary design with a filesystem-based solution.

### Architecture: Single-File System with Snapshots

**User-Configurable STEM:** Default `KlausC0deHelferData`, customizable via `stateFileName` setting

**File Structure:**
```
${workspace_root}/.vscode/
  ├── STEM.json               ← STATE + CONTENT: WorkspaceChangeLog
  ├── STEM.json.lock          ← LOCK: protects writes while generating diffs
  ├── STEM.json.danke         ← SIGNAL: Hook signals "I read the content"
  └── STEM/                   ← Snapshots directory (per workspace, preserves file history)
```

### State Format

**STEM.json (Unified State + Content):**
- `lastClaude: string` — timestamp of last report to Claude
- `files: Set<string>` — current workspace changes since last `danke()`
- `diffs: Array<string>` — recorded unified diffs since `lastClaude`

### Design Advantages

1. **Hook stays minimal:** Just transforms `.json`, doesn't generate diffs
2. **Extension owns complexity:** Diffs, filtering, content assembly all here
3. **Future-proof:** When VSCode integrates diff generation, swap `push()` implementation only
4. **Clear responsibilities:** State internal, Content for external consumption
5. **Scalable:** Easy to add new content types (warnings, lint messages, etc.)

### Core Implementation: WorkspaceChangeLog

**State Manager + Diff Coordinator:**

```typescript
export class WorkspaceChangeLog {
  lastClaude: string
  files: Set<string>           // Files changed since last danke()
  saved: Set<string>           // Files with snapshots (can generate diffs)
  flock: string                // Lock file path (internal tracking)

  // Methods
  load(fn: string): string
  save(fn: string, noUnlock?: boolean): string
  lock(fn: string): void
  done(): void

  push(relFilePath: string): boolean
    // File changed → generate diff (if snapshot exists) and add to content
    // Returns: true if newly added, false if already tracked

  danke(fn: string, thankYouPath: string): void
    // Atomic state machine: lock → merge files into saved → clear files →
    // save state → snapshot loop (unlocked) → release lock
}
```

### Lock+Danke IPC Pattern

**Extension holds lock** while: modifying state, generating diffs, updating snapshots
**Hook waits** for lock to release, then reads consistent data atomically
Ensures Hook never sees partial/inconsistent state

### Flow: File Change → Diff Generation → Hook Injection

1. File watcher detects change → `trackFileChange(relPath)`
2. `trackFileChange()` filters excluded paths
3. Calls `K.log.push(relPath)` — generates diff + adds to content
4. Returns true if newly added, false if already tracked
5. Debounced state save via `K.saveStateDebounced()`

When hook fires:
1. Hook waits for lock release (max 5 seconds)
2. Reads atomic `STEM.json`
3. Formats diffs + files for Claude context
4. Creates `.danke` file to signal completion

On `danke()` (Hook completion signal):
1. Acquire lock
2. Copy `files` to snapshot list, clear `files`
3. Merge snapshot list into `saved` (now these files can generate diffs)
4. Update `lastClaude` timestamp
5. Persist state (lock still held)
6. Save snapshots to disk
7. Release lock

### Status

**v0.5.1-a0 (Code-Complete, Testing-Pending):**
- ✅ Architecture & Design — Single `.json` file, snapshot-based diffs
- ✅ Extension (Klaus.ts) — File tracking, danke callback, workspace setup
- ✅ Hook (KlausHaken.ts) — Reads `.json`, formats for Claude, signals receipt
- ✅ State Manager (WorkspaceChangeLog) — load/save/lock/done/danke methods
- ✅ Diff Generation (push method) — jsdiff.createTwoFilesPatch with whitespace-insensitive context
- ✅ Lock+Danke IPC — atomic coordination, race-condition-free
- ✅ `saved` Set — Populated at init via filesystem-walk of snapspace (not persisted)
- ⏳ End-to-end Testing — Code complete, awaiting real-world workspace validation

---

## Future Enhancements (v0.7.0+)

### Snapshot Lifecycle Management

1. **Periodic `saved`-Set Refresh**
   - Re-scan snapspace at regular intervals (e.g., on config change, workspace focus)
   - Detects if snapshots were manually deleted
   - Keeps `saved` in sync with actual filesystem state

2. **Garbage Collection for Old Snapshots**
   - Check mtime of snapshot files
   - Delete snapshots older than 2 weeks
   - Prevents unbounded growth of `.vscode/STEM/` directory

3. **Refined FileSystemWatcher Pattern**
   - Split watchers by event type:
     - `onCreate` → Immediately capture snapshot
     - `onDelete` → Remove corresponding snapshot (if exists)
   - More efficient snapshot management aligned with actual file lifecycle

---
