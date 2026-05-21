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
class CurrentConfig
{
    mode: string
    file: string
    incl: string[]
    excl: string[]
    public init: boolean = false
    constructor ( c: vscode.ExtensionContext )
    {
        const cfg = vscode.workspace.getConfiguration( Context.extName() )
        if ( cfg ) {
            this.mode = cfg.get( Config.MODE, `` )
            this.file = cfg.get( Config.FILE, `` )
            this.incl = cfg.get( Config.INCL, [] )
            this.excl = cfg.get( Config.EXCL, [] )
        } else {
            this.mode = ``; this.file = ``; this.incl = []; this.excl = []
        }
    }
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
    static state( key: State ): string | undefined
    {
        switch ( key ) {
            case State.WORKSPACE: return Context.ctx.workspaceState.get<string>( key )
            case State.GLOBAL:
            case State.LASTPATH: return Context.ctx.globalState.get<string>( key )
        }
    }
    static setState( k: State, v: string | undefined ): void
    {
        switch ( k ) {
            case State.WORKSPACE: Context.ctx.workspaceState.update( k, v ); break
            case State.GLOBAL:
            case State.LASTPATH: Context.ctx.globalState.update( k, v ); break
        }
    }
    static active( key: Config ): any { return vscode.workspace.getConfiguration( Context.extName() )?.get( key ) }
    static global( key: Config ): any { return vscode.workspace.getConfiguration( Context.extName(), null )?.get( key ) }
    static project( key: Config ): any
    {
        if ( vscode.workspace.name === undefined ) return undefined
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
    private klaus
    private fileWatchers: vscode.FileSystemWatcher[] = [];
    private state: WorkspaceState = cleanStateNow()
    private saveStateTimeout: NodeJS.Timeout | null = null;

    constructor ( context: vscode.ExtensionContext )
    {
        Logger.init( context )
        Context.init( context )
        this.handleLegacyBugs()
        this.handleUpgrade()
        // lies aus, was aktuell "gültig ist"
        this.klaus = new CurrentConfig( context )
        // Registriere Callback → workspace-Wechsel
        vscode.workspace.onDidChangeWorkspaceFolders( () => { this.handleWorkspaceChange() } )
        // Registriere Callback → Handlung bei Config-Änderungen
        vscode.workspace.onDidChangeConfiguration( ( event ) => { this.handleConfigChange( event ) } )
        // Nun können wir los legen … Ähm … nein, das macht VScode für uns.
    }

    private getKlausDateiName(): string | undefined
    {
        const stem = Context.active( Config.FILE ) || EXT_DEF_FILE
        const filename = `${stem}.json`

        let workspaceRoot = vscode.workspace.name

        if ( workspaceRoot !== undefined ) {
            if ( vscode.workspace.workspaceFile ) {
                workspaceRoot = path.dirname( vscode.workspace.workspaceFile.fsPath )
                Logger.debug( `🔍 Using workspaceFile dir: ${workspaceRoot}` )
            } else if ( vscode.workspace.workspaceFolders?.length ) {
                workspaceRoot = vscode.workspace.workspaceFolders[ 0 ].uri.fsPath
                Logger.debug( `🔍 Using workspaceFolders[0]: ${workspaceRoot}` )
            }
        } else {
            Logger.debug( `🔍 No workspace folder…` )
        }
        if ( workspaceRoot )
            workspaceRoot = path.join( workspaceRoot, '.vscode', filename )
        return workspaceRoot
    }

    private getKlausKonfigZiel(): string
    {
        let base = vscode.workspace.workspaceFolders![ 0 ].uri.fsPath // Fallback.
        if ( this.klaus.file.length )
            // KlausDatei hat den Pfad schon bestimmt.  Von ${baseDir}/.vscode/klausfile zu baseDir:
            base = path.dirname( path.dirname( this.klaus.file ) )
        return path.join( base, '.claude', 'settings.local.json' )
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
            if ( set )
                Logger.log( `⛔ Hook setup to ${settingsFile} FAILED!` )
        }
    }

    private handleLegacyBugs(): void
    {
        // a7 Bug: Hook-Pfade in globalState → a8 räumt auf
        const legacyGlobal = Context.get().globalState.get<string>( State.GLOBAL )
        if ( legacyGlobal ) {
            Logger.log( `🩹 handleLegacyBugs: Entferne Klaus-Hooks aus globalem State` )
            const stateFileStem = Context.active( Config.FILE ) || EXT_DEF_FILE
            try {
                const js = parseJSON( fs.readFileSync( legacyGlobal, 'utf-8' ) )
                if ( js.hooks?.UserPromptSubmit ) {
                    js.hooks.UserPromptSubmit.forEach( ( entry: any ) =>
                    {
                        if ( entry.hooks ) {
                            entry.hooks = entry.hooks.filter(
                                ( hook: any ) => !(
                                    hook.type === 'command' &&
                                    hook.command === 'node' &&
                                    hook.args?.length === 2 &&
                                    hook.args[ 0 ]?.includes( 'hook-handler.js' ) &&
                                    hook.args[ 1 ]?.includes( stateFileStem )
                                )
                            )
                        }
                    } )
                }
                fs.writeFileSync( legacyGlobal, JSON.stringify( js, null, 2 ) )
                Logger.log( `🩹 Klaus-Hooks aus ${legacyGlobal} entfernt.` )
            } catch ( err ) {
                Logger.debug( `🩹 Fehler beim Cleanup von ${legacyGlobal}: ${err}` )
            }
            Context.get().globalState.update( State.GLOBAL, undefined )
        }

        // Legacy: State-Keys löschen (nicht mehr nötig)
        Context.get().globalState.update( State.WORKSPACE, undefined )
        Context.get().workspaceState.update( State.WORKSPACE, undefined )
    }

    private handleUpgrade(): void
    {
        const currentPath = Context.path()
        const lastKnownPath = Context.state( State.LASTPATH )
        Context.setState( State.LASTPATH, currentPath )

        Logger.debug( `🗹🗷 handleUpgrade()` )
        if ( lastKnownPath && currentPath !== lastKnownPath ) {
            Logger.log( `♻️ Version change detected!` )
            Logger.debug( `🔧  Old: ${this.getRelativePath( lastKnownPath )}` )
            Logger.debug( `🔧  New: ${this.getRelativePath( currentPath )}` )
        } else if ( !lastKnownPath )
            Logger.log( `🆕 First run: initializing persistent storage` )
    }

    private handleWorkspaceChange(): void
    {
        Logger.debug( `🗹🗷 handleWorkspaceChange( ${vscode.workspace.name} )` )

        const newDatei = this.getKlausDateiName()

        if ( newDatei ) {   // Informationen beschaffen
            this.klaus.file = newDatei
            const mode = Context.active( Config.MODE )
            const isActive = mode !== 'none'
            const fromOverride = Context.project( Config.MODE ) === undefined

            // Wenn der Nutzer kein Feedback für Klaus wünscht, sollte auch "altes Feedback"
            if ( mode === 'none' ) this.state = cleanStateNow() // entfernt werden!
            else this.loadState()
            // Klaus (de)aktivieren…
            this.updateKlausHook( this.getKlausKonfigZiel(), this.klaus.file, isActive )
            // Watcher aktivieren
            let wcnt = this.setupWatchers( isActive )
            // Korrekte Ausgabe mit Warnung - sollte nur noch 1x erfolgen.
            if ( !isActive || wcnt > ( vscode.workspace.workspaceFolders?.length || 1 ) ) {
                Logger.log( `📋 Workspace '${vscode.workspace.name}' selected: `
                    + AWARENESS_MODE_ICONS[ mode ] + SCOPE_ICONS[ fromOverride ? 0 : 1 ]
                    + `#${wcnt}:${Context.active( Config.FILE )}` )
                if ( mode !== Context.project( Config.MODE ) ) { // Warnung vor dem Hund
                    if ( mode === 'none' )
                        Logger.log( `⚠️  Klaus erhält KEINE Daten (Workspace deaktiviert, Folder="${Context.project( Config.MODE )}")!` )
                    else
                        Logger.log( `⚠️  Klaus Daten werden VERSCHLUCKT (Folder deaktiviert, Workspace="${mode}")!` )
                }
                this.klaus.init = true
            } else Logger.debug( `📋 Workspace '${vscode.workspace.name}' reconfigured.` )
        } else {
            if ( this.klaus.file !== '' ) {
                this.klaus.file = ''
                Logger.log( `😴 No workspace open ⇒ Klaus\'C0dehelfer inaktiv.` )
                this.klaus.init = true
            }
        }
        this.dbgCfg()
    }

    private handleConfigChange( e: vscode.ConfigurationChangeEvent ): void
    {
        if ( e.affectsConfiguration( Config.INCL ) && this.klaus.incl !== Context.active( Config.INCL ) ) {
            Logger.log( `🔁 Watchers need reconfiguration!` )
            this.setupWatchers( Context.active( Config.MODE ) !== 'none' )
        } else if ( ( e.affectsConfiguration( Config.MODE ) && this.klaus.mode !== Context.active( Config.MODE ) )
            || ( e.affectsConfiguration( Config.FILE ) && this.klaus.file !== Context.active( Config.FILE ) )
            || !this.klaus.init
        ) {
            if ( !this.klaus.init ) this.klaus.init = true
            else Logger.log( `🔁 Configuration change detected!` )
            this.handleWorkspaceChange()
        } else Logger.debug( `🔄 unimportant Configuration change detected.` )
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
            const danke = this.klaus.file + `.danke`
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
        Logger.log( `🙏 Danke received: hook has read state…` )
        this.state = cleanStateNow()
        try {
            fs.unlinkSync( uri.fsPath )
            Logger.debug( `🧹 Danke file cleaned up` )
        } catch ( err ) {
            Logger.debug( `ℹ️  Could not delete danke file: ${err}` )
        }
        this.saveStateDebounced()
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
        else if ( Context.get().storageUri ) { // try to make relative to workspace storage
            const rp = path.relative( path.dirname( Context.get().storageUri!.fsPath ), filePath )
            if ( rp.length ) return rp
        }
        return filePath
    }

    private loadState(): void
    {
        const dat = this.klaus.file
        if ( dat.length )
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
                Logger.error( `⛔ Failed to load state: ${err} → state reset to "now".` )
            }
        else Logger.log( `⛔ no state to load.` )
    }

    private saveStateDebounced(): void
    {
        if ( !this.saveStateTimeout && this.klaus.file.length ) {
            try {
                const dir = path.dirname( this.klaus.file )
                if ( !fs.existsSync( dir ) ) {
                    fs.mkdirSync( dir, { recursive: true } )
                }
                fs.writeFileSync( `${this.klaus.file}.lock`, '' )
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
            const absolutePath = this.klaus.file
            if ( absolutePath.length ) {
                const lockPath = `${absolutePath}.lock`
                const dir = path.dirname( absolutePath )

                if ( !fs.existsSync( dir ) ) fs.mkdirSync( dir, { recursive: true } )
                if ( !fs.existsSync( lockPath ) ) fs.writeFileSync( lockPath, '' )

                fs.writeFileSync( absolutePath, JSON.stringify( this.state, null, 2 ) )
                fs.unlinkSync( lockPath )
                Logger.debug( `💾 State saved to ${absolutePath}` )
            }
        } catch ( err ) {
            Logger.error( `⛔ Failed to save state: ${err}` )
        }
    }

    deactivate(): void
    {
        this.fileWatchers.forEach( ( w ) => w.dispose() )
        if ( this.saveStateTimeout ) clearTimeout( this.saveStateTimeout )
        this.saveState()
        Logger.log( '🔌 Klaus\'C0dehelfer deaktiviert…' )
    }

    // Debugging-Helfer (warum nur an einer Stelle den "guten" ouput haben?)
    private dbgCfg()
    {
        const gm = Context.global( Config.MODE )
        const gf = Context.global( Config.FILE ) || EXT_DEF_FILE
        const pm = Context.project( Config.MODE )
        const pf = Context.project( Config.FILE ) || EXT_DEF_FILE
        const am = Context.active( Config.MODE )
        const af = Context.active( Config.FILE ) || EXT_DEF_FILE
        const ia = gm !== 'none' || pm !== 'none' || am !== 'none'

        Logger.debug( `📝 current Klaus'C0dehelfer configuration:` )
        Logger.debug( `🌐 GLOBAL: ⇒mode ${AWARENESS_MODE_ICONS[ gm ]}, ⇒stateFile=${gf}` )
        Logger.debug( `🏭 PROJECT:⇒mode ${AWARENESS_MODE_ICONS[ pm ]}, ⇒stateFile=${pf}` )
        Logger.debug( `${ia ? `✅` : `❎`} ACTIVE: ⇒mode ${AWARENESS_MODE_ICONS[ am ]}, ⇒stateFile=${af}` )
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
