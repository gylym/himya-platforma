alter table public.content_items
  add column if not exists item_type text not null default 'lesson'
  check (item_type in ('program','course','module','lesson','report'));

update public.content_items set item_type='program'
where path in ('/mektep','/universitet','/sabaktastyk-kopiri');
update public.content_items set item_type='program' where path='/mektep/teoriya';
update public.content_items set item_type='course'
where path in ('/mektep/oku-bagdarlamasy','/mektep/zhalpy-zhane-beyin','/mektep/ubt','/universitet/sillabus','/universitet/teoriya','/universitet/ozin-ozi-daiyndau','/korytyndy-diagnostika')
   or path ~ '^/mektep/teoriya/(7|8|9|10|11)-synyp$';
update public.content_items set item_type='report'
where path in ('/mektep/bilim-kartasy','/universitet/bilim-kartasy');

create index if not exists content_items_parent_type_order_idx
on public.content_items(parent_id, item_type, sort_order);
