# TableHub

Единая платформа таблиц отдела маркетинга: каталог, просмотр, автоаналитика.
Спека: `docs/superpowers/specs/2026-07-14-marketing-tables-platform-design.md`.
План фазы 1: `docs/superpowers/plans/2026-07-14-tablehub-phase1.md`.

## Стек
Next.js 16 (webpack) · Supabase (Postgres/Auth/Realtime) · Univer · Recharts · Google Sheets API.

## Запуск локально
1. `nvm use` (Node 22), затем `npm install`
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

## Первичная настройка (один раз)

### 1. Supabase (база + вход)
1. Создать проект на supabase.com → SQL Editor → выполнить `supabase/migrations/0001_init.sql`.
2. Settings → API: скопировать URL, `anon`, `service_role` в `.env.local`.
3. **Отключить самостоятельную регистрацию**: Authentication → Sign In / Providers → Email → выключить «Allow new users to sign up» (аккаунты создаёт только админ).
4. **Создать первого админа**: Authentication → Users → Add user → почта `assistmv5@gmail.com` + пароль, галка Auto Confirm User. Роль admin для этой почты уже засеяна миграцией. Остальных сотрудников потом создаёшь прямо в админке платформы.

Вход в платформу — по почте и паролю. Google-аккаунты сотрудникам не нужны.

### 2. Google service account (чтение таблиц)
Нужен, чтобы платформа сама читала твои Google Таблицы. Это **единственное**, для чего нужен Google Cloud — к входу пользователей отношения не имеет.
1. Google Cloud Console (console.cloud.google.com) → создать проект (любое имя, напр. `tablehub`).
2. APIs & Services → Enable APIs → включить **Google Drive API** и **Google Sheets API**.
3. IAM & Admin → Service Accounts → Create (`tablehub-importer`), без ролей.
4. Keys → Add key → JSON → скачать. В терминале `base64 -i ключ.json | pbcopy` → вставить в `.env.local` как `GOOGLE_SERVICE_ACCOUNT_JSON_B64`.
5. В Google Drive: папку отдела с таблицами → Поделиться → email сервисного аккаунта (`...@...iam.gserviceaccount.com`), право «Читатель». ID папки из URL → `GOOGLE_DRIVE_FOLDER_ID`.

## Деплой (Vercel)
1. Пуш в GitHub → импорт репозитория в Vercel → добавить все env из таблицы.
2. Build command: `npm run build` (уже с `--webpack`).
3. Supabase → Authentication → URL Configuration: добавить прод-домен в Site URL.
4. Включить 5-минутный переимпорт (Supabase → SQL Editor), подставив свой домен и CRON_SECRET:

```sql
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
```

Проверка: `select * from cron.job;` — задание в списке; через 5 минут в каталоге обновляется «обновлено …».
(vercel.json содержит страховочный дневной cron — Vercel Hobby чаще не умеет; основной цикл — pg_cron.)

## Правила фазы 1
- Источник истины — Google Sheets, платформа read-only (редактирование придёт в фазе 2).
- Вход по почте и паролю; аккаунты создаёт только админ в админке (самостоятельная регистрация выключена).
- Роли: админ (импорт, сотрудники), редактор/просмотр — пока одинаковы (различия в фазе 2).
