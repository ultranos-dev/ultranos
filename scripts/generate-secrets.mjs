// generates JWT secrets and writes to .env
import { randomBytes } from 'crypto'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '..', '.env')

const accessSecret = randomBytes(64).toString('hex')
const refreshSecret = randomBytes(64).toString('hex')

let content = readFileSync(envPath, 'utf-8')
content = content.replace('JWT_ACCESS_SECRET=REPLACE_WITH_GENERATED_SECRET', `JWT_ACCESS_SECRET=${accessSecret}`)
content = content.replace('JWT_REFRESH_SECRET=REPLACE_WITH_GENERATED_SECRET', `JWT_REFRESH_SECRET=${refreshSecret}`)
writeFileSync(envPath, content)

console.log('✅ JWT secrets generated and written to .env')
console.log('   JWT_ACCESS_SECRET  →', accessSecret.slice(0, 16) + '...')
console.log('   JWT_REFRESH_SECRET →', refreshSecret.slice(0, 16) + '...')
