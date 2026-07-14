import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/auth'
import { createAdminSupabase } from '@/lib/supabase/admin'

async function guard() {
  const session = await getApiSession()
  if (!session) return { error: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }) } as const
  if (session.role !== 'admin') return { error: NextResponse.json({ error: 'Только для администратора' }, { status: 403 }) } as const
  return { session } as const
}

export async function GET() {
  const g = await guard()
  if ('error' in g) return g.error
  const admin = createAdminSupabase()
  const { data: allow } = await admin.from('allowlist').select('email').order('email')
  const { data: roles } = await admin.from('user_roles').select('email, role')
  const roleMap = new Map((roles ?? []).map((r) => [r.email, r.role]))
  return NextResponse.json({ users: (allow ?? []).map((a) => ({ email: a.email, role: roleMap.get(a.email) ?? 'viewer' })) })
}

export async function POST(request: Request) {
  const g = await guard()
  if ('error' in g) return g.error
  const { email, role } = await request.json()
  if (typeof email !== 'string' || !email.includes('@')) return NextResponse.json({ error: 'Некорректный email' }, { status: 400 })
  const normalized = email.trim().toLowerCase()
  const admin = createAdminSupabase()
  const { error } = await admin.from('allowlist').upsert({ email: normalized })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (role === 'admin' || role === 'editor' || role === 'viewer') {
    await admin.from('user_roles').upsert({ email: normalized, role })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const g = await guard()
  if ('error' in g) return g.error
  const { email } = await request.json()
  const normalized = String(email).trim().toLowerCase()
  if (normalized === g.session.email) return NextResponse.json({ error: 'Нельзя удалить самого себя' }, { status: 400 })
  const admin = createAdminSupabase()
  await admin.from('user_roles').delete().eq('email', normalized)
  await admin.from('allowlist').delete().eq('email', normalized)
  return NextResponse.json({ ok: true })
}
