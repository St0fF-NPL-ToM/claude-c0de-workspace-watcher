import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as diff from 'diff'
import { ExtName, ConfigKey, CKey, Default } from "./KlausKonstanten.generated"
import { Erkannt } from './KlausOrgane'

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
// → unser Informationsträger für Klaus
export interface HookData
{
    lastClaude: string
    files: string[]
    diffs: string[]
    dels: string[]
}
// → unser Datenträger …
export class WorkspaceChangeLog
{   // internal state to save:
    lastClaude: string = new Date().toISOString()
    files: Set<string> = new Set()
    diffs: string[] = []
    dels: Set<string> = new Set()
    // internal state / temporary data holders
    saved: Set<string> = new Set()
    file: string = ``
    flock: string = ``
    public load( fn: string ): string
    {
        this.file = fn
        // saved aus Snapshots rekonstruieren
        let schnapps = path.join( path.dirname( fn ), path.basename( fn, `.json` ) )
        this.saved = new Set()
        if ( fs.existsSync( schnapps ) ) {
            const snapFiles = fs.readdirSync( schnapps, { recursive: true } ) as string[]
            snapFiles.forEach( ( f ) => this.saved.add( path.relative( schnapps, f ) ) )
        } // So, erstmal was getrunken …
        // Vielleicht noch ein fehlerhaftes übriges Danke-File löschen?
        if ( fs.existsSync( fn + `.danke` ) ) fs.unlinkSync( fn + `.danke` )
        if ( fs.existsSync( fn ) ) {
            const data = fs.readFileSync( fn, 'utf-8' )
            const parsed = JSON.parse( data ) as HookData
            this.lastClaude = parsed.lastClaude || new Date().toISOString()
            this.files = new Set( parsed.files || [] )
            this.diffs = parsed.diffs || []
            this.dels = new Set( parsed.dels || [] )
            return `lastClaude=${this.lastClaude}, files=${this.files.size}, diffables=${this.saved.size}`
        } else
            return `file not found at ${fn} → state reset to "now".`
    }
    public save( fn: string, noUnlock: boolean = false ): string
    {
        if ( this.file !== fn ) {
            if ( fs.existsSync( this.file ) ) fs.unlinkSync( this.file )
            this.file = fn
        }
        this.lock( fn )    // silent fail if already set.
        this.write2( fn )
        if ( !noUnlock ) this.done()
        return `saved to ${fn}`
    }
    private write2( fn: string )
    {
        fs.writeFileSync( fn, JSON.stringify( {
            lastClaude: this.lastClaude,
            diffs: this.diffs,
            files: Array.from( this.files ),
            dels: Array.from( this.dels )
        }, null, 2 ) )
    }
    public lock( fn: string )
    {
        if ( !this.flock ) {
            this.flock = `${fn}.lock`
            const dir = path.dirname( fn )
            if ( !fs.existsSync( dir ) ) fs.mkdirSync( dir, { recursive: true } )
            if ( !fs.existsSync( this.flock ) ) fs.writeFileSync( this.flock, '' )
        }
    }
    public done()
    {
        if ( this.flock ) {
            fs.unlinkSync( this.flock )
            this.flock = ``
        }
    }
    verzeichnisse(): string[]
    {
        let ks = path.dirname( this.file )
        let ws = path.dirname( ks )
        return [ ws, path.join( ks, path.basename( this.file, `.json` ) ) ]
    }
    public danke( thk: string )
    {   /** Danke-Flow-Refactoring: nun wird es ein Bitte-Flow!
         *  → bitte-File anlegen
         *  → Extension registriert "danke", erstellt diffs und schreibt .info-Datei
         *  → zum Abschluss als "Signal zurück" wird das Danke-File gelöscht
         *  → der Hook wartet, solange das Danke-File existiert
         *  → err liest dann das info file und löscht es.
         */
        const toSnapshot = [ ...this.files ]  // Kopie
        this.files = new Set()  // ← Sofort leeren, wird von diff "re-filled"
        this.diffs = []         // diffs sind ephemeral, werden jetzt erstellt
        toSnapshot.forEach( ( fn ) => this.diff( fn ) )
        this.write2( this.file + `.info` )
        fs.unlinkSync( thk ); Logger.log( `🧹 Danke file cleaned up after writing Hook-Infos.` )
        // this basically saves the diffs of the current State in the state file, but ignores them completely!
        this.files = new Set()
        this.dels = new Set()
        this.lastClaude = new Date().toISOString()  // ← Timestamp setzen
        this.write2( this.file )
    }
    public snapShot( err: NodeJS.ErrnoException | null, fn: string ): void
    {
        if ( err ) Logger.error( `🚫 failed to update snapshot file: ${err}, file: '${fn}'` )
        else {
            Logger.debug( `📷 snapshot '${fn}' updated…` )
            let sp = path.join( path.dirname( this.file ), path.basename( this.file, `.json` ), fn )
            if ( fs.existsSync( sp ) ) this.saved.add( fn )
            else this.saved.delete( fn )
        }
    }
    private diff( fn: string )
    {   // find out real file names
        let [ ws, ks ] = this.verzeichnisse()
        let snapName = path.join( ks, fn )
        let fileName = path.join( ws, fn )
        let fEx = fs.existsSync( fileName )
        let sEx = fs.existsSync( snapName )
        if ( fEx ) {
            const newContent = fs.readFileSync( fileName, 'utf-8' )    // Read current file
            if ( sEx ) {
                const oldContent = fs.readFileSync( snapName, 'utf-8' )   // Read old snapshot file
                // Generate unified diff using jsdiff
                const di = diff.structuredPatch( fn, fn, oldContent, newContent, undefined, undefined, { ignoreWhitespace: true, context: 2, stripTrailingCr: true } )
                if ( di.hunks.length ) {                            // changes detected:
                    di.oldFileName = undefined
                    this.diffs.push( `==diff: '${fn}'==\n` + diff.formatPatch( di, diff.OMIT_HEADERS ) )       // → record change
                } else this.files.add( fn )
                Logger.trace( `∂ '${fn}': ${JSON.stringify( di )}` )
            } else {
                this.files.add( fn )
                Logger.trace( `📎 no diff, creating snapshot: '${fn}'` )
            }
            fs.mkdir( path.dirname( snapName ), { recursive: true }, ( err ) =>
            {
                if ( err ) Logger.error( `🚫 failed to create snapshot folder: ${err}, file: '${path.dirname( snapName )}'` )
                else fs.writeFile( snapName, newContent, 'utf-8', ( err ) => this.snapShot( err, fn ) )
            } )
        } else {
            this.dels.add( fn )
            Logger.trace( `🗑️ no diff, file deleted: '${fn}'` )
            if ( sEx ) // file deleted - snapshot not needed anymore
                fs.unlink( snapName, ( err ) => this.snapShot( err, fn ) )
        }
    }
    public push( fn: string, action: Erkannt ): boolean
    {   /** push-refactoring:
         *  → nur noch Dateien in das Set "pushen"
         *  → diffs erst bei Anforderung bestimmen
         */
        if ( ( Erkannt.modifiziert === action ) || ( action === Erkannt.erstellt ) ) {
            if ( !this.files.has( fn ) ) {
                this.files.add( fn )    // Eine Änderung, nur die Ungenaue.
                return true
            }
        } else if ( action === Erkannt.entfernt ) {
            if ( !this.dels.has( fn ) ) {
                this.dels.add( fn )
                return true
            }
        }
        return false
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
    static extName(): string { return ExtName }
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
    static active( key: CKey ): any { return vscode.workspace.getConfiguration( Context.extName() )?.get( key ) }
    static global( key: CKey ): any { return vscode.workspace.getConfiguration( Context.extName(), null )?.get( key ) }
    static project( key: CKey ): any
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
        Logger.log( `⏰ Klaus'C0dehelfer version 📦${version} startet … 🚀` )
    }
    static log( msg: string ): void { Logger.channel.info( msg ) }
    static debug( msg: string ): void { Logger.channel.debug( msg ) }
    static trace( msg: string ): void { Logger.channel.trace( msg ) }
    static error( msg: string ): void { Logger.channel.error( msg ) }
    static dispose(): void { Logger.channel.dispose() }
}
// JSON.parse wirft immer bei Fehlern - ich hasse sowas! (try-catch-wrapper)
export function parseJSON( str: string ): any { try { return JSON.parse( str ) } catch { return {} } }
