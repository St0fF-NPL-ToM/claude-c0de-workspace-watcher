import * as vscode from 'vscode'

// → Globalisierung von Parametern / Strings / Interfaces
export const EXT_DEF_FILE = 'KlausC0deHelferData'
export const SCOPE_ICONS: string[] = [ `🌐`, `🏭` ]
export const AWARENESS_MODE_ICONS: Record<string, string> = { 'none': '☕', 'onDemand': '👀', 'realTime': '🧐' }
export function getModeIcon( mode: string ): string { return AWARENESS_MODE_ICONS[ mode ] || '❓' }
export interface WorkspaceChangeLog { lastClaude: string; files: string[] }
export function cleanWorkspaceChangesNow(): WorkspaceChangeLog  // auch mehrfach benötigt: resetState
{
    return { lastClaude: new Date().toISOString(), files: [] }
}
// → Enumerationen
export enum StateKey
{
    DEPRECATED_GLOBAL = 'Klaus.global',        // Rechner-Klaus
    DEPRECATED_WORKSPACE = 'Klaus.workspace', // Workspace-Klaus
    LASTPATH = 'Klaus.platz'      // Extension Pfad
}
export enum ConfigKey
{
    MODE = 'awarenessMode',
    FILE = 'stateFileName',
    INCL = 'includePatterns',
    EXCL = 'excludePatterns'
}

// → unser globaler ExtensionContext
export class Context
{
    private static ctx: vscode.ExtensionContext
    static init( context: vscode.ExtensionContext ): void { Context.ctx = context }
    static get(): vscode.ExtensionContext { return Context.ctx }
    static path(): string { return Context.ctx.extension.extensionPath }
    static extName(): string { return Context.ctx.extension.packageJSON.name }
    static state( key: StateKey ): string | undefined
    {
        switch ( key ) {
            case StateKey.DEPRECATED_WORKSPACE: return Context.ctx.workspaceState.get<string>( key )
            case StateKey.DEPRECATED_GLOBAL:
            case StateKey.LASTPATH: return Context.ctx.globalState.get<string>( key )
        }
    }
    static setState( k: StateKey, v: string | undefined ): void
    {
        switch ( k ) {
            case StateKey.DEPRECATED_WORKSPACE: Context.ctx.workspaceState.update( k, v ); break
            case StateKey.DEPRECATED_GLOBAL:
            case StateKey.LASTPATH: Context.ctx.globalState.update( k, v ); break
        }
    }
    static active( key: ConfigKey ): any { return vscode.workspace.getConfiguration( Context.extName() )?.get( key ) }
    static global( key: ConfigKey ): any { return vscode.workspace.getConfiguration( Context.extName(), null )?.get( key ) }
    static project( key: ConfigKey ): any
    {
        if ( vscode.workspace.name === undefined ) return undefined
        return vscode.workspace.getConfiguration( Context.extName(), vscode.workspace.workspaceFolders![ 0 ] )?.get( key )
    }
}
// → unsere Ausgaben
export class Logger
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
export const parseJSON = ( str: string ): any =>
{
    try {
        return JSON.parse( str )
    } catch {
        return {}
    }
}
