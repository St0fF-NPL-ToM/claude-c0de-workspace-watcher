import * as fs from 'node:fs'
import { HookData } from './KlausDinge'

const maxWaitMs = 30000

class HookInput
{
  session_id: string = ``
  transcript_path: string = ``
  cwd: string = ``
  permission_mode: string = ``
  hook_event_name: string = ``
  prompt: string = ``
  public async init()
  {
    let isl = ''
    for await ( const chunk of process.stdin ) { isl += chunk }
    try {
      const i = JSON.parse( isl ) as HookInput
      this.session_id = i.session_id
      this.transcript_path = i.transcript_path
      this.cwd = i.cwd
      this.permission_mode = i.permission_mode
      this.hook_event_name = i.hook_event_name
      this.prompt = i.prompt
    }
    catch ( err ) {
      process.stderr.write( `[WARN] Could not read hook input data: ${err}\n` )
    }
  }
}

class HookOutput
{
  public hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit'
    additionalContext: string
  }
  constructor ( ac: HookData )
  {
    let context: string = ''
    if ( ac.diffs.length === 0 && ac.files.length === 0 && ac.dels.length === 0 ) {
      context = `[EPHEMERAL: no workspace files have changed since${ac.lastClaude}]`
    } else {
      context = `[EPHEMERAL: recorded file changes since ${ac.lastClaude}: ${ac.diffs.length} diffs, ${ac.files.length} non-diffable file changes, ${ac.dels.length} file deletions.]\n`
      if ( ac.diffs.length )
        context += `${ac.diffs.join( '\n' )}\n---\n`
      if ( ac.files.length )
        context += `changed file names (no diff available): [\n\t${ac.files.join( '\n\t' )}\n]` + ( ac.dels.length ? `,\n` : `` )
      if ( ac.dels.length )
        context += `removed file names: [\n\t${ac.dels.join( '\n\t' )}\n]`
    }
    this.hookSpecificOutput = {
      hookEventName: 'UserPromptSubmit',  // ← Hardcoded hier
      additionalContext: context,
    }
  }
}

function sleep( ms: number ): Promise<void> { return new Promise( ( resolve ) => setTimeout( resolve, ms ) ) }
async function handleUserPromptSubmit(): Promise<void>
{
  // Hook-Prompt-Parameter erhalten (JSON input via stdin) [absolut unnötig - just for the future!]
  const hi = new HookInput; hi.init()
  // Parameter lesen
  const fn = process.argv[ 2 ]
  if ( fn ) {
    const infoFilePath = `${fn}.info`     // added ".info" it's gonna be two files!
    const pleaseFilePath = `${fn}.danke`  // no FN-change (why change all the other files, too?)
    // say "please" to initiate reply sequence
    fs.writeFileSync( pleaseFilePath, '' )
    // wait at max 5s for "data production" (done when bitte-file got deleted.)
    const startTime = Date.now()
    while ( fs.existsSync( pleaseFilePath ) ) {
      if ( Date.now() - startTime > maxWaitMs ) throw "info file not ready in time."
      await sleep( 50 )
    }
    // read data
    const data = JSON.parse( fs.readFileSync( infoFilePath, 'utf-8' ) ) as HookData
    // remove temporary file
    fs.unlinkSync( infoFilePath )
    // produce output
    console.log( JSON.stringify( new HookOutput( data ) ) )
  } else {
    process.stderr.write( `[ERROR] No data file path provided via argv[2]: '${fn}'\n` )
    process.exit( 1 )
  }
}

handleUserPromptSubmit().catch( ( err ) =>
{
  process.stderr.write( `[ERROR] Hook handler failed: ${err}\n` )
  process.exit( 1 )
} )
