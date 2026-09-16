begin;
create table if not exists public.game_results (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 game_id text not null default 'redox-v1' check(game_id='redox-v1'),
 level text not null check(level in ('beginner','intermediate','advanced')),
 answers jsonb not null,
 score integer not null check(score between 0 and 300),
 max_score integer not null default 300 check(max_score=300),
 created_at timestamptz not null default now()
);
create index if not exists game_results_owner_date on public.game_results(user_id,created_at desc);
alter table public.game_results enable row level security;
revoke all on public.game_results from anon,authenticated;
grant select on public.game_results to authenticated;
create policy game_results_owner_read on public.game_results for select to authenticated using(user_id=(select auth.uid()));
-- No client INSERT/UPDATE/DELETE grant. The server computes all scores.
create or replace function public.submit_redox_game(p_id uuid,p_level text,p_answers jsonb)
returns public.game_results language plpgsql security definer set search_path='' as $$
declare expected jsonb; total integer:=0; i integer; result public.game_results;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 expected:=case p_level when 'beginner' then '[0,1,2]'::jsonb when 'intermediate' then '[2,0,1]'::jsonb when 'advanced' then '[1,2,0]'::jsonb else null end;
 if expected is null or p_answers is null or jsonb_typeof(p_answers)<>'array' then raise exception 'invalid_answers'; end if;
 if jsonb_array_length(p_answers)<>3 then raise exception 'invalid_answers'; end if;
 for i in 0..2 loop
  if jsonb_typeof(p_answers->i)<>'number' or (p_answers->>i) not in ('0','1','2') then raise exception 'invalid_answer'; end if;
  if p_answers->i=expected->i then total:=total+100; end if;
 end loop;
 insert into public.game_results(id,user_id,level,answers,score) values(p_id,auth.uid(),p_level,p_answers,total) on conflict(id) do nothing;
 select * into result from public.game_results where id=p_id and user_id=auth.uid();
 if not found then raise exception 'invalid_attempt'; end if;
 if result.level<>p_level or result.answers<>p_answers then raise exception 'attempt_already_saved'; end if;
 return result;
end $$;
revoke all on function public.submit_redox_game(uuid,text,jsonb) from public,anon;
grant execute on function public.submit_redox_game(uuid,text,jsonb) to authenticated;
commit;
