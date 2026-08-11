create table characters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  universe text not null check (universe in ('MAR','DC','NAR','JJK','DS','BC','SL','HP')),
  alias text,
  note text,
  tier text check (tier in ('S','A','B','C','D')),
  image_url text,
  animation_url text,
  created_at timestamptz default now(),
  unique(name, universe)
);

create index idx_characters_universe on characters(universe);git add supabase/migrations
git commit -m "Add characters table"
git push