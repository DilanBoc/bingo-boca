-- Bingo familiar: pega esto en Supabase > SQL Editor > Run

create table if not exists rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  pattern text not null default 'lleno',
  auto_check boolean not null default true,
  drawn int[] not null default '{}',
  drawn_count int not null default 0,
  status text not null default 'lobby',   -- lobby | playing | finished
  winners jsonb not null default '[]',
  last_claim jsonb,
  round int not null default 1,
  created_at timestamptz not null default now()
);

-- El secreto del anfitrión vive aparte y sin políticas: nadie lo lee desde el navegador.
create table if not exists room_hosts (
  room_id uuid primary key references rooms(id) on delete cascade,
  secret text not null
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists cards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  numero int not null,
  grid int[] not null
);

create index if not exists cards_room_idx on cards(room_id);
create index if not exists cards_player_idx on cards(player_id);
create index if not exists players_room_idx on players(room_id);

alter table rooms enable row level security;
alter table room_hosts enable row level security;
alter table players enable row level security;
alter table cards enable row level security;

-- Lectura pública; todas las escrituras pasan por las rutas /api con la service role key.
create policy "leer salas" on rooms for select using (true);
create policy "leer jugadores" on players for select using (true);
create policy "leer cartones" on cards for select using (true);

-- Tiempo real
alter publication supabase_realtime add table rooms;
alter publication supabase_realtime add table players;
