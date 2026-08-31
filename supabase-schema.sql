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
  due_date date,
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

-- If your project was created before due_date existed, run this once instead of
-- recreating the table:
--   alter table purchases add column if not exists due_date date;
