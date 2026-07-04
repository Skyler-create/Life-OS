-- ============================================================
-- LifeOS v2 schema (template)
-- REPLACE ALL __OWNER_EMAIL__ with the user's email, LOWERCASE,
-- before running. Run once in the Supabase SQL editor or via MCP.
-- ============================================================

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  project text,
  status text not null default 'not_started' check (status in ('not_started','in_progress','done','blocked')),
  deadline_type text check (deadline_type in ('hard','self_imposed')),
  due date,
  energy text check (energy in ('DEEP','FOCUS','LIGHT','PARALLEL')),
  parallel boolean not null default false,
  est_minutes integer,
  priority text default 'med' check (priority in ('high','med','low')),
  notes text,
  chunk_index integer,
  chunk_total integer,
  bucket text not null default 'active' check (bucket in ('active','backlog')),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  partial_date date
);
create index tasks_status_idx on public.tasks (status);
create index tasks_due_idx on public.tasks (due);

create table public.daily_log (
  date date primary key,
  score numeric,
  streak_hit boolean,
  streak_count integer,
  rest_day boolean not null default false,
  tasks_planned integer,
  tasks_done integer,
  tasks_partial integer,
  wake_time text,
  focus integer,
  energy_now integer,
  started_with_start_here boolean,
  read_brief boolean,
  notes_tomorrow text,
  notes_new text,
  notes_check text,
  notes text
);

create table public.weekly_goals (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  target_per_week integer not null default 1,
  est_minutes integer,
  energy text,
  priority text,
  active boolean not null default true,
  sort integer
);

create table public.goal_logs (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.weekly_goals(id) on delete cascade,
  date date not null,
  note text
);
create index goal_logs_date_idx on public.goal_logs (date);

create table public.briefs (
  date date primary key,
  content_md text not null,
  start_here_task text,
  plan jsonb,
  created_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  front text not null,
  back text not null,
  topic text,
  category text,
  created_at timestamptz not null default now(),
  due date not null default current_date,
  interval_days integer not null default 0,
  ease numeric not null default 2.5,
  reps integer not null default 0,
  lapses integer not null default 0,
  suspended boolean not null default false
);
create index cards_due_idx on public.cards (due) where not suspended;

-- ---------- Row-level security: single user, locked to your email ----------
alter table public.tasks enable row level security;
alter table public.daily_log enable row level security;
alter table public.weekly_goals enable row level security;
alter table public.goal_logs enable row level security;
alter table public.briefs enable row level security;
alter table public.cards enable row level security;

create policy owner_all_tasks on public.tasks for all to authenticated
  using ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__') with check ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__');
create policy owner_all_daily_log on public.daily_log for all to authenticated
  using ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__') with check ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__');
create policy owner_all_weekly_goals on public.weekly_goals for all to authenticated
  using ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__') with check ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__');
create policy owner_all_goal_logs on public.goal_logs for all to authenticated
  using ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__') with check ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__');
create policy owner_all_briefs on public.briefs for all to authenticated
  using ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__') with check ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__');
create policy owner_all_cards on public.cards for all to authenticated
  using ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__') with check ((auth.jwt() ->> 'email') = '__OWNER_EMAIL__');

-- ---------- SQL executor for the optional chat edge function ----------
create or replace function public.lifeos_exec_sql(q text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  res jsonb; n int;
  qc text := regexp_replace(q, ';\s*$', '');
  ql text := lower(ltrim(qc));
begin
  if ql like 'drop%' or ql like 'truncate%' or ql like 'alter%' or ql like 'create%' or ql like 'grant%' or ql like 'revoke%' then
    return jsonb_build_object('error', 'DDL is not allowed from chat');
  end if;
  if ql like 'select%' or (ql like 'with%' and ql not like '%insert%' and ql not like '%update%' and ql not like '%delete%') then
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', qc) into res;
    return res;
  else
    execute qc;
    get diagnostics n = row_count;
    return jsonb_build_object('rows_affected', n);
  end if;
exception when others then
  return jsonb_build_object('error', sqlerrm);
end $$;
revoke all on function public.lifeos_exec_sql(text) from public;
revoke all on function public.lifeos_exec_sql(text) from anon;
revoke all on function public.lifeos_exec_sql(text) from authenticated;
grant execute on function public.lifeos_exec_sql(text) to service_role;

-- ---------- Live sync ----------
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.daily_log;
alter publication supabase_realtime add table public.goal_logs;
alter publication supabase_realtime add table public.briefs;
alter publication supabase_realtime add table public.weekly_goals;
alter publication supabase_realtime add table public.cards;
