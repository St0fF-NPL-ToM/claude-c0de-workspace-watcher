# Klaus'C0dehelfer — MultiDiff Specification

## Overview

Unified diff-generation system for both On-Demand and Real-Time Claude awareness modes. Both modes use identical data structures and algorithms; only the trigger and transfer mechanism differs.

Single persistent state file: `.vscode/KlausC0deHelferData.json`

## Current Status (2026-05-16)

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
Current implementation lists changed files. Next phase replaces file list with actual `git diff`-style unified diffs via `diffToKlaus()` function. Architecture decision pending: whether hook can call extension functions directly via IPC, or extension must pre-generate diffs.

## Data Model

### Persistent State: `.vscode/KlausC0deHelferData.json`

```json
{
  "last_injection": "2026-05-14T08:15:30.000Z",
  "changed_files": ["src/main.cpp", "src/utils.ts"]
}
```

- `last_injection`: Timestamp when Klaus Haiku last received info
- `changed_files`: Array of file paths that changed since `last_injection`
  - only used in `Prompt Mode`
---

## Core Functions

### Core Output Function: Stream VSCode Diffs to Klaus Haiku

```typescript
function diffToKlaus(filename: string, since_timestamp: string): void
  // Query VSCode Timeline for version at since_timestamp
  // Generate unified diff: version_at_timestamp → current_version
  // Output to stdout (raw, standard git diff format)
```

### Mode P (PromptInjection) — On-Demand

**Function:** `diffChangesToKlaus()`

**Flow:**
1. Read `.vscode/KlausC0deHelferData.json`
2. For each file in `changed_files`:
   - Call `diffToKlaus(filename, last_injection)`
   - Pipes stdout → Klaus Haiku context
3. Update JSON:
   - Set `last_injection = now`
   - Clear `changed_files = []`

**Trigger:**
- Hook (`beforeAnswer`): Call `plugin.diffChangesToKlaus()`
- File watcher detects file change: Update `changed_files` array (unified add)
- Plugin configuration init: Set `last_injection = now`, `changed_files = []`

**Token Cost:** Minimal (1 diff generation per prompt)

---

### Mode C (ContinuousInjection) — Real-Time

**Function:** `diffFileToKlaus(filename: string)`

**Flow:**
1. Read `last_injection` from `.vscode/KlausC0deHelferData.json`
2. Call `diffToKlaus(filename, last_injection)`
3. Pipes stdout → Klaus Haiku (notification, Palimm! 🔔)
4. Update JSON:
   - Set `last_injection = now`

**Trigger:**
- Hook (`onSave`): File watcher detects change → Call `plugin.diffFileToKlaus(filename)`
- Plugin configuration init: Set `last_injection = now`

**Token Cost:** Per-file notification overhead (token-expensive)

---

## Implementation Requirements

### VSCode Timeline Integration

- Query VSCode FileChangeEvent history
- Get file content at specific timestamp
- Generate unified diff: `content_at_T` → `current_content`
- Output format: Standard `git diff` (unified diff)

### Hook Configuration

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

## Implementation Notes

**Data File:** `.vscode/KlausC0deHelferData.json`
- Single source of truth
- Updated after each diff injection
- Git ignored

**Diff Output:**
- TODO find out!

**Timestamps:**
- ISO 8601 format (UTC)
- Millisecond precision

**Git Ignore:**
```
.vscode/KlausC0deHelferData.json
```

---
