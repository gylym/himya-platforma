begin;
alter table public.content_resources add column if not exists title text not null default '';
alter table public.content_resources add column if not exists description text not null default '';
alter table public.content_resources add column if not exists subject text not null default '';
alter table public.content_resources add column if not exists category text not null default '';
alter table public.content_resources add column if not exists is_published boolean not null default true;
grant update(title,description,subject,category,is_published) on public.content_resources to authenticated;
create policy resources_admin_update on public.content_resources for update using(public.is_admin()) with check(public.is_admin());
alter table public.content_items add column if not exists description text not null default '';
alter table public.content_items add column if not exists subject text not null default 'Химия';
alter table public.content_items add column if not exists category text not null default 'Басқа';
alter table public.profiles add column if not exists username text;
create unique index if not exists profiles_username_unique on public.profiles(lower(username)) where username is not null;
alter table public.profiles add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,32}$');
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.profiles(id,display_name,email,username,role)
 values(new.id,nullif(btrim(new.raw_user_meta_data->>'display_name'),''),new.email,
 nullif(lower(btrim(new.raw_user_meta_data->>'username')),''),
 case when new.raw_user_meta_data->>'role'='university_student' then 'university_student'::public.app_role else 'student'::public.app_role end);
 return new;
end $$;
-- A hidden ancestor hides every descendant and its resources.
create or replace function public.content_is_visible(target uuid)
returns boolean language sql stable security definer set search_path='' as $$
 with recursive ancestors as (
 select id,parent_id,is_published,array[id] as visited,false as cycle from public.content_items where id=target
 union all
 select c.id,c.parent_id,c.is_published,a.visited||c.id,c.id=any(a.visited)
 from public.content_items c join ancestors a on c.id=a.parent_id where not a.cycle
 ) select coalesce(bool_and(is_published and not cycle),false) from ancestors;
$$;
revoke all on function public.content_is_visible(uuid) from public;
grant execute on function public.content_is_visible(uuid) to anon,authenticated;
drop policy if exists content_read_published_or_admin on public.content_items;
create policy content_read_published_or_admin on public.content_items for select using(public.is_admin() or public.content_is_visible(id));
drop policy if exists resources_read_published_or_admin on public.content_resources;
create policy resources_read_published_or_admin on public.content_resources for select using(public.is_admin() or (is_published and public.content_is_visible(item_id)));
-- Prepare storage access policies; switch the bucket private after frontend deployment.
drop policy if exists content_assets_public_read on storage.objects;
create policy content_assets_visible_read on storage.objects for select using (
 bucket_id='content-assets' and (public.is_admin() or exists(
 select 1 from public.content_resources r where r.storage_path=name and r.is_published and public.content_is_visible(r.item_id)
 ))
);
create or replace function public.prevent_content_cycle() returns trigger language plpgsql set search_path='' as $$
begin
 if new.parent_id=new.id or exists(with recursive parents as (
 select id,parent_id from public.content_items where id=new.parent_id
 union select c.id,c.parent_id from public.content_items c join parents p on c.id=p.parent_id
 ) select 1 from parents where id=new.id) then raise exception 'Бөлімді өз ішіне орналастыруға болмайды';end if;
 return new;
end $$;
create trigger content_no_cycles before insert or update of parent_id on public.content_items for each row execute function public.prevent_content_cycle();
create or replace function public.admin_set_user_role(target_user uuid,new_role public.app_role)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_admin() then raise exception 'forbidden';end if;
 if target_user=auth.uid() and new_role<>'admin' then raise exception 'Өз әкімші рөліңізді өзгертуге болмайды';end if;
 update public.profiles set role=new_role where id=target_user;
 if not found then raise exception 'user_not_found';end if;
end $$;
-- Only the Edge function's server credential can consume login rate limits.
create table public.login_rate_limits(key text primary key,window_start timestamptz not null default now(),attempts integer not null default 1);
alter table public.login_rate_limits enable row level security;
revoke all on public.login_rate_limits from anon,authenticated;
create function public.consume_login_attempt(rate_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare total integer;
begin
 insert into public.login_rate_limits(key) values(rate_key) on conflict(key) do update set
 attempts=case when public.login_rate_limits.window_start<now()-interval '15 minutes' then 1 else public.login_rate_limits.attempts+1 end,
 window_start=case when public.login_rate_limits.window_start<now()-interval '15 minutes' then now() else public.login_rate_limits.window_start end returning attempts into total;
 delete from public.login_rate_limits where window_start<now()-interval '1 day';
 return total<=10;
end $$;
revoke all on function public.consume_login_attempt(text) from public,anon,authenticated;
grant execute on function public.consume_login_attempt(text) to service_role;
create function public.material_popularity() returns table(item_id uuid,views bigint)
language sql stable security definer set search_path='' as $$
 select p.item_id,sum(p.view_count)::bigint from public.user_progress p
 where public.content_is_visible(p.item_id) group by p.item_id having sum(p.view_count)>0 order by sum(p.view_count) desc limit 20;
$$;
revoke all on function public.material_popularity() from public;
grant execute on function public.material_popularity() to anon,authenticated;
commit;
