create or replace function public.admin_reorder_content(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected_ids uuid[];
  target_parent uuid;
  target_area public.content_area;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then
    raise exception 'invalid_order';
  end if;
  if (select count(distinct value) from unnest(p_ids) as value) <> cardinality(p_ids) then
    raise exception 'duplicate_ids';
  end if;

  select parent_id, area into target_parent, target_area
  from public.content_items where id = p_ids[1];

  select array_agg(id order by id) into expected_ids
  from public.content_items
  where area = target_area and parent_id is not distinct from target_parent;

  if expected_ids is distinct from (select array_agg(value order by value) from unnest(p_ids) as value) then
    raise exception 'stale_or_cross_parent_order';
  end if;

  update public.content_items as item
  set sort_order = ordered.position * 10,
      updated_at = now()
  from (
    select value as id, ordinality - 1 as position
    from unnest(p_ids) with ordinality as submitted(value, ordinality)
  ) as ordered
  where item.id = ordered.id;
end;
$$;

revoke all on function public.admin_reorder_content(uuid[]) from public;
grant execute on function public.admin_reorder_content(uuid[]) to authenticated;
