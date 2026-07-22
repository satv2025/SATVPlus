-- ============================================================
-- SATV+ · Perfiles de visualización (máximo 10 por cuenta)
-- V3: 50 avatares raster + foto propia por perfil con Storage.
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

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

-- 2) Catálogo de avatares pregenerados (50 PNG premium)
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

update public.profile_avatars
set active = false
where avatar_key !~ '^avatar-[0-9]{2}$';

insert into public.profile_avatars (avatar_key, label, image_url, sort_order, active)
values
  ('avatar-01', 'Avatar 01', '/images/profile-avatars/avatar-01.png', 10, true),
  ('avatar-02', 'Avatar 02', '/images/profile-avatars/avatar-02.png', 20, true),
  ('avatar-03', 'Avatar 03', '/images/profile-avatars/avatar-03.png', 30, true),
  ('avatar-04', 'Avatar 04', '/images/profile-avatars/avatar-04.png', 40, true),
  ('avatar-05', 'Avatar 05', '/images/profile-avatars/avatar-05.png', 50, true),
  ('avatar-06', 'Avatar 06', '/images/profile-avatars/avatar-06.png', 60, true),
  ('avatar-07', 'Avatar 07', '/images/profile-avatars/avatar-07.png', 70, true),
  ('avatar-08', 'Avatar 08', '/images/profile-avatars/avatar-08.png', 80, true),
  ('avatar-09', 'Avatar 09', '/images/profile-avatars/avatar-09.png', 90, true),
  ('avatar-10', 'Avatar 10', '/images/profile-avatars/avatar-10.png', 100, true),
  ('avatar-11', 'Avatar 11', '/images/profile-avatars/avatar-11.png', 110, true),
  ('avatar-12', 'Avatar 12', '/images/profile-avatars/avatar-12.png', 120, true),
  ('avatar-13', 'Avatar 13', '/images/profile-avatars/avatar-13.png', 130, true),
  ('avatar-14', 'Avatar 14', '/images/profile-avatars/avatar-14.png', 140, true),
  ('avatar-15', 'Avatar 15', '/images/profile-avatars/avatar-15.png', 150, true),
  ('avatar-16', 'Avatar 16', '/images/profile-avatars/avatar-16.png', 160, true),
  ('avatar-17', 'Avatar 17', '/images/profile-avatars/avatar-17.png', 170, true),
  ('avatar-18', 'Avatar 18', '/images/profile-avatars/avatar-18.png', 180, true),
  ('avatar-19', 'Avatar 19', '/images/profile-avatars/avatar-19.png', 190, true),
  ('avatar-20', 'Avatar 20', '/images/profile-avatars/avatar-20.png', 200, true),
  ('avatar-21', 'Avatar 21', '/images/profile-avatars/avatar-21.png', 210, true),
  ('avatar-22', 'Avatar 22', '/images/profile-avatars/avatar-22.png', 220, true),
  ('avatar-23', 'Avatar 23', '/images/profile-avatars/avatar-23.png', 230, true),
  ('avatar-24', 'Avatar 24', '/images/profile-avatars/avatar-24.png', 240, true),
  ('avatar-25', 'Avatar 25', '/images/profile-avatars/avatar-25.png', 250, true),
  ('avatar-26', 'Avatar 26', '/images/profile-avatars/avatar-26.png', 260, true),
  ('avatar-27', 'Avatar 27', '/images/profile-avatars/avatar-27.png', 270, true),
  ('avatar-28', 'Avatar 28', '/images/profile-avatars/avatar-28.png', 280, true),
  ('avatar-29', 'Avatar 29', '/images/profile-avatars/avatar-29.png', 290, true),
  ('avatar-30', 'Avatar 30', '/images/profile-avatars/avatar-30.png', 300, true),
  ('avatar-31', 'Avatar 31', '/images/profile-avatars/avatar-31.png', 310, true),
  ('avatar-32', 'Avatar 32', '/images/profile-avatars/avatar-32.png', 320, true),
  ('avatar-33', 'Avatar 33', '/images/profile-avatars/avatar-33.png', 330, true),
  ('avatar-34', 'Avatar 34', '/images/profile-avatars/avatar-34.png', 340, true),
  ('avatar-35', 'Avatar 35', '/images/profile-avatars/avatar-35.png', 350, true),
  ('avatar-36', 'Avatar 36', '/images/profile-avatars/avatar-36.png', 360, true),
  ('avatar-37', 'Avatar 37', '/images/profile-avatars/avatar-37.png', 370, true),
  ('avatar-38', 'Avatar 38', '/images/profile-avatars/avatar-38.png', 380, true),
  ('avatar-39', 'Avatar 39', '/images/profile-avatars/avatar-39.png', 390, true),
  ('avatar-40', 'Avatar 40', '/images/profile-avatars/avatar-40.png', 400, true),
  ('avatar-41', 'Avatar 41', '/images/profile-avatars/avatar-41.png', 410, true),
  ('avatar-42', 'Avatar 42', '/images/profile-avatars/avatar-42.png', 420, true),
  ('avatar-43', 'Avatar 43', '/images/profile-avatars/avatar-43.png', 430, true),
  ('avatar-44', 'Avatar 44', '/images/profile-avatars/avatar-44.png', 440, true),
  ('avatar-45', 'Avatar 45', '/images/profile-avatars/avatar-45.png', 450, true),
  ('avatar-46', 'Avatar 46', '/images/profile-avatars/avatar-46.png', 460, true),
  ('avatar-47', 'Avatar 47', '/images/profile-avatars/avatar-47.png', 470, true),
  ('avatar-48', 'Avatar 48', '/images/profile-avatars/avatar-48.png', 480, true),
  ('avatar-49', 'Avatar 49', '/images/profile-avatars/avatar-49.png', 490, true),
  ('avatar-50', 'Avatar 50', '/images/profile-avatars/avatar-50.png', 500, true)
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
  custom_avatar_url text null,
  is_kids boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint viewer_profiles_name_chk
    check (char_length(btrim(name)) between 1 and 30)
);

alter table public.viewer_profiles
  add column if not exists custom_avatar_url text;

create index if not exists viewer_profiles_account_idx
  on public.viewer_profiles (account_id, created_at);

create unique index if not exists viewer_profiles_account_name_uidx
  on public.viewer_profiles (account_id, lower(btrim(name)));

comment on column public.viewer_profiles.custom_avatar_url is
  'URL pública de la foto propia subida por el usuario para ese perfil.';

update public.viewer_profiles
set avatar_key = 'avatar-01'
where avatar_key !~ '^avatar-[0-9]{2}$'
  and custom_avatar_url is null;

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

-- 4) RLS de perfiles
alter table public.profile_avatars enable row level security;
alter table public.viewer_profiles enable row level security;

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

-- 5) Storage: foto propia del perfil
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'viewer-profile-photos',
  'viewer-profile-photos',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists viewer_profile_photos_public_read on storage.objects;
drop policy if exists viewer_profile_photos_insert_own on storage.objects;
drop policy if exists viewer_profile_photos_update_own on storage.objects;
drop policy if exists viewer_profile_photos_delete_own on storage.objects;

create policy viewer_profile_photos_public_read
on storage.objects
for select
to public
using (bucket_id = 'viewer-profile-photos');

create policy viewer_profile_photos_insert_own
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'viewer-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy viewer_profile_photos_update_own
on storage.objects
for update
to authenticated
using (
  bucket_id = 'viewer-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'viewer-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy viewer_profile_photos_delete_own
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'viewer-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;

-- ============================================================
-- 6) Progreso de reproducción por perfil de visualización
-- Cada perfil de una misma cuenta mantiene su propio historial.
-- ============================================================

begin;

alter table public.watch_progress
  add column if not exists viewer_profile_id uuid;

alter table public.watch_progress
  drop constraint if exists watch_progress_viewer_profile_id_fkey;

alter table public.watch_progress
  add constraint watch_progress_viewer_profile_id_fkey
  foreign key (viewer_profile_id)
  references public.viewer_profiles(id)
  on delete cascade;

update public.watch_progress wp
set viewer_profile_id = (
  select vp.id
  from public.viewer_profiles vp
  where vp.account_id = wp.user_id
  order by vp.created_at asc, vp.id asc
  limit 1
)
where wp.viewer_profile_id is null
  and exists (
    select 1
    from public.viewer_profiles vp
    where vp.account_id = wp.user_id
  );

alter table public.watch_progress
  drop constraint if exists watch_progress_user_id_movie_id_episode_id_key;

drop index if exists public.watch_progress_user_movie_episode_notnull_uidx;
drop index if exists public.watch_progress_user_movie_null_episode_uidx;

create unique index if not exists watch_progress_viewer_movie_uidx
  on public.watch_progress (viewer_profile_id, movie_id)
  where episode_id is null and viewer_profile_id is not null;

create unique index if not exists watch_progress_viewer_movie_episode_uidx
  on public.watch_progress (viewer_profile_id, movie_id, episode_id)
  where episode_id is not null and viewer_profile_id is not null;

create index if not exists watch_progress_viewer_updated_idx
  on public.watch_progress (viewer_profile_id, updated_at desc);

create or replace function public.sync_watch_progress_profile_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_id uuid;
begin
  if new.viewer_profile_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'VIEWER_PROFILE_REQUIRED',
      detail = 'El progreso debe pertenecer a un perfil de visualización.';
  end if;

  select vp.account_id
  into owner_id
  from public.viewer_profiles vp
  where vp.id = new.viewer_profile_id;

  if owner_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'VIEWER_PROFILE_NOT_FOUND';
  end if;

  new.user_id := owner_id;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists watch_progress_sync_profile_owner
  on public.watch_progress;

create trigger watch_progress_sync_profile_owner
before insert or update on public.watch_progress
for each row execute function public.sync_watch_progress_profile_owner();

alter table public.watch_progress enable row level security;

drop policy if exists "watch_progress_delete_own" on public.watch_progress;
drop policy if exists "watch_progress_insert_own" on public.watch_progress;
drop policy if exists "watch_progress_select_own" on public.watch_progress;
drop policy if exists "watch_progress_update_own" on public.watch_progress;
drop policy if exists "wp_delete" on public.watch_progress;
drop policy if exists "wp_insert" on public.watch_progress;
drop policy if exists "wp_select" on public.watch_progress;
drop policy if exists "wp_update" on public.watch_progress;
drop policy if exists "watch_progress_select_viewer_own" on public.watch_progress;
drop policy if exists "watch_progress_insert_viewer_own" on public.watch_progress;
drop policy if exists "watch_progress_update_viewer_own" on public.watch_progress;
drop policy if exists "watch_progress_delete_viewer_own" on public.watch_progress;

create policy watch_progress_select_viewer_own
on public.watch_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.viewer_profiles vp
    where vp.id = watch_progress.viewer_profile_id
      and vp.account_id = auth.uid()
  )
);

create policy watch_progress_insert_viewer_own
on public.watch_progress
for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.viewer_profiles vp
    where vp.id = watch_progress.viewer_profile_id
      and vp.account_id = auth.uid()
  )
);

create policy watch_progress_update_viewer_own
on public.watch_progress
for update
to authenticated
using (
  exists (
    select 1
    from public.viewer_profiles vp
    where vp.id = watch_progress.viewer_profile_id
      and vp.account_id = auth.uid()
  )
)
with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.viewer_profiles vp
    where vp.id = watch_progress.viewer_profile_id
      and vp.account_id = auth.uid()
  )
);

create policy watch_progress_delete_viewer_own
on public.watch_progress
for delete
to authenticated
using (
  exists (
    select 1
    from public.viewer_profiles vp
    where vp.id = watch_progress.viewer_profile_id
      and vp.account_id = auth.uid()
  )
);

grant select, insert, update, delete
on public.watch_progress
to authenticated;

comment on column public.watch_progress.viewer_profile_id is
  'Perfil de visualización propietario del progreso. Cada perfil mantiene progreso independiente.';

commit;

-- Verificaciones rápidas
select 'profile_avatars' as table_name, count(*) as rows from public.profile_avatars where active = true
union all
select 'viewer_profiles', count(*) from public.viewer_profiles
union all
select 'watch_progress_con_perfil', count(*) from public.watch_progress where viewer_profile_id is not null;
