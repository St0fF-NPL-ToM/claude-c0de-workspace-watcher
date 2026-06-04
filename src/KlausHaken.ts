import * as fs from 'fs'
import { HookData } from './KlausDinge'

interface HookInput { fn: string }

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
  let isl = ''
  let hi: HookInput
  // Parameter erhalten (JSON input via stdin)
  for await ( const chunk of process.stdin ) { isl += chunk }
  try {
    hi = JSON.parse( isl ) as HookInput
    const lockFilePath = `${hi.fn}.lock` // `${hi.fn}.lock`
    const thankYouPath = `${hi.fn}.danke`// `${hi.fn}.danke`

    let maxWaitMs = 5000
    const startTime = Date.now()
    while ( fs.existsSync( lockFilePath ) ) {
      if ( Date.now() - startTime > maxWaitMs ) process.exit( 0 )
      await sleep( 10 )
    }
    // read data
    const data = JSON.parse( fs.readFileSync( hi.fn, 'utf-8' ) ) as HookData
    // say "thank you"
    fs.writeFileSync( thankYouPath, '' )
    // produce output
    console.log( JSON.stringify( new HookOutput( data ) ) )
  } catch ( err ) {
    process.stderr.write( `[WARN] Could not read data or create danke file: ${err}\n` )
  }
}

handleUserPromptSubmit().catch( ( err ) =>
{
  process.stderr.write( `[ERROR] Hook handler failed: ${err}\n` )
  process.exit( 1 )
} )
