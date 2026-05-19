import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as process from 'node:process'

let monitor: ClaudeWorkspaceMonitor

interface WorkspaceState
{
    lastClaude: string
    files: string[]
}

// Globalisierung von Parametern / Strings / etc.
const EXT_DEF_FILE = 'KlausC0deHelferData'
const SCOPE_ICONS: string[] = [ `🌐`, `🏭` ]
const AWARENESS_MODE_ICONS: Record<string, string> = { 'none': '☕', 'onDemand': '👀', 'realTime': '🧐' }
function getModeIcon( mode: string ): string { return AWARENESS_MODE_ICONS[ mode ] || '❓' }
// → unser versteckter Zustand
enum State
{
    GLOBAL = 'Klaus.global',        // Rechner-Klaus
    WORKSPACE = 'Klaus.workspace', // Workspace-Klaus
    LASTPATH = 'Klaus.platz'      // Extension Pfad
}
// → unsere Einstellungen
enum Config
{
    MODE = 'awarenessMode',
    FILE = 'stateFileName',
    INCL = 'includePatterns',
    EXCL = 'excludePatterns'
}
// → unser globaler ExtensionContext
class Context
{
    private static ctx: vscode.ExtensionContext
    static init( context: vscode.ExtensionContext ): void { Context.ctx = context }
    static get(): vscode.ExtensionContext { return Context.ctx }
    static path(): string { return Context.ctx.extension.extensionPath }
    static extName(): string { return Context.ctx.extension.packageJSON.name }
    static state( key: State ): string | undefined { return Context.ctx.globalState.get<string>( key ) }
    static setState( k: State, v: string | undefined ): void { Context.ctx.globalState.update( k, v ) }
    static active( key: Config ): any { return vscode.workspace.getConfiguration( Context.extName() )?.get( key ) }
    static global( key: Config ): any { return vscode.workspace.getConfiguration( Context.extName(), null )?.get( key ) }
    static project( key: Config ): any
    {
        return vscode.workspace.getConfiguration( Context.extName(), vscode.workspace.workspaceFolders![ 0 ] )?.get( key )
    }
}
function cleanStateNow(): WorkspaceState  // auch mehrfach benötigt: resetState
{
    return {
        lastClaude: new Date().toISOString(),
        files: [],
    }
}
class Logger // selbstredend …
{
    private static channel: vscode.LogOutputChannel

    static init( context: vscode.ExtensionContext ): void
    {
        const version = ( context.extension.packageJSON as any ).version || 'unknown'
        Logger.channel = vscode.window.createOutputChannel( "Klaus'C0dehelfer", { log: true } )
        Logger.log( `🚀 Klaus'C0dehelfer version 📦${version} startet…` )
    }
    static log( msg: string ): void { Logger.channel.info( msg ) }
    static debug( msg: string ): void { Logger.channel.debug( msg ) }
    static error( msg: string ): void { Logger.channel.error( msg ) }
    static dispose(): void { Logger.channel.dispose() }
}
// JSON.parse wirft immer bei Fehlern - ich hasse sowas! (try-catch-wrapper)
const parseJSON = ( str: string ): any =>
{
    try {
        return JSON.parse( str )
    } catch {
        return {}
    }
}

export class ClaudeWorkspaceMonitor
{
    private klausDatei: string = '';
    private fileWatchers: vscode.FileSystemWatcher[] = [];
    private state: WorkspaceState = cleanStateNow()
    private saveStateTimeout: NodeJS.Timeout | null = null;

    constructor ( context: vscode.ExtensionContext )
    {
        Logger.init( context )
        Context.init( context )
        // Upgrade-Detection: Check if extension path changed (upgrade detected)
        const currentPath = context.extension.extensionPath
        const lastKnownPath = Context.state( State.LASTPATH )
        Context.setState( State.LASTPATH, currentPath )
        this.handleUpgrade( lastKnownPath, currentPath )
        // Beschaffe StateFileNamen
        this.klausDatei = this.getKlausDateiName()
        // Registriere Callback → Handlung bei Config-Änderungen
        vscode.workspace.onDidChangeConfiguration( ( event ) => { this.handleConfigChange( event ) } )
        // Registriere Callback → workspace-Wechsel
        vscode.workspace.onDidChangeWorkspaceFolders( () => { this.handleWorkspaceChange() } )
        // Nun können wir los legen …
        this.handleWorkspaceChange()
    }

    private getKlausDateiName(): string
    {
        const stem = Context.active( Config.FILE ) || EXT_DEF_FILE
        const filename = `${stem}.json`
        const workspaceRoot = vscode.workspace.workspaceFolders![ 0 ].uri.fsPath
        const result = path.join( workspaceRoot, '.vscode', filename )
        if ( !this.klausDatei.length )
            Logger.debug( `🗂️  State file: ${stem} → ${result}` )
        return result
    }

    private getKlausKonfigZiel( global: boolean ): string
    {
        if ( global ) {
            const homeDir = process.env.HOME || process.env.USERPROFILE || ''
            if ( homeDir )
                return path.join( homeDir, '.claude', 'settings.json' )
            else
                Logger.debug( "⛔ Klaus'C0dehelfer: Could not determine home directory." )
        }
        return path.join( vscode.workspace.workspaceFolders![ 0 ].uri.fsPath, '.claude', 'settings.local.json' )
    }

    private klausHookJSON( klaus: fs.PathLike )
    {
        return { type: 'command', command: 'node', args: [ `${path.join( Context.path(), 'dist', 'hook-handler.js' )}`, klaus ] }
    }

    private updateKlausHook( settingsFile: fs.PathLike, klaus: fs.PathLike, set: boolean )
    {
        /**
         *  Hooks setzen und wieder lösen - wie ist das sinnvoll erledigt, welche Parameter werden gebraucht?
         *  → der Hook braucht sein Target Executable
         *  → der Hook braucht die KlausDatei, damit er weiss, wo zu lesen ist.
         *  → eine wiederverwendbare Funktion würde add/remove/update auf einmal können
         *  → der Hook braucht auch einen Pfad, wo er installiert werden soll
         *
         * Settings-File laden (oder erstellen)  */
        const js = parseJSON( fs.existsSync( settingsFile ) ? fs.readFileSync( settingsFile, 'utf-8' ) : '{}' )
        // Egal ob gelöscht werden soll, oder gesetzt.  Einen bestehenden Hook müssen wir zuerst entfernen
        if ( js.hooks && js.hooks.UserPromptSubmit ) {            // Also wird gegen die Parameter gefiltert! (die exe könnte sich bei Versionsbumps ändern!)
            js.hooks.UserPromptSubmit.forEach( ( entry: any ) =>
            {
                if ( entry.hooks ) {
                    entry.hooks = entry.hooks.filter(
                        ( hook: any ) => !( hook.type === 'command' && hook.command === 'node' && hook.args.length === 2 && hook.args[ 1 ] === klaus )
                    )
                }
            } )
        }
        if ( set ) {
            // Sicherstellen, dass die Struktur existiert
            if ( !js.hooks ) js.hooks = {}
            if ( !js.hooks.UserPromptSubmit ) js.hooks.UserPromptSubmit = [ { hooks: [ this.klausHookJSON( klaus ) ] } ]
            else // eigenen Hook setzen
                js.hooks.UserPromptSubmit[ 0 ].hooks.push( this.klausHookJSON( klaus ) )
        }
        try {
            fs.writeFileSync( settingsFile, JSON.stringify( js, null, 2 ) )
            Logger.log( `✅ Hook ` + ( set ? `written to` : `cleared from` ) + ` ${settingsFile}` )
        } catch ( err ) {
            Logger.log( `⛔ Hook update to ${settingsFile} FAILED!` )
        }
    }

    private handleUpgrade( oldPath: string | undefined, newPath: string ): void
    {
        Logger.debug( `🗹🗷 handleUpgrade( ${oldPath}, ${newPath} )` )
        if ( oldPath && newPath !== oldPath ) {
            Logger.log( `♻️ Version change detected!` )
            Logger.debug( `🔧  Old: ${oldPath ? this.getRelativePath( oldPath ) : '(none)'}` )
            Logger.debug( `🔧  New: ${this.getRelativePath( newPath )}` )
            // Falls global konfiguriert war:
            let gs = Context.state( State.GLOBAL )
            if ( gs ) {
                this.updateKlausHook( gs, this.klausDatei, false )
                gs = this.getKlausKonfigZiel( true )
                this.updateKlausHook( gs, this.klausDatei, true )
                Context.setState( State.GLOBAL, gs )
            }
            // Gleiches Spiel lokal/Workspace
            let ps = Context.state( State.WORKSPACE )
            if ( ps ) {
                this.updateKlausHook( ps, this.klausDatei, false )
                ps = this.getKlausKonfigZiel( false )
                this.updateKlausHook( ps, this.klausDatei, true )
                Context.setState( State.WORKSPACE, ps )
            }
        } else if ( !oldPath )
            Logger.log( `🆕 First run: initializing persistent storage` )
    }

    private handleConfigChange( event: vscode.ConfigurationChangeEvent ): void
    {
        /** Wie muss auf welche Konfigurationsänderung reagiert werden?
         *  - pattern change:
         *    → Watcher neu anlegen (wenn aktiv)
         *  - file name change: → interner state sollte immer aktuell sein
         *    → letzten Hook deaktivieren
         *    → neuen State schreiben
         *    → alte Datei löschen
         *    → Hook reaktivieren (wenn nötig)
         *    → Watcher neu anlegen (wenn aktiv)
         *  - mode change:
         *    → letzten Hook deaktivieren
         *    → neuen State schreiben
         *    → Hook aktivieren (wenn nötig)
         *    → Watcher neu anlegen (wenn aktiv)
         */
        const sw = event.affectsConfiguration( Context.extName() + '.' + Config.INCL )
        const kf = event.affectsConfiguration( Context.extName() + '.' + Config.FILE )
        const mc = event.affectsConfiguration( Context.extName() + '.' + Config.MODE )
        const cm = Context.active( Config.MODE )
        const ia = cm !== 'none'
        const gl = Context.project( Config.MODE ) !== cm

        if ( sw || kf || mc ) {
            if ( kf || mc ) {
                const newPath = this.getKlausDateiName() // fragt die Konfig ab
                const newConf = this.getKlausKonfigZiel( gl )// Entscheidet über die Claude-Config
                if ( kf ) {
                    Logger.debug( `🔄  KlausDatei changed: ${this.klausDatei} → ${newPath}` )
                    fs.unlinkSync( this.klausDatei )
                } else
                    Logger.debug( `⚙️  awarenessMode changed: ${ia}` )
                this.updateKlausHook( newConf, this.klausDatei, false )
                this.klausDatei = newPath
                this.saveState()
                if ( ia ) {
                    this.updateKlausHook( newConf, this.klausDatei, true )
                    Context.setState( gl ? State.GLOBAL : State.WORKSPACE, newConf )
                } else
                    Context.setState( gl ? State.GLOBAL : State.WORKSPACE, undefined )
            } else Logger.debug( `🔄  include patterns changed - resetting file system watchers…` )
            this.setupWatchers( ia )
        }
    }

    private handleWorkspaceChange(): void
    {
        Logger.debug( `🗹🗷 handleWorkspaceChange( ${vscode.workspace.name} )` )
        const wsf = vscode.workspace.workspaceFolders
        if ( wsf ) {
            this.loadState()
            const mode = Context.active( Config.MODE )
            const file = Context.active( Config.FILE )
            const isActive = mode !== 'none'
            const isGlobal = Context.project( Config.MODE ) === undefined


            Logger.log( `📋 Workspace '${vscode.workspace.name}' selected: `
                + AWARENESS_MODE_ICONS[ mode ] + SCOPE_ICONS[ isGlobal ? 0 : 1 ]
                + `#${this.setupWatchers( isActive )}:${file}` )

            if ( isActive ) {
                this.dbgCfg()
                return  // no deactivate here!
            }
        } else
            Logger.log( '😴 No workspace open ⇒ Klaus\'C0dehelfer inaktiv.' )
        this.dbgCfg()
        this.deactivate()
    }

    private makeWatcher( b: vscode.Uri, p: string, c: boolean ): vscode.FileSystemWatcher
    {
        return vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern( b, p ), !c, c, c )
    }

    private setupWatchers( enabled: boolean ): number
    {
        // Falls schon Watcher existieren, werden sie vorher entfernt
        Logger.debug( `🗹🗷 setupWatchers( ${enabled} ) - count at start: ${this.fileWatchers.length}` )

        this.fileWatchers.length = 0
        const wsf = vscode.workspace.workspaceFolders?.[ 0 ]
        if ( enabled && wsf ) {
            let patterns = Context.active( Config.INCL ) as string[]
            patterns.forEach( ( pattern ) =>
            {
                const watcher = this.makeWatcher( wsf.uri, pattern, false )
                watcher.onDidChange( ( uri ) => this.trackFileChange( uri.fsPath ) )
                this.fileWatchers.push( watcher )
            } )
            const danke = this.klausDatei + `.danke`
            const watcher = this.makeWatcher( vscode.Uri.file( path.dirname( danke ) ), path.basename( danke ), true )
            watcher.onDidCreate( ( uri ) => { this.dankeSchoen( uri ) } )
            this.fileWatchers.push( watcher )
            Logger.debug(
                `🔍 Klaus wartet auf Dateiänderungen… (…${this.fileWatchers.length} FileSystemWatchers are listening for changes…)`
            )
        } else {
            Logger.debug( '🔇 alle Watcher gelöscht…' )
        }
        return this.fileWatchers.length
    }

    private dankeSchoen( uri: vscode.Uri ): void
    {
        // Das ist der eigentliche Danke-Handler!
        const fp = uri.fsPath
        if ( path.extname( fp ) === '.danke' ) {
            Logger.log( `🙏 Danke received: hook has read state…` )
            this.state = cleanStateNow()
            try {
                fs.unlinkSync( fp )
                Logger.debug( `🧹 Danke file cleaned up` )
            } catch ( err ) {
                Logger.debug( `ℹ️  Could not delete danke file: ${err}` )
            }
            this.saveStateDebounced()
        }
    }

    private trackFileChange( filePath: string ): void
    {
        if ( this.isExcluded( filePath ) ) Logger.debug( `🚫 Excluded: ${filePath}` )
        else {
            const relativePath = this.getRelativePath( filePath )
            if ( !this.state.files.includes( relativePath ) ) {
                this.state.files.push( relativePath )
                Logger.log( `✏️  [${new Date().toISOString()}] ${relativePath}` )
            } else {
                Logger.debug( `⏭️  Already tracked: ${relativePath}` )
            }
            this.saveStateDebounced()
        }
    }

    private isExcluded( filePath: string ): boolean
    {
        return ( Context.active( Config.EXCL ) as string[] )?.some( ( pattern ) =>
        { // Escape the patterns
            const escaped = pattern
                .replace( /\./g, '\\.' )
                .replace( /\*/g, '[^/]*' )
                .replace( /\?/g, '[^/]' )
                .replace( /\*\*/g, '.*' )
            let regex = new RegExp( `(^|/)${escaped}($|/)` )
            return regex.test( filePath )
        } )
    }

    private getRelativePath( filePath: string ): string
    {
        // Relative Pfade - relativ zum Workspace?
        const workspaceFolder = vscode.workspace.getWorkspaceFolder( vscode.Uri.file( filePath ) )
        if ( workspaceFolder ) return path.relative( workspaceFolder.uri.fsPath, filePath )
        else {// try to make relative to vscode
            const rp = path.relative( path.dirname( Context.get().globalStorageUri.fsPath ), filePath )
            if ( rp.length ) return rp
        }
        return filePath
    }

    private loadState(): void
    {
        const dat = this.klausDatei
        try {
            if ( fs.existsSync( dat ) ) {
                const data = fs.readFileSync( dat, 'utf-8' )
                const parsed = JSON.parse( data )
                this.state = {
                    lastClaude: parsed.lastClaude || new Date().toISOString(),
                    files: parsed.files || [],
                }
                Logger.debug( `📂 loadState: loaded ${this.state.files.length} files, lastClaude=${this.state.lastClaude}` )
            } else {
                this.state = cleanStateNow()
                Logger.debug( `📂 loadState: file not found at ${dat} → state reset to "now".` )
            }
        } catch ( err ) {
            this.state = cleanStateNow()
            Logger.error( `⛔ Failed to load state: ${err}` )
        }
    }

    private saveStateDebounced(): void
    {
        if ( !this.saveStateTimeout ) {
            try {
                const dir = path.dirname( this.klausDatei )
                if ( !fs.existsSync( dir ) ) {
                    fs.mkdirSync( dir, { recursive: true } )
                }
                fs.writeFileSync( `${this.klausDatei}.lock`, '' )
                Logger.debug( `🔒 Lock set (debounce started)` )
            } catch ( err ) {
                Logger.debug( `⚠️  Could not set lock on debounce: ${err}` )
            }
        }
        if ( this.saveStateTimeout ) { clearTimeout( this.saveStateTimeout ) }
        this.saveStateTimeout = setTimeout( () => { this.saveState() }, 3000 )
    }

    private saveState(): void
    {
        try {
            const absolutePath = this.klausDatei
            const lockPath = `${absolutePath}.lock`
            const dir = path.dirname( absolutePath )
            if ( !fs.existsSync( dir ) ) {
                fs.mkdirSync( dir, { recursive: true } )
            }
            if ( !fs.existsSync( lockPath ) ) {
                fs.writeFileSync( lockPath, '' )
            }
            fs.writeFileSync( absolutePath, JSON.stringify( this.state, null, 2 ) )
            fs.unlinkSync( lockPath )
            Logger.debug( `💾 State saved to ${absolutePath}` )
        } catch ( err ) {
            Logger.error( `⛔ Failed to save state: ${err}` )
        }
    }

    deactivate(): void
    {
        this.fileWatchers.forEach( ( w ) => w.dispose() )
        if ( this.saveStateTimeout ) {
            clearTimeout( this.saveStateTimeout )
        }
        this.saveState()
        Logger.log( '🔌 Klaus\'C0dehelfer deaktiviert…' )
    }

    // Debugging-Helfer (warum nur an einer Stelle den "guten" ouput haben?)
    private dbgCfg()
    {
        const gm = Context.global( Config.MODE )
        const pm = Context.project( Config.MODE )
        const gf = Context.global( Config.FILE ) || EXT_DEF_FILE
        const pf = Context.project( Config.FILE ) || EXT_DEF_FILE
        const ia = gm !== 'none' || pm !== 'none'

        Logger.debug( `📝 current Klaus'C0dehelfer configuration: ${AWARENESS_MODE_ICONS[ Context.active( Config.MODE ) ]}` )
        Logger.debug( `🌐 GLOBAL: ⇒mode ${AWARENESS_MODE_ICONS[ gm ]}, ⇒stateFile=${gf}, ⇒🪝 '${Context.state( State.GLOBAL ) || '(not set)'}'` )
        Logger.debug( `🏭 PROJECT:⇒mode ${AWARENESS_MODE_ICONS[ pm ]}, ⇒stateFile=${pf}, ⇒🪝 '${Context.state( State.WORKSPACE ) || '(not set)'}'` )
        if ( vscode.workspace.workspaceFolders ) {
            Logger.debug( `🗃️ Workspace folders: ` )
            vscode.workspace.workspaceFolders.forEach( f => { Logger.debug( `  📂 ${this.getRelativePath( f.uri.fsPath ) || f.uri.fsPath}` ) } )
        }
        Logger.debug( `⌚ lastKlaus: ${this.state.lastClaude}` )
        if ( this.state.files.length ) {
            Logger.debug( `📑 files changed:` )
            this.state.files.forEach( ( f ) => Logger.debug( `  💾 ${this.getRelativePath( f )}` ) )
        }
    }
}

export function activate( context: vscode.ExtensionContext )
{
    monitor = new ClaudeWorkspaceMonitor( context )
    context.subscriptions.push(
        vscode.commands.registerCommand( Context.extName() + '.openSettings',
            () => { vscode.commands.executeCommand( 'workbench.action.openSettings', Context.extName() ) } )
    )
}

export function deactivate()
{
    monitor.deactivate()
}
