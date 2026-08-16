-- Judo Coach — схема Supabase (замена Firestore / Yandex MongoDB).
-- Выполнить целиком в Supabase Dashboard → SQL Editor → New query → Run.

-- ---------- profiles (замена users) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  is_pro boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: select own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles
  for update using (auth.uid() = id);

-- Автоматически создаём профиль при регистрации нового пользователя.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- user_data (замена Firestore users/{uid}/data/{key}) ----------
create table if not exists public.user_data (
  uid uuid not null references auth.users(id) on delete cascade,
  key text not null,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (uid, key)
);

alter table public.user_data enable row level security;

create policy "user_data: all own" on public.user_data
  for all using (auth.uid() = uid) with check (auth.uid() = uid);

-- ---------- ai_chats / ai_messages (ИИ-тренер) ----------
create table if not exists public.ai_chats (
  id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users(id) on delete cascade,
  mode text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_chats enable row level security;
create policy "ai_chats: all own" on public.ai_chats
  for all using (auth.uid() = uid) with check (auth.uid() = uid);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.ai_chats(id) on delete cascade,
  uid uuid not null references auth.users(id) on delete cascade,
  role text not null,
  text text,
  created_at timestamptz not null default now()
);

alter table public.ai_messages enable row level security;
create policy "ai_messages: all own" on public.ai_messages
  for all using (auth.uid() = uid) with check (auth.uid() = uid);

-- ---------- ai_usage (лимиты Free/Pro — читает и пишет только Edge Function) ----------
create table if not exists public.ai_usage (
  uid uuid not null references auth.users(id) on delete cascade,
  period text not null,       -- например '2026-08' (месяц)
  mode text not null,
  count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (uid, period, mode)
);

alter table public.ai_usage enable row level security;
-- Обычные пользователи не читают/не пишут напрямую — только через
-- Edge Function с service_role ключом. Политик select/insert намеренно нет.
