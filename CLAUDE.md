# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Klaus'C0dehelfer** (`claude-c0de-workspace-watcher`) — a VSCode extension published by theObsessedManiacs that monitors workspace file changes and surfaces them to Claude Code via a hook handler. Requires the `anthropic.claude-code` extension as a dependency.

## Commands

```bash
npm run compile         # Type-check (no emit)
npm run watch           # Watch mode type-check (for development)
npm run bundle          # Build both extension.js and hook-handler.js
npm run bundle:ext      # Build only the VSCode extension
npm run bundle:hook     # Build only the Claude Code hook handler
npx vsce package        # Create installable .vsix file
```

## Development Workflow

### Local Development & Debugging

1. **Type-check in watch mode:**
   ```bash
   npm run watch
   ```

2. **Bundle both scripts:**
   ```bash
   npm run bundle
   ```

3. **Package the extension:**
   ```bash
   npx vsce package
   ```

4. **Install in VSCode:**
   - Open VSCode
   - `Ctrl+Shift+X` → Extensions
   - Click `⋯` (three dots) → `Install from VSIX…`
   - Select the generated `.vsix` file
   - Reload VSCode

5. **Debug the extension:**
   - `Ctrl+Shift+D` (Debug view)
   - Select "Run Extension" configuration
   - Press `F5` to start the Extension Development Host
   - VSCode opens a new window with your extension loaded
   - Set breakpoints in `src/Klaus.ts` and interact with the UI
   - The test instance connects to your development version

6. **Test the hook handler:**
   - The hook-handler runs when Claude Code fires the `UserPromptSubmit` hook
   - To test manually: trigger it from the Claude Code editor by submitting a prompt with the hook enabled
   - Check `.vscode/KlausC0deHelferData.json` to verify state is being written
   - Check `.vscode/KlausC0deHelferData.json.danke` to see if the hook read the state

> **Note:** `npm run lint` references ESLint but ESLint is not installed — skip it.

## Questions & Decisions

When working on this project:

**Thinking before asking:** Don't ask questions whose answer is two thoughts away. Invest the thinking first. Questions where the answer lies within arm's reach without effort are wasted context. This isn't about avoiding questions — it's about respecting that good questions come from having thought things through.

**Examples:**
- ❌ "Should I use `setTimeout` here?" (answer: read the debounce code 5 lines up)
- ❌ "Does the hook see the lock file?" (answer: read the Lock+Danke pattern explanation above)
- ✅ "I see the debounce is 3s and the hook waits 5s — is this margin enough for all scenarios?" (thoughtful question about edge cases)

## Versioning & Build Workflow

The extension uses **post-commit automatic versioning**: the version number is incremented after each commit by the `.git/hooks/post-commit` hook.

**Version format:** `X.Y.Z-LETTER#` (e.g., `0.5.0-a7`)
- `X.Y.Z`: semantic version (manual, change in code/major features)
- `LETTER#`: auto-incrementing build counter per letter (a=first series, b=second series, etc.)
- Example: `0.4.0-a1` → `0.4.0-a2` → `0.4.0-a3` ... → `0.5.0-b1` (when Y/Z changes manually)

**Workflow (always in order):**
1. Make code changes
2. `npm run compile` → verify type-checking passes
3. `npm run bundle` → builds the extension. Current results: Klaus.js and hook-handler.js with current version
4. `npx vsce package` → creates VSIX with current version
5. **Test the VSIX** in VSCode before committing (install and verify hook/monitoring work)
6. `git add <files>` (do NOT add package.json yet)
7. `git commit` → fires post-commit hook, which:
   - Increments version in `package.json`
   - Automatically stages `package.json` with `git add`

The next commit will include the incremented version. This ensures committed version and built VSIX always match.

## Bundling & Build Details

**Dependency bundling:**
- `minimatch` is listed in `package.json` but not used — Klaus.ts implements its own `globToRegex()` method for pattern matching
- Both bundles are self-contained with no external node_modules required at runtime

**Source layout:**
- `src/Klaus.ts`: extension logic, mutable globals, entry points (`activate`/`deactivate`)
- `src/KlausDinge.ts`: static definitions — `Context`, `Logger`, enums, constants, pure helpers
- `src/hook-handler.ts`: standalone Claude Code hook handler

**TypeScript & esbuild:**
- `tsconfig.json`: CommonJS modules, ES2020 target, strict mode, no emit (esbuild handles emit)
- esbuild config:
  - `--bundle`: includes dependencies
  - `--minify`: shrinks output size
  - `--external:vscode`: excludes VSCode API from extension bundle (it's provided by host)
  - `--platform=node`: targets Node.js runtime (not browser)

**Output artifacts** (aktueller Projektzustand — unterliegt der Evolution):
- `dist/Klaus.js`: VSCode extension (bundled, minified, ~9.7KB)
- `dist/hook-handler.js`: Claude Code hook (bundled, minified, ~1.5KB)

