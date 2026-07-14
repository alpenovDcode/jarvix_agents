# TableHub Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Каталог всех Google-таблиц отдела маркетинга с импортом в Postgres, просмотром в Univer (read-only) и автоматической live-аналитикой; вход через Google OAuth по allowlist.

**Architecture:** Next.js (App Router) на Vercel + Supabase (Postgres/Auth/Realtime). Импорт: Drive/Sheets API (service account) → конвертер в Univer-снапшоты (jsonb) → детектор структуры → типизированный dataset → генераторы виджетов. В фазе 1 источник истины — Google (`mode='google-owned'`), платформа read-only, переимпорт каждые 5 минут по pg_cron.

**Tech Stack:** Next.js 16 (webpack), TypeScript strict, Tailwind CSS 4, @univerjs/presets, @supabase/supabase-js + @supabase/ssr, googleapis, Recharts, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-14-marketing-tables-platform-design.md`

## Global Constraints

- Репозиторий: `/Users/ruslanalpenov/Desktop/личные проекты/tablehub`. Путь содержит кириллицу и пробел — **всегда кавычь пути в shell**; все команды выполняются из корня репозитория.
- Next.js собирается **только webpack'ом**: скрипты `next dev --webpack`, `next build --webpack` (Turbopack ломается на кириллическом пути).
- Vercel Hobby: серверная функция ≤ 60 сек → любой импорт работает с бюджетом времени **45 000 мс** на вызов и докладывает `remaining`; Vercel cron на Hobby только раз в день → 5-минутный цикл делает **pg_cron из Supabase** (Task 14).
- UI: русский язык, светлая тема, чистый профессиональный стиль, без геймификации.
- Цвета графиков — только константы `VIZ` из `src/lib/viz.ts` (валидированная палитра навыка dataviz); менять hex без повторного прогона `validate_palette.js` нельзя.
- Чистая логика (конвертер, детектор, типизация, аналитика, каталог) — **TDD, без обращений к сети/БД**. Роуты и страницы — тонкие обёртки.
- `SUPABASE_SERVICE_ROLE_KEY` и `GOOGLE_SERVICE_ACCOUNT_JSON_B64` используются только в серверном коде (`src/lib/supabase/admin.ts`, `src/lib/google/*`, роуты); в клиентские компоненты — никогда.
- Лимит виджетов аналитики: 40 на лист.
- API-роуты, использующие googleapis: `export const runtime = 'nodejs'` и `export const maxDuration = 60`.
- Пакетный менеджер npm. Коммиты — conventional commits (`feat:`, `test:`, `chore:`, `docs:`).

## Вне скоупа этого плана

По спеке уходит в фазы 2–3 (не реализовывать сейчас): редактирование и совместная работа, зеркалирование платформа→Google, перевод владения, ручная разметка листов, retention-когорты, фильтр по периоду и настройка набора/порядка виджетов, страница «Синхронизация», доступ по отдельным таблицам.

## Карта файлов

```
tablehub/
├── package.json, tsconfig.json, next.config.ts, postcss.config.mjs, vitest.config.ts, vercel.json
├── .env.local.example, README.md
├── supabase/migrations/0001_init.sql
├── scripts/check-db.ts, scripts/check-google.ts
├── src/
│   ├── middleware.ts                      # refresh сессии Supabase
│   ├── app/
│   │   ├── layout.tsx, globals.css, page.tsx          # каталог
│   │   ├── login/page.tsx, denied/page.tsx
│   │   ├── auth/callback/route.ts
│   │   ├── tables/[id]/page.tsx                       # вкладки таблицы
│   │   ├── tables/[id]/TableTabs.tsx                  # клиентский переключатель вкладок
│   │   ├── tables/[id]/UniverViewer.tsx               # Univer read-only
│   │   ├── tables/[id]/AnalyticsTab.tsx               # виджеты + Realtime
│   │   ├── tables/[id]/ReportTab.tsx                  # отчёт импорта
│   │   ├── admin/page.tsx, admin/AllowlistManager.tsx, admin/ImportPanel.tsx
│   │   └── api/
│   │       ├── admin/import/route.ts
│   │       ├── admin/allowlist/route.ts
│   │       ├── cron/reimport/route.ts
│   │       └── tables/[id]/analytics/route.ts
│   ├── components/Header.tsx
│   └── lib/
│       ├── types.ts                       # общие типы снапшота/датасета
│       ├── auth.ts                        # requireUser / requireAdmin / getApiSession
│       ├── supabase/client.ts, server.ts, admin.ts
│       ├── google/client.ts               # Drive + Sheets API
│       ├── google/convert.ts              # [PURE] Google grid → Univer snapshot + отчёт
│       ├── dataset/detect.ts              # [PURE] snapshotToMatrix, detectDataRange
│       ├── dataset/infer.ts               # [PURE] типизация колонок, парсеры
│       ├── dataset/build.ts               # [PURE] snapshot → dataset
│       ├── analytics/widgets.ts           # [PURE] типы виджетов + buildWidgets
│       ├── catalog.ts                     # [PURE] группировка/поиск каталога
│       ├── workbook.ts                    # [PURE] сборка IWorkbookData для Univer
│       ├── import/importTable.ts          # оркестрация импорта
│       └── viz.ts                         # палитра + ru-форматтеры
└── tests/                                 # зеркалит src/lib, + tests/smoke.test.ts
```

---

### Task 1: Скаффолд Next.js + Tailwind + Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `vitest.config.ts`, `.gitignore`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`, `tests/smoke.test.ts`

**Interfaces:**
- Produces: работающие `npm run dev` (webpack), `npm run test`; alias `@/*` → `src/*` и в Next, и в Vitest.

- [ ] **Step 1: Создать package.json и .gitignore**

`package.json`:
```json
{
  "name": "tablehub",
  "private": true,
  "scripts": {
    "dev": "next dev --webpack",
    "build": "next build --webpack",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest",
    "check:db": "tsx scripts/check-db.ts",
    "check:google": "tsx scripts/check-google.ts"
  }
}
```

`.gitignore`:
```
node_modules/
.next/
.env.local
.vercel
*.tsbuildinfo
```

- [ ] **Step 2: Установить зависимости**

Run:
```bash
cd "/Users/ruslanalpenov/Desktop/личные проекты/tablehub"
npm i next@16 react@19 react-dom@19
npm i -D typescript @types/node @types/react @types/react-dom vitest tailwindcss @tailwindcss/postcss postcss tsx dotenv
```
Expected: обе команды завершаются без ошибок, появляется `package-lock.json`.

- [ ] **Step 3: Создать конфиги**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.ts`:
```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

`postcss.config.mjs`:
```js
export default { plugins: { '@tailwindcss/postcss': {} } }
```

`vitest.config.ts` (обязательно `fileURLToPath` — на кириллическом пути `new URL().pathname` даёт percent-encoded мусор):
```ts
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
```

- [ ] **Step 4: Создать каркас приложения**

`src/app/globals.css`:
```css
@import "tailwindcss";

:root {
  --surface: #fcfcfb;
  --page: #f9f9f7;
  --ink: #0b0b0b;
  --ink-secondary: #52514e;
  --ink-muted: #898781;
  --hairline: #e1e0d9;
}

body {
  background: var(--page);
  color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}
```

`src/app/layout.tsx`:
```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'TableHub — таблицы отдела маркетинга',
  description: 'Единая платформа таблиц и аналитики',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
```

`src/app/page.tsx` (заглушка, каталог придёт в Task 10):
```tsx
export default function Home() {
  return <main className="p-8">TableHub</main>
}
```

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('vitest работает', () => {
    expect(1 + 1).toBe(2)
  })
})
```

- [ ] **Step 5: Проверить dev-сервер и тесты**

Run: `npm run test`
Expected: `1 passed`.

Run: `npm run dev` (остановить по Ctrl+C после проверки)
Expected: страница `http://localhost:3000` отвечает «TableHub», в логе нет упоминаний Turbopack.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: scaffold Next.js app with Tailwind and Vitest"
```

---

### Task 2: Схема БД, клиенты Supabase, проверочный скрипт

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `scripts/check-db.ts`, `.env.local.example`

**Interfaces:**
- Produces: таблицы `profiles`, `allowlist`, `user_roles`, `tables`, `table_sheets`, `datasets` с RLS; функции `public.is_allowlisted()`, `public.is_admin()`; `createBrowserSupabase(): SupabaseClient`, `createServerSupabase(): Promise<SupabaseClient>`, `createAdminSupabase(): SupabaseClient`.

- [ ] **Step 1: Установить зависимости**

```bash
npm i @supabase/supabase-js @supabase/ssr
```

- [ ] **Step 2: Написать миграцию**

`supabase/migrations/0001_init.sql`:
```sql
-- TableHub фаза 1: схема, RLS, сиды
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.allowlist (
  email text primary key,
  created_at timestamptz not null default now()
);

create table public.user_roles (
  email text primary key,
  role text not null check (role in ('admin','editor','viewer'))
);

create table public.tables (
  id uuid primary key default gen_random_uuid(),
  google_spreadsheet_id text not null unique,
  title text not null,
  folder text not null default 'Без папки',
  description text,
  mode text not null default 'google-owned' check (mode in ('google-owned','platform-owned')),
  import_status text not null default 'pending' check (import_status in ('pending','ok','error')),
  import_error text,
  import_report jsonb,
  google_modified_at timestamptz,
  last_imported_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.table_sheets (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  google_sheet_id bigint not null,
  title text not null,
  sheet_index int not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  unique (table_id, google_sheet_id)
);

create table public.datasets (
  sheet_id uuid primary key references public.table_sheets(id) on delete cascade,
  status text not null check (status in ('ok','needs_mapping','empty')),
  header_row int,
  start_col int,
  end_col int,
  end_row int,
  confidence real,
  columns jsonb,
  rows jsonb,
  built_at timestamptz not null default now()
);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger tables_updated_at before update on public.tables
  for each row execute function public.set_updated_at();
create trigger table_sheets_updated_at before update on public.table_sheets
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.jwt_email() returns text language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create or replace function public.is_allowlisted() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowlist a where lower(a.email) = public.jwt_email())
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_allowlisted() and exists (
    select 1 from public.user_roles r
    where lower(r.email) = public.jwt_email() and r.role = 'admin')
$$;

alter table public.profiles enable row level security;
alter table public.allowlist enable row level security;
alter table public.user_roles enable row level security;
alter table public.tables enable row level security;
alter table public.table_sheets enable row level security;
alter table public.datasets enable row level security;

create policy "profiles select allowlisted" on public.profiles
  for select to authenticated using (public.is_allowlisted());
create policy "allowlist select own or admin" on public.allowlist
  for select to authenticated using (lower(email) = public.jwt_email() or public.is_admin());
create policy "allowlist write admin" on public.allowlist
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "roles select own or admin" on public.user_roles
  for select to authenticated using (lower(email) = public.jwt_email() or public.is_admin());
create policy "roles write admin" on public.user_roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "tables select allowlisted" on public.tables
  for select to authenticated using (public.is_allowlisted());
create policy "sheets select allowlisted" on public.table_sheets
  for select to authenticated using (public.is_allowlisted());
create policy "datasets select allowlisted" on public.datasets
  for select to authenticated using (public.is_allowlisted());
-- Запись в tables/table_sheets/datasets — только service role (обходит RLS).

insert into public.allowlist (email) values ('assistmv5@gmail.com') on conflict do nothing;
insert into public.user_roles (email, role) values ('assistmv5@gmail.com', 'admin') on conflict do nothing;

alter publication supabase_realtime add table public.datasets;
```

- [ ] **Step 3: Клиенты Supabase**

`src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createBrowserSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

`src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createServerSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // вызов из Server Component — сессию обновит middleware
          }
        },
      },
    },
  )
}
```

`src/lib/supabase/admin.ts`:
```ts
import { createClient } from '@supabase/supabase-js'

// Только для серверного кода: обходит RLS.
export function createAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
```

- [ ] **Step 4: .env.local.example и проверочный скрипт**

`.env.local.example`:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://XXXX.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
# base64 от JSON-ключа service account Google (cat key.json | base64)
GOOGLE_SERVICE_ACCOUNT_JSON_B64=
# ID папки Google Drive с таблицами отдела (из URL папки)
GOOGLE_DRIVE_FOLDER_ID=
# Случайная строка: openssl rand -hex 24
CRON_SECRET=
```

`scripts/check-db.ts`:
```ts
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
```

- [ ] **Step 5: ЧЕЛОВЕЧЕСКИЙ ЧЕКПОЙНТ — создать проект Supabase и применить миграцию**

Попросить пользователя (или сделать через браузер с его согласия):
1. Создать проект на supabase.com (регион EU, Free tier).
2. SQL Editor → вставить содержимое `supabase/migrations/0001_init.sql` → Run. Ожидается `Success. No rows returned`.
3. Project Settings → API: скопировать URL, `anon`, `service_role` ключи в `.env.local` (создать из `.env.local.example`).

- [ ] **Step 6: Проверить схему**

Run: `npm run check:db`
Expected:
```
✓ profiles: 0 строк
✓ allowlist: 1 строк
✓ user_roles: 1 строк
✓ tables: 0 строк
✓ table_sheets: 0 строк
✓ datasets: 0 строк
БД готова
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: database schema, RLS policies and Supabase clients"
```

---

### Task 3: Вход через Google, allowlist-гейт, шапка

**Files:**
- Create: `src/middleware.ts`, `src/lib/auth.ts`, `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`, `src/app/denied/page.tsx`, `src/components/Header.tsx`
- Modify: `src/app/layout.tsx`, `src/app/page.tsx`

**Interfaces:**
- Consumes: `createServerSupabase`, `createAdminSupabase` (Task 2).
- Produces: `type SessionInfo = { userId: string; email: string; role: 'admin' | 'editor' | 'viewer' }`; `requireUser(): Promise<SessionInfo>` (redirect на `/login` или `/denied`); `requireAdmin(): Promise<SessionInfo>` (redirect на `/`); `getApiSession(): Promise<SessionInfo | null>` (без redirect, для API-роутов).

- [ ] **Step 1: middleware для обновления сессии**

`src/middleware.ts`:
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )
  await supabase.auth.getUser() // обновляет протухший токен
  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)'],
}
```

- [ ] **Step 2: lib/auth.ts**

```ts
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
```

- [ ] **Step 3: страницы входа/отказа и callback**

`src/app/login/page.tsx`:
```tsx
'use client'
import { createBrowserSupabase } from '@/lib/supabase/client'

export default function LoginPage() {
  const signIn = () => {
    const supabase = createBrowserSupabase()
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">TableHub</h1>
        <p className="mt-2 text-sm text-[var(--ink-secondary)]">Таблицы и аналитика отдела маркетинга</p>
        <button
          onClick={signIn}
          className="mt-6 w-full rounded-lg bg-[#2a78d6] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#256abf]"
        >
          Войти через Google
        </button>
      </div>
    </main>
  )
}
```

`src/app/auth/callback/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (code) {
    const supabase = await createServerSupabase()
    await supabase.auth.exchangeCodeForSession(code)
  }
  return NextResponse.redirect(new URL('/', url.origin))
}
```

`src/app/denied/page.tsx`:
```tsx
import Link from 'next/link'

export default function DeniedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-8 text-center">
        <h1 className="text-lg font-semibold">Нет доступа</h1>
        <p className="mt-2 text-sm text-[var(--ink-secondary)]">
          Ваш аккаунт не в списке допущенных. Обратитесь к администратору платформы.
        </p>
        <Link href="/login" className="mt-6 inline-block text-sm text-[#2a78d6] underline">
          Войти другим аккаунтом
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 4: шапка**

`src/components/Header.tsx`:
```tsx
import Link from 'next/link'
import type { SessionInfo } from '@/lib/auth'

export function Header({ session }: { session: SessionInfo }) {
  return (
    <header className="border-b border-[var(--hairline)] bg-[var(--surface)]">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-semibold">TableHub</Link>
        <nav className="flex items-center gap-4 text-sm text-[var(--ink-secondary)]">
          {session.role === 'admin' && <Link href="/admin" className="hover:text-[var(--ink)]">Админка</Link>}
          <span>{session.email}</span>
        </nav>
      </div>
    </header>
  )
}
```

Обновить `src/app/page.tsx` — временная защищённая заглушка:
```tsx
import { requireUser } from '@/lib/auth'
import { Header } from '@/components/Header'

export default async function Home() {
  const session = await requireUser()
  return (
    <>
      <Header session={session} />
      <main className="mx-auto max-w-6xl p-6">Каталог появится в Task 10</main>
    </>
  )
}
```

- [ ] **Step 5: ЧЕЛОВЕЧЕСКИЙ ЧЕКПОЙНТ — настроить Google OAuth**

1. Google Cloud Console → создать проект `tablehub` → APIs & Services → OAuth consent screen (Internal, если Workspace; иначе External + test users).
2. Credentials → Create OAuth client ID (Web): Authorized redirect URI = `https://XXXX.supabase.co/auth/v1/callback` (из Supabase → Authentication → Providers → Google).
3. В Supabase → Authentication → Providers → Google: включить, вставить Client ID/Secret.
4. В Supabase → Authentication → URL Configuration: Site URL `http://localhost:3000`, Redirect URLs `http://localhost:3000/auth/callback`.

- [ ] **Step 6: Проверить вход вручную**

Run: `npm run dev`
Проверить: `/` редиректит на `/login` → вход Google-аккаунтом из allowlist → каталог-заглушка с шапкой и «Админка»; вход посторонним аккаунтом → `/denied`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: Google OAuth login with allowlist gate and roles"
```

---

### Task 4: Общие типы и клиент Google API

**Files:**
- Create: `src/lib/types.ts`, `src/lib/google/client.ts`, `scripts/check-google.ts`

**Interfaces:**
- Produces (`src/lib/types.ts` — использует вся чистая логика):

```ts
export type CellScalar = string | number | boolean | null

export interface SnapshotStyle {
  bg?: { rgb: string }        // '#rrggbb'
  bl?: 0 | 1                  // bold
  it?: 0 | 1                  // italic
  fs?: number                 // размер шрифта
  ht?: 0 | 1 | 2 | 3          // horizontal align: unset/left/center/right
  n?: { pattern: string }     // числовой формат Univer
  nfType?: string             // тип формата Google (DATE, PERCENT, CURRENCY…) — наше расширение
}

export interface SnapshotCell {
  v?: string | number | boolean   // вычисленное значение
  f?: string                      // формула '=SUM(A1:A2)' (совместимая)
  s?: string                      // id стиля
  custom?: { frozenFormula?: string } // замороженная Google-специфичная формула
}

export interface MergeRange { startRow: number; endRow: number; startColumn: number; endColumn: number }

export interface SheetSnapshot {
  name: string
  rowCount: number
  columnCount: number
  cellData: Record<number, Record<number, SnapshotCell>>
  mergeData: MergeRange[]
  styles: Record<string, SnapshotStyle>   // ключи уникальны в рамках листа: s{sheetIndex}_{n}
}

export type ColumnType = 'number' | 'money' | 'percent' | 'date' | 'category' | 'id' | 'text'

export interface DatasetColumn { index: number; key: string; title: string; type: ColumnType }

export type DatasetBuild =
  | { status: 'ok'; headerRow: number; range: { startCol: number; endCol: number; endRow: number }
      confidence: number; columns: DatasetColumn[]; rows: CellScalar[][] }
  | { status: 'needs_mapping'; confidence: number }
  | { status: 'empty' }

export interface SheetImportReport {
  sheetTitle: string
  cellCount: number
  formulaCount: number
  frozenFormulas: { a1: string; fn: string }[]
  warnings: string[]
}

export interface TableImportReport {
  sheets: SheetImportReport[]
  totalCells: number
  totalFormulas: number
  totalFrozen: number
  status: 'clean' | 'warnings'
}
```

- Produces (`src/lib/google/client.ts`): `listFolderSpreadsheets(rootFolderId: string): Promise<DriveSpreadsheet[]>` где `DriveSpreadsheet = { id: string; name: string; folder: string; modifiedTime: string }`; `fetchSpreadsheetGrid(spreadsheetId: string): Promise<GoogleGridSheet[]>` (тип `GoogleGridSheet` объявлен в Task 5 в `convert.ts`).

- [ ] **Step 1: Установить googleapis и создать types.ts**

```bash
npm i googleapis
```

Создать `src/lib/types.ts` с содержимым из блока Interfaces выше (дословно).

- [ ] **Step 2: Клиент Google**

`src/lib/google/client.ts`:
```ts
import { google, type sheets_v4 } from 'googleapis'

function serviceAccount() {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_B64
  if (!b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON_B64 не задан')
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as { client_email: string; private_key: string }
}

function authClient() {
  const sa = serviceAccount()
  return new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/spreadsheets.readonly',
    ],
  })
}

export interface DriveSpreadsheet { id: string; name: string; folder: string; modifiedTime: string }

const SPREADSHEET_MIME = 'application/vnd.google-apps.spreadsheet'
const FOLDER_MIME = 'application/vnd.google-apps.folder'

async function listChildren(drive: ReturnType<typeof google.drive>, folderId: string, mimeType: string) {
  const files: { id: string; name: string; modifiedTime?: string }[] = []
  let pageToken: string | undefined
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and mimeType='${mimeType}' and trashed=false`,
      fields: 'nextPageToken, files(id, name, modifiedTime)',
      pageSize: 200,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    files.push(...((res.data.files ?? []) as typeof files))
    pageToken = res.data.nextPageToken ?? undefined
  } while (pageToken)
  return files
}

/** Таблицы в корневой папке и её подпапках первого уровня. Подпапка = «папка» каталога. */
export async function listFolderSpreadsheets(rootFolderId: string): Promise<DriveSpreadsheet[]> {
  const drive = google.drive({ version: 'v3', auth: authClient() })
  const result: DriveSpreadsheet[] = []
  const rootFiles = await listChildren(drive, rootFolderId, SPREADSHEET_MIME)
  for (const f of rootFiles) result.push({ id: f.id, name: f.name, folder: 'Без папки', modifiedTime: f.modifiedTime! })
  const subfolders = await listChildren(drive, rootFolderId, FOLDER_MIME)
  for (const sub of subfolders) {
    const files = await listChildren(drive, sub.id, SPREADSHEET_MIME)
    for (const f of files) result.push({ id: f.id, name: f.name, folder: sub.name, modifiedTime: f.modifiedTime! })
  }
  return result
}

const GRID_FIELDS =
  'sheets(properties(sheetId,title,index,gridProperties(rowCount,columnCount)),' +
  'data(startRow,startColumn,rowData(values(' +
  'userEnteredValue(formulaValue),' +
  'effectiveValue(numberValue,stringValue,boolValue),' +
  'effectiveFormat(backgroundColor(red,green,blue),textFormat(bold,italic,fontSize),horizontalAlignment,numberFormat(type,pattern))' +
  '))),merges)'

export async function fetchSpreadsheetGrid(spreadsheetId: string): Promise<sheets_v4.Schema$Sheet[]> {
  const sheets = google.sheets({ version: 'v4', auth: authClient() })
  const res = await sheets.spreadsheets.get({ spreadsheetId, includeGridData: true, fields: GRID_FIELDS })
  return res.data.sheets ?? []
}
```

- [ ] **Step 3: Проверочный скрипт**

`scripts/check-google.ts`:
```ts
import { config } from 'dotenv'
config({ path: '.env.local' })

async function main() {
  const { listFolderSpreadsheets } = await import('../src/lib/google/client')
  const files = await listFolderSpreadsheets(process.env.GOOGLE_DRIVE_FOLDER_ID!)
  console.log(`Найдено таблиц: ${files.length}`)
  for (const f of files.slice(0, 10)) console.log(`- [${f.folder}] ${f.name} (изменена ${f.modifiedTime})`)
}
main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 4: ЧЕЛОВЕЧЕСКИЙ ЧЕКПОЙНТ — service account и доступ к папке**

1. Google Cloud Console (проект `tablehub`) → включить **Google Drive API** и **Google Sheets API** (APIs & Services → Enable).
2. IAM & Admin → Service Accounts → Create (`tablehub-importer`), без ролей проекта.
3. Keys → Add key → JSON → скачать. В терминале: `base64 -i ключ.json | pbcopy` → вставить в `.env.local` как `GOOGLE_SERVICE_ACCOUNT_JSON_B64`.
4. В Google Drive: папку отдела с таблицами → Поделиться → email сервисного аккаунта (`tablehub-importer@...iam.gserviceaccount.com`) с правом «Читатель». ID папки из URL → `GOOGLE_DRIVE_FOLDER_ID`.

- [ ] **Step 5: Проверить доступ**

Run: `npm run check:google`
Expected: `Найдено таблиц: N` (N > 0) и список первых 10 с папками.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: shared types and Google Drive/Sheets client"
```

---

### Task 5: Конвертер Google grid → Univer-снапшот (TDD)

**Files:**
- Create: `src/lib/google/convert.ts`, `tests/google/convert.test.ts`

**Interfaces:**
- Consumes: типы из `@/lib/types` (Task 4).
- Produces: `convertGridSheet(sheet: GoogleGridSheet, sheetIndex: number): { snapshot: SheetSnapshot; report: SheetImportReport }`; `summarizeReports(sheets: SheetImportReport[]): TableImportReport`; `isFrozenFormula(formula: string): string | null`; `toA1(row: number, col: number): string`; тип `GoogleGridSheet` (минимальный, структурно совместимый с `sheets_v4.Schema$Sheet`).

- [ ] **Step 1: Написать падающие тесты**

`tests/google/convert.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { convertGridSheet, isFrozenFormula, summarizeReports, toA1, type GoogleGridSheet } from '@/lib/google/convert'

function sheetWith(rowData: NonNullable<NonNullable<GoogleGridSheet['data']>[number]['rowData']>): GoogleGridSheet {
  return { properties: { sheetId: 11, title: 'Лист1', index: 0 }, data: [{ rowData }] }
}

describe('toA1', () => {
  it('преобразует индексы в A1', () => {
    expect(toA1(0, 0)).toBe('A1')
    expect(toA1(4, 2)).toBe('C5')
    expect(toA1(0, 26)).toBe('AA1')
  })
})

describe('isFrozenFormula', () => {
  it('находит Google-специфичные функции', () => {
    expect(isFrozenFormula('=IMPORTRANGE("url";"A1:B2")')).toBe('IMPORTRANGE')
    expect(isFrozenFormula('=SUM(QUERY(A1:B2,"select *"))')).toBe('QUERY')
  })
  it('не трогает совместимые формулы и похожие имена', () => {
    expect(isFrozenFormula('=SUM(A1:A10)')).toBeNull()
    expect(isFrozenFormula('=MYQUERY(A1)')).toBeNull()
  })
})

describe('convertGridSheet', () => {
  it('переносит значения трёх типов', () => {
    const { snapshot, report } = convertGridSheet(sheetWith([
      { values: [
        { effectiveValue: { stringValue: 'Канал' } },
        { effectiveValue: { numberValue: 42.5 } },
        { effectiveValue: { boolValue: true } },
      ] },
    ]), 0)
    expect(snapshot.cellData[0][0].v).toBe('Канал')
    expect(snapshot.cellData[0][1].v).toBe(42.5)
    expect(snapshot.cellData[0][2].v).toBe(true)
    expect(report.cellCount).toBe(3)
  })

  it('сохраняет совместимую формулу вместе со значением', () => {
    const { snapshot, report } = convertGridSheet(sheetWith([
      { values: [{ userEnteredValue: { formulaValue: '=SUM(B2:B9)' }, effectiveValue: { numberValue: 100 } }] },
    ]), 0)
    expect(snapshot.cellData[0][0]).toMatchObject({ v: 100, f: '=SUM(B2:B9)' })
    expect(report.formulaCount).toBe(1)
    expect(report.frozenFormulas).toHaveLength(0)
  })

  it('замораживает IMPORTRANGE: значение остаётся, формула в custom', () => {
    const { snapshot, report } = convertGridSheet(sheetWith([
      { values: [{ userEnteredValue: { formulaValue: '=IMPORTRANGE("x";"A1")' }, effectiveValue: { numberValue: 7 } }] },
    ]), 0)
    const cell = snapshot.cellData[0][0]
    expect(cell.v).toBe(7)
    expect(cell.f).toBeUndefined()
    expect(cell.custom?.frozenFormula).toBe('=IMPORTRANGE("x";"A1")')
    expect(report.frozenFormulas).toEqual([{ a1: 'A1', fn: 'IMPORTRANGE' }])
  })

  it('дедуплицирует стили и учитывает смещение блока', () => {
    const bold = { textFormat: { bold: true } }
    const { snapshot } = convertGridSheet({
      properties: { sheetId: 1, title: 'S', index: 2 },
      data: [{ startRow: 3, startColumn: 1, rowData: [
        { values: [{ effectiveValue: { stringValue: 'a' }, effectiveFormat: bold }, { effectiveValue: { stringValue: 'b' }, effectiveFormat: bold }] },
      ] }],
    }, 2)
    const a = snapshot.cellData[3][1]
    const b = snapshot.cellData[3][2]
    expect(a.s).toBeDefined()
    expect(a.s).toBe(b.s)
    expect(a.s!.startsWith('s2_')).toBe(true)
    expect(snapshot.styles[a.s!]).toEqual({ bl: 1 })
  })

  it('переносит объединённые ячейки в mergeData', () => {
    const { snapshot } = convertGridSheet({
      properties: { sheetId: 1, title: 'S', index: 0 },
      data: [{ rowData: [{ values: [{ effectiveValue: { stringValue: 'x' } }] }] }],
      merges: [{ startRowIndex: 0, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 3 }],
    }, 0)
    expect(snapshot.mergeData).toEqual([{ startRow: 0, endRow: 1, startColumn: 0, endColumn: 2 }])
  })

  it('пустой лист даёт пустой снапшот без ошибок', () => {
    const { snapshot, report } = convertGridSheet({ properties: { sheetId: 1, title: 'Пусто', index: 0 } }, 0)
    expect(snapshot.cellData).toEqual({})
    expect(report.cellCount).toBe(0)
  })
})

describe('summarizeReports', () => {
  it('агрегирует и ставит статус warnings при заморозках', () => {
    const clean = { sheetTitle: 'a', cellCount: 5, formulaCount: 1, frozenFormulas: [], warnings: [] }
    const frozen = { sheetTitle: 'b', cellCount: 3, formulaCount: 2, frozenFormulas: [{ a1: 'A1', fn: 'QUERY' }], warnings: [] }
    expect(summarizeReports([clean, clean]).status).toBe('clean')
    const agg = summarizeReports([clean, frozen])
    expect(agg).toMatchObject({ totalCells: 8, totalFormulas: 3, totalFrozen: 1, status: 'warnings' })
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm run test -- tests/google/convert.test.ts`
Expected: FAIL — `Cannot find module '@/lib/google/convert'` (или все тесты красные).

- [ ] **Step 3: Реализация**

`src/lib/google/convert.ts`:
```ts
import type { MergeRange, SheetImportReport, SheetSnapshot, SnapshotCell, SnapshotStyle, TableImportReport } from '@/lib/types'

// Минимальные типы ответа Sheets API (структурно совместимы с sheets_v4.Schema$Sheet)
export interface GoogleCellFormat {
  backgroundColor?: { red?: number; green?: number; blue?: number }
  textFormat?: { bold?: boolean; italic?: boolean; fontSize?: number }
  horizontalAlignment?: string
  numberFormat?: { type?: string; pattern?: string }
}
export interface GoogleCellData {
  userEnteredValue?: { formulaValue?: string }
  effectiveValue?: { numberValue?: number; stringValue?: string; boolValue?: boolean }
  effectiveFormat?: GoogleCellFormat
}
export interface GoogleGridSheet {
  properties?: { sheetId?: number; title?: string; index?: number; gridProperties?: { rowCount?: number; columnCount?: number } }
  data?: { startRow?: number; startColumn?: number; rowData?: { values?: GoogleCellData[] }[] }[]
  merges?: { startRowIndex?: number; endRowIndex?: number; startColumnIndex?: number; endColumnIndex?: number }[]
}

/** Google-специфичные функции: в Univer не работают, замораживаем в значение. */
const FROZEN_FUNCTIONS = [
  'IMPORTRANGE', 'QUERY', 'IMPORTXML', 'IMPORTHTML', 'IMPORTDATA', 'IMPORTFEED',
  'IMAGE', 'SPARKLINE', 'GOOGLEFINANCE', 'GOOGLETRANSLATE', 'DETECTLANGUAGE',
  'ARRAYFORMULA', 'FLATTEN', 'SORTN', 'LABEL', 'CONTINUE',
]
const FROZEN_RE = new RegExp(`(^|[^A-Z0-9_.])(${FROZEN_FUNCTIONS.join('|')})\\s*\\(`)

export function isFrozenFormula(formula: string): string | null {
  const m = FROZEN_RE.exec(formula.toUpperCase())
  return m ? m[2] : null
}

export function toA1(row: number, col: number): string {
  let letters = ''
  let n = col
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return `${letters}${row + 1}`
}

function channelToHex(c = 0): string {
  return Math.round(c * 255).toString(16).padStart(2, '0')
}

const HT_MAP: Record<string, 1 | 2 | 3> = { LEFT: 1, CENTER: 2, RIGHT: 3 }

function extractStyle(fmt?: GoogleCellFormat): SnapshotStyle | null {
  if (!fmt) return null
  const s: SnapshotStyle = {}
  if (fmt.backgroundColor) {
    const hex = `#${channelToHex(fmt.backgroundColor.red)}${channelToHex(fmt.backgroundColor.green)}${channelToHex(fmt.backgroundColor.blue)}`
    if (hex !== '#ffffff') s.bg = { rgb: hex }
  }
  if (fmt.textFormat?.bold) s.bl = 1
  if (fmt.textFormat?.italic) s.it = 1
  if (fmt.textFormat?.fontSize && fmt.textFormat.fontSize !== 10) s.fs = fmt.textFormat.fontSize
  const ht = fmt.horizontalAlignment ? HT_MAP[fmt.horizontalAlignment] : undefined
  if (ht) s.ht = ht
  if (fmt.numberFormat?.pattern) s.n = { pattern: fmt.numberFormat.pattern }
  if (fmt.numberFormat?.type) s.nfType = fmt.numberFormat.type
  return Object.keys(s).length ? s : null
}

export function convertGridSheet(sheet: GoogleGridSheet, sheetIndex: number): { snapshot: SheetSnapshot; report: SheetImportReport } {
  const title = sheet.properties?.title ?? `Лист ${sheetIndex + 1}`
  const cellData: SheetSnapshot['cellData'] = {}
  const styles: Record<string, SnapshotStyle> = {}
  const styleIds = new Map<string, string>()
  const report: SheetImportReport = { sheetTitle: title, cellCount: 0, formulaCount: 0, frozenFormulas: [], warnings: [] }
  let maxRow = -1
  let maxCol = -1

  for (const block of sheet.data ?? []) {
    const rowOffset = block.startRow ?? 0
    const colOffset = block.startColumn ?? 0
    ;(block.rowData ?? []).forEach((rowData, ri) => {
      ;(rowData.values ?? []).forEach((cell, ci) => {
        const row = rowOffset + ri
        const col = colOffset + ci
        const out: SnapshotCell = {}
        const ev = cell.effectiveValue
        if (ev?.numberValue !== undefined) out.v = ev.numberValue
        else if (ev?.stringValue !== undefined) out.v = ev.stringValue
        else if (ev?.boolValue !== undefined) out.v = ev.boolValue
        const formula = cell.userEnteredValue?.formulaValue
        if (formula) {
          report.formulaCount++
          const frozenFn = isFrozenFormula(formula)
          if (frozenFn) {
            out.custom = { frozenFormula: formula }
            report.frozenFormulas.push({ a1: toA1(row, col), fn: frozenFn })
          } else {
            out.f = formula
          }
        }
        const style = extractStyle(cell.effectiveFormat)
        if (style) {
          const key = JSON.stringify(style)
          let id = styleIds.get(key)
          if (!id) {
            id = `s${sheetIndex}_${styleIds.size}`
            styleIds.set(key, id)
            styles[id] = style
          }
          out.s = id
        }
        if (out.v === undefined && !out.f && !out.s && !out.custom) return
        ;(cellData[row] ??= {})[col] = out
        report.cellCount++
        if (row > maxRow) maxRow = row
        if (col > maxCol) maxCol = col
      })
    })
  }

  const mergeData: MergeRange[] = (sheet.merges ?? []).map((m) => ({
    startRow: m.startRowIndex ?? 0,
    endRow: (m.endRowIndex ?? 1) - 1,
    startColumn: m.startColumnIndex ?? 0,
    endColumn: (m.endColumnIndex ?? 1) - 1,
  }))

  const snapshot: SheetSnapshot = {
    name: title,
    rowCount: Math.min(Math.max(maxRow + 51, 100), 10000),
    columnCount: Math.min(Math.max(maxCol + 6, 26), 200),
    cellData,
    mergeData,
    styles,
  }
  return { snapshot, report }
}

export function summarizeReports(sheets: SheetImportReport[]): TableImportReport {
  const totalCells = sheets.reduce((acc, s) => acc + s.cellCount, 0)
  const totalFormulas = sheets.reduce((acc, s) => acc + s.formulaCount, 0)
  const totalFrozen = sheets.reduce((acc, s) => acc + s.frozenFormulas.length, 0)
  const totalWarnings = sheets.reduce((acc, s) => acc + s.warnings.length, 0)
  return { sheets, totalCells, totalFormulas, totalFrozen, status: totalFrozen + totalWarnings > 0 ? 'warnings' : 'clean' }
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npm run test -- tests/google/convert.test.ts`
Expected: PASS, все зелёные.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: Google grid to Univer snapshot converter with import report"
```

---

### Task 6: Детектор структуры листа (TDD)

**Files:**
- Create: `src/lib/dataset/detect.ts`, `tests/dataset/detect.test.ts`

**Interfaces:**
- Consumes: `SheetSnapshot`, `CellScalar` из `@/lib/types`.
- Produces: `snapshotToMatrix(snapshot: SheetSnapshot): CellScalar[][]`; `detectDataRange(matrix: CellScalar[][]): DataRange | null` где `DataRange = { headerRow: number; startCol: number; endCol: number; endRow: number; confidence: number }`; константа `CONFIDENCE_THRESHOLD = 0.55`.

- [ ] **Step 1: Написать падающие тесты**

`tests/dataset/detect.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { detectDataRange, snapshotToMatrix, CONFIDENCE_THRESHOLD } from '@/lib/dataset/detect'
import type { CellScalar, SheetSnapshot } from '@/lib/types'

const M = (rows: CellScalar[][]) => rows

describe('snapshotToMatrix', () => {
  it('разворачивает разреженный cellData в матрицу', () => {
    const snapshot: SheetSnapshot = {
      name: 'S', rowCount: 100, columnCount: 26, mergeData: [], styles: {},
      cellData: { 0: { 0: { v: 'Дата' }, 2: { v: 'Лиды' } }, 2: { 1: { v: 5 } } },
    }
    expect(snapshotToMatrix(snapshot)).toEqual([
      ['Дата', null, 'Лиды'],
      [null, null, null],
      [null, 5, null],
    ])
  })
  it('пустой снапшот → пустая матрица', () => {
    expect(snapshotToMatrix({ name: 'S', rowCount: 100, columnCount: 26, mergeData: [], styles: {}, cellData: {} })).toEqual([])
  })
})

describe('detectDataRange', () => {
  it('чистый список: заголовки в строке 0', () => {
    const r = detectDataRange(M([
      ['Дата', 'Канал', 'Расход'],
      ['01.06.2026', 'VK', 1000],
      ['02.06.2026', 'Яндекс', 2000],
      ['03.06.2026', 'VK', 1500],
    ]))!
    expect(r).toMatchObject({ headerRow: 0, startCol: 0, endCol: 2, endRow: 3 })
    expect(r.confidence).toBeGreaterThan(CONFIDENCE_THRESHOLD)
  })

  it('шапка-название сверху: заголовки найдены ниже', () => {
    const r = detectDataRange(M([
      ['Отчёт по рекламе', null, null],
      [null, null, null],
      ['Дата', 'Канал', 'Расход'],
      ['01.06.2026', 'VK', 1000],
      ['02.06.2026', 'Яндекс', 2000],
    ]))!
    expect(r.headerRow).toBe(2)
    expect(r.endRow).toBe(4)
  })

  it('игнорирует хвост после трёх пустых строк', () => {
    const r = detectDataRange(M([
      ['Имя', 'Значение'],
      ['a', 1],
      ['b', 2],
      [null, null],
      [null, null],
      [null, null],
      ['примечание внизу', null],
    ]))!
    expect(r.endRow).toBe(2)
  })

  it('строка из чисел не считается заголовком', () => {
    expect(detectDataRange(M([
      [1, 2, 3],
      [4, 5, 6],
    ]))).toBeNull()
  })

  it('пустая матрица → null', () => {
    expect(detectDataRange([])).toBeNull()
  })
})
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npm run test -- tests/dataset/detect.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

`src/lib/dataset/detect.ts`:
```ts
import type { CellScalar, SheetSnapshot } from '@/lib/types'

export const CONFIDENCE_THRESHOLD = 0.55

export function snapshotToMatrix(snapshot: SheetSnapshot): CellScalar[][] {
  const rowIdx = Object.keys(snapshot.cellData).map(Number)
  if (!rowIdx.length) return []
  const maxRow = Math.max(...rowIdx)
  let maxCol = 0
  for (const r of rowIdx) {
    const cols = Object.keys(snapshot.cellData[r]).map(Number)
    if (cols.length) maxCol = Math.max(maxCol, ...cols)
  }
  const matrix: CellScalar[][] = []
  for (let r = 0; r <= maxRow; r++) {
    const row: CellScalar[] = []
    for (let c = 0; c <= maxCol; c++) {
      const v = snapshot.cellData[r]?.[c]?.v
      row.push(v === undefined ? null : v)
    }
    matrix.push(row)
  }
  return matrix
}

export interface DataRange { headerRow: number; startCol: number; endCol: number; endRow: number; confidence: number }

const isEmpty = (v: CellScalar): boolean => v === null || v === ''

/** Заголовок — непустая строка, не являющаяся числом. */
function isHeaderish(v: CellScalar): boolean {
  if (typeof v !== 'string') return false
  const t = v.trim()
  if (!t) return false
  return Number.isNaN(Number(t.replace(',', '.').replace(/\s/g, '')))
}

function scoreCandidate(matrix: CellScalar[][], headerRow: number): DataRange | null {
  const row = matrix[headerRow] ?? []
  const nonEmptyIdx = row.map((v, i) => (isEmpty(v) ? -1 : i)).filter((i) => i >= 0)
  if (nonEmptyIdx.length < 2) return null
  const stringRatio = nonEmptyIdx.filter((i) => isHeaderish(row[i])).length / nonEmptyIdx.length
  if (stringRatio < 0.6) return null

  const startCol = nonEmptyIdx[0]
  const endCol = nonEmptyIdx[nonEmptyIdx.length - 1]

  let endRow = headerRow
  let emptyStreak = 0
  for (let r = headerRow + 1; r < matrix.length; r++) {
    const hasData = (matrix[r] ?? []).slice(startCol, endCol + 1).some((v) => !isEmpty(v))
    if (hasData) {
      endRow = r
      emptyStreak = 0
    } else if (++emptyStreak >= 3) break
  }
  if (endRow === headerRow) return null

  const titles = nonEmptyIdx.map((i) => String(row[i]).trim().toLowerCase())
  const uniqueness = new Set(titles).size / titles.length

  let filled = 0
  let total = 0
  const colConsistency: number[] = []
  for (let c = startCol; c <= endCol; c++) {
    const kinds = new Map<string, number>()
    let colNonEmpty = 0
    for (let r = headerRow + 1; r <= endRow; r++) {
      total++
      const v = matrix[r]?.[c] ?? null
      if (isEmpty(v)) continue
      filled++
      colNonEmpty++
      kinds.set(typeof v, (kinds.get(typeof v) ?? 0) + 1)
    }
    colConsistency.push(colNonEmpty === 0 ? 0 : Math.max(...kinds.values()) / colNonEmpty)
  }
  const fillRatio = total === 0 ? 0 : filled / total
  const typeConsistency = colConsistency.reduce((a, b) => a + b, 0) / colConsistency.length

  const confidence = 0.35 * stringRatio + 0.2 * uniqueness + 0.2 * fillRatio + 0.25 * typeConsistency
  return { headerRow, startCol, endCol, endRow, confidence: Math.round(confidence * 100) / 100 }
}

export function detectDataRange(matrix: CellScalar[][]): DataRange | null {
  const scanLimit = Math.min(matrix.length, 20)
  let best: DataRange | null = null
  for (let r = 0; r < scanLimit; r++) {
    const candidate = scoreCandidate(matrix, r)
    if (candidate && (!best || candidate.confidence > best.confidence)) best = candidate
  }
  return best
}
```

- [ ] **Step 4: Прогнать тесты**

Run: `npm run test -- tests/dataset/detect.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: sheet structure detector with confidence scoring"
```

---

### Task 7: Типизация колонок и сборка dataset (TDD)

**Files:**
- Create: `src/lib/dataset/infer.ts`, `src/lib/dataset/build.ts`, `tests/dataset/infer.test.ts`, `tests/dataset/build.test.ts`

**Interfaces:**
- Consumes: `snapshotToMatrix`, `detectDataRange`, `CONFIDENCE_THRESHOLD` (Task 6); типы Task 4.
- Produces: `parseNumberLike(v: CellScalar): number | null`; `parseRuDate(s: string): string | null` (→ `'YYYY-MM-DD'`); `serialToISO(serial: number): string`; `inferColumnType(values: CellScalar[], meta: { nfTypes: (string | null)[]; title: string }): ColumnType`; `buildDataset(snapshot: SheetSnapshot): DatasetBuild`.

- [ ] **Step 1: Падающие тесты типизации**

`tests/dataset/infer.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { inferColumnType, parseNumberLike, parseRuDate, serialToISO } from '@/lib/dataset/infer'

describe('parseNumberLike', () => {
  it('числа и строки-числа', () => {
    expect(parseNumberLike(42)).toBe(42)
    expect(parseNumberLike('1 234,56')).toBe(1234.56)
    expect(parseNumberLike('1,234.56')).toBe(1234.56)
    expect(parseNumberLike('15%')).toBe(0.15)
    expect(parseNumberLike('1 200 ₸')).toBe(1200)
    expect(parseNumberLike('abc')).toBeNull()
    expect(parseNumberLike(null)).toBeNull()
  })
})

describe('parseRuDate / serialToISO', () => {
  it('русские и ISO даты', () => {
    expect(parseRuDate('01.06.2026')).toBe('2026-06-01')
    expect(parseRuDate('1.6.26')).toBe('2026-06-01')
    expect(parseRuDate('2026-06-01')).toBe('2026-06-01')
    expect(parseRuDate('45.13.2026')).toBeNull()
    expect(parseRuDate('привет')).toBeNull()
  })
  it('серийные даты Google (эпоха 1899-12-30)', () => {
    expect(serialToISO(46174)).toBe('2026-06-01')
    expect(serialToISO(46175)).toBe('2026-06-02')
  })
})

describe('inferColumnType', () => {
  const noNf = (n: number) => Array<string | null>(n).fill(null)

  it('date по формату Google', () => {
    expect(inferColumnType([46174, 46175, 46176], { nfTypes: ['DATE', 'DATE', 'DATE'], title: 'Дата' })).toBe('date')
  })
  it('date по строкам дд.мм.гггг', () => {
    expect(inferColumnType(['01.06.2026', '02.06.2026', null], { nfTypes: noNf(3), title: 'Дата' })).toBe('date')
  })
  it('percent по формату и по %-строкам', () => {
    expect(inferColumnType([0.12, 0.34], { nfTypes: ['PERCENT', 'PERCENT'], title: 'CTR' })).toBe('percent')
    expect(inferColumnType(['12%', '34%'], { nfTypes: noNf(2), title: 'CTR' })).toBe('percent')
  })
  it('money по формату CURRENCY и по символам валют', () => {
    expect(inferColumnType([1000, 2000], { nfTypes: ['CURRENCY', 'CURRENCY'], title: 'Расход' })).toBe('money')
    expect(inferColumnType(['1 200 ₸', '3 400 ₸'], { nfTypes: noNf(2), title: 'Расход' })).toBe('money')
  })
  it('number для чисел без формата', () => {
    expect(inferColumnType([1, 2, 3, null], { nfTypes: noNf(4), title: 'Лиды' })).toBe('number')
  })
  it('id по названию колонки', () => {
    expect(inferColumnType([101, 102, 103], { nfTypes: noNf(3), title: 'ID кампании' })).toBe('id')
  })
  it('category при малом числе уникальных', () => {
    expect(inferColumnType(['VK', 'Яндекс', 'VK', 'VK'], { nfTypes: noNf(4), title: 'Канал' })).toBe('category')
  })
  it('text по умолчанию', () => {
    expect(inferColumnType(['Запуск А', 'Тест Б', 'Промо В', 'Акция Г'], { nfTypes: noNf(4), title: 'Комментарий' })).toBe('text')
  })
})
```

- [ ] **Step 2: Прогнать — FAIL**

Run: `npm run test -- tests/dataset/infer.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация infer.ts**

`src/lib/dataset/infer.ts`:
```ts
import type { CellScalar, ColumnType } from '@/lib/types'

const DAY_MS = 86_400_000
const SERIAL_EPOCH_UTC = Date.UTC(1899, 11, 30) // эпоха серийных дат Google/Excel

export function serialToISO(serial: number): string {
  return new Date(SERIAL_EPOCH_UTC + Math.round(serial) * DAY_MS).toISOString().slice(0, 10)
}

export function parseRuDate(s: string): string | null {
  const t = s.trim()
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const m = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(t)
  if (!m) return null
  const dd = Number(m[1])
  const mm = Number(m[2])
  let yy = Number(m[3])
  if (yy < 100) yy += 2000
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null
  return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

export function parseNumberLike(v: CellScalar): number | null {
  if (typeof v === 'number') return v
  if (typeof v !== 'string') return null
  let t = v.trim().replace(/[\s  ]/g, '')
  if (!t) return null
  let percent = false
  if (t.endsWith('%')) {
    percent = true
    t = t.slice(0, -1)
  }
  t = t.replace(/[₸₽$€]/g, '')
  if (t.includes('.') && t.includes(',')) t = t.replace(/,/g, '')
  else t = t.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  const n = Number(t)
  return percent ? n / 100 : n
}

const CURRENCY_RE = /[₸₽$€]/
const ID_TITLE_RE = /(^|[\s_(])(id|код|номер|№|артикул)/i

export function inferColumnType(values: CellScalar[], meta: { nfTypes: (string | null)[]; title: string }): ColumnType {
  const cells = values
    .map((v, i) => ({ v, nf: meta.nfTypes[i] ?? null }))
    .filter(({ v }) => v !== null && v !== '')
  if (!cells.length) return 'text'
  const n = cells.length
  const share = (pred: (x: { v: CellScalar; nf: string | null }) => boolean) => cells.filter(pred).length / n

  const dateShare = share(({ v, nf }) =>
    ((nf === 'DATE' || nf === 'DATE_TIME') && typeof v === 'number') ||
    (typeof v === 'string' && parseRuDate(v) !== null))
  if (dateShare >= 0.6) return 'date'

  if (share(({ v, nf }) => nf === 'PERCENT' || (typeof v === 'string' && v.trim().endsWith('%'))) >= 0.5) return 'percent'
  if (share(({ v, nf }) => nf === 'CURRENCY' || (typeof v === 'string' && CURRENCY_RE.test(v))) >= 0.5) return 'money'

  const numericShare = share(({ v }) => parseNumberLike(v) !== null)
  const unique = new Set(cells.map(({ v }) => String(v).trim().toLowerCase()))
  const uniqueRatio = unique.size / n

  if (numericShare >= 0.8) return ID_TITLE_RE.test(meta.title) ? 'id' : 'number'
  if (ID_TITLE_RE.test(meta.title) && uniqueRatio >= 0.9) return 'id'
  if (unique.size <= 30 && uniqueRatio <= 0.5) return 'category'
  return 'text'
}
```

- [ ] **Step 4: Прогнать — PASS, затем падающие тесты build**

Run: `npm run test -- tests/dataset/infer.test.ts` → PASS.

`tests/dataset/build.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildDataset } from '@/lib/dataset/build'
import type { SheetSnapshot, SnapshotCell, SnapshotStyle } from '@/lib/types'

function snap(cellData: Record<number, Record<number, SnapshotCell>>, styles: Record<string, SnapshotStyle> = {}): SheetSnapshot {
  return { name: 'S', rowCount: 100, columnCount: 26, mergeData: [], styles, cellData }
}

// 4 строки данных: «Канал» должен дать уникальность 2/4 = 0.5 (порог category)
const marketing = snap(
  {
    0: { 0: { v: 'Дата' }, 1: { v: 'Канал' }, 2: { v: 'Расход' }, 3: { v: 'Лиды' } },
    1: { 0: { v: 46174, s: 'd' }, 1: { v: 'VK' }, 2: { v: 1000, s: 'c' }, 3: { v: 10 } },
    2: { 0: { v: 46175, s: 'd' }, 1: { v: 'Яндекс' }, 2: { v: 2000, s: 'c' }, 3: { v: 25 } },
    3: { 0: { v: 46176, s: 'd' }, 1: { v: 'VK' }, 2: { v: 1500, s: 'c' }, 3: { v: 15 } },
    4: { 0: { v: 46177, s: 'd' }, 1: { v: 'VK' }, 2: { v: 500, s: 'c' }, 3: { v: 5 } },
  },
  { d: { nfType: 'DATE', n: { pattern: 'dd.mm.yyyy' } }, c: { nfType: 'CURRENCY', n: { pattern: '#,##0 ₸' } } },
)

describe('buildDataset', () => {
  it('строит типизированный dataset из чистого листа', () => {
    const d = buildDataset(marketing)
    if (d.status !== 'ok') throw new Error(`ожидали ok, получили ${d.status}`)
    expect(d.columns.map((c) => c.type)).toEqual(['date', 'category', 'money', 'number'])
    expect(d.columns.map((c) => c.title)).toEqual(['Дата', 'Канал', 'Расход', 'Лиды'])
    expect(d.rows[0]).toEqual(['2026-06-01', 'VK', 1000, 10])
    expect(d.rows).toHaveLength(4)
  })

  it('пустой лист → empty', () => {
    expect(buildDataset(snap({})).status).toBe('empty')
  })

  it('лист без распознаваемых заголовков → needs_mapping', () => {
    const messy = snap({
      0: { 0: { v: 'Свободный текст в углу' } },
      5: { 3: { v: 123 } },
    })
    expect(buildDataset(messy).status).toBe('needs_mapping')
  })
})
```

Run: `npm run test -- tests/dataset/build.test.ts` → FAIL (модуль не найден).

- [ ] **Step 5: Реализация build.ts**

`src/lib/dataset/build.ts`:
```ts
import type { CellScalar, ColumnType, DatasetBuild, DatasetColumn, SheetSnapshot } from '@/lib/types'
import { CONFIDENCE_THRESHOLD, detectDataRange, snapshotToMatrix } from '@/lib/dataset/detect'
import { inferColumnType, parseNumberLike, parseRuDate, serialToISO } from '@/lib/dataset/infer'

function normalize(v: CellScalar, type: ColumnType): CellScalar {
  if (v === null || v === '') return null
  switch (type) {
    case 'date':
      if (typeof v === 'number') return serialToISO(v)
      if (typeof v === 'string') return parseRuDate(v)
      return null
    case 'number':
    case 'money':
    case 'percent':
      return parseNumberLike(v) // PERCENT-формат Google уже хранит долю; строки '15%' parseNumberLike делит на 100
    default:
      return typeof v === 'string' ? v.trim() : v
  }
}

export function buildDataset(snapshot: SheetSnapshot): DatasetBuild {
  const matrix = snapshotToMatrix(snapshot)
  if (!matrix.length) return { status: 'empty' }
  const range = detectDataRange(matrix)
  if (!range) return { status: 'needs_mapping', confidence: 0 }
  if (range.confidence < CONFIDENCE_THRESHOLD) return { status: 'needs_mapping', confidence: range.confidence }

  const nfType = (r: number, c: number): string | null => {
    const styleId = snapshot.cellData[r]?.[c]?.s
    return styleId ? (snapshot.styles[styleId]?.nfType ?? null) : null
  }

  const { headerRow, startCol, endCol, endRow } = range
  const columns: DatasetColumn[] = []
  for (let c = startCol; c <= endCol; c++) {
    const raw = matrix[headerRow][c]
    const title = raw === null || raw === '' ? `Колонка ${c + 1}` : String(raw).trim()
    const values: CellScalar[] = []
    const nfTypes: (string | null)[] = []
    for (let r = headerRow + 1; r <= endRow; r++) {
      values.push(matrix[r]?.[c] ?? null)
      nfTypes.push(nfType(r, c))
    }
    columns.push({ index: c, key: `c${c}`, title, type: inferColumnType(values, { nfTypes, title }) })
  }

  const rows: CellScalar[][] = []
  for (let r = headerRow + 1; r <= endRow; r++) {
    const row = columns.map((col) => normalize(matrix[r]?.[col.index] ?? null, col.type))
    if (row.some((v) => v !== null && v !== '')) rows.push(row)
  }

  return { status: 'ok', headerRow, range: { startCol, endCol, endRow }, confidence: range.confidence, columns, rows }
}
```

- [ ] **Step 6: Прогнать все тесты**

Run: `npm run test`
Expected: PASS (smoke + convert + detect + infer + build).

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: column typing and dataset builder with normalization"
```

---

### Task 8: Генераторы аналитики (TDD)

**Files:**
- Create: `src/lib/analytics/widgets.ts`, `tests/analytics/widgets.test.ts`

**Interfaces:**
- Consumes: `DatasetBuild`, `DatasetColumn`, `CellScalar` (Task 4).
- Produces:

```ts
export type OkDataset = Extract<DatasetBuild, { status: 'ok' }>
export type ValueFormat = 'number' | 'money' | 'percent'
export type Widget =
  | { kind: 'rowcount'; id: string; title: string; count: number }
  | { kind: 'kpi'; id: string; title: string; column: string; format: ValueFormat
      stats: { sum: number; avg: number; median: number; min: number; max: number; count: number } }
  | { kind: 'timeseries'; id: string; title: string; dateColumn: string; metricColumn: string
      granularity: 'day' | 'week' | 'month'; points: { t: string; v: number }[]
      growthPct: number | null; format: ValueFormat }
  | { kind: 'breakdown'; id: string; title: string; column: string
      items: { name: string; count: number; sharePct: number }[] }
  | { kind: 'slice'; id: string; title: string; categoryColumn: string; metricColumn: string
      agg: 'sum'; items: { name: string; value: number }[]; format: ValueFormat }
export const WIDGET_LIMIT = 40
export function buildWidgets(d: OkDataset): { widgets: Widget[]; truncated: number }
```

- [ ] **Step 1: Падающие тесты**

`tests/analytics/widgets.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildWidgets, WIDGET_LIMIT, type OkDataset } from '@/lib/analytics/widgets'
import type { CellScalar, ColumnType } from '@/lib/types'

function ds(cols: { title: string; type: ColumnType }[], rows: CellScalar[][]): OkDataset {
  return {
    status: 'ok', headerRow: 0, confidence: 0.9,
    range: { startCol: 0, endCol: cols.length - 1, endRow: rows.length },
    columns: cols.map((c, i) => ({ index: i, key: `c${i}`, title: c.title, type: c.type })),
    rows,
  }
}

const base = ds(
  [
    { title: 'Дата', type: 'date' },
    { title: 'Канал', type: 'category' },
    { title: 'Расход', type: 'money' },
  ],
  [
    ['2026-06-01', 'VK', 100],
    ['2026-06-01', 'Яндекс', 300],
    ['2026-06-02', 'VK', 200],
    ['2026-06-03', 'VK', 400],
  ],
)

describe('buildWidgets', () => {
  it('rowcount и kpi со статистикой', () => {
    const { widgets } = buildWidgets(base)
    const rowcount = widgets.find((w) => w.kind === 'rowcount')!
    expect(rowcount).toMatchObject({ count: 4 })
    const kpi = widgets.find((w) => w.kind === 'kpi')!
    expect(kpi).toMatchObject({
      column: 'Расход', format: 'money',
      stats: { sum: 1000, avg: 250, median: 250, min: 100, max: 400, count: 4 },
    })
  })

  it('timeseries: дневная гранулярность, суммирование по дате, рост', () => {
    const { widgets } = buildWidgets(base)
    const ts = widgets.find((w) => w.kind === 'timeseries')!
    if (ts.kind !== 'timeseries') throw new Error('unreachable')
    expect(ts.granularity).toBe('day')
    expect(ts.points).toEqual([
      { t: '2026-06-01', v: 400 },
      { t: '2026-06-02', v: 200 },
      { t: '2026-06-03', v: 400 },
    ])
    expect(ts.growthPct).toBe(100) // 400 против 200
  })

  it('growthPct = null, когда предыдущий период равен 0', () => {
    const d = ds(
      [{ title: 'Дата', type: 'date' }, { title: 'Лиды', type: 'number' }],
      [['2026-06-01', 0], ['2026-06-02', 50]],
    )
    const ts = buildWidgets(d).widgets.find((w) => w.kind === 'timeseries')!
    if (ts.kind !== 'timeseries') throw new Error('unreachable')
    expect(ts.growthPct).toBeNull()
  })

  it('месячная гранулярность на длинном интервале', () => {
    const d = ds(
      [{ title: 'Дата', type: 'date' }, { title: 'Лиды', type: 'number' }],
      [['2025-01-05', 1], ['2025-06-10', 2], ['2025-12-20', 3]],
    )
    const ts = buildWidgets(d).widgets.find((w) => w.kind === 'timeseries')!
    if (ts.kind !== 'timeseries') throw new Error('unreachable')
    expect(ts.granularity).toBe('month')
    expect(ts.points[0]).toEqual({ t: '2025-01', v: 1 })
  })

  it('breakdown: топ по количеству с долями', () => {
    const { widgets } = buildWidgets(base)
    const br = widgets.find((w) => w.kind === 'breakdown')!
    if (br.kind !== 'breakdown') throw new Error('unreachable')
    expect(br.items).toEqual([
      { name: 'VK', count: 3, sharePct: 75 },
      { name: 'Яндекс', count: 1, sharePct: 25 },
    ])
  })

  it('slice: сумма метрики по категории, по убыванию', () => {
    const { widgets } = buildWidgets(base)
    const sl = widgets.find((w) => w.kind === 'slice')!
    if (sl.kind !== 'slice') throw new Error('unreachable')
    expect(sl.items).toEqual([
      { name: 'VK', value: 700 },
      { name: 'Яндекс', value: 300 },
    ])
  })

  it('без колонки-даты нет timeseries', () => {
    const d = ds([{ title: 'Канал', type: 'category' }, { title: 'Лиды', type: 'number' }], [['VK', 1]])
    expect(buildWidgets(d).widgets.some((w) => w.kind === 'timeseries')).toBe(false)
  })

  it('ограничение WIDGET_LIMIT с подсчётом отброшенного', () => {
    const cols: { title: string; type: ColumnType }[] = [{ title: 'Дата', type: 'date' }]
    for (let i = 0; i < 60; i++) cols.push({ title: `М${i}`, type: 'number' })
    const rows = [['2026-06-01', ...Array(60).fill(1)] as CellScalar[], ['2026-06-02', ...Array(60).fill(2)] as CellScalar[]]
    const { widgets, truncated } = buildWidgets(ds(cols, rows))
    expect(widgets.length).toBeLessThanOrEqual(WIDGET_LIMIT)
    expect(truncated).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Прогнать — FAIL**

Run: `npm run test -- tests/analytics/widgets.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Реализация**

`src/lib/analytics/widgets.ts`:
```ts
import type { CellScalar, ColumnType, DatasetBuild, DatasetColumn } from '@/lib/types'

export type OkDataset = Extract<DatasetBuild, { status: 'ok' }>
export type ValueFormat = 'number' | 'money' | 'percent'

export type Widget =
  | { kind: 'rowcount'; id: string; title: string; count: number }
  | { kind: 'kpi'; id: string; title: string; column: string; format: ValueFormat
      stats: { sum: number; avg: number; median: number; min: number; max: number; count: number } }
  | { kind: 'timeseries'; id: string; title: string; dateColumn: string; metricColumn: string
      granularity: 'day' | 'week' | 'month'; points: { t: string; v: number }[]
      growthPct: number | null; format: ValueFormat }
  | { kind: 'breakdown'; id: string; title: string; column: string
      items: { name: string; count: number; sharePct: number }[] }
  | { kind: 'slice'; id: string; title: string; categoryColumn: string; metricColumn: string
      agg: 'sum'; items: { name: string; value: number }[]; format: ValueFormat }

export const WIDGET_LIMIT = 40
const NUMERIC: ColumnType[] = ['number', 'money', 'percent']
const TOP_N = 10

const formatOf = (t: ColumnType): ValueFormat => (t === 'money' ? 'money' : t === 'percent' ? 'percent' : 'number')
const round1 = (n: number) => Math.round(n * 10) / 10

function numbersAt(d: OkDataset, pos: number): number[] {
  return d.rows.map((r) => r[pos]).filter((v): v is number => typeof v === 'number')
}

function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function bucketKey(iso: string, g: 'day' | 'week' | 'month'): string {
  if (g === 'day') return iso
  if (g === 'month') return iso.slice(0, 7)
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)) // понедельник недели
  return d.toISOString().slice(0, 10)
}

export function buildWidgets(d: OkDataset): { widgets: Widget[]; truncated: number } {
  const widgets: Widget[] = []
  const pos = (c: DatasetColumn) => d.columns.indexOf(c)
  const numericCols = d.columns.filter((c) => NUMERIC.includes(c.type))
  const categoryCols = d.columns.filter((c) => c.type === 'category')
  const dateCol = d.columns.find((c) => c.type === 'date')

  widgets.push({ kind: 'rowcount', id: 'rowcount', title: 'Строк данных', count: d.rows.length })

  for (const col of numericCols) {
    const nums = numbersAt(d, pos(col))
    if (!nums.length) continue
    const sorted = [...nums].sort((a, b) => a - b)
    const sum = nums.reduce((a, b) => a + b, 0)
    widgets.push({
      kind: 'kpi', id: `kpi:${col.key}`, title: col.title, column: col.title, format: formatOf(col.type),
      stats: { sum, avg: sum / nums.length, median: median(sorted), min: sorted[0], max: sorted[sorted.length - 1], count: nums.length },
    })
  }

  if (dateCol) {
    const datePos = pos(dateCol)
    for (const col of numericCols) {
      const metricPos = pos(col)
      const pairs = d.rows
        .map((r) => ({ t: r[datePos], v: r[metricPos] }))
        .filter((p): p is { t: string; v: number } => typeof p.t === 'string' && typeof p.v === 'number')
      if (pairs.length < 2) continue
      const days = pairs.map((p) => p.t).sort()
      const spanDays = (Date.parse(days[days.length - 1]) - Date.parse(days[0])) / 86_400_000
      const granularity: 'day' | 'week' | 'month' = spanDays > 180 ? 'month' : spanDays > 45 ? 'week' : 'day'
      const buckets = new Map<string, number>()
      for (const p of pairs) {
        const key = bucketKey(p.t, granularity)
        buckets.set(key, (buckets.get(key) ?? 0) + p.v)
      }
      const points = [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([t, v]) => ({ t, v }))
      let growthPct: number | null = null
      if (points.length >= 2) {
        const prev = points[points.length - 2].v
        const last = points[points.length - 1].v
        growthPct = prev === 0 ? null : round1(((last - prev) / Math.abs(prev)) * 100)
      }
      widgets.push({
        kind: 'timeseries', id: `ts:${col.key}`, title: `${col.title} — динамика`,
        dateColumn: dateCol.title, metricColumn: col.title, granularity, points, growthPct, format: formatOf(col.type),
      })
    }
  }

  for (const col of categoryCols) {
    const p = pos(col)
    const counts = new Map<string, number>()
    let total = 0
    for (const r of d.rows) {
      const v = r[p]
      if (v === null || v === '') continue
      total++
      counts.set(String(v), (counts.get(String(v)) ?? 0) + 1)
    }
    if (!total) continue
    const items = [...counts.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, TOP_N)
      .map(([name, count]) => ({ name, count, sharePct: round1((count / total) * 100) }))
    widgets.push({ kind: 'breakdown', id: `br:${col.key}`, title: `${col.title} — структура`, column: col.title, items })
  }

  for (const cat of categoryCols.slice(0, 2)) {
    for (const metric of numericCols.slice(0, 3)) {
      const cp = pos(cat)
      const mp = pos(metric)
      const sums = new Map<string, number>()
      for (const r of d.rows) {
        const name = r[cp]
        const v = r[mp]
        if (name === null || name === '' || typeof v !== 'number') continue
        sums.set(String(name), (sums.get(String(name)) ?? 0) + v)
      }
      if (!sums.size) continue
      const items = [...sums.entries()].sort(([, a], [, b]) => b - a).slice(0, TOP_N)
        .map(([name, value]) => ({ name, value }))
      widgets.push({
        kind: 'slice', id: `sl:${cat.key}:${metric.key}`, title: `${metric.title} по «${cat.title}»`,
        categoryColumn: cat.title, metricColumn: metric.title, agg: 'sum', items, format: formatOf(metric.type),
      })
    }
  }

  const truncated = Math.max(0, widgets.length - WIDGET_LIMIT)
  return { widgets: widgets.slice(0, WIDGET_LIMIT), truncated }
}
```

- [ ] **Step 4: Прогнать — PASS**

Run: `npm run test -- tests/analytics/widgets.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: analytics widget generators (kpi, timeseries, breakdown, slice)"
```

---

### Task 9: Оркестрация импорта и API-роуты

**Files:**
- Create: `src/lib/import/importTable.ts`, `tests/import/importTable.test.ts`, `src/app/api/admin/import/route.ts`, `src/app/api/cron/reimport/route.ts`

**Interfaces:**
- Consumes: `convertGridSheet`, `summarizeReports` (Task 5); `buildDataset` (Task 7); `fetchSpreadsheetGrid`, `listFolderSpreadsheets` (Task 4); `getApiSession` (Task 3); `createAdminSupabase` (Task 2).
- Produces: `needsImport(t: { google_modified_at: string | null; last_imported_at: string | null }): boolean`; `syncCatalog(admin: SupabaseClient): Promise<{ total: number }>`; `importTable(admin: SupabaseClient, table: { id: string; google_spreadsheet_id: string }): Promise<void>`; `runImportBatch(admin: SupabaseClient, budgetMs: number, opts?: { retryErrors?: boolean }): Promise<{ imported: number; remaining: number; errors: { table: string; message: string }[] }>`; HTTP: `POST /api/admin/import` (body `{ sync?: boolean; retryErrors?: boolean }` → `{ imported, remaining, errors, total? }`), `GET|POST /api/cron/reimport` (заголовок `Authorization: Bearer $CRON_SECRET`).

- [ ] **Step 1: Падающий тест на needsImport**

`tests/import/importTable.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { needsImport } from '@/lib/import/importTable'

describe('needsImport', () => {
  it('ни разу не импортирована → true', () => {
    expect(needsImport({ google_modified_at: '2026-07-01T00:00:00Z', last_imported_at: null })).toBe(true)
  })
  it('изменена в Google после импорта → true', () => {
    expect(needsImport({ google_modified_at: '2026-07-02T00:00:00Z', last_imported_at: '2026-07-01T00:00:00Z' })).toBe(true)
  })
  it('импорт свежее изменения → false', () => {
    expect(needsImport({ google_modified_at: '2026-07-01T00:00:00Z', last_imported_at: '2026-07-02T00:00:00Z' })).toBe(false)
  })
  it('нет данных об изменении, но импорт был → false', () => {
    expect(needsImport({ google_modified_at: null, last_imported_at: '2026-07-01T00:00:00Z' })).toBe(false)
  })
})
```

Run: `npm run test -- tests/import/importTable.test.ts` → FAIL.

- [ ] **Step 2: Реализация importTable.ts**

`src/lib/import/importTable.ts`:
```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { convertGridSheet, summarizeReports, type GoogleGridSheet } from '@/lib/google/convert'
import { buildDataset } from '@/lib/dataset/build'
import { fetchSpreadsheetGrid, listFolderSpreadsheets } from '@/lib/google/client'
import type { DatasetBuild, SheetImportReport } from '@/lib/types'

export function needsImport(t: { google_modified_at: string | null; last_imported_at: string | null }): boolean {
  if (!t.last_imported_at) return true
  if (!t.google_modified_at) return false
  return new Date(t.google_modified_at).getTime() > new Date(t.last_imported_at).getTime()
}

/** Обновляет каталог таблиц из Drive (названия, папки, modifiedTime, новые файлы). */
export async function syncCatalog(admin: SupabaseClient): Promise<{ total: number }> {
  const files = await listFolderSpreadsheets(process.env.GOOGLE_DRIVE_FOLDER_ID!)
  if (files.length) {
    const { error } = await admin.from('tables').upsert(
      files.map((f) => ({
        google_spreadsheet_id: f.id,
        title: f.name,
        folder: f.folder,
        google_modified_at: f.modifiedTime,
      })),
      { onConflict: 'google_spreadsheet_id' },
    )
    if (error) throw new Error(`syncCatalog: ${error.message}`)
  }
  return { total: files.length }
}

function datasetToRow(sheetId: string, d: DatasetBuild) {
  if (d.status === 'ok') {
    return {
      sheet_id: sheetId, status: 'ok', header_row: d.headerRow,
      start_col: d.range.startCol, end_col: d.range.endCol, end_row: d.range.endRow,
      confidence: d.confidence, columns: d.columns, rows: d.rows,
    }
  }
  return {
    sheet_id: sheetId, status: d.status, header_row: null,
    start_col: null, end_col: null, end_row: null,
    confidence: d.status === 'needs_mapping' ? d.confidence : null, columns: null, rows: null,
  }
}

export async function importTable(admin: SupabaseClient, table: { id: string; google_spreadsheet_id: string }): Promise<void> {
  const gridSheets = await fetchSpreadsheetGrid(table.google_spreadsheet_id)
  const reports: SheetImportReport[] = []
  const keptSheetIds: number[] = []

  for (let i = 0; i < gridSheets.length; i++) {
    const gs = gridSheets[i] as GoogleGridSheet
    const googleSheetId = gs.properties?.sheetId ?? i
    const { snapshot, report } = convertGridSheet(gs, i)
    reports.push(report)
    keptSheetIds.push(googleSheetId)

    const { data: sheetRow, error } = await admin
      .from('table_sheets')
      .upsert(
        { table_id: table.id, google_sheet_id: googleSheetId, title: snapshot.name, sheet_index: gs.properties?.index ?? i, snapshot },
        { onConflict: 'table_id,google_sheet_id' },
      )
      .select('id')
      .single()
    if (error) throw new Error(`table_sheets: ${error.message}`)

    const { error: dsError } = await admin
      .from('datasets')
      .upsert(datasetToRow(sheetRow.id, buildDataset(snapshot)), { onConflict: 'sheet_id' })
    if (dsError) throw new Error(`datasets: ${dsError.message}`)
  }

  if (keptSheetIds.length) {
    await admin.from('table_sheets').delete()
      .eq('table_id', table.id)
      .not('google_sheet_id', 'in', `(${keptSheetIds.join(',')})`)
  }

  await admin.from('tables').update({
    import_status: 'ok',
    import_error: null,
    import_report: summarizeReports(reports),
    last_imported_at: new Date().toISOString(),
  }).eq('id', table.id)
}

export interface BatchResult { imported: number; remaining: number; errors: { table: string; message: string }[] }

export async function runImportBatch(admin: SupabaseClient, budgetMs: number, opts: { retryErrors?: boolean } = {}): Promise<BatchResult> {
  const started = Date.now()
  const { data, error } = await admin
    .from('tables')
    .select('id, google_spreadsheet_id, title, import_status, google_modified_at, last_imported_at')
    .eq('mode', 'google-owned')
    .order('last_imported_at', { ascending: true, nullsFirst: true })
  if (error) throw new Error(error.message)

  const queue = (data ?? []).filter((t) => needsImport(t) || (opts.retryErrors && t.import_status === 'error'))
  const errors: BatchResult['errors'] = []
  let processed = 0

  for (const t of queue) {
    if (Date.now() - started > budgetMs) break
    try {
      await importTable(admin, t)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      errors.push({ table: t.title, message })
      // last_imported_at ставим и при ошибке — иначе битая таблица зациклит очередь;
      // повторная попытка: при изменении файла в Google или кнопкой «повторить с ошибками»
      await admin.from('tables').update({
        import_status: 'error', import_error: message, last_imported_at: new Date().toISOString(),
      }).eq('id', t.id)
    }
    processed++
  }
  return { imported: processed, remaining: Math.max(0, queue.length - processed), errors }
}
```

- [ ] **Step 3: Прогнать тест — PASS**

Run: `npm run test -- tests/import/importTable.test.ts` → PASS.

- [ ] **Step 4: API-роуты**

`src/app/api/admin/import/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/auth'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { runImportBatch, syncCatalog } from '@/lib/import/importTable'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  if (session.role !== 'admin') return NextResponse.json({ error: 'Только для администратора' }, { status: 403 })

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const admin = createAdminSupabase()
  let total: number | undefined
  if (body.sync) total = (await syncCatalog(admin)).total
  const result = await runImportBatch(admin, 45_000, { retryErrors: Boolean(body.retryErrors) })
  return NextResponse.json({ ...result, total })
}
```

`src/app/api/cron/reimport/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { createAdminSupabase } from '@/lib/supabase/admin'
import { runImportBatch, syncCatalog } from '@/lib/import/importTable'

export const runtime = 'nodejs'
export const maxDuration = 60

async function handle(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const admin = createAdminSupabase()
  await syncCatalog(admin)
  const result = await runImportBatch(admin, 45_000)
  return NextResponse.json(result)
}

export async function GET(request: Request) { return handle(request) }  // Vercel cron ходит GET'ом
export async function POST(request: Request) { return handle(request) } // pg_cron ходит POST'ом
```

- [ ] **Step 5: Ручная проверка импорта**

Run: `npm run dev`, войти админом, затем в другом терминале (cookie не нужен — проверяем cron-роут):
```bash
curl -s -X POST http://localhost:3000/api/cron/reimport -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"
```
Expected: JSON вида `{"imported":N,"remaining":0,"errors":[]}` (при N таблиц в папке; при большом N — `remaining > 0`, повторить). Затем `npm run check:db` — `tables`, `table_sheets`, `datasets` непустые.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: import orchestration with time budget, admin and cron routes"
```

---

### Task 10: Каталог таблиц

**Files:**
- Create: `src/lib/catalog.ts`, `tests/catalog.test.ts`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `requireUser` (Task 3), `createServerSupabase` (Task 2).
- Produces: `type CatalogTable = { id: string; title: string; folder: string; import_status: 'pending' | 'ok' | 'error'; last_imported_at: string | null; sheet_count: number }`; `groupTables(rows: CatalogTable[], query: string): { folder: string; tables: CatalogTable[] }[]`.

**Примечание для исполнителя:** при вёрстке страниц каталога/таблицы используй навык `ui-ux-pro-max`, если доступен; стиль — чистый профессиональный, светлый, без декоративности.

- [ ] **Step 1: Падающие тесты groupTables**

`tests/catalog.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { groupTables, type CatalogTable } from '@/lib/catalog'

const t = (title: string, folder: string): CatalogTable => ({
  id: title, title, folder, import_status: 'ok', last_imported_at: null, sheet_count: 1,
})

describe('groupTables', () => {
  it('группирует по папкам и сортирует по-русски', () => {
    const groups = groupTables([t('Бюджет', 'Реклама'), t('Анонсы', 'Контент'), t('Отчёт', 'Реклама')], '')
    expect(groups.map((g) => g.folder)).toEqual(['Контент', 'Реклама'])
    expect(groups[1].tables.map((x) => x.title)).toEqual(['Бюджет', 'Отчёт'])
  })
  it('ищет по названию и папке без учёта регистра', () => {
    const groups = groupTables([t('Бюджет 2026', 'Реклама'), t('Анонсы', 'Контент')], 'бюдж')
    expect(groups).toHaveLength(1)
    expect(groups[0].tables[0].title).toBe('Бюджет 2026')
  })
  it('пустой запрос возвращает всё', () => {
    expect(groupTables([t('А', 'Ф1'), t('Б', 'Ф2')], '  ')).toHaveLength(2)
  })
})
```

Run: `npm run test -- tests/catalog.test.ts` → FAIL.

- [ ] **Step 2: Реализация lib/catalog.ts**

```ts
export interface CatalogTable {
  id: string
  title: string
  folder: string
  import_status: 'pending' | 'ok' | 'error'
  last_imported_at: string | null
  sheet_count: number
}

export function groupTables(rows: CatalogTable[], query: string): { folder: string; tables: CatalogTable[] }[] {
  const q = query.trim().toLowerCase()
  const filtered = q
    ? rows.filter((t) => t.title.toLowerCase().includes(q) || t.folder.toLowerCase().includes(q))
    : rows
  const groups = new Map<string, CatalogTable[]>()
  for (const t of filtered) {
    const list = groups.get(t.folder) ?? []
    list.push(t)
    groups.set(t.folder, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'ru'))
    .map(([folder, tables]) => ({ folder, tables: [...tables].sort((x, y) => x.title.localeCompare(y.title, 'ru')) }))
}
```

Run: `npm run test -- tests/catalog.test.ts` → PASS.

- [ ] **Step 3: Страница каталога**

`src/app/page.tsx` (заменить целиком):
```tsx
import Link from 'next/link'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { groupTables, type CatalogTable } from '@/lib/catalog'

export const dynamic = 'force-dynamic'

const STATUS: Record<CatalogTable['import_status'], { text: string; cls: string }> = {
  ok: { text: 'импортирована', cls: 'bg-[#eaf3ea] text-[#006300]' },
  pending: { text: 'ждёт импорта', cls: 'bg-[#f0efec] text-[var(--ink-secondary)]' },
  error: { text: 'ошибка импорта', cls: 'bg-[#fdeaea] text-[#d03b3b]' },
}

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await requireUser()
  const { q = '' } = await searchParams
  const supabase = await createServerSupabase()
  const { data } = await supabase
    .from('tables')
    .select('id, title, folder, import_status, last_imported_at, table_sheets(count)')
  const rows: CatalogTable[] = (data ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    folder: t.folder as string,
    import_status: t.import_status as CatalogTable['import_status'],
    last_imported_at: t.last_imported_at as string | null,
    sheet_count: (t.table_sheets as unknown as { count: number }[])?.[0]?.count ?? 0,
  }))
  const groups = groupTables(rows, q)

  return (
    <>
      <Header session={session} />
      <main className="mx-auto max-w-6xl p-6">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">Таблицы отдела</h1>
          <form method="GET" className="w-72">
            <input
              type="search" name="q" defaultValue={q} placeholder="Поиск по названию или папке…"
              className="w-full rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 text-sm outline-none focus:border-[#2a78d6]"
            />
          </form>
        </div>

        {groups.length === 0 && (
          <p className="mt-10 text-center text-sm text-[var(--ink-muted)]">
            {q ? 'Ничего не найдено.' : 'Таблиц пока нет — запустите импорт в админке.'}
          </p>
        )}

        {groups.map((g) => (
          <section key={g.folder} className="mt-8">
            <h2 className="text-sm font-medium uppercase tracking-wide text-[var(--ink-muted)]">{g.folder}</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {g.tables.map((t) => (
                <Link
                  key={t.id} href={`/tables/${t.id}`}
                  className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 transition-shadow hover:shadow-sm"
                >
                  <div className="font-medium">{t.title}</div>
                  <div className="mt-2 flex items-center justify-between text-xs text-[var(--ink-secondary)]">
                    <span>{t.sheet_count} лист.</span>
                    <span className={`rounded-full px-2 py-0.5 ${STATUS[t.import_status].cls}`}>{STATUS[t.import_status].text}</span>
                  </div>
                  {t.last_imported_at && (
                    <div className="mt-1 text-xs text-[var(--ink-muted)]">обновлено {fmtDate(t.last_imported_at)}</div>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}
      </main>
    </>
  )
}
```

- [ ] **Step 4: Ручная проверка**

Run: `npm run dev` → `/` показывает импортированные таблицы по папкам, поиск `?q=` фильтрует, карточки со статусами.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: catalog page with folders, search and import status"
```

---

### Task 11: Страница таблицы: просмотр в Univer и отчёт импорта

**Files:**
- Create: `src/lib/workbook.ts`, `tests/workbook.test.ts`, `src/app/tables/[id]/page.tsx`, `src/app/tables/[id]/TableTabs.tsx`, `src/app/tables/[id]/UniverViewer.tsx`, `src/app/tables/[id]/ReportTab.tsx`

**Interfaces:**
- Consumes: `requireUser`, `createServerSupabase`, `Header`; типы Task 4.
- Produces: `type SheetRowInput = { google_sheet_id: number; title: string; sheet_index: number; snapshot: SheetSnapshot }`; `assembleWorkbookData(tableId: string, title: string, sheets: SheetRowInput[]): { id: string; name: string; sheetOrder: string[]; sheets: Record<string, object>; styles: Record<string, object> }`. Компонент `AnalyticsTab` подключается в Task 12 — в этом таске вкладка «Аналитика» рендерит заглушку `<p>Скоро</p>`, которую Task 12 заменит.

- [ ] **Step 1: Падающий тест сборки workbook**

`tests/workbook.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { assembleWorkbookData, type SheetRowInput } from '@/lib/workbook'
import type { SheetSnapshot } from '@/lib/types'

const snap = (name: string, styles: SheetSnapshot['styles'] = {}): SheetSnapshot => ({
  name, rowCount: 100, columnCount: 26, mergeData: [], styles, cellData: { 0: { 0: { v: name } } },
})

describe('assembleWorkbookData', () => {
  it('сортирует листы по sheet_index и склеивает стили без nfType', () => {
    const sheets: SheetRowInput[] = [
      { google_sheet_id: 200, title: 'Второй', sheet_index: 1, snapshot: snap('Второй', { s1_0: { bl: 1, nfType: 'DATE' } }) },
      { google_sheet_id: 100, title: 'Первый', sheet_index: 0, snapshot: snap('Первый', { s0_0: { it: 1 } }) },
    ]
    const wb = assembleWorkbookData('t1', 'Моя таблица', sheets)
    expect(wb.id).toBe('wb_t1')
    expect(wb.sheetOrder).toEqual(['sheet_100', 'sheet_200'])
    expect(wb.styles).toEqual({ s0_0: { it: 1 }, s1_0: { bl: 1 } }) // nfType вырезан
    expect((wb.sheets['sheet_100'] as { name: string }).name).toBe('Первый')
  })
})
```

Run: `npm run test -- tests/workbook.test.ts` → FAIL.

- [ ] **Step 2: Реализация workbook.ts**

`src/lib/workbook.ts`:
```ts
import type { SheetSnapshot } from '@/lib/types'

export interface SheetRowInput { google_sheet_id: number; title: string; sheet_index: number; snapshot: SheetSnapshot }

/** Собирает объект в форме IWorkbookData Univer из per-sheet снапшотов. */
export function assembleWorkbookData(tableId: string, title: string, sheets: SheetRowInput[]) {
  const ordered = [...sheets].sort((a, b) => a.sheet_index - b.sheet_index)
  const styles: Record<string, object> = {}
  const sheetsById: Record<string, object> = {}
  const sheetOrder: string[] = []
  for (const s of ordered) {
    const sid = `sheet_${s.google_sheet_id}`
    sheetOrder.push(sid)
    for (const [id, style] of Object.entries(s.snapshot.styles)) {
      const { nfType: _nfType, ...univerStyle } = style // nfType — наше поле, Univer его не знает
      styles[id] = univerStyle
    }
    sheetsById[sid] = {
      id: sid,
      name: s.title,
      rowCount: s.snapshot.rowCount,
      columnCount: s.snapshot.columnCount,
      cellData: s.snapshot.cellData,
      mergeData: s.snapshot.mergeData,
    }
  }
  return { id: `wb_${tableId}`, name: title, sheetOrder, sheets: sheetsById, styles }
}
```

Run: `npm run test -- tests/workbook.test.ts` → PASS.

- [ ] **Step 3: Установить Univer и написать viewer**

```bash
npm i @univerjs/presets
```

`src/app/tables/[id]/UniverViewer.tsx`:
```tsx
'use client'
import { useEffect, useRef } from 'react'
import '@univerjs/presets/lib/styles/preset-sheets-core.css'

export default function UniverViewer({ data }: { data: Record<string, unknown> }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let disposed = false
    let dispose: (() => void) | undefined
    ;(async () => {
      const [{ createUniver, LocaleType, mergeLocales }, { UniverSheetsCorePreset }, ruRU] = await Promise.all([
        import('@univerjs/presets'),
        import('@univerjs/presets/preset-sheets-core'),
        import('@univerjs/presets/preset-sheets-core/locales/ru-RU'),
      ])
      if (disposed || !containerRef.current) return
      const { univer, univerAPI } = createUniver({
        locale: LocaleType.RU_RU,
        locales: { [LocaleType.RU_RU]: mergeLocales((ruRU as { default?: object }).default ?? ruRU) },
        presets: [UniverSheetsCorePreset({ container: containerRef.current })],
      })
      const workbook = univerAPI.createWorkbook(data as never)
      // Фаза 1 — только просмотр. Если в текущей версии Univer нет такого метода,
      // альтернатива: univerAPI.getActiveWorkbook()?.setEditable(false)
      univerAPI.getPermission().setWorkbookEditPermission(workbook.getId(), false)
      dispose = () => univer.dispose()
    })()
    return () => { disposed = true; dispose?.() }
  }, [data])

  return <div ref={containerRef} className="mt-3 h-[70vh] w-full overflow-hidden rounded-xl border border-[var(--hairline)]" />
}
```

- [ ] **Step 4: Страница таблицы с вкладками и отчётом**

`src/app/tables/[id]/ReportTab.tsx`:
```tsx
import type { TableImportReport } from '@/lib/types'

export function ReportTab({ report }: { report: TableImportReport | null }) {
  if (!report) return <p className="mt-6 text-sm text-[var(--ink-muted)]">Отчёта пока нет — таблица ещё не импортирована.</p>
  return (
    <div className="mt-4 space-y-4">
      <p className="text-sm">
        Статус: <b>{report.status === 'clean' ? 'перенесено без потерь' : 'есть замечания'}</b> ·
        ячеек {report.totalCells} · формул {report.totalFormulas} · заморожено {report.totalFrozen}
      </p>
      {report.sheets.map((s) => (
        <div key={s.sheetTitle} className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
          <div className="font-medium">{s.sheetTitle}</div>
          <div className="mt-1 text-sm text-[var(--ink-secondary)]">ячеек {s.cellCount}, формул {s.formulaCount}</div>
          {s.frozenFormulas.length > 0 && (
            <div className="mt-2 text-sm">
              <div className="text-[var(--ink-secondary)]">Замороженные формулы (значение сохранено, формула отключена):</div>
              <ul className="mt-1 list-inside list-disc text-[var(--ink-secondary)]">
                {s.frozenFormulas.slice(0, 20).map((f) => (
                  <li key={f.a1}><b>{f.a1}</b>: {f.fn}</li>
                ))}
                {s.frozenFormulas.length > 20 && <li>и ещё {s.frozenFormulas.length - 20}…</li>}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

`src/app/tables/[id]/TableTabs.tsx`:
```tsx
'use client'
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { ReportTab } from './ReportTab'
import { assembleWorkbookData, type SheetRowInput } from '@/lib/workbook'
import type { TableImportReport } from '@/lib/types'

const UniverViewer = dynamic(() => import('./UniverViewer'), {
  ssr: false,
  loading: () => <p className="mt-6 text-sm text-[var(--ink-muted)]">Загрузка таблицы…</p>,
})

const TABS = ['Таблица', 'Аналитика', 'Отчёт импорта'] as const

export function TableTabs({ table, sheets }: {
  table: { id: string; title: string; import_report: TableImportReport | null }
  sheets: (SheetRowInput & { id: string })[]
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Таблица')
  return (
    <div className="mt-4">
      <div className="flex gap-1 border-b border-[var(--hairline)]">
        {TABS.map((t) => (
          <button
            key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm ${tab === t
              ? 'border-b-2 border-[#2a78d6] font-medium text-[var(--ink)]'
              : 'text-[var(--ink-secondary)] hover:text-[var(--ink)]'}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === 'Таблица' && <UniverViewer data={assembleWorkbookData(table.id, table.title, sheets)} />}
      {tab === 'Аналитика' && <p className="mt-6 text-sm text-[var(--ink-muted)]">Скоро</p>}
      {tab === 'Отчёт импорта' && <ReportTab report={table.import_report} />}
    </div>
  )
}
```

`src/app/tables/[id]/page.tsx`:
```tsx
import { notFound } from 'next/navigation'
import { requireUser } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { Header } from '@/components/Header'
import { TableTabs } from './TableTabs'
import type { SheetRowInput } from '@/lib/workbook'

export const dynamic = 'force-dynamic'

export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser()
  const { id } = await params
  const supabase = await createServerSupabase()
  const { data: table } = await supabase
    .from('tables')
    .select('id, title, folder, import_status, import_report, last_imported_at')
    .eq('id', id)
    .maybeSingle()
  if (!table) notFound()
  const { data: sheets } = await supabase
    .from('table_sheets')
    .select('id, google_sheet_id, title, sheet_index, snapshot')
    .eq('table_id', id)
    .order('sheet_index')

  return (
    <>
      <Header session={session} />
      <main className="mx-auto max-w-6xl p-6">
        <h1 className="text-xl font-semibold">{table.title}</h1>
        <p className="mt-1 text-sm text-[var(--ink-muted)]">{table.folder}</p>
        <TableTabs table={table} sheets={(sheets ?? []) as (SheetRowInput & { id: string })[]} />
      </main>
    </>
  )
}
```

- [ ] **Step 5: Ручная проверка**

Run: `npm run dev` → открыть таблицу из каталога: вкладка «Таблица» рендерит лист в Univer на русском, значения/стили/объединения на месте, редактирование заблокировано; «Отчёт импорта» показывает сводку.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: table page with read-only Univer viewer and import report tab"
```

---

### Task 12: Вкладка «Аналитика» с live-обновлением

**Files:**
- Create: `src/lib/viz.ts`, `src/app/api/tables/[id]/analytics/route.ts`, `src/app/tables/[id]/AnalyticsTab.tsx`
- Modify: `src/app/tables/[id]/TableTabs.tsx` (заменить заглушку «Скоро»)

**Interfaces:**
- Consumes: `buildWidgets`, `OkDataset`, `Widget` (Task 8); `getApiSession`, `createServerSupabase`, `createBrowserSupabase`.
- Produces: `GET /api/tables/[id]/analytics` → `{ sheets: { sheetId: string; title: string; status: 'ok' | 'needs_mapping' | 'empty'; widgets: Widget[]; truncated: number }[] }`; константы `VIZ`, `fmtValue(v, format)`, `fmtCompact(v)`.

**Примечание для исполнителя (dataviz):** палитра ниже — валидированная референс-палитра навыка dataviz (adjacent CVD ΔE 24.2 в light mode — прошла проверку). Правила, применённые в коде: один ряд — без легенды (название в заголовке карточки); линии 2px без точек; бары 14px со скруглением 4px на конце данных; сетка — волосяная, только горизонтальная; подписи и значения — цветом текста, не цветом ряда; тултип обязателен. Если меняешь цвета — прогони `scripts/validate_palette.js` из навыка dataviz.

- [ ] **Step 1: Установить Recharts и создать viz.ts**

```bash
npm i recharts
```

`src/lib/viz.ts`:
```ts
// Палитра — референс-инстанс навыка dataviz (валидирована: adjacent CVD dE 24.2, light).
// Менять hex только после прогона scripts/validate_palette.js из навыка dataviz.
export const VIZ = {
  series1: '#2a78d6',
  series2: '#1baf7a',
  negative: '#e34948',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#898781',
  inkSecondary: '#52514e',
  surface: '#fcfcfb',
  goodText: '#006300',
} as const

const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 })
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 })

export function fmtValue(v: number, format: 'number' | 'money' | 'percent'): string {
  if (format === 'percent') return `${nf1.format(v * 100)}%`
  if (format === 'money') return nf0.format(v)
  return Math.abs(v) >= 100 ? nf0.format(v) : nf1.format(v)
}

export function fmtCompact(v: number): string {
  return new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 }).format(v)
}
```

- [ ] **Step 2: API аналитики**

`src/app/api/tables/[id]/analytics/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/auth'
import { createServerSupabase } from '@/lib/supabase/server'
import { buildWidgets, type OkDataset, type Widget } from '@/lib/analytics/widgets'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getApiSession()
  if (!session) return NextResponse.json({ error: 'Не авторизован' }, { status: 401 })
  const { id } = await params
  const supabase = await createServerSupabase() // RLS отфильтрует недопущенных

  const { data: sheets, error } = await supabase
    .from('table_sheets')
    .select('id, title, sheet_index, datasets(status, header_row, start_col, end_col, end_row, confidence, columns, rows)')
    .eq('table_id', id)
    .order('sheet_index')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = (sheets ?? []).map((s) => {
    const raw = Array.isArray(s.datasets) ? s.datasets[0] : s.datasets
    const ds = raw as {
      status: 'ok' | 'needs_mapping' | 'empty'
      header_row: number | null; start_col: number | null; end_col: number | null; end_row: number | null
      confidence: number | null; columns: OkDataset['columns'] | null; rows: OkDataset['rows'] | null
    } | null
    if (!ds || ds.status !== 'ok' || !ds.columns || !ds.rows) {
      return { sheetId: s.id, title: s.title, status: (ds?.status ?? 'empty') as 'needs_mapping' | 'empty', widgets: [] as Widget[], truncated: 0 }
    }
    const dataset: OkDataset = {
      status: 'ok', headerRow: ds.header_row ?? 0, confidence: ds.confidence ?? 0,
      range: { startCol: ds.start_col ?? 0, endCol: ds.end_col ?? 0, endRow: ds.end_row ?? 0 },
      columns: ds.columns, rows: ds.rows,
    }
    const { widgets, truncated } = buildWidgets(dataset)
    return { sheetId: s.id, title: s.title, status: 'ok' as const, widgets, truncated }
  })
  return NextResponse.json({ sheets: result })
}
```

- [ ] **Step 3: Компонент AnalyticsTab**

`src/app/tables/[id]/AnalyticsTab.tsx`:
```tsx
'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { createBrowserSupabase } from '@/lib/supabase/client'
import { VIZ, fmtCompact, fmtValue } from '@/lib/viz'
import type { Widget } from '@/lib/analytics/widgets'

interface SheetAnalytics {
  sheetId: string
  title: string
  status: 'ok' | 'needs_mapping' | 'empty'
  widgets: Widget[]
  truncated: number
}

export function AnalyticsTab({ tableId, sheetIds }: { tableId: string; sheetIds: string[] }) {
  const [sheets, setSheets] = useState<SheetAnalytics[] | null>(null)
  const [active, setActive] = useState(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/tables/${tableId}/analytics`)
    if (res.ok) setSheets((await res.json()).sheets)
  }, [tableId])

  useEffect(() => { load() }, [load])

  // live: изменения datasets (переимпорт) → перезагрузка виджетов
  useEffect(() => {
    if (!sheetIds.length) return
    const supabase = createBrowserSupabase()
    const channel = supabase
      .channel(`datasets-${tableId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'datasets', filter: `sheet_id=in.(${sheetIds.join(',')})` },
        () => {
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(load, 500)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      if (timer.current) clearTimeout(timer.current)
    }
  }, [tableId, sheetIds, load])

  if (!sheets) return <p className="mt-6 text-sm text-[var(--ink-muted)]">Считаем аналитику…</p>
  if (!sheets.length) return <p className="mt-6 text-sm text-[var(--ink-muted)]">Нет данных.</p>

  const sheet = sheets[Math.min(active, sheets.length - 1)]
  return (
    <div className="mt-4">
      {sheets.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {sheets.map((s, i) => (
            <button
              key={s.sheetId} onClick={() => setActive(i)}
              className={`rounded-full border px-3 py-1 text-sm ${i === active
                ? 'border-[#2a78d6] text-[#2a78d6]'
                : 'border-[var(--hairline)] text-[var(--ink-secondary)]'}`}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
      <SheetWidgets sheet={sheet} />
    </div>
  )
}

function Notice({ text }: { text: string }) {
  return <p className="mt-6 rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4 text-sm text-[var(--ink-secondary)]">{text}</p>
}

function SheetWidgets({ sheet }: { sheet: SheetAnalytics }) {
  if (sheet.status === 'needs_mapping') return <Notice text="Не удалось автоматически распознать структуру листа. Ручная разметка появится в фазе 3." />
  if (sheet.status === 'empty') return <Notice text="Лист пустой — аналитики нет." />
  const kpis = sheet.widgets.filter((w) => w.kind === 'kpi' || w.kind === 'rowcount')
  const charts = sheet.widgets.filter((w) => w.kind === 'timeseries' || w.kind === 'breakdown' || w.kind === 'slice')
  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {kpis.map((w) => <KpiCard key={w.id} w={w} />)}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {charts.map((w) => <ChartCard key={w.id} w={w} />)}
      </div>
      {sheet.truncated > 0 && <p className="mt-3 text-xs text-[var(--ink-muted)]">Показаны не все виджеты: скрыто {sheet.truncated}.</p>}
    </div>
  )
}

function KpiCard({ w }: { w: Widget }) {
  if (w.kind === 'rowcount') {
    return (
      <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <div className="text-xs text-[var(--ink-secondary)]">{w.title}</div>
        <div className="mt-1 text-2xl font-semibold">{fmtValue(w.count, 'number')}</div>
      </div>
    )
  }
  if (w.kind !== 'kpi') return null
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <div className="text-xs text-[var(--ink-secondary)]">{w.title} — сумма</div>
      <div className="mt-1 text-2xl font-semibold">{fmtValue(w.stats.sum, w.format)}</div>
      <div className="mt-1 text-xs text-[var(--ink-muted)]">
        сред. {fmtValue(w.stats.avg, w.format)} · мед. {fmtValue(w.stats.median, w.format)} · мин {fmtValue(w.stats.min, w.format)} · макс {fmtValue(w.stats.max, w.format)}
      </div>
    </div>
  )
}

function ChartTooltip({ active, payload, label, format }: {
  active?: boolean; payload?: { value: number }[]; label?: string; format: 'number' | 'money' | 'percent'
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 text-xs shadow-sm">
      <div className="text-[var(--ink-secondary)]">{label}</div>
      <div className="font-medium">{fmtValue(payload[0].value, format)}</div>
    </div>
  )
}

function ChartCard({ w }: { w: Widget }) {
  if (w.kind === 'timeseries') {
    return (
      <figure className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
        <figcaption className="flex items-baseline justify-between gap-2 text-sm">
          <span className="font-medium">{w.title}</span>
          {w.growthPct !== null && (
            <span className="text-xs" style={{ color: w.growthPct >= 0 ? VIZ.goodText : VIZ.negative }}>
              {w.growthPct >= 0 ? '↑' : '↓'} {Math.abs(w.growthPct).toLocaleString('ru-RU')}% к пред. периоду
            </span>
          )}
        </figcaption>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={w.points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={VIZ.grid} vertical={false} />
              <XAxis dataKey="t" tick={{ fill: VIZ.muted, fontSize: 11 }} tickLine={false} axisLine={{ stroke: VIZ.axis }} minTickGap={24} />
              <YAxis tick={{ fill: VIZ.muted, fontSize: 11 }} tickLine={false} axisLine={false} width={48} tickFormatter={fmtCompact} />
              <Tooltip content={<ChartTooltip format={w.format} />} />
              <Line type="monotone" dataKey="v" stroke={VIZ.series1} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>
    )
  }
  if (w.kind !== 'breakdown' && w.kind !== 'slice') return null
  const isBreakdown = w.kind === 'breakdown'
  const data = isBreakdown
    ? w.items.map((i) => ({ name: i.name, value: i.count }))
    : w.items.map((i) => ({ name: i.name, value: i.value }))
  const format: 'number' | 'money' | 'percent' = isBreakdown ? 'number' : w.format
  return (
    <figure className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-4">
      <figcaption className="text-sm font-medium">{w.title}</figcaption>
      <div className="mt-3" style={{ height: Math.max(120, data.length * 30 + 30) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 8 }} barCategoryGap={4}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={120} tick={{ fill: VIZ.inkSecondary, fontSize: 12 }} tickLine={false} axisLine={{ stroke: VIZ.axis }} />
            <Tooltip content={<ChartTooltip format={format} />} />
            <Bar dataKey="value" fill={isBreakdown ? VIZ.series2 : VIZ.series1} radius={[0, 4, 4, 0]} barSize={14}>
              <LabelList dataKey="value" position="right" style={{ fill: VIZ.inkSecondary, fontSize: 11 }} formatter={(v: number) => fmtCompact(v)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  )
}
```

- [ ] **Step 4: Подключить вкладку**

В `src/app/tables/[id]/TableTabs.tsx`: добавить импорт `import { AnalyticsTab } from './AnalyticsTab'` и заменить строку заглушки:
```tsx
{tab === 'Аналитика' && <AnalyticsTab tableId={table.id} sheetIds={sheets.map((s) => s.id)} />}
```

- [ ] **Step 5: Ручная проверка live-обновления**

1. `npm run dev` → открыть таблицу → «Аналитика»: KPI-карточки, динамика, структура, срезы; на нераспознанных листах — сообщение про разметку.
2. Изменить ячейку в исходном Google Sheets → дёрнуть переимпорт: `curl -s -X POST http://localhost:3000/api/cron/reimport -H "Authorization: Bearer $(grep CRON_SECRET .env.local | cut -d= -f2)"` → виджеты на открытой вкладке обновились сами, без перезагрузки страницы.
3. Если Realtime-событие не приходит: проверить, что в Supabase → Database → Replication таблица `datasets` включена в публикацию `supabase_realtime` (миграция это делает).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: analytics tab with auto widgets and realtime refresh"
```

---

### Task 13: Админка: allowlist и панель импорта

**Files:**
- Create: `src/app/api/admin/allowlist/route.ts`, `src/app/admin/page.tsx`, `src/app/admin/AllowlistManager.tsx`, `src/app/admin/ImportPanel.tsx`

**Interfaces:**
- Consumes: `requireAdmin`, `getApiSession`, `createAdminSupabase`; `POST /api/admin/import` (Task 9).
- Produces: `GET /api/admin/allowlist` → `{ users: { email: string; role: string }[] }`; `POST` body `{ email, role }`; `DELETE` body `{ email }`.

- [ ] **Step 1: API allowlist**

`src/app/api/admin/allowlist/route.ts`:
```ts
import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/auth'
import { createAdminSupabase } from '@/lib/supabase/admin'

async function guard() {
  const session = await getApiSession()
  if (!session) return { error: NextResponse.json({ error: 'Не авторизован' }, { status: 401 }) }
  if (session.role !== 'admin') return { error: NextResponse.json({ error: 'Только для администратора' }, { status: 403 }) }
  return { session }
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
```

- [ ] **Step 2: Компоненты админки**

`src/app/admin/AllowlistManager.tsx`:
```tsx
'use client'
import { useCallback, useEffect, useState } from 'react'

const ROLES = [
  { value: 'viewer', label: 'Просмотр' },
  { value: 'editor', label: 'Редактор' },
  { value: 'admin', label: 'Админ' },
]

export function AllowlistManager() {
  const [users, setUsers] = useState<{ email: string; role: string }[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/allowlist')
    if (res.ok) setUsers((await res.json()).users)
  }, [])
  useEffect(() => { load() }, [load])

  const call = async (method: 'POST' | 'DELETE', body: object) => {
    setError(null)
    const res = await fetch('/api/admin/allowlist', {
      method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    if (!res.ok) setError((await res.json()).error ?? 'Ошибка')
    await load()
  }

  return (
    <section className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Доступ к платформе</h2>
      <form
        className="mt-3 flex gap-2"
        onSubmit={async (e) => { e.preventDefault(); await call('POST', { email, role }); setEmail('') }}
      >
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="email@компании.kz"
          className="flex-1 rounded-lg border border-[var(--hairline)] px-3 py-2 text-sm outline-none focus:border-[#2a78d6]"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-[var(--hairline)] px-2 py-2 text-sm">
          {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
        <button className="rounded-lg bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf]">Добавить</button>
      </form>
      {error && <p className="mt-2 text-sm text-[#d03b3b]">{error}</p>}
      <ul className="mt-4 divide-y divide-[var(--hairline)]">
        {users.map((u) => (
          <li key={u.email} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span>{u.email}</span>
            <span className="flex items-center gap-3">
              <select
                value={u.role}
                onChange={(e) => call('POST', { email: u.email, role: e.target.value })}
                className="rounded-lg border border-[var(--hairline)] px-2 py-1 text-sm"
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
              <button onClick={() => call('DELETE', { email: u.email })} className="text-[#d03b3b] hover:underline">удалить</button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
```

`src/app/admin/ImportPanel.tsx`:
```tsx
'use client'
import { useState } from 'react'

export function ImportPanel() {
  const [progress, setProgress] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ table: string; message: string }[]>([])
  const [running, setRunning] = useState(false)

  const run = async (retryErrors: boolean) => {
    setRunning(true)
    setErrors([])
    setProgress('Синхронизация каталога с Google Drive…')
    let done = 0
    try {
      for (let i = 0; i < 100; i++) { // предохранитель от бесконечного цикла
        const res = await fetch('/api/admin/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sync: i === 0, retryErrors: retryErrors && i === 0 }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? res.statusText)
        const data = await res.json() as { imported: number; remaining: number; errors: { table: string; message: string }[] }
        done += data.imported
        setErrors((prev) => [...prev, ...data.errors])
        setProgress(`Обработано таблиц: ${done}, осталось: ${data.remaining}`)
        if (data.remaining === 0) break
      }
      setProgress((p) => `${p} — готово ✓`)
    } catch (e) {
      setProgress(`Ошибка: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setRunning(false)
    }
  }

  return (
    <section className="rounded-xl border border-[var(--hairline)] bg-[var(--surface)] p-5">
      <h2 className="font-medium">Импорт из Google Sheets</h2>
      <p className="mt-1 text-sm text-[var(--ink-secondary)]">
        Забирает все таблицы из папки отдела. Дальше обновление идёт автоматически каждые 5 минут.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          onClick={() => run(false)} disabled={running}
          className="rounded-lg bg-[#2a78d6] px-4 py-2 text-sm font-medium text-white hover:bg-[#256abf] disabled:opacity-50"
        >
          {running ? 'Импортируем…' : 'Импортировать всё'}
        </button>
        <button
          onClick={() => run(true)} disabled={running}
          className="rounded-lg border border-[var(--hairline)] px-4 py-2 text-sm hover:bg-[#f0efec] disabled:opacity-50"
        >
          Повторить таблицы с ошибками
        </button>
      </div>
      {progress && <p className="mt-3 text-sm text-[var(--ink-secondary)]">{progress}</p>}
      {errors.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-[#d03b3b]">
          {errors.map((e, i) => <li key={i}><b>{e.table}</b>: {e.message}</li>)}
        </ul>
      )}
    </section>
  )
}
```

`src/app/admin/page.tsx`:
```tsx
import { requireAdmin } from '@/lib/auth'
import { Header } from '@/components/Header'
import { AllowlistManager } from './AllowlistManager'
import { ImportPanel } from './ImportPanel'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const session = await requireAdmin()
  return (
    <>
      <Header session={session} />
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <h1 className="text-xl font-semibold">Админка</h1>
        <ImportPanel />
        <AllowlistManager />
      </main>
    </>
  )
}
```

- [ ] **Step 3: Ручная проверка**

`npm run dev` → `/admin` под админом: «Импортировать всё» прогоняет пакеты с прогрессом до «готово ✓»; добавление/удаление email и смена роли работают; под viewer'ом `/admin` редиректит на `/`.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: admin page with allowlist manager and import panel"
```

---

### Task 14: Деплой: Vercel, pg_cron, README

**Files:**
- Create: `vercel.json`, `README.md`

**Interfaces:**
- Consumes: `GET /api/cron/reimport` (Task 9).
- Produces: продовое окружение с автообновлением каждые 5 минут.

- [ ] **Step 1: vercel.json (страховочный дневной cron)**

`vercel.json`:
```json
{
  "crons": [{ "path": "/api/cron/reimport", "schedule": "0 6 * * *" }]
}
```
(Vercel Hobby не умеет чаще раза в день; основной 5-минутный цикл — pg_cron ниже. Vercel сам подставит `Authorization: Bearer $CRON_SECRET`, если переменная `CRON_SECRET` задана.)

- [ ] **Step 2: README с ранбуком**

`README.md`:
```markdown
# TableHub

Единая платформа таблиц отдела маркетинга: каталог, просмотр, автоаналитика.
Спека: `docs/superpowers/specs/2026-07-14-marketing-tables-platform-design.md`.

## Стек
Next.js 16 (webpack) · Supabase (Postgres/Auth/Realtime) · Univer · Recharts · Google Sheets API.

## Запуск локально
1. `npm install`
2. Скопировать `.env.local.example` → `.env.local`, заполнить (см. ниже).
3. `npm run check:db && npm run check:google` — обе проверки зелёные.
4. `npm run dev` (только webpack: путь до репозитория содержит кириллицу, Turbopack не работает).

## Переменные окружения
| Переменная | Откуда |
|---|---|
| NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY | Supabase → Settings → API |
| GOOGLE_SERVICE_ACCOUNT_JSON_B64 | base64 JSON-ключа service account (`base64 -i key.json`) |
| GOOGLE_DRIVE_FOLDER_ID | ID папки отдела из URL Drive |
| CRON_SECRET | `openssl rand -hex 24` |

## Деплой (Vercel)
1. Пуш в GitHub → импорт репозитория в Vercel → добавить все env из таблицы.
2. Build command: `next build --webpack` (или оставить `npm run build`).
3. Supabase → Authentication → URL Configuration: добавить прод-домен в Site URL и `https://<домен>/auth/callback` в Redirect URLs.
4. Включить 5-минутный переимпорт (Supabase → SQL Editor), подставив свой домен и CRON_SECRET:

    create extension if not exists pg_cron;
    create extension if not exists pg_net;
    select cron.schedule(
      'tablehub-reimport',
      '*/5 * * * *',
      $$
      select net.http_post(
        url := 'https://ЗАМЕНИ-НА-ДОМЕН.vercel.app/api/cron/reimport',
        headers := jsonb_build_object('Authorization', 'Bearer ЗАМЕНИ-НА-CRON-SECRET')
      )
      $$
    );

   Проверка: `select * from cron.job;` — задание в списке; через 5 минут в каталоге обновляется «обновлено …».

## Правила фазы 1
- Источник истины — Google Sheets, платформа read-only (редактирование придёт в фазе 2).
- Роли: админ (импорт, доступы), редактор/просмотр — пока одинаковы (различия в фазе 2).
```

- [ ] **Step 3: Сборка и деплой**

Run: `npm run build`
Expected: сборка успешна, без ошибок типов.

ЧЕЛОВЕЧЕСКИЙ ЧЕКПОЙНТ: создать GitHub-репозиторий, `git push`, импортировать в Vercel, задать env, выполнить шаги 3–4 из README (Auth URLs + pg_cron).

- [ ] **Step 4: Финальная проверка по критериям фазы 1 (спека, раздел 12)**

1. Команда видит все таблицы отдела в каталоге — открыть прод, сверить количество с Drive.
2. Живая аналитика: изменить ячейку в Google Sheets → ≤5–6 минут → виджеты обновились без перезагрузки.
3. Отчёты импорта чистые (`перенесено без потерь`) минимум у 80% таблиц — открыть админку/каталог, посчитать статусы; для остальных в отчёте видно, что заморожено.
4. Вход посторонним Google-аккаунтом → `/denied`.
5. Прогнать навык `superpowers:verification-before-completion` перед объявлением фазы готовой.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: deploy config, pg_cron runbook and README"
```





