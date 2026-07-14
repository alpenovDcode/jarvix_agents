import { config } from 'dotenv'
config({ path: '.env.local' })
import { createClient } from '@supabase/supabase-js'

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  for (const t of ['profiles', 'allowlist', 'user_roles', 'tables', 'table_sheets', 'datasets']) {
    const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true })
    if (error) throw new Error(`${t}: ${error.message}`)
    console.log(`✓ ${t}: ${count} строк`)
  }
  console.log('БД готова')
}
main().catch((e) => { console.error(e); process.exit(1) })
