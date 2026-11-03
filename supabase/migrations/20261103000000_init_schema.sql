-- Sloplomacy 1901 Database Schema (Supabase PostgreSQL)
-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Profiles Table (linked to Supabase auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone" 
  on public.profiles for select 
  using (true);

create policy "Users can update their own profile" 
  on public.profiles for update 
  using (auth.uid() = id);

-- Auto-create profile on auth signup trigger
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2. Multiplayer Games Table
create table if not exists public.multiplayer_games (
  id uuid primary key default uuid_generate_v4(),
  room_code text unique not null,
  name text not null,
  host_user_id uuid references auth.users(id) on delete set null,
  status text not null check (status in ('lobby', 'in_progress', 'completed')),
  phase text not null default 'Movement',
  season text not null default 'Spring',
  year integer not null default 1901,
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.multiplayer_games enable row level security;

create policy "Games are viewable by all logged-in players"
  on public.multiplayer_games for select
  using (true);

create policy "Authenticated users can create games"
  on public.multiplayer_games for insert
  with check (auth.role() = 'authenticated');

create policy "Host can update game"
  on public.multiplayer_games for update
  using (auth.uid() = host_user_id);

-- 3. Game Participants (Power assignments)
create table if not exists public.game_participants (
  id uuid primary key default uuid_generate_v4(),
  game_id uuid references public.multiplayer_games(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  power text not null,
  is_ready boolean not null default false,
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(game_id, power),
  unique(game_id, user_id)
);

alter table public.game_participants enable row level security;

create policy "Participants are viewable by everyone"
  on public.game_participants for select
  using (true);

create policy "Authenticated users can join games"
  on public.game_participants for insert
  with check (auth.role() = 'authenticated');

create policy "Users can update their own participant record"
  on public.game_participants for update
  using (auth.uid() = user_id);
