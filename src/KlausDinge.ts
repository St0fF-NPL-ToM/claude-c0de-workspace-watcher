import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'

// → Globalisierung von Parametern / Strings / Interfaces
const SCOPE_ICONS: string[] = [ `🌐`, `🏭` ]    // sozusagen global vs. firma ... doofes Emoticon.
const AWARENESS_MODE_ICONS: Record<string, string> = { 'none': '☕', 'onDemand': '👀', 'realTime': '🧐' }
export function modeIcon( mode: string ): string { return AWARENESS_MODE_ICONS[ mode ] || '❓' }
export function scopeIcon( fromOverride: boolean ): string { return SCOPE_ICONS[ fromOverride ? 0 : 1 ] }
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

// → unser Datenträger …
export class WorkspaceChangeLog
{
    lastClaude: string = new Date().toISOString()
    files: string[] = []
    public reset( parsed?: any )
    {
        this.lastClaude = parsed?.lastClaude || new Date().toISOString()
        this.files = parsed?.files || []
    }
}
// → unser aktueller (globaler) Zustand
export class K
{
    public static mode: string = 'none'
    public static file: string = ''
    public static incl: string[] = []
    public static init: boolean = false
    public static augen: vscode.FileSystemWatcher[] = []
    public static log: WorkspaceChangeLog = new WorkspaceChangeLog()
    public static wartet: NodeJS.Timeout | null = null
    public static defName: string = ''

    // JSON.parse wirft immer bei Fehlern - ich hasse sowas! (try-catch-wrapper)
    public static parseJSON( str: string ): any { try { return JSON.parse( str ) } catch { return {} } }
    // Der Dateiname muss erst "errechnet" werden
    public static getDateiName(): string | undefined
    {
        const stem = Context.active( ConfigKey.FILE ) || K.defName
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
    // auch dies ist eine interne Helferfunktion.
    public static getRelativePath( filePath: string ): string
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
    public static loadState(): boolean  // is the state valid after this operation?
    {
        const dat = K.file
        if ( dat.length )
            try {
                if ( fs.existsSync( dat ) ) {
                    const data = fs.readFileSync( dat, 'utf-8' )
                    const parsed = JSON.parse( data )
                    K.log.reset( parsed )
                    Logger.debug( `📂 loadState: loaded ${K.log.files.length} files, lastClaude=${K.log.lastClaude}` )
                } else {
                    K.log.reset()
                    Logger.debug( `📂 loadState: file not found at ${dat} → state reset to "now".` )
                }
            } catch ( err ) {
                K.log.reset()
                Logger.error( `⛔ Failed to load state: ${err} → state reset to "now".` )
            }
        else {
            K.log.reset()
            Logger.log( `⛔ no state to load.` )
        }
        return true
    }
    public static saveState(): void
    {
        try {
            const absolutePath = K.file
            if ( absolutePath.length ) {
                const lockPath = `${absolutePath}.lock`
                const dir = path.dirname( absolutePath )
                if ( !fs.existsSync( dir ) ) fs.mkdirSync( dir, { recursive: true } )
                if ( !fs.existsSync( lockPath ) ) fs.writeFileSync( lockPath, '' )
                fs.writeFileSync( absolutePath, JSON.stringify( K.log, null, 2 ) )
                fs.unlinkSync( lockPath )
                Logger.debug( `💾 State saved to ${absolutePath}` )
            }
        } catch ( err ) {
            Logger.error( `⛔ Failed to save state: ${err}` )
        }
    }
    public static saveStateDebounced(): void
    {
        if ( !K.wartet && K.file.length ) {
            try {
                const dir = path.dirname( K.file )
                if ( !fs.existsSync( dir ) ) fs.mkdirSync( dir, { recursive: true } )
                fs.writeFileSync( `${K.file}.lock`, '' )
                Logger.debug( `🔒 Lock set (debounce started)` )
            } catch ( err ) {
                Logger.debug( `⚠️  Could not set lock on debounce: ${err}` )
            }
        }
        if ( K.wartet ) clearTimeout( K.wartet )
        K.wartet = setTimeout( () => { K.saveState() }, 3000 )
    }

}
// → unser globaler ExtensionContext
export class Context
{
    private static ctx: vscode.ExtensionContext
    static init( context: vscode.ExtensionContext ): void
    {
        Context.ctx = context
    }
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
