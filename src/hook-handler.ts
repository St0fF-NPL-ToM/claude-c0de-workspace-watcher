import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

interface HookInput {
  workspace?: string;
  [key: string]: any;
}

interface HookOutput {
  additionalContext: string;
}

async function handleUserPromptSubmit(): Promise<void> {
  try {
    process.stderr.write('[DEBUG] 🎣 Hook triggered: UserPromptSubmit\n');

    let inputData = '';
    for await (const chunk of process.stdin) {
      inputData += chunk;
    }

    process.stderr.write(`[DEBUG] 📥 Received stdin: ${inputData.substring(0, 100)}...\n`);

    let hookInput: HookInput;
    try {
      hookInput = JSON.parse(inputData);
    } catch {
      hookInput = { workspace: process.cwd() };
      process.stderr.write('[DEBUG] ⚠️  Could not parse stdin as JSON, using cwd fallback\n');
    }

    const workspaceFolder = hookInput.workspace || process.cwd();
    process.stderr.write(`[DEBUG] 📁 Workspace folder: ${workspaceFolder}\n`);

    const mtimesPath = path.join(workspaceFolder, '.vscode', 'KlausC0deHelferData.json');
    process.stderr.write(`[DEBUG] 🔍 Looking for state file: ${mtimesPath}\n`);

    if (!fs.existsSync(mtimesPath)) {
      process.stderr.write('[DEBUG] ℹ️  State file not found, exiting silently\n');
      process.exit(0);
    }

    const stateData = fs.readFileSync(mtimesPath, 'utf-8');
    const state: any = JSON.parse(stateData);
    const changedFiles = state.files || [];

    process.stderr.write(`[DEBUG] 📊 State loaded: ${changedFiles.length} files tracked\n`);

    if (changedFiles.length === 0) {
      process.stderr.write('[DEBUG] ℹ️  No files changed, exiting silently\n');
      process.exit(0);
    }

    const contextLines = changedFiles.map((file: string) => `  • ${file}`).join('\n');
    const output: HookOutput = {
      additionalContext: `📝 Klaus'C0dehelfer detected file changes:\n${contextLines}`,
    };

    process.stderr.write(`[DEBUG] ✅ Outputting to Claude: ${changedFiles.length} changed files\n`);
    console.log(JSON.stringify(output));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[ERROR] Hook handler failed: ${err}\n`);
    process.exit(1);
  }
}

handleUserPromptSubmit();
