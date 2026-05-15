import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let extensionContext: vscode.ExtensionContext;

const GLOBAL_STATE_KEY_GLOBAL = 'claudeHook.globalSettingsPath';
const GLOBAL_STATE_KEY_WORKSPACE = 'claudeHook.workspaceSettingsPath';

interface WorkspaceState {
  lastChecked: string;
  files: string[];
}

class Logger {
  private static channel: vscode.LogOutputChannel;

  static init(): void {
    Logger.channel = vscode.window.createOutputChannel("Klaus'C0dehelfer", { log: true });
  }

  static log(msg: string): void {
    Logger.channel.info(msg);
  }

  static debug(msg: string): void {
    Logger.channel.debug(msg);
  }

  static error(msg: string): void {
    Logger.channel.error(msg);
  }

  static dispose(): void {
    Logger.channel.dispose();
  }
}

export class ClaudeWorkspaceMonitor {
  private mtimesFile: string;
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private state: WorkspaceState = {
    lastChecked: new Date().toISOString(),
    files: [],
  };

  // File patterns to monitor (sinnvolle Änderungen)
  private readonly INCLUDE_PATTERNS = [
    '**/*.{cpp,h,hpp,c,py,ts,tsx,js,json,yaml,toml,md,txt,sh,cmake,asm}',
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

    // 2. Default: .vscode/KlausC0deHelferData.json in first workspace folder
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceFolder) {
      return path.join(workspaceFolder, '.vscode', 'KlausC0deHelferData.json');
    }

    // 3. Fallback: home directory .vscode
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    return path.join(homeDir, '.vscode', 'KlausC0deHelferData.json');
  }

  async activate(): Promise<void> {
    this.loadState();
    this.setupWorkspaceWatchers();

    // Register change detection on file save
    vscode.workspace.onDidSaveTextDocument((doc) => {
      this.trackFileChange(doc.uri.fsPath);
    });

    Logger.log('✅ Klaus\'C0dehelfer ist scharf! (…claude workspace monitor activated…)');
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

        watcher.onDidChange((uri) =>
          this.trackFileChange(uri.fsPath)
        );

        this.fileWatchers.push(watcher);
      });
    });

    Logger.log(
      `🔍 Workspace watchers set up for ${vscode.workspace.workspaceFolders?.length || 0} folders`
    );
  }

  private trackFileChange(filePath: string): void {
    if (this.isExcluded(filePath)) {
      return;
    }

    const relativePath = this.getRelativePath(filePath);

    if (!this.state.files.includes(relativePath)) {
      this.state.files.push(relativePath);
      Logger.log(`✏️  [${new Date().toISOString()}] ${relativePath}`);
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
          files: parsed.files || [],
        };
      }
    } catch (err) {
      Logger.error(`Failed to load state: ${err}`);
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
      Logger.debug(`💾 State saved to ${this.mtimesFile}`);
    } catch (err) {
      Logger.error(`Failed to save state: ${err}`);
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

async function handleAwarenessChange(event: vscode.ConfigurationChangeEvent): Promise<void> {
  // TODO: Global vs. Workspace detection via inspect() is "subject to discussion".
  // affectsConfiguration(section, folder) returns true for BOTH global and workspace
  // changes, so affectsConfiguration alone is insufficient for distinction.
  const folders = vscode.workspace.workspaceFolders;
  const config = vscode.workspace.getConfiguration('claude-workspace-monitor');
  const insp = config.inspect<string>('awarenessMode');

  let isGlobal = true;

  if (folders && folders.length > 0) {
    for (const folder of folders) {
      if (event.affectsConfiguration('claude-workspace-monitor.awarenessMode', folder)) {
        if (folder === folders[0]) isGlobal = false;
        else {
          vscode.window.showWarningMessage(
            "Klaus'C0dehelfer: Subfolder-Konfiguration wird nicht unterstützt."
          );
          return; // ICH HASSE PREMATURE RETURNS! Dennoch korrekt hier.
        }
        break;
      }
    }
  }

  const mode = isGlobal
    ? (insp?.globalValue ?? 'none')
    : (insp?.workspaceValue ?? 'none');

  if (mode === 'realTime') {
    vscode.window.showInformationMessage("Real-Time mode: coming soon.");
    return;
  }

  await handleAwarenessModeSetting(mode, isGlobal);
}

async function removeKlausHooks(isGlobal: boolean): Promise<void> {
  const stateKey = isGlobal ? GLOBAL_STATE_KEY_GLOBAL : GLOBAL_STATE_KEY_WORKSPACE;
  const settingsPath = extensionContext.globalState.get<string>(stateKey);

  if (!settingsPath || !fs.existsSync(settingsPath)) {
    Logger.log('ℹ️  No hook configured for this scope — nothing to remove.');
    return;
  }

  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    delete settings.hooks;

    if (Object.keys(settings).length === 0) {
      fs.unlinkSync(settingsPath);
      Logger.log(`🗑️  Deleted empty settings file: ${settingsPath}`);
    } else {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      Logger.log(`🗑️  Hook removed from ${settingsPath}`);
    }
  } catch (err) {
    Logger.error(`Cleanup failed for ${settingsPath}: ${err}`);
    return;
  }

  extensionContext.globalState.update(stateKey, undefined);
  vscode.window.showInformationMessage("Klaus'C0dehelfer: Hook-Konfiguration entfernt.");
}

async function handleAwarenessModeSetting(mode: string, isGlobal: boolean): Promise<void> {
  if (mode === 'none') {
    await removeKlausHooks(isGlobal);
    return;
  }

  /* dieser Code ist Quatsch, solange wir es schon in handleAwarenessChange() abfangen.
     Dennoch: für später drinne lassen! */
  // if (mode === 'realTime') {
  //   vscode.window.showInformationMessage("Real-Time mode: coming soon.");
  //   return;
  // }

  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) {
    vscode.window.showErrorMessage("Klaus'C0dehelfer: Could not determine home directory.");
    return;
  }

  const claudeFolder = path.join(homeDir, '.claude');
  const settingsPath = path.join(claudeFolder, 'settings.local.json');

  try {
    let settings: any = {};
    if (fs.existsSync(settingsPath)) {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      settings = JSON.parse(content);
    }

    // TODO: Hook-Inhalt wird in SPEC.md-Phase definiert
    settings.hooks = { UserPromptSubmit: `node ${path.join(__dirname, 'hook-handler.js')}` };

    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Pfad scope-getrennt speichern
    const stateKey = isGlobal ? GLOBAL_STATE_KEY_GLOBAL : GLOBAL_STATE_KEY_WORKSPACE;
    extensionContext.globalState.update(stateKey, settingsPath);

    Logger.log(`✅ Hook written to ${settingsPath}`);
    vscode.window.showInformationMessage('✅ Klaus integration configured!');
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to write hook: ${err}`);
  }
}

export function activate(context: vscode.ExtensionContext) {
  extensionContext = context;
  Logger.init();
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
        handleAwarenessChange(event);
      }
    })
  );
}

export function deactivate() {
  Logger.dispose();
}
