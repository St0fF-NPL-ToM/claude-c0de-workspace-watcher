import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as diff from 'diff'
import { ExtName, ConfigKey, CKey, Default } from "./KlausKonstanten.generated"

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
}
// → unser Datenträger …
export class WorkspaceChangeLog
{
    lastClaude: string = new Date().toISOString()
    files: Set<string> = new Set()
    saved: Set<string> = new Set()
    diffs: string[] = []
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
        if ( fs.existsSync( fn ) ) {
            const data = fs.readFileSync( fn, 'utf-8' )
            const parsed = JSON.parse( data ) as HookData
            this.lastClaude = parsed.lastClaude || new Date().toISOString()
            this.files = new Set( parsed.files || [] )
            this.diffs = parsed.diffs || []
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
        fs.writeFileSync( fn, JSON.stringify( {
            lastClaude: this.lastClaude,
            diffs: this.diffs,
            files: Array.from( this.files )
        }, null, 2 ) )
        if ( !noUnlock ) this.done()
        return `saved to ${fn}`
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
    {   /** Danke-Flow: ab jetzt auch logisch…
         *  → lock setzen
         *  → Aufgabenliste erstellen
         *  → datafile und statefile aktualisieren (lock wird gelöst)
         *  → Aufgaben abarbeiten (Dateien kopieren)
         */
        this.lock( this.file ) // wir werden speichern! Atomare Operationen zuerst!
        const toSnapshot = [ ...this.files ]  // Kopie
        this.files = new Set()  // ← Sofort leeren!
        this.lastClaude = new Date().toISOString()  // ← Timestamp setzen
        this.diffs = [] // diffs sind ephemeral!
        toSnapshot.forEach( ( fn ) => this.saved.add( fn ) )
        if ( fs.existsSync( thk ) ) { fs.unlinkSync( thk ); Logger.debug( `🧹 Danke file cleaned up` ) }
        this.save( this.file )
        let [ ws, ks ] = this.verzeichnisse()
        // 2. LANGSAM: Snapshot-Loop (neue files können jetzt reingedrückt werden)
        for ( const relFilePath of toSnapshot ) {
            const snapPath = path.join( ks, relFilePath )
            const sourcePath = path.join( ws, relFilePath )
            try {
                const content = fs.readFileSync( sourcePath, 'utf-8' )
                fs.mkdirSync( path.dirname( snapPath ), { recursive: true } )
                fs.writeFileSync( snapPath, content )
            } catch ( err ) {
                // Fehler? Datei gelöscht oder permission issue
                this.saved.delete( relFilePath )
                this.save( this.file ) // sofortiges Entfernen aus der eigentlich schon vorbereiteten Liste.
            }
        }
    }
    public push( fn: string ): boolean
    {   /** Wie machen wir das hier genau?  Sehr einfach.
         *  - wir haben den Workspace-relative file path als fn.
         *  - wir brauchen ein Diff zum letzten gespeicherten Zustand.
         *  → Ist die betreffende Datei schon in "files" aufgeführt?
         *      ( würde bedeuten: Snapshot lag bei erster Änderung nicht vor )
         *    ✔ keine Änderung
         *    ✘ gibt es einen Snapshot der Datei ?
         *      ✘ füge Datei zu "files" hinzu, speichere keinen Snapshot
         *      ✔ → beschaffe Diff
         *        → speichere aktuellen Stand als Snapshot
         *        → falls Diff leer ist: keinen Eintrag erstellen.
         */
        if ( !this.files.has( fn ) ) {
            let [ ws, ks ] = this.verzeichnisse()
            let snapName = path.join( ks, fn )
            if ( fs.existsSync( snapName ) ) {
                let fileName = path.join( ws, fn )
                // Read old snapshot file
                const oldContent = fs.readFileSync( snapName, 'utf-8' )
                // Read current file
                const newContent = fs.readFileSync( fileName, 'utf-8' )
                // Generate unified diff using jsdiff
                const di = diff.structuredPatch( fn, fn, oldContent, newContent, undefined, undefined, { ignoreWhitespace: true, context: 2, stripTrailingCr: true } )
                Logger.debug( `∂ :${JSON.stringify( di )}` )
                if ( di.hunks.length ) {                            // changes detected:
                    di.oldFileName = undefined
                    this.diffs.push( `==diff: '${fn}'==\n` + diff.formatPatch( di, diff.OMIT_HEADERS ) )       // → record change
                    fs.writeFile( snapName, newContent, 'utf-8',    // → update snapshot
                        ( err ) => { if ( err ) Logger.error( `🚫 failed to update snapshot: ${err}, file: '${snapName}'` ) } )
                    return true                                 // → tell upstream about a real change
                }
            } else {
                this.files.add( fn )    // Eine Änderung, nur die Ungenaue.
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
    static error( msg: string ): void { Logger.channel.error( msg ) }
    static dispose(): void { Logger.channel.dispose() }
}
// JSON.parse wirft immer bei Fehlern - ich hasse sowas! (try-catch-wrapper)
export function parseJSON( str: string ): any { try { return JSON.parse( str ) } catch { return {} } }
