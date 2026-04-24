create extension if not exists pgcrypto;

create table if not exists public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'My Wishlist',
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create table if not exists public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_url text not null,
  title text,
  description text,
  image_url text,
  price numeric(12,2),
  currency text,
  site_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wishlist_id, source_url)
);

create index if not exists wishlist_items_wishlist_id_idx on public.wishlist_items (wishlist_id);
create index if not exists wishlists_share_token_idx on public.wishlists (share_token);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists wishlists_set_updated_at on public.wishlists;
create trigger wishlists_set_updated_at
before update on public.wishlists
for each row
execute function public.set_updated_at();

drop trigger if exists wishlist_items_set_updated_at on public.wishlist_items;
create trigger wishlist_items_set_updated_at
before update on public.wishlist_items
for each row
execute function public.set_updated_at();

alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;

drop policy if exists "wishlists_owner_select" on public.wishlists;
create policy "wishlists_owner_select"
on public.wishlists
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "wishlists_owner_insert" on public.wishlists;
create policy "wishlists_owner_insert"
on public.wishlists
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "wishlists_owner_update" on public.wishlists;
create policy "wishlists_owner_update"
on public.wishlists
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "wishlists_owner_delete" on public.wishlists;
create policy "wishlists_owner_delete"
on public.wishlists
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "wishlist_items_owner_select" on public.wishlist_items;
create policy "wishlist_items_owner_select"
on public.wishlist_items
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "wishlist_items_owner_insert" on public.wishlist_items;
create policy "wishlist_items_owner_insert"
on public.wishlist_items
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "wishlist_items_owner_update" on public.wishlist_items;
create policy "wishlist_items_owner_update"
on public.wishlist_items
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "wishlist_items_owner_delete" on public.wishlist_items;
create policy "wishlist_items_owner_delete"
on public.wishlist_items
for delete
to authenticated
using (auth.uid() = user_id);
