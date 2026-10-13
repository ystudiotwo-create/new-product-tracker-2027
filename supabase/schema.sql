-- 2027 新品開發進度：Supabase schema
-- Every app document lives in public.docs (collection, id, data jsonb), mirroring the original Artifact database.
-- Access: only signed-in accounts on the company domain; roster (people) and reminderLog are admin-only writes.

create table if not exists public.docs (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
alter table public.docs replica identity full;

create table if not exists public.admins (email text primary key);

create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  email text
);

create or replace function public.is_member() returns boolean
language sql stable as $$
  select coalesce(auth.jwt()->>'email','') ilike '%@ystudiostyle.com'
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_member() and exists (
    select 1 from public.admins where lower(email) = lower(auth.jwt()->>'email'))
$$;

-- top-level merge, like Firestore update(); creates the doc if missing
create or replace function public.doc_merge(p_collection text, p_id text, p_patch jsonb)
returns public.docs language sql security invoker set search_path = public as $$
  insert into public.docs (collection, id, data) values (p_collection, p_id, p_patch)
  on conflict (collection, id) do update set data = public.docs.data || excluded.data, updated_at = now()
  returning *
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', new.email), new.email)
  on conflict (id) do update set name = excluded.name, email = excluded.email;
  return new;
end $$;
drop trigger if exists on_auth_user_saved on auth.users;
create trigger on_auth_user_saved after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- row level security
alter table public.docs enable row level security;
alter table public.admins enable row level security;
alter table public.profiles enable row level security;

drop policy if exists docs_read on public.docs;
drop policy if exists docs_insert on public.docs;
drop policy if exists docs_update on public.docs;
drop policy if exists docs_delete on public.docs;
create policy docs_read on public.docs for select to authenticated using (public.is_member());
create policy docs_insert on public.docs for insert to authenticated with check (
  public.is_member()
  and (collection not in ('people','reminderLog') or public.is_admin())
  and (collection <> 'claims' or id = auth.uid()::text or public.is_admin()));
create policy docs_update on public.docs for update to authenticated
  using (public.is_member()
    and (collection not in ('people','reminderLog') or public.is_admin())
    and (collection <> 'claims' or id = auth.uid()::text or public.is_admin()))
  with check (public.is_member()
    and (collection not in ('people','reminderLog') or public.is_admin())
    and (collection <> 'claims' or id = auth.uid()::text or public.is_admin()));
create policy docs_delete on public.docs for delete to authenticated using (
  public.is_member()
  and (collection not in ('people','reminderLog') or public.is_admin())
  and (collection <> 'claims' or id = auth.uid()::text or public.is_admin()));

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated using (public.is_member());

revoke all on public.docs, public.admins, public.profiles from anon;
grant select, insert, update, delete on public.docs to authenticated;
grant select on public.profiles to authenticated;
revoke execute on function public.doc_merge(text, text, jsonb) from public, anon;
grant execute on function public.doc_merge(text, text, jsonb) to authenticated;
grant execute on function public.is_admin() to authenticated;

-- realtime
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- file storage: private bucket, members can read and upload
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('files', 'files', false, 20971520, array['image/*','application/pdf'])
on conflict (id) do nothing;
drop policy if exists files_read on storage.objects;
drop policy if exists files_upload on storage.objects;
create policy files_read on storage.objects for select to authenticated using (bucket_id = 'files' and public.is_member());
create policy files_upload on storage.objects for insert to authenticated with check (bucket_id = 'files' and public.is_member());

insert into public.admins (email) values ('ystudio.two@ystudiostyle.com') on conflict do nothing;
