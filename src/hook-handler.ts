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
  const output: HookOutput = {
    additionalContext: `📝 Klaus'C0dehelfer detected file changes since last prompt:\n${contextLines}`,
  };

  console.log(JSON.stringify(output));
}

handleUserPromptSubmit().catch((err) => {
  process.stderr.write(`[ERROR] Hook handler failed: ${err}\n`);
  process.exit(1);
});
