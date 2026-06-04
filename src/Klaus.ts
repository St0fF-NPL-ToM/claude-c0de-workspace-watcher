import * as vscode from 'vscode'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as diff from 'diff'
import { CKey, ConfigKey, Default, ExtName } from "./KlausKonstanten.generated"
import { Augen, Hand } from './KlausOrgane'
import { Context, HookData, Logger, modeIcon, parseJSON, scopeIcon, StateKey, WorkspaceChangeLog } from "./KlausDinge"

// → das ist Klaus!
export class K
{
    public static mode: string = Default.MODE
    public static file: string | undefined = undefined
    public static incl: string[] = Default.INCL
    public static excl: RegExp[] = []
    public static log: WorkspaceChangeLog = new WorkspaceChangeLog()
    public static wartet: NodeJS.Timeout | null = null
    public static defName: string = Default.FILE
    public static klausSpace: string = ''
    public static workspace: string = ''

    public static gutenMorgen(): void
    {
        K.inclChanged(); K.exclChanged(); K.fileChanged()
        Logger.log( `🕵️ Klaus\'C0dehelfer initialisiert: ${K.modeChanged()}…` )
    }
    public static guteNacht(): void
    {
        K.schlaf()
        Logger.log( '🔌 Klaus\'C0dehelfer deaktiviert…' )
    }
    static schlaf(): void
    {
        if ( K.wartet ) clearTimeout( K.wartet )
        Hand.weg()
        Augen.zu()
        K.sichern()
    }
    // Der Dateiname muss erst "errechnet" werden
    public static dateiName(): string | undefined
    {
        const stem = Context.active( CKey.FILE ) || K.defName
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
    public static relPfad( filePath: string ): string
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
    public static laden(): boolean  // is the state valid after this operation?
    {
        const dat = K.file
        if ( dat )
            try {
                Logger.debug( `📂 loadState: ${K.log.load( dat )}` )
            } catch ( err ) {
                K.log = new WorkspaceChangeLog
                Logger.error( `⛔ Failed to load state: ${err} → state reset to "now".` )
            }
        else {
            K.log = new WorkspaceChangeLog
            Logger.log( `⛔ no state to load.` )
        }
        return true
    }
    public static sichern(): void
    {
        try {
            if ( K.file )
                Logger.debug( `💾 State: ${K.log.save( K.file )}` )
        } catch ( err ) {
            Logger.error( `⛔ Failed to save state: ${err}` )
        }
    }
    public static baldSichern(): void
    {
        if ( !K.wartet && K.file ) {
            try {
                K.log.lock( `${K.file}.lock` )
                Logger.debug( `🔒 Lock set (debounce started)` )
            } catch ( err ) {
                Logger.debug( `⚠️  Could not set lock on debounce: ${err}` )
            }
        }
        if ( K.wartet ) clearTimeout( K.wartet )
        K.wartet = setTimeout( () => { K.sichern() }, 3000 )
    }
    public static willNicht( fn: string ): boolean
    {
        return K.excl.some( re => re.test( fn ) )
    }
    public static exclChanged(): string | undefined
    {
        const el = Context.active( CKey.EXCL ) as string[] || undefined
        let neu = ( el ? el : Default.EXCL ).map( _ => new RegExp( `(^|/)${_
            .replace( /\./g, '\\.' )
            .replace( /\*/g, '[^/]*' )
            .replace( /\?/g, '[^/]' )
            .replace( /\*\*/g, '.*' )
            }($|/)` ) )
        let anders = K.excl ? neu.some( ( r, i ) => ( K.excl.at( i ) !== r ) ) : Boolean( neu )
        if ( anders ) {
            K.excl = neu
            return `🚫 Klaus spart sich ein paar Dateien…`
        }
    }
    public static inclChanged(): string | undefined
    {
        let anders = false
        const neu = Context.active( CKey.INCL ) as string[]
        neu.forEach( i => { if ( !K.incl.find( s => s === i ) ) anders = true } )
        if ( anders ) {
            K.incl = neu
            if ( K.mode !== 'none' ) Augen.auf( neu, K.file + `.danke`, ( f => K.dateiAnders( f ) ), ( d => K.dankeSchoen( d ) ) )
            return `🗂️ Klaus schaut nun anders hin…`
        }
    }
    public static fileChanged(): string | undefined
    {
        const neu = K.dateiName()
        if ( K.file ) {
            if ( K.file !== neu ) {
                if ( ( K.mode !== 'none' ) && ( K.workspace ) && neu ) {   // Wir sind aktiv → die Umbenennung hat Seiteneffekte!
                    const nd = path.dirname( neu )
                    const od = path.dirname( K.file )
                    if ( nd === od ) {   // Die Klausdatei innerhalb eines Workspace muss umbenannt werden!
                        if ( fs.existsSync( K.file ) ) { fs.renameSync( K.file, neu ) }
                        const osd = path.join( od, path.basename( K.file, `.json` ) )
                        const nsd = path.join( nd, path.basename( neu, `.json` ) )
                        if ( fs.existsSync( osd ) ) { fs.renameSync( osd, nsd ) }
                    }
                }
                K.file = neu
                K.sichern()
                if ( neu ) return `📝 KlausDatei geändert zu: '${path.basename( neu, `.json` )}'`
            }
        } else K.file = neu // Initialisierung → Name ist damit festgelegt.
    }
    public static modeChanged(): string | undefined
    {
        const nm = Context.active( CKey.MODE )
        if ( K.mode !== nm ) {
            let t = `Modus = ${modeIcon( K.mode )} 🔀 ${modeIcon( nm )}`
            K.mode = nm
            this.workspaceChanged()
            return t
        }
    }
    public static workspaceChanged(): void
    {
        Logger.debug( `🗹🗷 handleWorkspaceChange( ${vscode.workspace.name} )` )
        // neue workspace-Folder bestimmen
        const nws = vscode.workspace.workspaceFile ? path.dirname( vscode.workspace.workspaceFile.fsPath ) : vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[ 0 ].uri.fsPath : ``
        let umbau = true
        // Vorbereitungen treffen
        if ( K.workspace ) K.schlaf()    // Da wir den vorherigen Modus nicht kennen (wollen) → Ruhe!
        if ( K.workspace !== nws ) {    // Workspace ändert sich - auf die eine oder andere Weise
            K.fileChanged()             // → Dateinamen und Pfade aktualisieren
            K.workspace = nws
            K.klausSpace = path.join( nws, `.vscode`, Context.active( CKey.FILE ) )
            umbau = false
        } // Innerhalb des Workspace änderte sich etwas... modus oder folders (keine Vorbereitung nötig)
        // Jetzt den aktuellen Zustand herstellen
        let futter, finger: boolean = false
        let glotzn: number = 0
        const isActive = ( K.mode !== 'none' && K.workspace && K.file )
        if ( isActive ) {
            futter = K.laden()
            finger = Hand.dran( K.workspace, K.file! )
            glotzn = Augen.auf( K.incl, K.file + `.danke`, ( f => K.dateiAnders( f ) ), ( d => K.dankeSchoen( d ) ) )
        } else {    // Wenn der Nutzer kein Feedback für Klaus wünscht, sollte auch
            K.log = new WorkspaceChangeLog() // "altes Feedback" entfernt werden!
            K.sichern()
        }
        if ( isActive )
            Logger.log( `📋 Workspace '${vscode.workspace.name}' ${umbau ? `umkonfiguriert` : `ausgewählt`}: `
                + modeIcon( K.mode ) + scopeIcon(
                    ( Context.active( CKey.MODE ) !== Context.global( CKey.MODE ) ) ||
                    ( Context.active( CKey.MODE ) !== Context.project( CKey.MODE ) ) )
                + `#${glotzn}:'${Context.active( CKey.FILE )}'` + ( futter ? ` (fresh) ` : ` ` ) + ( finger ? `🟢` : `⭕` ) )
        else {
            K.file = undefined
            Logger.log( `😴 Klaus\'C0dehelfer träumt von 🌞` )
        }
    }
    public static dateiAnders( f: string ): void
    {
        if ( K.willNicht( f ) ) Logger.debug( `🚫 Excluded: ${f}` )
        else {
            const relativePath = K.relPfad( f )
            if ( K.log.push( relativePath ) ) {
                Logger.log( `✏️  [${new Date().toISOString()}] ${relativePath}` )
                K.baldSichern()
            } else Logger.debug( `⏭️  Already tracked / no changes: ${relativePath}` )
        }
    }
    public static dankeSchoen( f: string ): void
    {
        Logger.log( `🙏 Danke received: hook has read state…` )
        K.log.danke( f )
    }
}

// Debugging-Helfer (warum nur an einer Stelle den "guten" ouput haben?)
function dbgCfg()
{
    const gm = Context.global( CKey.MODE )
    const gf = Context.global( CKey.FILE ) || K.defName
    const pm = Context.project( CKey.MODE )
    const pf = Context.project( CKey.FILE ) || K.defName
    const am = Context.active( CKey.MODE )
    const af = Context.active( CKey.FILE ) || K.defName
    const ia = gm !== 'none' || pm !== 'none' || am !== 'none'

    Logger.debug( `📝 current Klaus'C0dehelfer configuration:` )
    Logger.debug( `🌐 GLOBAL: ⇒mode ${modeIcon( gm )}, ⇒stateFile=${gf}` )
    Logger.debug( `🏭 PROJECT:⇒mode ${modeIcon( pm )}, ⇒stateFile=${pf}` )
    Logger.debug( `${ia ? `✅` : `❎`} ACTIVE: ⇒mode ${modeIcon( am )}, ⇒stateFile=${af}` )
    if ( vscode.workspace.workspaceFolders ) {
        Logger.debug( `🗃️ Workspace folders: ` )
        vscode.workspace.workspaceFolders.forEach( f => { Logger.debug( `  📂 ${K.relPfad( f.uri.fsPath ) || f.uri.fsPath}` ) } )
    }
    Logger.debug( `⌚ lastKlaus: ${K.log.lastClaude}` )
    if ( K.log.files.size ) {
        Logger.debug( `📑 files changed:` )
        K.log.files.forEach( ( f ) => Logger.debug( `  💾 ${K.relPfad( f )}` ) )
    }
}
