-- mcqs: server-side storage — correctChoiceId never leaves the server.
create table if not exists mcqs (
  id                uuid primary key default gen_random_uuid(),
  lesson_id         uuid not null references lessons(id) on delete cascade,
  objective_id      text not null,
  question          text not null,
  choices           jsonb not null,
  correct_choice_id text not null,
  explanation       text not null,
  hint              text not null,
  source_chunk_ids  text[] not null default '{}',
  created_at        timestamptz not null default now()
);

-- attempts: one row per user answer submission.
create table if not exists attempts (
  id                 uuid primary key default gen_random_uuid(),
  mcq_id             uuid not null references mcqs(id) on delete cascade,
  lesson_id          uuid not null references lessons(id) on delete cascade,
  objective_id       text not null,
  user_id            uuid not null,
  selected_choice_id text not null,
  correct            boolean not null,
  attempt_number     int not null default 1,
  created_at         timestamptz not null default now()
);

create index if not exists mcqs_lesson_id_idx      on mcqs(lesson_id);
create index if not exists attempts_mcq_id_idx     on attempts(mcq_id);
create index if not exists attempts_lesson_id_idx  on attempts(lesson_id);

alter table mcqs     enable row level security;
alter table attempts enable row level security;

-- MCQs scoped to lesson owner (join-based; service role bypasses in practice).
create policy "Users see own lesson mcqs"
  on mcqs for all
  using (
    exists (
      select 1 from lessons
      where lessons.id = mcqs.lesson_id
        and lessons.user_id = auth.uid()
    )
  );

create policy "Users see own attempts"
  on attempts for all
  using (auth.uid() = user_id);
