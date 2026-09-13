begin;
-- Username login resolves email from profiles. Keep it aligned with confirmed Auth changes.
create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.profiles set email=new.email where id=new.id;
  return new;
end $$;
revoke all on function public.sync_profile_email() from public,anon,authenticated;
drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated after update of email on auth.users
for each row when (old.email is distinct from new.email)
execute function public.sync_profile_email();
update public.profiles p set email=u.email from auth.users u
where p.id=u.id and p.email is distinct from u.email;

-- Serialize admin-role changes and preserve at least one administrator.
create or replace function public.admin_set_user_role(target_user uuid,new_role public.app_role)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(846201);
  if not public.is_admin() then raise exception 'forbidden';end if;
  if new_role is null then raise exception 'invalid_role';end if;
  if target_user=auth.uid() and new_role<>'admin' then
    raise exception 'Өз әкімші рөліңізді өзгертуге болмайды';
  end if;
  if new_role<>'admin' and exists(select 1 from public.profiles where id=target_user and role='admin')
    and (select count(*) from public.profiles where role='admin')<=1 then
    raise exception 'Кемінде бір әкімші қалуы керек';
  end if;
  update public.profiles set role=new_role where id=target_user;
  if not found then raise exception 'user_not_found';end if;
end $$;
commit;
