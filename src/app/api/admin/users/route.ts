import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { requireAdminApi } from '@/lib/auth'
import { createAdminSupabase } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type Role = 'admin' | 'editor' | 'viewer'
const isRole = (r: unknown): r is Role => r === 'admin' || r === 'editor' || r === 'viewer'

const bad = (message: string, status = 400) => NextResponse.json({ error: message }, { status })

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  return request.json().catch(() => null)
}

// Надёжный пароль для передачи сотруднику (Supabase хранит только его bcrypt-хэш).
function generatePassword(): string {
  return randomBytes(12).toString('base64url')
}

export async function GET() {
  const g = await requireAdminApi()
  if ('error' in g) return g.error
  const admin = createAdminSupabase()
  const { data: profiles } = await admin.from('profiles').select('id, email, full_name').order('email')
  const { data: roles } = await admin.from('user_roles').select('email, role')
  // сопоставление без учёта регистра — как в auth.ts и is_admin()
  const roleMap = new Map((roles ?? []).map((r) => [String(r.email).toLowerCase(), r.role]))
  const users = (profiles ?? []).map((p) => ({
    id: p.id as string,
    email: p.email as string,
    full_name: (p.full_name as string | null) ?? '',
    role: (roleMap.get(String(p.email).toLowerCase()) as Role | undefined) ?? 'viewer',
  }))
  return NextResponse.json({ users })
}

export async function POST(request: Request) {
  const g = await requireAdminApi()
  if ('error' in g) return g.error
  const body = await readBody(request)
  if (!body) return bad('Некорректный запрос')
  const { email, full_name, role } = body
  if (typeof email !== 'string' || !email.includes('@')) return bad('Некорректная почта')
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
    return bad(msg)
  }
  const { error: roleError } = await admin.from('user_roles').upsert({ email: normalized, role: finalRole })
  // аккаунт уже создан — пароль всё равно возвращаем, но предупреждаем о роли
  const warning = roleError ? `Аккаунт создан, но роль не записана (${roleError.message}) — назначьте её вручную` : undefined
  return NextResponse.json({ ok: true, email: normalized, password, warning }) // пароль показываем один раз
}

export async function PATCH(request: Request) {
  const g = await requireAdminApi()
  if ('error' in g) return g.error
  const body = await readBody(request)
  if (!body) return bad('Некорректный запрос')
  const { email, role } = body
  if (!isRole(role)) return bad('Неизвестная роль')
  if (typeof email !== 'string' || !email.includes('@')) return bad('Некорректная почта')
  const normalized = email.trim().toLowerCase()
  if (normalized === g.session.email && role !== 'admin') {
    return bad('Нельзя снять админа с самого себя')
  }
  const admin = createAdminSupabase()
  const { error } = await admin.from('user_roles').upsert({ email: normalized, role })
  if (error) return bad(error.message, 500)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request) {
  const g = await requireAdminApi()
  if ('error' in g) return g.error
  const body = await readBody(request)
  if (!body || typeof body.id !== 'string' || !body.id) return bad('Некорректный запрос')
  const admin = createAdminSupabase()

  // почту берём из auth по id — присланной в теле не доверяем,
  // иначе самозащиту можно обойти парой {свой id, чужая почта}
  const { data: target, error: lookupError } = await admin.auth.admin.getUserById(body.id)
  if (lookupError || !target?.user?.email) return bad('Пользователь не найден', 404)
  const email = target.user.email.toLowerCase()
  if (email === g.session.email) return bad('Нельзя удалить самого себя')

  const { error: roleError } = await admin.from('user_roles').delete().eq('email', email)
  if (roleError) return bad(roleError.message, 500)
  const { error: userError } = await admin.auth.admin.deleteUser(body.id) // profile удалится каскадом
  if (userError) return bad(userError.message, 500)
  return NextResponse.json({ ok: true })
}
