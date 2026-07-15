import { redirect } from 'next/navigation'
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'
import { createAdminSupabase } from '@/lib/supabase/admin'

export type Role = 'admin' | 'editor' | 'viewer'
export type SessionInfo = { userId: string; email: string; role: Role }

// Аккаунты создаёт только админ (публичная регистрация выключена), поэтому
// сам факт валидной сессии = доступ. Роль берём из user_roles (по умолчанию viewer).
export async function getApiSession(): Promise<SessionInfo | null> {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const email = user.email.toLowerCase()
  const admin = createAdminSupabase()
  const { data: roleRow } = await admin.from('user_roles').select('role').eq('email', email).maybeSingle()
  const role = (roleRow?.role as Role | undefined) ?? 'viewer'
  return { userId: user.id, email, role }
}

export async function requireUser(): Promise<SessionInfo> {
  const session = await getApiSession()
  if (!session) redirect('/login')
  return session
}

export async function requireAdmin(): Promise<SessionInfo> {
  const info = await requireUser()
  if (info.role !== 'admin') redirect('/')
  return info
}

/** Общий guard для admin-only API-роутов. */
export async function requireAdminApi(): Promise<{ session: SessionInfo } | { error: NextResponse }> {
  const session = await getApiSession()
  if (!session) return { error: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }) }
  if (session.role !== 'admin') return { error: NextResponse.json({ error: 'Только для администратора' }, { status: 403 }) }
  return { session }
}
