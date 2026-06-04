import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { Context, Logger, parseJSON } from './KlausDinge'


export class Augen
{
    static a: vscode.FileSystemWatcher[] = []

    public static auf( incl: string[], danke: string, fc_cb: ( f: string ) => void, d_cb: ( d: string ) => void ): number
    {
        Logger.debug( `🗹☐ OochnUff!` )
        // Falls schon Watcher existieren, werden sie vorher entfernt
        Augen.zu( true )
        const wsf = vscode.workspace.workspaceFolders
        if ( wsf ) {
            incl.forEach( s => Augen.neu( wsf[ 0 ].uri, s, false, fc_cb ) )
            if ( wsf.length > 1 ) { // Sub-Workspaces, die außerhalb liegen:
                wsf.forEach( f =>
                {
                    if ( ( f.index > 0 ) && ( path.relative( wsf[ 0 ].uri.fsPath, f.uri.fsPath ).startsWith( `..` ) ) ) {
                        incl.forEach( s => Augen.neu( f.uri, s, false, fc_cb ) )
                    }
                } )
            }
            if ( danke ) Augen.neu( vscode.Uri.file( path.dirname( danke ) ), path.basename( danke ), true, d_cb )
            Logger.debug( `🔍 Klaus wartet auf Dateiänderungen… (…${Augen.a.length} FileSystemWatchers are listening for changes…)` )
        } else Logger.debug( '🔇 alle Watcher gelöscht…' )
        return Augen.a.length
    }
    public static zu( zwinkern: boolean = false ): void
    {
        if ( !zwinkern ) Logger.debug( `☐☒ OochnZu!` )
        Augen.a.length = 0
        if ( !zwinkern ) Logger.debug( '🔇 alle Watcher gelöscht…' )
    }
    public static neu( b: vscode.Uri, p: string, c: boolean, cb: ( x: string ) => void ): number
    {
        const a = vscode.workspace.createFileSystemWatcher( new vscode.RelativePattern( b, p ), !c, c, c )
        a.onDidChange( ( uri ) => cb( uri.fsPath ) )
        Augen.a.push( a )
        return Augen.a.length
    }
}

/**
 *  Hooks setzen und wieder lösen - wie ist das sinnvoll erledigt, welche Parameter werden gebraucht?
 * ===================================================================================================
 *  → der Hook braucht sein Target Executable
 *  → der Hook braucht die KlausDatei, damit er weiss, wo zu lesen ist.
 *  → eine wiederverwendbare Funktion würde add/remove/update auf einmal können
 *  → der Hook braucht auch einen Pfad, wo er installiert werden soll
 *
 *  ✔ Zwei Ziele.  Ist "oldKlaus" === undefined, wird gesetzt, Ist newKlaus == undefined, wird gelöst.
 *                  Sind beide gesetzt, wird der Hook verändert.
 **/
export class Hand
{
    static h: string = ``
    static d: string = ``
    // true: hook gesetzt, false: hook gelöst (fehler: ebenso false)
    public static dran( ws: string, kf: string ): boolean
    {
        const JSONfinger = ( klaus: string ) =>  // lambda für Hook-Eintrag-Erstellung
            ( { type: 'command', command: 'node', args: [ `${path.join( Context.path(), 'dist', 'KlausHaken.js' )}`, klaus ] } )

        Hand.h = path.join( ws, `.claude`, `settings.local.json` )
        let hand = Hand.hoch()
        if ( !hand ) hand = {}        // Sicherstellen, dass die Struktur existiert
        if ( !hand.hooks ) hand.hooks = {}
        if ( !hand.hooks.UserPromptSubmit ) hand.hooks.UserPromptSubmit = [ { hooks: [ JSONfinger( kf ) ] } ]
        else // eigenen Hook setzen
            hand.hooks.UserPromptSubmit[ 0 ].hooks.push( JSONfinger( kf ) )
        Hand.d = kf
        return Hand.raus( hand )
    }
    public static weg(): boolean
    {
        const hand = Hand.hoch()
        if ( hand ) {
            Hand.d = ``
            return Hand.raus( hand )
        } else return true
    }
    static hoch(): any
    {
        if ( Hand.h && Hand.d ) {
            // Settings-File laden (oder erstellen)
            const js = parseJSON( fs.existsSync( Hand.h ) ? fs.readFileSync( Hand.h, 'utf-8' ) : '{}' )
            // Egal ob gelöscht werden soll, oder gesetzt.  Einen bestehenden Hook müssen wir zuerst entfernen
            if ( js.hooks && js.hooks.UserPromptSubmit ) {            // Also wird gegen die Parameter gefiltert! (die exe könnte sich bei Versionsbumps ändern!)
                js.hooks.UserPromptSubmit.forEach( ( entry: any ) =>
                {
                    if ( entry.hooks ) {
                        entry.hooks = entry.hooks.filter(
                            ( hook: any ) => !( hook.type === 'command' && hook.command === 'node' && hook.args.length === 2 && hook.args[ 1 ] === Hand.d )
                        )
                    }
                } )
                return js
            }
        }
    }
    static raus( hand: any, laut: boolean = true ): boolean
    {
        try {
            fs.writeFileSync( Hand.h, JSON.stringify( hand, null, 2 ) )
            if ( laut ) Logger.log( `👋 Hand ` + ( ( Hand.d ) ? `angelegt (🔗) an` : `weg genommen (⛓️‍💥) von` ) + ` '${Hand.h}'` )
        } catch ( err ) {
            if ( Hand.d ) Logger.log( `⛔ Hand an-oder-ablegen bei '${Hand.h}' fehlgeschlagen: ${err}` )
            return false
        }
        return true
    }
}
