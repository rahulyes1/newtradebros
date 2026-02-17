create table if not exists public.user_trading_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trades jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_trading_data enable row level security;

create policy "Users can read their own trading data"
on public.user_trading_data
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own trading data"
on public.user_trading_data
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own trading data"
on public.user_trading_data
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
