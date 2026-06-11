
# Project

**Klaus'C0dehelfer** (`claude-c0de-workspace-watcher`) — a VSCode extension published by theObsessedManiacs that monitors workspace file changes and surfaces them to Claude Code via a hook handler. Requires the `anthropic.claude-code` extension as a dependency.

## Commands

```bash
npm run compile         # Type-check (no emit)
npm run watch           # Watch mode type-check (for development)
npm run bundle          # Build both Klaus.js and KlausHaken.js
npm run bundle:ext      # Build only Klaus.js (VSCode extension)
npm run bundle:hook     # Build only KlausHaken.js (Claude Code hook handler)
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
   - KlausHaken.js runs when Claude Code fires the `UserPromptSubmit` hook
   - To test manually: trigger it from the Claude Code editor by submitting a prompt with the hook enabled
   - Check `.vscode/KlausC0deHelferData.json` to verify state is being written
   - Check `.vscode/KlausC0deHelferData.json.danke` to see if KlausHaken successfully read the state

> **Note:** `npm run lint` references ESLint but ESLint is not installed — skip it.


### Versioning & Build Workflow

The extension uses **post-commit automatic versioning**: the version number is incremented after each commit by the `.git/hooks/post-commit` hook.

**Version format:** `X.Y.Z-LETTER#` (e.g., `0.5.0-a7`)
- `X.Y.Z`: semantic version (manual, change in code/major features)
- `LETTER#`: auto-incrementing build counter per letter (a=first series, b=second series, etc.)
- Example: `0.4.0-a1` → `0.4.0-a2` → `0.4.0-a3` ... → `0.5.0-b1` (when Y/Z changes manually)

**Workflow (always in order):**
1. Make code changes
2. `npm run compile` → verify type-checking passes
3. `npm run bundle` → builds Klaus.js and KlausHaken.js with current version
4. `npx vsce package` → creates VSIX with current version
5. **Test the VSIX** in VSCode before committing (install and verify hook/monitoring work)
6. `git add <files>` (do NOT add package.json yet)
7. `git commit` → fires post-commit hook, which:
   - Increments version in `package.json`
   - Automatically stages `package.json` with `git add`

The next commit will include the incremented version. This ensures committed version and built VSIX always match.

### Bundling & Build Details

**Dependency bundling:**
- `minimatch` is listed in `package.json` but not used — Klaus.ts implements its own `globToRegex()` method for pattern matching
- Both bundles are self-contained with no external node_modules required at runtime

**Source layout:**
- `src/Klaus.ts`: extension logic, mutable globals, entry points (`activate`/`deactivate`)
- `src/KlausDinge.ts`: static definitions — `Context`, `Logger`, enums, constants, pure helpers
- `src/KlausHaken.ts`: standalone Claude Code hook handler

**TypeScript & esbuild:**
- `tsconfig.json`: CommonJS modules, ES2020 target, strict mode, no emit (esbuild handles emit)
- esbuild config:
  - `--bundle`: includes dependencies
  - `--minify`: shrinks output size
  - `--external:vscode`: excludes VSCode API from extension bundle (it's provided by host)
  - `--platform=node`: targets Node.js runtime (not browser)

**Output artifacts** (aktueller Projektzustand — unterliegt der Evolution):

| Artefakt | Größe | Zweck |
|----------|-------|-------|
| `dist/Klaus.js` | 11KB | VSCode extension (bundled, minified) |
| `dist/KlausHaken.js` | 1.5KB | Claude Code hook handler (bundled, minified) |

**Versionsstand:** aktuell v0.5.3-a1
