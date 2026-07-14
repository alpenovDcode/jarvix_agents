import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

export type Role = 'admin' | 'editor' | 'viewer'
export type SessionInfo = { userId: string; email: string; role: Role }

// Аккаунты создаёт только админ (публичная регистрация выключена), поэтому
// сам факт валидной сессии = доступ. Роль берём из user_roles (по умолчанию viewer).
async function resolveSession(): Promise<{ state: 'anon' | 'ok'; info?: SessionInfo }> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { state: 'anon' }
  const email = user.email.toLowerCase()
  const admin = createAdminSupabase()
  const { data: roleRow } = await admin.from('user_roles').select('role').eq('email', email).maybeSingle()
  const role = (roleRow?.role as Role | undefined) ?? 'viewer'
  return { state: 'ok', info: { userId: user.id, email, role } }
}

export async function getApiSession(): Promise<SessionInfo | null> {
  const s = await resolveSession()
  return s.state === 'ok' ? s.info! : null
}

export async function requireUser(): Promise<SessionInfo> {
  const s = await resolveSession()
  if (s.state === 'anon') redirect('/login')
  return s.info!
}

export async function requireAdmin(): Promise<SessionInfo> {
  const info = await requireUser()
  if (info.role !== 'admin') redirect('/')
  return info
}
