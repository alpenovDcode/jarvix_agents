-- TableHub фаза 1: схема, RLS, сиды
-- Вход: email + пароль. Аккаунты создаёт только админ (публичная регистрация отключена
-- в настройках Supabase). Наличие аккаунта в auth.users = доступ; роль хранится в user_roles.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
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

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.user_roles r
    where lower(r.email) = public.jwt_email() and r.role = 'admin')
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.tables enable row level security;
alter table public.table_sheets enable row level security;
alter table public.datasets enable row level security;

-- Любой аутентифицированный пользователь допущен (аккаунты создаёт только админ).
create policy "profiles select authenticated" on public.profiles
  for select to authenticated using (true);
create policy "roles select own or admin" on public.user_roles
  for select to authenticated using (lower(email) = public.jwt_email() or public.is_admin());
create policy "roles write admin" on public.user_roles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "tables select authenticated" on public.tables
  for select to authenticated using (true);
create policy "sheets select authenticated" on public.table_sheets
  for select to authenticated using (true);
create policy "datasets select authenticated" on public.datasets
  for select to authenticated using (true);
-- Запись в tables/table_sheets/datasets и создание пользователей — только service role (обходит RLS).

-- Роль первого админа. Сам auth-аккаунт с этим email создаётся вручную один раз
-- (Supabase → Authentication → Add user) — см. README.
insert into public.user_roles (email, role) values ('assistmv5@gmail.com', 'admin') on conflict do nothing;

alter publication supabase_realtime add table public.datasets;
