create extension if not exists pgcrypto;

create type public.app_role as enum ('student', 'university_student', 'admin');
create type public.content_area as enum ('school', 'university', 'bridge', 'diagnostic');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role public.app_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.content_items (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.content_items(id) on delete cascade,
  area public.content_area not null,
  title text not null check (length(btrim(title)) > 0),
  path text not null unique check (path like '/%'),
  body text not null default '',
  sort_order integer not null default 0 check (sort_order >= 0),
  is_published boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_items_parent_order_idx on public.content_items(parent_id, sort_order);
create index content_items_area_published_idx on public.content_items(area, is_published);

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger content_updated_at before update on public.content_items
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested text;
begin
  requested := new.raw_user_meta_data ->> 'role';
  insert into public.profiles(id, display_name, role)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    case when requested = 'university_student'
      then 'university_student'::public.app_role
      else 'student'::public.app_role
    end
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'::public.app_role
  );
$$;

alter table public.profiles enable row level security;
alter table public.content_items enable row level security;

create policy profiles_read_self_or_admin on public.profiles
for select using (id = auth.uid() or public.is_admin());
create policy profiles_update_self_or_admin on public.profiles
for update using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy content_read_published_or_admin on public.content_items
for select using (is_published or public.is_admin());
create policy content_admin_insert on public.content_items
for insert with check (public.is_admin());
create policy content_admin_update on public.content_items
for update using (public.is_admin()) with check (public.is_admin());
create policy content_admin_delete on public.content_items
for delete using (public.is_admin());

revoke all on public.profiles, public.content_items from anon, authenticated;
grant select on public.profiles to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant select on public.content_items to anon, authenticated;
grant insert, update, delete on public.content_items to authenticated;

create or replace function public.admin_set_user_role(target_user uuid, new_role public.app_role)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'forbidden'; end if;
  update public.profiles set role = new_role where id = target_user;
  if not found then raise exception 'user_not_found'; end if;
end $$;

revoke all on function public.admin_set_user_role(uuid, public.app_role) from public;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated;
