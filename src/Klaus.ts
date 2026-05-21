import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Context, Logger, StateKey, ConfigKey, EXT_DEF_FILE, SCOPE_ICONS, getModeIcon, WorkspaceChangeLog, cleanWorkspaceChangesNow, parseJSON } from './KlausDinge'

// → aktueller Laufzeit-Zustand der Extension - GLOBAL VARS
let klausMode: string = 'none'
let klausFile: string = ''
let klausIncl: string[] = []
let klausInit: boolean = false
let fileWatchers: vscode.FileSystemWatcher[] = []
let state: WorkspaceChangeLog = cleanWorkspaceChangesNow()
let saveStateTimeout: NodeJS.Timeout | null = null

// → VSCode Extension integration
export function activate( context: vscode.ExtensionContext )
{
    Logger.init( context )
    Context.init( context )
    handleLegacyBugs()
    handleUpgrade()
    const cfg = vscode.workspace.getConfiguration( Context.extName() )
    if ( cfg ) {
        klausMode = cfg.get( ConfigKey.MODE, 'none' )
        klausFile = cfg.get( ConfigKey.FILE, '' )
        klausIncl = cfg.get( ConfigKey.INCL, [] )
    }
    vscode.workspace.onDidChangeWorkspaceFolders( () => { handleWorkspaceChange() } )
    vscode.workspace.onDidChangeConfiguration( ( event ) => { handleConfigChange( event ) } )
    context.subscriptions.push(
        vscode.commands.registerCommand( Context.extName() + '.openSettings',
            () => { vscode.commands.executeCommand( 'workbench.action.openSettings', Context.extName() ) } )
    )
}

export function deactivate()
{
    if ( saveStateTimeout ) clearTimeout( saveStateTimeout )
    fileWatchers.forEach( ( w ) => w.dispose() )
    saveState()
    Logger.log( '🔌 Klaus\'C0dehelfer deaktiviert…' )
}

// → Master Functions:
function handleLegacyBugs(): void
{
    // a7 Bug: Hook-Pfade in globalState → a8 räumt auf
    const legacyGlobal = Context.get().globalState.get<string>( StateKey.DEPRECATED_GLOBAL )
    if ( legacyGlobal ) {
        Logger.log( `🩹 handleLegacyBugs: Entferne Klaus-Hooks aus globalem State` )
        const stateFileStem = Context.active( ConfigKey.FILE ) || EXT_DEF_FILE
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
        Context.get().globalState.update( StateKey.DEPRECATED_GLOBAL, undefined )
    }

    // Legacy: State-Keys löschen (nicht mehr nötig)
    Context.get().globalState.update( StateKey.DEPRECATED_WORKSPACE, undefined )
    Context.get().workspaceState.update( StateKey.DEPRECATED_WORKSPACE, undefined )
}

function handleUpgrade(): void
{
    const currentPath = Context.path()
    const lastKnownPath = Context.state( StateKey.LASTPATH )
    Context.setState( StateKey.LASTPATH, currentPath )

    Logger.debug( `🗹🗷 handleUpgrade()` )
    if ( lastKnownPath && currentPath !== lastKnownPath ) {
        Logger.log( `♻️ Version change detected!` )
        Logger.debug( `🔧  Old: ${getRelativePath( lastKnownPath )}` )
        Logger.debug( `🔧  New: ${getRelativePath( currentPath )}` )
    } else if ( !lastKnownPath )
        Logger.log( `🆕 First run: initializing persistent storage` )
}

function handleWorkspaceChange(): void
{
    Logger.debug( `🗹🗷 handleWorkspaceChange( ${vscode.workspace.name} )` )

    const newDatei = getKlausDateiName()

    if ( newDatei ) {   // Informationen beschaffen
        klausFile = newDatei
        const mode = Context.active( ConfigKey.MODE )
        const isActive = mode !== 'none'
        const fromOverride = Context.project( ConfigKey.MODE ) === undefined

        // Wenn der Nutzer kein Feedback für Klaus wünscht, sollte auch "altes Feedback"
        if ( mode === 'none' ) state = cleanWorkspaceChangesNow() // entfernt werden!
        else loadState()
        // Klaus (de)aktivieren…
        updateKlausHook( getKlausKonfigZiel(), klausFile, isActive )
        // Watcher aktivieren
        let wcnt = setupWatchers( isActive )
        // Korrekte Ausgabe mit Warnung - sollte nur noch 1x erfolgen.
        if ( !isActive || wcnt > ( vscode.workspace.workspaceFolders?.length || 1 ) ) {
            Logger.log( `📋 Workspace '${vscode.workspace.name}' selected: `
                + getModeIcon( mode ) + SCOPE_ICONS[ fromOverride ? 0 : 1 ]
                + `#${wcnt}:${Context.active( ConfigKey.FILE )}` )
            if ( mode !== Context.project( ConfigKey.MODE ) ) { // Warnung vor dem Hund
                if ( mode === 'none' )
                    Logger.log( `⚠️  Klaus erhält KEINE Daten (Workspace deaktiviert, Folder="${Context.project( ConfigKey.MODE )}")!` )
                else
                    Logger.log( `⚠️  Klaus Daten werden VERSCHLUCKT (Folder deaktiviert, Workspace="${mode}")!` )
            }
            klausInit = true
        } else Logger.debug( `📋 Workspace '${vscode.workspace.name}' reconfigured.` )
    } else {
        if ( klausFile !== '' ) {
            klausFile = ''
            Logger.log( `😴 No workspace open ⇒ Klaus\'C0dehelfer inaktiv.` )
            klausInit = true
        }
    }
    dbgCfg()
}

function handleConfigChange( e: vscode.ConfigurationChangeEvent ): void
{
    if ( e.affectsConfiguration( ConfigKey.INCL ) && klausIncl !== Context.active( ConfigKey.INCL ) ) {
        Logger.log( `🔁 Watchers need reconfiguration!` )
        setupWatchers( Context.active( ConfigKey.MODE ) !== 'none' )
    } else if ( ( e.affectsConfiguration( ConfigKey.MODE ) && klausMode !== Context.active( ConfigKey.MODE ) )
        || ( e.affectsConfiguration( ConfigKey.FILE ) && klausFile !== Context.active( ConfigKey.FILE ) )
        || !klausInit
    ) {
        if ( !klausInit ) klausInit = true
        else Logger.log( `🔁 Configuration change detected!` )
        handleWorkspaceChange()
    } else Logger.debug( `🔄 unimportant Configuration change detected.` )
}

function saveState(): void
{
    try {
        const absolutePath = klausFile
        if ( absolutePath.length ) {
            const lockPath = `${absolutePath}.lock`
            const dir = path.dirname( absolutePath )

            if ( !fs.existsSync( dir ) ) fs.mkdirSync( dir, { recursive: true } )
            if ( !fs.existsSync( lockPath ) ) fs.writeFileSync( lockPath, '' )

            fs.writeFileSync( absolutePath, JSON.stringify( state, null, 2 ) )
            fs.unlinkSync( lockPath )
            Logger.debug( `💾 State saved to ${absolutePath}` )
        }
    } catch ( err ) {
        Logger.error( `⛔ Failed to save state: ${err}` )
    }
}

// → Secondary Functions:

function getKlausDateiName(): string | undefined
{
    const stem = Context.active( ConfigKey.FILE ) || EXT_DEF_FILE
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

function getKlausKonfigZiel(): string
{
    let base = vscode.workspace.workspaceFolders![ 0 ].uri.fsPath // Fallback.
    if ( klausFile.length )
        // KlausDatei hat den Pfad schon bestimmt.  Von ${baseDir}/.vscode/klausfile zu baseDir:
        base = path.dirname( path.dirname( klausFile ) )
    return path.join( base, '.claude', 'settings.local.json' )
}

function klausHookJSON( klaus: fs.PathLike )
{
    return { type: 'command', command: 'node', args: [ `${path.join( Context.path(), 'dist', 'KlausHaken.js' )}`, klaus ] }
}

function updateKlausHook( settingsFile: fs.PathLike, klaus: fs.PathLike, set: boolean )
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
        if ( !js.hooks.UserPromptSubmit ) js.hooks.UserPromptSubmit = [ { hooks: [ klausHookJSON( klaus ) ] } ]
        else // eigenen Hook setzen
            js.hooks.UserPromptSubmit[ 0 ].hooks.push( klausHookJSON( klaus ) )
    }
    try {
        fs.writeFileSync( settingsFile, JSON.stringify( js, null, 2 ) )
        Logger.log( `✅ Hook ` + ( set ? `written to` : `cleared from` ) + ` ${settingsFile}` )
    } catch ( err ) {
        if ( set )
            Logger.log( `⛔ Hook setup to ${settingsFile} FAILED!` )
    }
}

function makeWatcher( b: vscode.Uri, p: string, c: boolean ): vscode.FileSystemWatcher
{
    return vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern( b, p ), !c, c, c )
}

function setupWatchers( enabled: boolean ): number
{
    // Falls schon Watcher existieren, werden sie vorher entfernt
    Logger.debug( `🗹🗷 setupWatchers( ${enabled} ) - count at start: ${fileWatchers.length}` )

    fileWatchers.length = 0
    const wsf = vscode.workspace.workspaceFolders?.[ 0 ]
    if ( enabled && wsf ) {
        let patterns = Context.active( ConfigKey.INCL ) as string[]
        patterns.forEach( ( pattern ) =>
        {
            const watcher = makeWatcher( wsf.uri, pattern, false )
            watcher.onDidChange( ( uri ) => trackFileChange( uri.fsPath ) )
            fileWatchers.push( watcher )
        } )
        const danke = klausFile + `.danke`
        const watcher = makeWatcher( vscode.Uri.file( path.dirname( danke ) ), path.basename( danke ), true )
        watcher.onDidCreate( ( uri ) => { dankeSchoen( uri ) } )
        fileWatchers.push( watcher )
        Logger.debug(
            `🔍 Klaus wartet auf Dateiänderungen… (…${fileWatchers.length} FileSystemWatchers are listening for changes…)`
        )
    } else {
        Logger.debug( '🔇 alle Watcher gelöscht…' )
    }
    return fileWatchers.length
}

function dankeSchoen( uri: vscode.Uri ): void
{
    Logger.log( `🙏 Danke received: hook has read state…` )
    state = cleanWorkspaceChangesNow()
    try {
        fs.unlinkSync( uri.fsPath )
        Logger.debug( `🧹 Danke file cleaned up` )
    } catch ( err ) {
        Logger.debug( `ℹ️  Could not delete danke file: ${err}` )
    }
    saveStateDebounced()
}

function trackFileChange( filePath: string ): void
{
    if ( isExcluded( filePath ) ) Logger.debug( `🚫 Excluded: ${filePath}` )
    else {
        const relativePath = getRelativePath( filePath )
        if ( !state.files.includes( relativePath ) ) {
            state.files.push( relativePath )
            Logger.log( `✏️  [${new Date().toISOString()}] ${relativePath}` )
        } else {
            Logger.debug( `⏭️  Already tracked: ${relativePath}` )
        }
        saveStateDebounced()
    }
}

function isExcluded( filePath: string ): boolean
{
    return ( Context.active( ConfigKey.EXCL ) as string[] )?.some( ( pattern ) =>
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

function getRelativePath( filePath: string ): string
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

function loadState(): void
{
    const dat = klausFile
    if ( dat.length )
        try {
            if ( fs.existsSync( dat ) ) {
                const data = fs.readFileSync( dat, 'utf-8' )
                const parsed = JSON.parse( data )
                state = {
                    lastClaude: parsed.lastClaude || new Date().toISOString(),
                    files: parsed.files || [],
                }
                Logger.debug( `📂 loadState: loaded ${state.files.length} files, lastClaude=${state.lastClaude}` )
            } else {
                state = cleanWorkspaceChangesNow()
                Logger.debug( `📂 loadState: file not found at ${dat} → state reset to "now".` )
            }
        } catch ( err ) {
            state = cleanWorkspaceChangesNow()
            Logger.error( `⛔ Failed to load state: ${err} → state reset to "now".` )
        }
    else Logger.log( `⛔ no state to load.` )
}

function saveStateDebounced(): void
{
    if ( !saveStateTimeout && klausFile.length ) {
        try {
            const dir = path.dirname( klausFile )
            if ( !fs.existsSync( dir ) ) {
                fs.mkdirSync( dir, { recursive: true } )
            }
            fs.writeFileSync( `${klausFile}.lock`, '' )
            Logger.debug( `🔒 Lock set (debounce started)` )
        } catch ( err ) {
            Logger.debug( `⚠️  Could not set lock on debounce: ${err}` )
        }
    }
    if ( saveStateTimeout ) { clearTimeout( saveStateTimeout ) }
    saveStateTimeout = setTimeout( () => { saveState() }, 3000 )
}

// Debugging-Helfer (warum nur an einer Stelle den "guten" ouput haben?)
function dbgCfg()
{
    const gm = Context.global( ConfigKey.MODE )
    const gf = Context.global( ConfigKey.FILE ) || EXT_DEF_FILE
    const pm = Context.project( ConfigKey.MODE )
    const pf = Context.project( ConfigKey.FILE ) || EXT_DEF_FILE
    const am = Context.active( ConfigKey.MODE )
    const af = Context.active( ConfigKey.FILE ) || EXT_DEF_FILE
    const ia = gm !== 'none' || pm !== 'none' || am !== 'none'

    Logger.debug( `📝 current Klaus'C0dehelfer configuration:` )
    Logger.debug( `🌐 GLOBAL: ⇒mode ${getModeIcon( gm )}, ⇒stateFile=${gf}` )
    Logger.debug( `🏭 PROJECT:⇒mode ${getModeIcon( pm )}, ⇒stateFile=${pf}` )
    Logger.debug( `${ia ? `✅` : `❎`} ACTIVE: ⇒mode ${getModeIcon( am )}, ⇒stateFile=${af}` )
    if ( vscode.workspace.workspaceFolders ) {
        Logger.debug( `🗃️ Workspace folders: ` )
        vscode.workspace.workspaceFolders.forEach( f => { Logger.debug( `  📂 ${getRelativePath( f.uri.fsPath ) || f.uri.fsPath}` ) } )
    }
    Logger.debug( `⌚ lastKlaus: ${state.lastClaude}` )
    if ( state.files.length ) {
        Logger.debug( `📑 files changed:` )
        state.files.forEach( ( f ) => Logger.debug( `  💾 ${getRelativePath( f )}` ) )
    }
}
