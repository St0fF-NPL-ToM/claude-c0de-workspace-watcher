import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

let extensionContext: vscode.ExtensionContext;

const GLOBAL_STATE_KEY_GLOBAL = 'claudeHook.globalSettingsPath';
const GLOBAL_STATE_KEY_WORKSPACE = 'claudeHook.workspaceSettingsPath';

interface WorkspaceState {
  lastClaude: string;
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
  private mtimesFile: string = '';
  private fileWatchers: vscode.FileSystemWatcher[] = [];
  private state: WorkspaceState = {
    lastClaude: new Date().toISOString(),
    files: [],
  };


  private getMtimesPath(): string {
    const config = vscode.workspace.getConfiguration('claude-workspace-monitor');
    const stem = config.get<string>('stateFileName') || 'KlausC0deHelferData';
    const filename = `${stem}.json`;
    const result = path.join('.vscode', filename);
    Logger.debug(`🗂️  getMtimesPath: ${stem} → ${result}`);
    return result;
  }

  async activate(): Promise<void> {
    Logger.log(`🚀 Klaus'C0dehelfer startet…`);

    this.mtimesFile = this.getMtimesPath();

    // Registriere Callback → Handlung bei Config-Änderungen
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('claude-workspace-monitor.stateFileName')) {
        const oldPath = this.mtimesFile;
        this.mtimesFile = this.getMtimesPath();
        Logger.debug(`🔄 stateFileName changed: ${oldPath} → ${this.mtimesFile}`);
      } else if (event.affectsConfiguration('claude-workspace-monitor.awarenessMode')) {
        handleAwarenessChange(event);
        const isActive = vscode.workspace.getConfiguration('claude-workspace-monitor').get('awarenessMode') !== 'none';
        this.setupWorkspaceWatchers(isActive);
      } else if (event.affectsConfiguration('claude-workspace-monitor.includePatterns')) {
        const isActive = vscode.workspace.getConfiguration('claude-workspace-monitor').get('awarenessMode') !== 'none';
        this.setupWorkspaceWatchers(isActive);
      }
    });
    // Registriere Callback → workspace-Wechsel
    vscode.workspace.onDidChangeWorkspaceFolders((event) => {
      Logger.debug(`📁 Workspace folders changed`);
      this.initializeWorkspace();
    });

    this.initializeWorkspace();
  }

  private initializeWorkspace(): void {
    if (vscode.workspace.workspaceFolders?.length) {
      this.loadState();

      const config = vscode.workspace.getConfiguration('claude-workspace-monitor');
      const isActive = config.get('awarenessMode') !== 'none';

      this.setupWorkspaceWatchers(isActive);

      Logger.debug(`📋 Settings: awarenessMode=${config.get('awarenessMode')}`);
      Logger.debug(`📋 Settings: stateFileName=${config.get('stateFileName') || 'KlausC0deHelferData'}`);
      Logger.debug(`📋 State file: ${this.mtimesFile}`);
      Logger.debug(`📋 Workspace folders: ${vscode.workspace.workspaceFolders.map(f => f.uri.fsPath).join(', ')}`);
      Logger.debug(`📋 Hook path (global): ${extensionContext.globalState.get(GLOBAL_STATE_KEY_GLOBAL) || '(not set)'}`);
      Logger.debug(`📋 Hook path (workspace): ${extensionContext.globalState.get(GLOBAL_STATE_KEY_WORKSPACE) || '(not set)'}`);

      if (isActive) {
        Logger.log('✅ Klaus\'C0dehelfer ist scharf! (…claude workspace monitor activated…)');
      } else {
        Logger.log('😴 Klaus\'C0dehelfer ist latschig! (…claude workspace monitor actively asleep…)');
      }
    } else {
      Logger.log('ℹ️  Kein Workspace offen — Klaus\'C0dehelfer inaktiv.');
      this.deactivate();
    }
  }

  private setupWorkspaceWatchers(enabled: boolean): void {
    this.fileWatchers.forEach((w) => w.dispose());
    this.fileWatchers = [];

    if (enabled) {
      const patterns = vscode.workspace.getConfiguration('claude-workspace-monitor')
        .get<string[]>('includePatterns', []);

      vscode.workspace.workspaceFolders?.forEach((folder) => {
        patterns.forEach((pattern) => {
          const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(folder, pattern),
            true,
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
        `🔍 Klaus wartet auf Dateiänderungen… (…watching ${vscode.workspace.workspaceFolders?.length || 0} folders for file changes…)`
      );
    } else {
      Logger.log('🔇 Pause konfiguriert…');
    }
  }

  private trackFileChange(filePath: string): void {
    if (this.isExcluded(filePath)) {
      Logger.debug(`🚫 Excluded: ${filePath}`);
      return;
    }

    const relativePath = this.getRelativePath(filePath);

    if (!this.state.files.includes(relativePath)) {
      this.state.files.push(relativePath);
      Logger.log(`✏️  [${new Date().toISOString()}] ${relativePath}`);
    } else {
      Logger.debug(`⏭️  Already tracked: ${relativePath}`);
    }

    this.saveStateDebounced();
  }

  private isExcluded(filePath: string): boolean {
    const excludePatterns = vscode.workspace.getConfiguration('claude-workspace-monitor')
      .get<string[]>('excludePatterns', []);
    return excludePatterns.some((pattern) => {
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
      const absolutePath = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, this.mtimesFile);
      if (fs.existsSync(absolutePath)) {
        const data = fs.readFileSync(absolutePath, 'utf-8');
        const parsed = JSON.parse(data);
        this.state = {
          lastClaude: parsed.lastClaude || new Date().toISOString(),
          files: parsed.files || [],
        };
        Logger.debug(`📂 loadState: loaded ${this.state.files.length} files, lastClaude=${this.state.lastClaude}`);
      } else {
        Logger.debug(`📂 loadState: file not found at ${absolutePath}`);
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
      const absolutePath = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, this.mtimesFile);
      const dir = path.dirname(absolutePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      this.state.lastClaude = new Date().toISOString();
      fs.writeFileSync(absolutePath, JSON.stringify(this.state, null, 2));
      Logger.debug(`💾 State saved to ${absolutePath}`);
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
  Logger.debug(`⚙️  awarenessMode changed`);

  const folders = vscode.workspace.workspaceFolders;
  const config = vscode.workspace.getConfiguration('claude-workspace-monitor');
  const insp = config.inspect<string>('awarenessMode');

  Logger.debug(`⚙️  inspect: globalValue=${insp?.globalValue}, workspaceValue=${insp?.workspaceValue}`);

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

  Logger.debug(`⚙️  isGlobal=${isGlobal}, mode=${mode}`);

  if (mode === 'realTime') {
    vscode.window.showInformationMessage("Real-Time mode: coming soon.");
    return;
  }

  await handleAwarenessModeSetting(mode, isGlobal);
}

async function removeKlausHooks(isGlobal: boolean): Promise<void> {
  const stateKey = isGlobal ? GLOBAL_STATE_KEY_GLOBAL : GLOBAL_STATE_KEY_WORKSPACE;
  const settingsPath = extensionContext.globalState.get<string>(stateKey);

  Logger.debug(`🗑️  removeKlausHooks: isGlobal=${isGlobal}, stateKey=${stateKey}`);
  Logger.debug(`🗑️  Stored path: ${settingsPath || '(not set)'}`);

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
  Logger.debug(`🔧 handleAwarenessModeSetting: mode=${mode}, isGlobal=${isGlobal}`);

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

  let settingsPath: string;

  if (isGlobal) {
    const homeDir = process.env.HOME || process.env.USERPROFILE || '';
    if (!homeDir) {
      vscode.window.showErrorMessage("Klaus'C0dehelfer: Could not determine home directory.");
      return;
    }
    settingsPath = path.join(homeDir, '.claude', 'settings.local.json');
  } else {
    settingsPath = path.join(vscode.workspace.workspaceFolders![0].uri.fsPath, '.claude', 'settings.local.json');
  }

  Logger.debug(`🔧 Target settings file: ${settingsPath}`);

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
