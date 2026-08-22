alter table public.content_items
  add column if not exists content_mode text not null default 'curriculum'
  check (content_mode in ('curriculum','resources'));

update public.content_items
set content_mode = 'resources'
where path in ('/mektep/oku-bagdarlamasy','/universitet/sillabus');
