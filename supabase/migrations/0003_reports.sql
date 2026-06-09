-- reports: one per completed lesson; stores computed mastery + LLM study tips.
create table if not exists reports (
  id                    uuid primary key default gen_random_uuid(),
  lesson_id             uuid not null references lessons(id) on delete cascade,
  user_id               uuid not null,
  overall_score         numeric(5,2) not null,
  mastery_by_objective  jsonb not null default '[]',
  strengths             text[] not null default '{}',
  gaps                  text[] not null default '{}',
  study_tips            jsonb not null default '[]',
  created_at            timestamptz not null default now()
);

create unique index if not exists reports_lesson_id_uidx on reports(lesson_id);
create index if not exists reports_user_id_idx         on reports(user_id);
create index if not exists reports_lesson_id_idx       on reports(lesson_id);

alter table reports enable row level security;

create policy "Users see own reports"
  on reports for all
  using (auth.uid() = user_id);

-- Mark lesson completed when all objectives done.
alter table lessons
  add column if not exists completed_at timestamptz;
