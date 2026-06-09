-- Enable pgvector extension
create extension if not exists vector;

-- Lessons table
create table if not exists lessons (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  title       text,
  file_url    text not null,
  raw_text    text,
  lesson_plan jsonb,
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Chunks table with vector column (1536 = OpenAI ada-002; adjust for your embeddings model)
create table if not exists chunks (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references lessons(id) on delete cascade,
  user_id     uuid not null,
  content     text not null,
  token_count int not null,
  chunk_index int not null,
  embedding   vector(1536),
  created_at  timestamptz not null default now()
);

-- Indexes
create index if not exists chunks_lesson_id_idx on chunks(lesson_id);
create index if not exists chunks_embedding_idx on chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- RLS
alter table lessons enable row level security;
alter table chunks  enable row level security;

create policy "Users see own lessons"
  on lessons for all
  using (auth.uid() = user_id);

create policy "Users see own chunks"
  on chunks for all
  using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lessons_updated_at
  before update on lessons
  for each row execute function update_updated_at();
