/**
 * Создаёт первого админ-пользователя через service_role (bootstrap).
 *   npm run create:admin -- почта@пример.com [пароль]
 * Если пароль не задан — генерируется и печатается.
 */
import { config } from 'dotenv'
config({ path: '.env.local' })
import { randomBytes } from 'node:crypto'
import { createAdminSupabase } from '@/lib/supabase/admin'

async function main() {
  const email = (process.argv[2] ?? 'assistmv5@gmail.com').trim().toLowerCase()
  const password = process.argv[3] ?? randomBytes(9).toString('base64url')
  const admin = createAdminSupabase()

  const { error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: 'Администратор' },
  })
  if (error && !error.message.includes('already')) throw new Error(error.message)
  const { error: roleError } = await admin.from('user_roles').upsert({ email, role: 'admin' })
  if (roleError) throw new Error(`user_roles: ${roleError.message}`) // иначе баннер успеха при ненадёжной роли

  console.log('\n=== Вход в TableHub ===')
  console.log(`почта:  ${email}`)
  console.log(error?.message.includes('already') ? '(пользователь уже существовал, роль admin подтверждена)' : `пароль: ${password}`)
  console.log('=======================\n')
}

main().catch((e) => { console.error(e); process.exit(1) })
