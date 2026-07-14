import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

export type Role = 'admin' | 'editor' | 'viewer'
export type SessionInfo = { userId: string; email: string; role: Role }

async function resolveSession(): Promise<{ state: 'anon' | 'denied' | 'ok'; info?: SessionInfo }> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { state: 'anon' }
  const email = user.email.toLowerCase()
  const admin = createAdminSupabase()
  const { data: allowed } = await admin.from('allowlist').select('email').eq('email', email).maybeSingle()
  if (!allowed) return { state: 'denied' }
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
  if (s.state === 'denied') redirect('/denied')
  return s.info!
}

export async function requireAdmin(): Promise<SessionInfo> {
  const info = await requireUser()
  if (info.role !== 'admin') redirect('/')
  return info
}
