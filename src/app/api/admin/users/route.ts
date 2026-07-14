import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { getApiSession } from '@/lib/auth'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type Role = 'admin' | 'editor' | 'viewer'
const isRole = (r: unknown): r is Role => r === 'admin' || r === 'editor' || r === 'viewer'

async function guard() {
  const session = await getApiSession()
  if (!session) return { error: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }) } as const
  if (session.role !== 'admin') return { error: NextResponse.json({ error: 'Только для администратора' }, { status: 403 }) } as const
  return { session } as const
}

// Надёжный пароль для передачи сотруднику (Supabase хранит только его bcrypt-хэш).
function generatePassword(): string {
  return randomBytes(12).toString('base64url')
}

export async function GET() {
  const g = await guard()
  if ('error' in g) return g.error
  const admin = createAdminSupabase()
  const { data: profiles } = await admin.from('profiles').select('id, email, full_name').order('email')
  const { data: roles } = await admin.from('user_roles').select('email, role')
  const roleMap = new Map((roles ?? []).map((r) => [r.email, r.role]))
  const users = (profiles ?? []).map((p) => ({
    id: p.id as string,
    email: p.email as string,
    full_name: (p.full_name as string | null) ?? '',
    role: (roleMap.get(p.email as string) as Role | undefined) ?? 'viewer',
  }))
  return NextResponse.json({ users })
}

export async function POST(request: Request) {
  const g = await guard()
  if ('error' in g) return g.error
  const { email, full_name, role } = await request.json()
  if (typeof email !== 'string' || !email.includes('@')) return NextResponse.json({ error: 'Некорректная почта' }, { status: 400 })
  const normalized = email.trim().toLowerCase()
  const finalRole: Role = isRole(role) ? role : 'viewer'
  const password = generatePassword()
  const admin = createAdminSupabase()

  const { error } = await admin.auth.admin.createUser({
    email: normalized,
    password,
    email_confirm: true, // без письма-подтверждения — доступ выдаёт админ
    user_metadata: { full_name: typeof full_name === 'string' ? full_name.trim() : '' },
  })
  if (error) {
    const msg = error.message.includes('already') ? 'Пользователь с такой почтой уже есть' : error.message
    return NextResponse.json({ error: msg }, { status: 400 })
  }
  await admin.from('user_roles').upsert({ email: normalized, role: finalRole })
  return NextResponse.json({ ok: true, email: normalized, password }) // пароль показываем один раз
}

export async function PATCH(request: Request) {
  const g = await guard()
  if ('error' in g) return g.error
  const { email, role } = await request.json()
  if (!isRole(role)) return NextResponse.json({ error: 'Неизвестная роль' }, { status: 400 })
  const normalized = String(email).trim().toLowerCase()
  if (normalized === g.session.email && role !== 'admin') {
    return NextResponse.json({ error: 'Нельзя снять админа с самого себя' }, { status: 400 })
  }
  const admin = createAdminSupabase()
  await admin.from('user_roles').upsert({ email: normalized, role })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const g = await guard()
  if ('error' in g) return g.error
  const { id, email } = await request.json()
  const normalized = String(email).trim().toLowerCase()
  if (normalized === g.session.email) return NextResponse.json({ error: 'Нельзя удалить самого себя' }, { status: 400 })
  const admin = createAdminSupabase()
  await admin.from('user_roles').delete().eq('email', normalized)
  if (typeof id === 'string' && id) await admin.auth.admin.deleteUser(id) // profile удалится каскадом
  return NextResponse.json({ ok: true })
}
