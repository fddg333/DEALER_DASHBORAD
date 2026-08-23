-- Run this once in your Supabase project's SQL Editor
-- (Dashboard -> SQL Editor -> New query -> paste this -> Run)

create table dealers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  created_at timestamptz default now()
);

create table purchases (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid references dealers(id) on delete cascade,
  product text not null,
  qty numeric not null,
  rate numeric not null,
  date date not null,
  created_at timestamptz default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  dealer_id uuid references dealers(id) on delete cascade,
  amount numeric not null,
  date date not null,
  note text,
  created_at timestamptz default now()
);

-- Row level security is left off since all access goes through the app's
-- server-side API routes using the service role key, not directly from the browser.
