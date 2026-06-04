import * as fs from 'fs'
import * as path from 'path'

const packageJson = JSON.parse(
    fs.readFileSync( path.join( __dirname, '../package.json' ), 'utf-8' )
)
// Property-Names-List
interface P { n: string; k: string; s: string; d: string[] | string }
const p = Object.entries( packageJson.contributes.configuration.properties ).map( ( [ k, _ ] ) =>
{
    let obj = _ as any
    const li = k.lastIndexOf( '.' )
    const s = k.substring( li === -1 ? 0 : li + 1 )
    return { n: obj.name, k, s, d: obj.default }
} )

let content = `
// AUTO-GENERATED from package.json - Klaus kann auch pre-build-steps!
export const ExtName = '${packageJson.name}'
export enum CKey
{
${p.map( _ => `\t${_.n} = '${_.s}'` ).join( ',\n' )}
}
export enum ConfigKey
{
${p.map( _ => `\t${_.n} = '${_.k}'` ).join( ',\n' )}
}
export const Default = {
${p.map( _ =>
{
    let t = `\t${_.n}: `
    if ( Array.isArray( _.d ) ) t += `[ \`${_.d.join( '`, `' )}\` ]`
    else t += `'${_.d}'`
    return t
} ).join( ',\n' )}
}
`

fs.writeFileSync( path.join( __dirname, '../src/KlausKonstanten.generated.ts' ), content )

console.log( '✅ ConfigKeys generated from package.json' )
