# Changelog

All notable changes to Klaus'C0dehelfer are documented here.

---

## [0.6.0] – onDemand Mode & File Deletion Tracking

**Release Date:** 2026-06-25
**Updates:**
- 0.6.0-a22: 2026-07-23, depend-a-bot found a vulnerable dependency - updated all dependencies.

### Overview

v0.6 is a **major architectural overhaul** addressing a critical insight from 2 weeks of production testing: non-consolidated diffs overwhelm Claude when prompts are infrequent (e.g., "every 2 hours when the coder has a question"). The solution: **generate consolidated diffs on-demand** (when Claude submits a prompt) instead of recording every save.

### What Changed

#### 🎯 Core Architecture (onDemand Mode)

- **New coordination protocol:** inverted execution order, state file locking not necessary anymore\
  (but still in use for delayed state saving)
  - `.danke` file is written to signal demand for data
  - Extension generates diffs, writes `.info` (HookData)
  - Extension deletes `.danke` (signal: "Data ready")
  - Hook reads `.info`, outputs to Claude, cleans up
- **Overview of the data content** at the beginning of the additional context → helps Klaus to classify the data's importance
- **Consolidated diffs:** Multiple saves to the same file → one diff (~1kB vs. 25kB+ diff-size pre-v0.6)\
→ better "signal to noise ratio"
- **distinguished lists** of changed files (no base existed or freshly created - undiffable a.t.m.) vs. list of erased files
- **Async snapshot writes:** Critical path stays under 30s hook timeout; snapshot updates happen in background\
→ actually, by far less than 30s are needed, the timeout comes from `ClaudeCode`.


#### 🗂️ File Action Semantics (`Erkannt` Enum)

- New `Erkannt` enum distinguishes file actions:
  - `erstellt` (created) – file exists, no prior snapshot
  - `modifiziert` (modified) – file changed
  - `entfernt` (deleted) – file removed
- FileSystemWatcher now watches all three events (including `onCreate` for normal files – **bug fix**)
- Action propagates through call stack: Eyes → `dateiAnders()` → `push()` → routing

#### 📊 Deleted_File Tracking

- New `dels` Set tracks deleted files separately
- HookData now includes `dels: string[]` in output
- `push()` routes based on action:
  - `erstellt`/`modifiziert` → `files` (will be diffed in `danke()`)
  - `entfernt` → `dels` (tracked separately)
- Claude now sees which files were removed, not just changed

#### 🔧 Code Quality & Maintainability

- **Extracted `write2()` method:** Consolidates JSON serialization (used by `save()` and `danke()`)
- **Parameter clarity:** `c: boolean` → `onlyCreation: boolean` (makes design bugs visible)
- **Enhanced snapShot() callback:** Validates snapshot existence; updates/deletes from `saved` Set
- **Restructured HookOutput - new Introduction:** Clear categorization – "3 diffs, 2 non-diffable, 1 deletion"

#### 📝 Documentation

- Complete rewrite of CLAUDE_projectInfo.md with full architecture documentation (← only important to Klaus)
- Action-routing logic explained
- Timing constraints & concurrency model documented

### Breaking Changes
If you use Klaus with a sensible setup, not creating rules from every feedback you give, you'll notice less confusion in his answers.

During testing, Klaus oftentimes simply ignored the additional context due to its size.  This size resulted from my way of working thru problems until I need help and ask Klaus (or the internet for that matter).  Sometimes 2-5h without a prompt, but with 50+ file save actions.

A day of testing the changed style and consolidated diffs with Klaus Sonnenschein on the other project yielded: Klaus was much more aware of my doing - he even realized himself, he had not noticed various things in his first analysis.

Well, is this `breaking changes` - I think anything increasing the value of a piece of software is good for the user - so, yes!

### Testing

- 2 weeks production testing before v0.6 decision
- Extended testing phase in progress (aX → b0 → release cycle)

---

## [0.5.3] – Stabilization & Bugfixes

**Release Date:** 2026-06-12

### What Changed

- Multiple bugfixes from initial release testing
- Better diff generation
- First successful end-to-end tests

### The Critical Insight: From Accumulation to On-Demand

While working with 0.5.3, Stefan realized the fundamental problem: **ephemeral information should be consolidated on-demand**, not accumulated live. This insight drove the entire v0.6 redesign.

---

## [0.5.0 – 0.5.2] – Initial Implementation (Thought-to-be-but-was-Not-yet-MVP-Ready)

**Status:** Development phase, not recommended for production


### Key Limitations

- no diffs, yet, only a list of changed files
- not using correct keywords for Claude to distinguish the information from noise

---

## [0.4.0-i42 to i57] – The Honesty Phase (Iterations without MVP)

~3 days of refactoring. First, kept the version number, but then decided to install a much more honest post-commit-buildnumber-inc and went down to 0.4.0.

- single sources of truth installed (thought-to-be),
- cleaned up "different approaches taken on same problems" (statics|singletons),
- consolidated classes according to their purposes.
- restructured and refactored the whole extension

**Timeline:** 2026-05-14 (still as 0.5.6-something) to 2026-05-17 03:41 (Post-Commit Hook Era)

**Status:** Development iteration, not a release


This produced the rapid iteration sequence: `0.4.0-i42`, `0.4.0-i43`, ..., `0.4.0-i57` (15 iterations in ~1 hour).

**Why this matters:**
- This was Stefan's **honest way** of saying "we're still in development, this is not a release"
- Each commit = new build number (no false claims about stability)
- The "i" stood for **iteration** (no MVP, just work-in-progress)

**The result:** After ~16 iterations, 0.4.0-i57 became the foundation for 0.5.0-a0 (the actual MVP).

---

## Prototype Phase (withdrawn 0.5.5-beta and 0.5.6-beta)

### Klaus did:

- FileSystemWatcher integration
- Hook handler implementation
- State persistence (state file)

### Stefan's View:
After the first 4 implementation-iterations, Stefan took Klaus away from programming the extension.  The first 3 Iterations of adding code by Klaus worked fine - at least that's how it looked.

We prematurely released mentioned versions, but withdrew them pretty quickly - why?

That fourth iteration was about "letting the gears grip" - subtle bugs were a result of Klaus 'coding practice', leading Stefan to have very close looks at the code Klaus produced:
- not a single source of truth
- mixing different approaches for same activities
- an over-all unmaintainable codebase

It looked like beginner's code, copy&pasted together from stackoverflow, made to work based on a few assumptions one should not make, because they won't hold when checked more in-depth.

**Status:** Proof-of-concept only

Experimental implementation. Not usable. No MVP. Served to explore the idea of workspace-aware Claude integration. We apologize for making the horses mad.

---

## Versioning Scheme

**Format:** `X.Y.Z-LETTER#` (e.g., `0.6.0-a20`)

**Letter meanings:**
- **`i`** = **iteration** — raw development, no MVP, Post-Commit Hook era (every commit = new version)
- **`a`** = **alpha** — MVP exists, but not yet stable (early testing phase)
- **`b`** = **beta** — stable enough for broader testing
- **`r`** = **release** — production-ready (future use)

**Build number increment:**
- **Pre-Push Hook (current):** Version increments only when pushing (not on every commit)
  - When setting a tag: typically 2 increments (one for `git push`, one for `git push --tags`)
  - This reduces repo noise vs. Post-Commit Hook
- **Post-Commit Hook (0.4.0 era):** Version incremented on every commit
  - Produced rapid sequences like `0.4.0-i42` → `0.4.0-i57`
  - More noisy, but honest about development pace
