import * as vscode from 'vscode'
import * as fs from 'fs'
import { CKey, ConfigKey } from "./KlausKonstanten.generated"
import { K } from "./Klaus"
import { Context, Logger, parseJSON, StateKey } from './KlausDinge'

// → VSCode Extension integration
export function activate( context: vscode.ExtensionContext )
{
    Logger.init( context )
    Context.init( context )
    // das Folgende dürfen wir bei Init machen: Defaults und fixe Strings aus dem PackageJSON auslesen!
    handleLegacyBugs()
    handleUpgrade()
    vscode.workspace.onDidChangeWorkspaceFolders( ( e ) =>
    {
        Logger.debug( `🔄 event: ${JSON.stringify( e )} → begin handling…` )
        K.workspaceChanged()
        Logger.log( `🔁 Workspace-Folder-Change-Ereignis bearbeitet…` )
    } )
    vscode.workspace.onDidChangeConfiguration( ( e ) =>
    {
        Logger.debug( `🔄 event: ${JSON.stringify( e )} → begin handling…` )
        let log: string[] = []
        if ( e.affectsConfiguration( ConfigKey.EXCL ) ) { const l = K.exclChanged(); if ( l ) log.push( l ) }
        if ( e.affectsConfiguration( ConfigKey.INCL ) ) { const l = K.inclChanged(); if ( l ) log.push( l ) }
        if ( e.affectsConfiguration( ConfigKey.FILE ) ) { const l = K.fileChanged(); if ( l ) log.push( l ) }
        if ( e.affectsConfiguration( ConfigKey.MODE ) ) { const l = K.modeChanged(); if ( l ) log.push( l ) }
        if ( log ) log.forEach( txt => Logger.log( `🔁 ${txt}…` ) )
        else Logger.debug( `… event: ${JSON.stringify( e )} → no changes. 🔄` )
    } )
    context.subscriptions.push(
        vscode.commands.registerCommand( Context.extName() + '.openSettings',
            () => { vscode.commands.executeCommand( 'workbench.action.openSettings', Context.extName() ) } )
    )
    K.gutenMorgen()
}
export function deactivate()
{
    K.guteNacht()
}
// → Master Functions:
//  1st up: handle all those heaps of thrash Klaus and Stefan produced in earlier versions.
function handleLegacyBugs(): void
{
    // a7 Bug: Hook-Pfade in globalState → a8 räumt auf
    const legacyGlobal = Context.get().globalState.get<string>( StateKey.DEPRECATED_GLOBAL )
    if ( legacyGlobal ) {
        Logger.log( `🩹 handleLegacyBugs: Entferne Klaus-Hooks aus globalem State` )
        const stateFileStem = Context.active( CKey.FILE ) || K.defName
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
//  2nd: handle a version bump (does not matter if up or down…)
function handleUpgrade(): void
{
    const currentPath = Context.path()
    const lastKnownPath = Context.state( StateKey.LASTPATH )
    Context.setState( StateKey.LASTPATH, currentPath )

    Logger.debug( `🗹🗷 handleUpgrade()` )
    if ( lastKnownPath && currentPath !== lastKnownPath ) {
        Logger.log( `♻️ Version change detected!` )
        Logger.debug( `🔧  Old: ${K.relPfad( lastKnownPath )}` )
        Logger.debug( `🔧  New: ${K.relPfad( currentPath )}` )
    } else if ( !lastKnownPath )
        Logger.log( `🆕 First run: initializing persistent storage` )
}
