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
    process.stderr.write('[POC-DEBUG] 🎣 Hook triggered: UserPromptSubmit\n');

    // POC: Test if vscode module is available in this context
    process.stderr.write(`[POC-DEBUG] 📦 vscode object available: ${vscode ? '✅ YES' : '❌ NO'}\n`);
    if (vscode) {
      process.stderr.write(`[POC-DEBUG] vscode.workspace: ${vscode.workspace ? '✅ YES' : '❌ NO'}\n`);
      process.stderr.write(`[POC-DEBUG] vscode.window: ${vscode.window ? '✅ YES' : '❌ NO'}\n`);
    }

    let inputData = '';
    for await (const chunk of process.stdin) {
      inputData += chunk;
    }

    process.stderr.write(`[POC-DEBUG] 📥 Received stdin: ${inputData.substring(0, 100)}...\n`);

    let hookInput: HookInput;
    try {
      hookInput = JSON.parse(inputData);
    } catch {
      hookInput = { workspace: process.cwd() };
      process.stderr.write('[POC-DEBUG] ⚠️  Could not parse stdin as JSON, using cwd fallback\n');
    }

    const workspaceFolder = hookInput.workspace || process.cwd();
    process.stderr.write(`[POC-DEBUG] 📁 Workspace folder: ${workspaceFolder}\n`);

    const mtimesPath = path.join(workspaceFolder, '.vscode', 'KlausC0deHelferData.json');
    process.stderr.write(`[POC-DEBUG] 🔍 Looking for state file: ${mtimesPath}\n`);

    if (!fs.existsSync(mtimesPath)) {
      process.stderr.write('[POC-DEBUG] ℹ️  State file not found, exiting silently\n');
      process.exit(0);
    }

    const stateData = fs.readFileSync(mtimesPath, 'utf-8');
    const state: any = JSON.parse(stateData);
    const changedFiles = state.files || [];

    process.stderr.write(`[POC-DEBUG] 📊 State loaded: ${changedFiles.length} files tracked\n`);

    if (changedFiles.length === 0) {
      process.stderr.write('[POC-DEBUG] ℹ️  No files changed, exiting silently\n');
      process.exit(0);
    }

    const contextLines = changedFiles.map((file: string) => `  • ${file}`).join('\n');
    const output: HookOutput = {
      additionalContext: `📝 Klaus'C0dehelfer detected file changes:\n${contextLines}`,
    };

    process.stderr.write(`[POC-DEBUG] ✅ Outputting to Claude: ${changedFiles.length} changed files\n`);
    console.log(JSON.stringify(output));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[POC-ERROR] Hook handler failed: ${err}\n`);
    process.exit(1);
  }
}

handleUserPromptSubmit();
