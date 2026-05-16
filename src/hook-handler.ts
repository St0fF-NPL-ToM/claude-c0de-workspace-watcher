import * as fs from 'fs';
import * as path from 'path';

interface HookInput {
  workspace?: string;
}

interface HookState {
  files?: string[];
}

interface HookOutput {
  additionalContext: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleUserPromptSubmit(): Promise<void> {
  let inputData = '';
  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  let hookInput: HookInput;
  try {
    hookInput = JSON.parse(inputData) as HookInput;
  } catch {
    hookInput = { workspace: process.cwd() };
  }

  const workspaceFolder = hookInput.workspace || process.cwd();
  const mtimesPath = path.join(workspaceFolder, '.vscode', 'KlausC0deHelferData.json');
  const lockPath = `${mtimesPath}.lock`;
  const thankYouPath = `${mtimesPath}.danke`;

  let maxWaitMs = 5000;
  const startTime = Date.now();
  while (fs.existsSync(lockPath)) {
    if (Date.now() - startTime > maxWaitMs) {
      process.exit(0);
    }
    await sleep(10);
  }
  const lockWaitMs = Date.now() - startTime;

  let stateData: string;
  try {
    stateData = fs.readFileSync(mtimesPath, 'utf-8');
  } catch {
    process.exit(0);
  }

  const state = JSON.parse(stateData) as HookState;
  const changedFiles = state.files ?? [];

  if (changedFiles.length === 0) {
    process.exit(0);
  }

  const contextLines = changedFiles.map((file) => `  • ${file}`).join('\n');

  try {
    fs.writeFileSync(thankYouPath, '');
  } catch (err) {
    process.stderr.write(`[WARN] Could not create danke file: ${err}\n`);
  }

  const debugInfo = `\n\n🔒 Lock: waited ${lockWaitMs}ms | State: read ${changedFiles.length} files | Danke: created`;
  const output: HookOutput = {
    additionalContext: `📝 Klaus'C0dehelfer detected file changes since last prompt:\n${contextLines}${debugInfo}`,
  };

  console.log(JSON.stringify(output));
}

handleUserPromptSubmit().catch((err) => {
  process.stderr.write(`[ERROR] Hook handler failed: ${err}\n`);
  process.exit(1);
});
