import * as fs from 'fs'
import { HookData } from './KlausDinge'

const maxWaitMs = 5000

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
    if ( ac.diffs.length )
      context += `[EPHEMERAL: unified differential file changes since ${ac.lastClaude}:]\n${ac.diffs.join( '\n' )}\n---\n`
    if ( ac.files.length )
      context += `[EPHEMERAL: following workspace files have changed since ${ac.lastClaude} (no diff available):]\n${ac.files.join( '\n' )}\n---\n`
    if ( context.length === 0 )
      context = `[EPHEMERAL: no workspace files have changed since${ac.lastClaude}\n`
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
