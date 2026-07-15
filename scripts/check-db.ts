import { config } from 'dotenv'
config({ path: '.env.local' })
import { createAdminSupabase } from '@/lib/supabase/admin'

async function main() {
  const admin = createAdminSupabase()
  for (const t of ['profiles', 'user_roles', 'tables', 'table_sheets', 'datasets']) {
    const { count, error } = await admin.from(t).select('*', { count: 'exact', head: true })
    if (error) throw new Error(`${t}: ${error.message}`)
    console.log(`✓ ${t}: ${count} строк`)
  }
  console.log('БД готова')
}
main().catch((e) => { console.error(e); process.exit(1) })
