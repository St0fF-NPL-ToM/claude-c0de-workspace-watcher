import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface WorkspaceState {
  lastChecked: string;
  files: { [key: string]: number };
}

export class ClaudeWorkspaceMonitor {
  private mtimesFile: string;
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private state: WorkspaceState = {
    lastChecked: new Date().toISOString(),
    files: {},
  };

  // File patterns to monitor (sinnvolle Änderungen)
  private readonly INCLUDE_PATTERNS = [
    '**/*.{cpp,h,hpp,c,py,ts,tsx,js,json,yaml,toml,md,txt,sh,cmake,asm,sh}',
    '**/CMakeLists.txt',
  ];

  // Patterns to exclude (noise reduction)
  private readonly EXCLUDE_PATTERNS = [
    '**/.git/**',
    '**/build/**',
    '**/__pycache__/**',
    '**/.vscode/**',
    '**/node_modules/**',
    '**/.swp',
    '**/.swo',
    '**/.tmp/**',
    '**/logs/**',
    '**/*.o',
    '**/*.a',
    '**/*.so',
    '**/*.dll',
  ];

  constructor() {
    this.mtimesFile = this.getMtimesPath();
  }

  private getMtimesPath(): string {
    // 1. Check VSCode setting
    const config = vscode.workspace.getConfiguration('claude-workspace-monitor');
    const customPath = config.get<string>('mtimesPath');
    if (customPath) {
      return customPath.replace('${workspaceFolder}', vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '');
    }

    // 2. Default: .vscode/.workspaceChanges.json in first workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      return path.join(workspaceFolder, '.vscode', '.workspaceChanges.json');
    }

    // 3. Fallback: temp directory (shouldn't happen in normal VSCode usage)
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.claude-workspace-monitor-mtimes.json');
  }

  async activate(): Promise<void> {
    this.loadState();
    this.setupWorkspaceWatchers();

    // Register change detection on file save
    vscode.workspace.onDidSaveTextDocument((doc) => {
      this.trackFileChange(doc.uri.fsPath, 'modify');
    });

    // Handle file creation/deletion
    vscode.workspace.onDidCreateFiles((event) => {
      event.files.forEach((file) => {
        this.trackFileChange(file.fsPath, 'create');
      });
    });

    vscode.workspace.onDidDeleteFiles((event) => {
      event.files.forEach((file) => {
        this.trackFileChange(file.fsPath, 'delete');
      });
    });

    vscode.workspace.onDidRenameFiles((event) => {
      event.files.forEach((file) => {
        this.trackFileChange(file.newUri.fsPath, 'rename');
      });
    });

    console.log('✅ Klaus\'C0dehelfer ist scharf! (…claude workspace monitor activated…)');

    // Check for Claude integration setup
    this.checkClaudeIntegration();
  }

  private checkClaudeIntegration(): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    // Check workspace-local .claude/settings.json first
    let settingsPath: string | null = null;
    if (workspaceFolder) {
      const workspacePath = path.join(workspaceFolder, '.claude', 'settings.json');
      if (fs.existsSync(workspacePath)) {
        settingsPath = workspacePath;
      }
    }

    // Fallback to home directory .claude/settings.json
    if (!settingsPath) {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const homePath = path.join(homeDir, '.claude', 'settings.json');
      if (fs.existsSync(homePath)) {
        settingsPath = homePath;
      }
    }

    if (!settingsPath) {
      console.log('\n⚠️  📁 No .claude/settings.json found in workspace or home directory');
      console.log('💡 To enable Claude awareness of file changes, add a Hook:');
      console.log('   📖 See README for "Claude Integration" setup');
      console.log('   🔗 Or open Extension Settings (Ctrl+Shift+X → Klaus\'C0dehelfer)');
      console.log('');
      return;
    }

    // Check if hook is configured
    try {
      const settingsContent = fs.readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(settingsContent);
      if (settings.hooks) {
        console.log('✅ Claude Integration configured via .claude/settings.json');
      } else {
        console.log('ℹ️  .claude/settings.json exists but no hooks configured');
        console.log('   See README for "Claude Integration" setup');
      }
    } catch (err) {
      console.log('⚠️  Could not parse .claude/settings.json');
    }
  }

  private setupWorkspaceWatchers(): void {
    this.fileWatchers.forEach((w) => w.dispose());
    this.fileWatchers = [];

    vscode.workspace.workspaceFolders?.forEach((folder) => {
      this.INCLUDE_PATTERNS.forEach((pattern) => {
        const watcher = vscode.workspace.createFileSystemWatcher(
          new vscode.RelativePattern(folder, pattern),
          false,
          false,
          false
        );

        watcher.onDidCreate((uri) =>
          this.trackFileChange(uri.fsPath, 'create')
        );
        watcher.onDidChange((uri) =>
          this.trackFileChange(uri.fsPath, 'modify')
        );
        watcher.onDidDelete((uri) =>
          this.trackFileChange(uri.fsPath, 'delete')
        );

        this.fileWatchers.push(watcher);
      });
    });

    console.log(
      `🔍 Workspace watchers set up for ${vscode.workspace.workspaceFolders?.length || 0} folders`
    );
  }

  private trackFileChange(
    filePath: string,
    type: 'create' | 'modify' | 'delete' | 'rename'
  ): void {
    if (this.isExcluded(filePath)) {
      return;
    }

    const mtime = this.getFileMtime(filePath);
    const relativePath = this.getRelativePath(filePath);

    if (mtime !== null) {
      this.state.files[relativePath] = mtime;
      console.log(`✏️  [${new Date().toISOString()}] ${type}: ${relativePath}`);
    }

    this.saveStateDebounced();
  }

  private isExcluded(filePath: string): boolean {
    return this.EXCLUDE_PATTERNS.some((pattern) => {
      const regex = this.globToRegex(pattern);
      return regex.test(filePath);
    });
  }

  private globToRegex(glob: string): RegExp {
    const escaped = glob
      .replace(/\./g, '\\.')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\*\*/g, '.*');
    return new RegExp(`(^|/)${escaped}($|/)`);
  }

  private getFileMtime(filePath: string): number | null {
    try {
      const stats = fs.statSync(filePath);
      return Math.floor(stats.mtimeMs / 1000);
    } catch {
      return null;
    }
  }

  private getRelativePath(filePath: string): string {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(
      vscode.Uri.file(filePath)
    );
    if (workspaceFolder) {
      return path.relative(workspaceFolder.uri.fsPath, filePath);
    }
    return filePath;
  }

  private loadState(): void {
    try {
      if (fs.existsSync(this.mtimesFile)) {
        const data = fs.readFileSync(this.mtimesFile, 'utf-8');
        const parsed = JSON.parse(data);
        this.state = {
          lastChecked: parsed.last_checked || new Date().toISOString(),
          files: parsed.files || {},
        };
      }
    } catch (err) {
      console.error('Failed to load state:', err);
    }
  }

  private saveStateTimeout: NodeJS.Timeout | null = null;
  private saveStateDebounced(): void {
    if (this.saveStateTimeout) {
      clearTimeout(this.saveStateTimeout);
    }

    this.saveStateTimeout = setTimeout(() => {
      this.saveState();
    }, 5000);
  }

  private saveState(): void {
    try {
      const data = {
        tracking_enabled: true,
        workspace: 'auto-detected',
        patterns: this.INCLUDE_PATTERNS,
        last_checked: new Date().toISOString(),
        files: this.state.files,
      };

      const dir = path.dirname(this.mtimesFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.mtimesFile, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to save state:', err);
    }
  }

  deactivate(): void {
    this.fileWatchers.forEach((w) => w.dispose());
    if (this.saveStateTimeout) {
      clearTimeout(this.saveStateTimeout);
    }
    this.saveState();
  }
}

async function handleAwarenessModeSetting(mode: string): Promise<void> {
  if (mode === 'none') {
    return;
  }

  const explanations: { [key: string]: string } = {
    onDemand: 'On-Demand: Claude checks for file changes when responding to your prompts. Efficient, minimal tokens spent.',
    realTime: 'Real-Time: Claude is notified instantly when you save files. Immediate awareness, but costs more tokens.',
  };

  const selection = await vscode.window.showInformationMessage(
    explanations[mode] || '',
    { modal: true, detail: 'Select the .claude folder to configure this integration.' },
    'Select .claude Folder'
  );

  if (selection === 'Select .claude Folder') {
    const folders = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      title: 'Select .claude folder',
    });

    if (folders && folders.length > 0) {
      const claudeFolder = folders[0].fsPath;
      const settingsPath = path.join(claudeFolder, 'settings.json');

      try {
        // Read existing settings or start with empty object
        let settings: any = {};
        if (fs.existsSync(settingsPath)) {
          const content = fs.readFileSync(settingsPath, 'utf-8');
          settings = JSON.parse(content);
        }

        // Add or update hooks
        const hook = mode === 'onDemand'
          ? { beforeAnswer: 'check .vscode/.workspaceChanges.json for updates' }
          : { onChange: '.vscode/.workspaceChanges.json', action: 'notify' };

        settings.hooks = hook;

        // Write back
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
        vscode.window.showInformationMessage('✅ Claude integration configured!');
      } catch (err) {
        vscode.window.showErrorMessage(`Failed to write settings: ${err}`);
      }
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  const monitor = new ClaudeWorkspaceMonitor();
  monitor.activate();

  context.subscriptions.push({
    dispose: () => monitor.deactivate(),
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('claude-workspace-monitor.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', 'claude-workspace-monitor');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('claude-workspace-monitor.awarenessMode')) {
        const config = vscode.workspace.getConfiguration('claude-workspace-monitor');
        const mode = config.get<string>('awarenessMode', 'none');
        handleAwarenessModeSetting(mode);
      }
    })
  );
}

export function deactivate() {}
