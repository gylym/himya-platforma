create table public.site_settings (
  id text primary key,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.site_settings(id, settings)
values ('main', jsonb_build_object(
  'site_title', 'Үздіксіз білім беру платформасы',
  'font_family', 'Inter', 'base_size', 16,
  'background', '#070b14', 'surface', '#0f1627', 'text', '#f5f7ff',
  'school', '#20d7c3', 'university', '#8a8cff',
  'bridge', '#ffb648', 'diagnostic', '#ff6fae',
  'card_radius', 30, 'visual_effects', true
)) on conflict (id) do nothing;

alter table public.site_settings enable row level security;
create policy site_settings_public_read on public.site_settings for select using (true);
create policy site_settings_admin_update on public.site_settings
for update using (public.is_admin()) with check (public.is_admin());

revoke all on public.site_settings from anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant update(settings, updated_at) on public.site_settings to authenticated;
