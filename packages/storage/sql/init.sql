create table if not exists episodes (
  env text not null,
  variant text not null,
  episode_date text not null,
  title text not null,
  intro_content text not null,
  blog_content text not null,
  dialogue_json jsonb not null,
  stories_json jsonb not null,
  story_summaries_json jsonb not null,
  generated_at bigint not null,
  primary key (env, variant, episode_date)
);

create table if not exists workflow_runs (
  env text not null,
  variant text not null,
  episode_date text not null,
  phase text not null,
  status text not null,
  attempts integer not null default 0,
  error_message text,
  created_at bigint not null,
  updated_at bigint not null,
  primary key (env, variant, episode_date, phase)
);
