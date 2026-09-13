-- SECURITY DEFINER bypasses content RLS, so quiz submission must enforce ancestor visibility.
-- Requires 202609130001_platform_repair.sql (public.content_is_visible).
begin;

create or replace function public.submit_quiz_attempt(p_item_id uuid, p_answers jsonb)
returns setof public.user_progress
language plpgsql
security definer
set search_path = ''
as $$
declare
  questions jsonb;
  question_count integer;
  calculated_score integer;
begin
  if auth.uid() is null or public.is_admin() then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'invalid_answers';
  end if;

  select quiz_data -> 'questions' into questions
  from public.content_items
  where id = p_item_id and is_published and public.content_is_visible(id);
  if not found then
    raise exception 'forbidden';
  end if;
  question_count := coalesce(jsonb_array_length(questions), 0);
  if question_count = 0 or jsonb_array_length(p_answers) <> question_count then
    raise exception 'answer_every_question';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_answers) with ordinality as answer(value, position)
    where jsonb_typeof(answer.value) <> 'number'
      or (answer.value #>> '{}')::integer < 0
      or (answer.value #>> '{}')::integer >= jsonb_array_length(questions -> ((answer.position - 1)::integer) -> 'options')
  ) then
    raise exception 'invalid_answer';
  end if;

  select count(*)::integer into calculated_score
  from jsonb_array_elements(p_answers) with ordinality as answer(value, position)
  where (answer.value #>> '{}')::integer = coalesce((questions -> ((answer.position - 1)::integer) ->> 'correct_index')::integer, 0);

  insert into public.user_progress
    (user_id,item_id,progress,completed,score,max_score,quiz_answers,attempt_count,tested_at,updated_at)
  values
    (auth.uid(),p_item_id,100,true,calculated_score,question_count,p_answers,1,now(),now())
  on conflict (user_id,item_id) do update set
    progress=100,
    completed=true,
    score=excluded.score,
    max_score=excluded.max_score,
    quiz_answers=excluded.quiz_answers,
    attempt_count=public.user_progress.attempt_count+1,
    tested_at=now(),
    updated_at=now();

  return query select * from public.user_progress
  where user_id=auth.uid() and item_id=p_item_id;
end;
$$;

revoke all on function public.submit_quiz_attempt(uuid,jsonb) from public;
grant execute on function public.submit_quiz_attempt(uuid,jsonb) to authenticated;

commit;
