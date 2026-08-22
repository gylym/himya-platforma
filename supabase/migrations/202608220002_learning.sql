alter table public.content_items
  add column if not exists video_url text not null default '',
  add column if not exists quiz_data jsonb not null default '{}'::jsonb;

alter table public.profiles add column if not exists email text;
update public.profiles p set email = u.email from auth.users u where p.id = u.id and p.email is null;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare requested text;
begin
  requested := new.raw_user_meta_data ->> 'role';
  insert into public.profiles(id, display_name, email, role)
  values (
    new.id,
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), ''),
    new.email,
    case when requested = 'university_student'
      then 'university_student'::public.app_role
      else 'student'::public.app_role
    end
  );
  return new;
end $$;

create table public.content_resources (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.content_items(id) on delete cascade,
  filename text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/octet-stream',
  size bigint not null default 0 check (size >= 0),
  created_at timestamptz not null default now()
);

create index content_resources_item_idx on public.content_resources(item_id, created_at);

create table public.user_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id uuid not null references public.content_items(id) on delete cascade,
  progress integer not null default 0 check (progress between 0 and 100),
  completed boolean not null default false,
  score integer check (score is null or score >= 0),
  max_score integer check (max_score is null or max_score > 0),
  view_count integer not null default 0 check (view_count >= 0),
  last_opened timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

create index user_progress_updated_idx on public.user_progress(updated_at desc);

alter table public.content_resources enable row level security;
alter table public.user_progress enable row level security;

create policy resources_read_published_or_admin on public.content_resources
for select using (
  exists (
    select 1 from public.content_items
    where content_items.id = content_resources.item_id
      and (content_items.is_published or public.is_admin())
  )
);
create policy resources_admin_insert on public.content_resources
for insert with check (public.is_admin());
create policy resources_admin_delete on public.content_resources
for delete using (public.is_admin());

create policy progress_read_self_or_admin on public.user_progress
for select using (user_id = auth.uid() or public.is_admin());
create policy progress_insert_self on public.user_progress
for insert with check (user_id = auth.uid() and not public.is_admin());
create policy progress_update_self on public.user_progress
for update using (user_id = auth.uid() and not public.is_admin())
with check (user_id = auth.uid() and not public.is_admin());

revoke all on public.content_resources, public.user_progress from anon, authenticated;
grant select on public.content_resources to anon, authenticated;
grant insert, delete on public.content_resources to authenticated;
grant select, insert, update on public.user_progress to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('content-assets', 'content-assets', true, 20971520)
on conflict (id) do update set public = true, file_size_limit = 20971520;

create policy content_assets_public_read on storage.objects
for select using (bucket_id = 'content-assets');
create policy content_assets_admin_insert on storage.objects
for insert with check (bucket_id = 'content-assets' and public.is_admin());
create policy content_assets_admin_delete on storage.objects
for delete using (bucket_id = 'content-assets' and public.is_admin());
