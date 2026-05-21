import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { K, Context, Logger, StateKey, ConfigKey, modeIcon, scopeIcon, WorkspaceChangeLog } from './KlausDinge'

// → VSCode Extension integration
export function activate( context: vscode.ExtensionContext )
{
    Logger.init( context )
    Context.init( context )
    handleLegacyBugs()
    handleUpgrade()
    // das Folgende dürfen wir 1x anstelle "const EXT_DEF_FILE = 'KlausC0deHelferData'" machen.
    K.defName = context.extension.packageJSON.contributes.configuration.properties[ 'claude-c0de-workspace-watcher.stateFileName' ].default
    const cfg = vscode.workspace.getConfiguration( Context.extName() )
    if ( cfg ) {
        K.mode = cfg.get( ConfigKey.MODE, 'none' )
        K.file = cfg.get( ConfigKey.FILE, '' )
        K.incl = cfg.get( ConfigKey.INCL, [] )
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
    if ( K.wartet ) clearTimeout( K.wartet )
    K.augen.forEach( ( w ) => w.dispose() )
    K.saveState()
    Logger.log( '🔌 Klaus\'C0dehelfer deaktiviert…' )
}

// → Master Functions:
//  1st up: handle all those heaps of thrash Klaus and Stefan produced in earlier versions.
function handleLegacyBugs(): void
{
    // a7 Bug: Hook-Pfade in globalState → a8 räumt auf
    const legacyGlobal = Context.get().globalState.get<string>( StateKey.DEPRECATED_GLOBAL )
    if ( legacyGlobal ) {
        Logger.log( `🩹 handleLegacyBugs: Entferne Klaus-Hooks aus globalem State` )
        const stateFileStem = Context.active( ConfigKey.FILE ) || K.defName
        try {
            const js = K.parseJSON( fs.readFileSync( legacyGlobal, 'utf-8' ) )
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
//  2nd: handle a version bump (does not matter if up or down…)
function handleUpgrade(): void
{
    const currentPath = Context.path()
    const lastKnownPath = Context.state( StateKey.LASTPATH )
    Context.setState( StateKey.LASTPATH, currentPath )

    Logger.debug( `🗹🗷 handleUpgrade()` )
    if ( lastKnownPath && currentPath !== lastKnownPath ) {
        Logger.log( `♻️ Version change detected!` )
        Logger.debug( `🔧  Old: ${K.getRelativePath( lastKnownPath )}` )
        Logger.debug( `🔧  New: ${K.getRelativePath( currentPath )}` )
    } else if ( !lastKnownPath )
        Logger.log( `🆕 First run: initializing persistent storage` )
}
//  VSCode callback #1 → User selects or changes the workspace.
function handleWorkspaceChange(): void
{
    Logger.debug( `🗹🗷 handleWorkspaceChange( ${vscode.workspace.name} )` )

    const newDatei = K.getDateiName()

    if ( newDatei ) {   // Informationen beschaffen
        K.file = newDatei
        const mode = Context.active( ConfigKey.MODE )
        const isActive = mode !== 'none'
        const fromOverride = Context.project( ConfigKey.MODE ) === undefined

        // Wenn der Nutzer kein Feedback für Klaus wünscht, sollte auch "altes Feedback"
        if ( mode === 'none' ) K.log = new WorkspaceChangeLog() // entfernt werden!
        else K.loadState()
        // Klaus (de)aktivieren…
        let _base = vscode.workspace.workspaceFolders![ 0 ].uri.fsPath // Fallback.
        if ( K.file.length )
            // KlausDatei hat den Pfad schon bestimmt.  Von ${baseDir}/.vscode/klausfile zu baseDir:
            _base = path.dirname( path.dirname( K.file ) )
        updateKlausHook( path.join( _base, '.claude', 'settings.local.json' ), K.file, isActive )
        // Watcher aktivieren
        let wcnt = setupWatchers( isActive )
        // Korrekte Ausgabe mit Warnung - sollte nur noch 1x erfolgen.
        if ( !isActive || wcnt > ( vscode.workspace.workspaceFolders?.length || 1 ) ) {
            Logger.log( `📋 Workspace '${vscode.workspace.name}' selected: `
                + modeIcon( mode ) + scopeIcon( fromOverride )
                + `#${wcnt}:${Context.active( ConfigKey.FILE )}` )
            if ( mode !== Context.project( ConfigKey.MODE ) ) { // Warnung vor dem Hund
                if ( mode === 'none' )
                    Logger.log( `⚠️  Klaus erhält KEINE Daten (Workspace deaktiviert, Folder="${Context.project( ConfigKey.MODE )}")!` )
                else
                    Logger.log( `⚠️  Klaus Daten werden VERSCHLUCKT (Folder deaktiviert, Workspace="${mode}")!` )
            }
            K.init = true
        } else Logger.debug( `📋 Workspace '${vscode.workspace.name}' reconfigured.` )
    } else {
        if ( K.file !== '' ) {
            K.file = ''
            Logger.log( `😴 No workspace open ⇒ Klaus\'C0dehelfer inaktiv.` )
            K.init = true
        }
    }
    dbgCfg()
}
//  VSCode callback #2 → User changed a setting OR VScode is telling us current settings that are non-default
function handleConfigChange( e: vscode.ConfigurationChangeEvent ): void
{
    if ( e.affectsConfiguration( ConfigKey.INCL ) && K.incl !== Context.active( ConfigKey.INCL ) ) {
        Logger.log( `🔁 Watchers need reconfiguration!` )
        setupWatchers( Context.active( ConfigKey.MODE ) !== 'none' )
    } else if ( ( e.affectsConfiguration( ConfigKey.MODE ) && K.mode !== Context.active( ConfigKey.MODE ) )
        || ( e.affectsConfiguration( ConfigKey.FILE ) && K.file !== Context.active( ConfigKey.FILE ) )
        || !K.init
    ) {
        if ( !K.init ) K.init = true
        else Logger.log( `🔁 Configuration change detected!` )
        handleWorkspaceChange()
    } else Logger.debug( `🔄 unimportant Configuration change detected.` )
}
// → Secondary Functions
function updateKlausHook( settingsFile: fs.PathLike, klaus: fs.PathLike, set: boolean )
{
    /**
     *  Hooks setzen und wieder lösen - wie ist das sinnvoll erledigt, welche Parameter werden gebraucht?
     *  → der Hook braucht sein Target Executable
     *  → der Hook braucht die KlausDatei, damit er weiss, wo zu lesen ist.
     *  → eine wiederverwendbare Funktion würde add/remove/update auf einmal können
     *  → der Hook braucht auch einen Pfad, wo er installiert werden soll
     *  ( zuerst ein Helfer-Lambda)
     **/
    const klausHookJSON = ( klaus: fs.PathLike ) =>
        ( { type: 'command', command: 'node', args: [ `${path.join( Context.path(), 'dist', 'KlausHaken.js' )}`, klaus ] } )
    // Settings-File laden (oder erstellen)
    const js = K.parseJSON( fs.existsSync( settingsFile ) ? fs.readFileSync( settingsFile, 'utf-8' ) : '{}' )
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

function setupWatchers( enabled: boolean ): number
{
    const make = ( b: vscode.Uri, p: string, c: boolean ): vscode.FileSystemWatcher =>
        ( vscode.workspace.createFileSystemWatcher( new vscode.RelativePattern( b, p ), !c, c, c ) )
    // Falls schon Watcher existieren, werden sie vorher entfernt
    Logger.debug( `🗹🗷 setupWatchers( ${enabled} ) - count at start: ${K.augen.length}` )

    K.augen.length = 0
    const wsf = vscode.workspace.workspaceFolders?.[ 0 ]
    if ( enabled && wsf ) {
        let patterns = Context.active( ConfigKey.INCL ) as string[]
        patterns.forEach( ( pattern ) =>
        {
            const watcher = make( wsf.uri, pattern, false )
            watcher.onDidChange( ( uri ) => trackFileChange( uri.fsPath ) )
            K.augen.push( watcher )
        } )
        const danke = K.file + `.danke`
        const watcher = make( vscode.Uri.file( path.dirname( danke ) ), path.basename( danke ), true )
        watcher.onDidCreate( ( uri ) => { dankeSchoen( uri ) } )
        K.augen.push( watcher )
        Logger.debug(
            `🔍 Klaus wartet auf Dateiänderungen… (…${K.augen.length} FileSystemWatchers are listening for changes…)`
        )
    } else {
        Logger.debug( '🔇 alle Watcher gelöscht…' )
    }
    return K.augen.length
}

// Ternary Functions: own callbacks that make Klaus work.
function dankeSchoen( uri: vscode.Uri ): void
{
    Logger.log( `🙏 Danke received: hook has read state…` )
    K.log = new WorkspaceChangeLog()
    try {
        fs.unlinkSync( uri.fsPath )
        Logger.debug( `🧹 Danke file cleaned up` )
    } catch ( err ) {
        Logger.debug( `ℹ️  Could not delete danke file: ${err}` )
    }
    K.saveStateDebounced()
}

function trackFileChange( filePath: string ): void
{
    // Der einmalige Helfer wird wieder zum Lambda.
    const isExcluded = ( filePath: string ): boolean =>
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
    if ( isExcluded( filePath ) ) Logger.debug( `🚫 Excluded: ${filePath}` )
    else {
        const relativePath = K.getRelativePath( filePath )
        if ( !K.log.files.includes( relativePath ) ) {
            K.log.files.push( relativePath )
            Logger.log( `✏️  [${new Date().toISOString()}] ${relativePath}` )
        } else {
            Logger.debug( `⏭️  Already tracked: ${relativePath}` )
        }
        K.saveStateDebounced()
    }
}


// Debugging-Helfer (warum nur an einer Stelle den "guten" ouput haben?)
function dbgCfg()
{
    const gm = Context.global( ConfigKey.MODE )
    const gf = Context.global( ConfigKey.FILE ) || K.defName
    const pm = Context.project( ConfigKey.MODE )
    const pf = Context.project( ConfigKey.FILE ) || K.defName
    const am = Context.active( ConfigKey.MODE )
    const af = Context.active( ConfigKey.FILE ) || K.defName
    const ia = gm !== 'none' || pm !== 'none' || am !== 'none'

    Logger.debug( `📝 current Klaus'C0dehelfer configuration:` )
    Logger.debug( `🌐 GLOBAL: ⇒mode ${modeIcon( gm )}, ⇒stateFile=${gf}` )
    Logger.debug( `🏭 PROJECT:⇒mode ${modeIcon( pm )}, ⇒stateFile=${pf}` )
    Logger.debug( `${ia ? `✅` : `❎`} ACTIVE: ⇒mode ${modeIcon( am )}, ⇒stateFile=${af}` )
    if ( vscode.workspace.workspaceFolders ) {
        Logger.debug( `🗃️ Workspace folders: ` )
        vscode.workspace.workspaceFolders.forEach( f => { Logger.debug( `  📂 ${K.getRelativePath( f.uri.fsPath ) || f.uri.fsPath}` ) } )
    }
    Logger.debug( `⌚ lastKlaus: ${K.log.lastClaude}` )
    if ( K.log.files.length ) {
        Logger.debug( `📑 files changed:` )
        K.log.files.forEach( ( f ) => Logger.debug( `  💾 ${K.getRelativePath( f )}` ) )
    }
}
