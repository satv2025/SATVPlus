-- ============================================================
-- SATV+ · Perfiles de visualización (máximo 10 por cuenta)
-- Ejecutar completo en Supabase > SQL Editor.
-- No elimina public.profiles: esa tabla sigue siendo el perfil de CUENTA.
-- ============================================================

begin;

-- 1) Reparar la sincronización auth.users -> public.profiles
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    username,
    phone
  )
  values (
    new.id,
    new.email,
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, public.profiles.full_name),
    username = coalesce(excluded.username, public.profiles.username),
    phone = coalesce(excluded.phone, public.profiles.phone);

  return new;
end;
$$;

-- Asegura el trigger, sin duplicarlo.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Completa cuentas antiguas que no tengan fila en public.profiles.
insert into public.profiles (id, email, full_name, username, phone)
select
  u.id,
  u.email,
  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
  case
    when nullif(btrim(u.raw_user_meta_data ->> 'username'), '') is null then null
    when exists (
      select 1
      from public.profiles p
      where lower(p.username) = lower(btrim(u.raw_user_meta_data ->> 'username'))
        and p.id <> u.id
    ) then null
    else nullif(btrim(u.raw_user_meta_data ->> 'username'), '')
  end,
  nullif(btrim(u.raw_user_meta_data ->> 'phone'), '')
from auth.users u
where not exists (
  select 1 from public.profiles p where p.id = u.id
)
on conflict (id) do nothing;

-- 2) Catálogo de avatares pregenerados
create table if not exists public.profile_avatars (
  avatar_key text primary key,
  label text not null,
  image_url text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint profile_avatars_key_chk
    check (avatar_key ~ '^[a-z0-9][a-z0-9_-]{1,39}$')
);

insert into public.profile_avatars (avatar_key, label, image_url, sort_order, active)
values
  ('nova',   'Nova',   '/images/profile-avatars/nova.svg',   10, true),
  ('pixel',  'Pixel',  '/images/profile-avatars/pixel.svg',  20, true),
  ('luna',   'Luna',   '/images/profile-avatars/luna.svg',   30, true),
  ('rayo',   'Rayo',   '/images/profile-avatars/rayo.svg',   40, true),
  ('cosmo',  'Cosmo',  '/images/profile-avatars/cosmo.svg',  50, true),
  ('mora',   'Mora',   '/images/profile-avatars/mora.svg',   60, true),
  ('neo',    'Neo',    '/images/profile-avatars/neo.svg',    70, true),
  ('sol',    'Sol',    '/images/profile-avatars/sol.svg',    80, true),
  ('nube',   'Nube',   '/images/profile-avatars/nube.svg',   90, true),
  ('fuego',  'Fuego',  '/images/profile-avatars/fuego.svg', 100, true),
  ('onda',   'Onda',   '/images/profile-avatars/onda.svg',  110, true),
  ('astro',  'Astro',  '/images/profile-avatars/astro.svg', 120, true)
on conflict (avatar_key) do update set
  label = excluded.label,
  image_url = excluded.image_url,
  sort_order = excluded.sort_order,
  active = excluded.active;

-- 3) Perfiles de visualización. Una cuenta puede tener hasta 10.
create table if not exists public.viewer_profiles (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  avatar_key text not null references public.profile_avatars(avatar_key),
  is_kids boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viewer_profiles_name_chk
    check (char_length(btrim(name)) between 1 and 30)
);

create index if not exists viewer_profiles_account_idx
  on public.viewer_profiles (account_id, created_at);

create unique index if not exists viewer_profiles_account_name_uidx
  on public.viewer_profiles (account_id, lower(btrim(name)));

-- updated_at
create or replace function public.set_viewer_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := btrim(new.name);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists viewer_profiles_set_updated_at on public.viewer_profiles;
create trigger viewer_profiles_set_updated_at
before insert or update on public.viewer_profiles
for each row execute function public.set_viewer_profile_updated_at();

-- Límite real y concurrente de 10 perfiles por cuenta.
create or replace function public.enforce_viewer_profile_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.account_id::text, 0));

  select count(*)
  into profile_count
  from public.viewer_profiles
  where account_id = new.account_id;

  if profile_count >= 10 then
    raise exception using
      errcode = 'P0001',
      message = 'PROFILE_LIMIT_REACHED',
      detail = 'Cada cuenta puede tener como máximo 10 perfiles.';
  end if;

  return new;
end;
$$;

drop trigger if exists viewer_profiles_limit_10 on public.viewer_profiles;
create trigger viewer_profiles_limit_10
before insert on public.viewer_profiles
for each row execute function public.enforce_viewer_profile_limit();

-- 4) RLS
alter table public.profile_avatars enable row level security;
alter table public.viewer_profiles enable row level security;

-- Limpieza idempotente de políticas de este script.
drop policy if exists profile_avatars_read on public.profile_avatars;
drop policy if exists viewer_profiles_select_own on public.viewer_profiles;
drop policy if exists viewer_profiles_insert_own on public.viewer_profiles;
drop policy if exists viewer_profiles_update_own on public.viewer_profiles;
drop policy if exists viewer_profiles_delete_own on public.viewer_profiles;

create policy profile_avatars_read
on public.profile_avatars
for select
to anon, authenticated
using (active = true);

create policy viewer_profiles_select_own
on public.viewer_profiles
for select
to authenticated
using (account_id = auth.uid());

create policy viewer_profiles_insert_own
on public.viewer_profiles
for insert
to authenticated
with check (account_id = auth.uid());

create policy viewer_profiles_update_own
on public.viewer_profiles
for update
to authenticated
using (account_id = auth.uid())
with check (account_id = auth.uid());

create policy viewer_profiles_delete_own
on public.viewer_profiles
for delete
to authenticated
using (account_id = auth.uid());

grant select on public.profile_avatars to anon, authenticated;
grant select, insert, update, delete on public.viewer_profiles to authenticated;

commit;

-- Verificación rápida:
select 'profile_avatars' as table_name, count(*) as rows from public.profile_avatars
union all
select 'viewer_profiles', count(*) from public.viewer_profiles;
