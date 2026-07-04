// LifeOS chat edge function (OPTIONAL — powers the in-app CHAT tab).
// Deploy as function name "chat" (verify_jwt ON). Costs ~$2-6/month via the
// user's own Anthropic API key (secret: ANTHROPIC_API_KEY).
// REPLACE: __OWNER_EMAIL__ (lowercase) and the __PERSONAL_CONTEXT__ block.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const OWNER = '__OWNER_EMAIL__';
const MODEL = 'claude-haiku-4-5';

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYS_STATIC = `You are the chat interface to the user's LifeOS — their personal task/energy/streak system, backed by Postgres.

DATA MODEL (schema public):
tasks(id uuid, title, project, status[not_started|in_progress|done|blocked], deadline_type[hard|self_imposed], due date, energy[DEEP|FOCUS|LIGHT|PARALLEL], parallel bool, est_minutes int, priority[high|med|low], notes, chunk_index, chunk_total, bucket[active|backlog], created_at, completed_at, partial_date)
daily_log(date pk, score, streak_hit, streak_count, rest_day, wake_time, focus, energy_now, started_with_start_here, read_brief, notes_*)
weekly_goals(id, name, target_per_week, est_minutes, energy, priority, active) + goal_logs(id, goal_id, date)
briefs(date pk, content_md, start_here_task, plan jsonb) · cards(spaced-repetition flashcards)
Done Log = tasks with status='done'; done rows are NEVER deleted. Chunked tasks carry "(i/N)" in the title.

ENERGY METHODOLOGY: DEEP = full focus, peak energy. FOCUS = attention, not peak. LIGHT = admin, low effort. PARALLEL = doable alongside something else.
__PERSONAL_CONTEXT__
(^ Replace with the user's schedule constraints, peak hours, energy ceilings, sleep target — 5-10 lines. Ask them.)

HOW TO ANSWER: You have the full task list and recent history in LIVE CONTEXT — reason over it directly, weigh due dates vs energy vs time of day, give ONE clear recommendation with a one-line why. Use execute_sql ONLY for writes or data missing from context.

WRITE VERBS:
- "done with X" -> update tasks set status='done', completed_at=now(), partial_date=null where title ilike '%X%'; (multiple matches: ask which). Confirm + suggest next.
- "partway on X" -> status='in_progress', partial_date=current_date.
- "skip/defer X" -> self_imposed: due = due + 1; hard: warn first.
- "add task: ..." -> insert with best-guess fields (est 15 default, energy LIGHT unless obviously deeper). Confirm.
- goal done -> insert into goal_logs (goal_id, date) values ((select id from weekly_goals where name ilike '%...%'), current_date);
- "rest day" -> insert into daily_log (date, rest_day) values (current_date, true) on conflict (date) do update set rest_day = true;

SCORING (Option A): priority high=3 med=2 low=1; energy DEEP=3 FOCUS=2 LIGHT/PARALLEL=1; time_norm = est/max_est_today; weight=(p/3+e/3+time_norm)/3; partial 0.5x; score=(done/plan weights)*100 +2 if read brief, cap 100, hit >= 70. Plan = briefs.plan jsonb.

TONE: Direct, concise, confident. Keep replies short (mobile chat). If a tool call errors, quote the actual error.`;

// deno-lint-ignore no-explicit-any
async function fetchContext(supa: any): Promise<string> {
  const now = new Date().toLocaleString('en-US', { timeZone: '__TIMEZONE__', dateStyle: 'full', timeStyle: 'short' });
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: '__TIMEZONE__' });
  const [tasks, brief, logs, goals, goalLogs] = await Promise.all([
    supa.from('tasks').select('title,project,status,deadline_type,due,energy,est_minutes,priority,bucket,partial_date,completed_at')
      .or(`status.neq.done,completed_at.gte.${today}`).order('due', { ascending: true, nullsFirst: false }).limit(120),
    supa.from('briefs').select('start_here_task,plan').eq('date', today).maybeSingle(),
    supa.from('daily_log').select('*').order('date', { ascending: false }).limit(3),
    supa.from('weekly_goals').select('id,name,target_per_week,est_minutes,energy').eq('active', true),
    supa.from('goal_logs').select('goal_id,date').gte('date', new Date(Date.now() - 7 * 864e5).toLocaleDateString('sv-SE')),
  ]);
  const rows = (tasks.data || []).map((t: Record<string, unknown>) => {
    const bits = [t.title, t.project || '-', t.status, t.energy || '-', t.est_minutes ? t.est_minutes + 'm' : '-',
      t.due ? 'due ' + t.due : 'no due', t.deadline_type || '-', t.priority, t.bucket];
    if (t.partial_date === today) bits.push('PARTIAL-TODAY');
    if ((t.completed_at || '').toString().slice(0, 10) === today) bits.push('DONE-TODAY');
    return bits.join(' | ');
  }).join('\n');
  const goalCounts = (goals.data || []).map((g: Record<string, unknown>) => {
    const n = (goalLogs.data || []).filter((l: Record<string, unknown>) => l.goal_id === g.id).length;
    return `${g.name}: ${n}/${g.target_per_week} this week`;
  }).join(' · ');
  const b = brief.data;
  return `=== LIVE CONTEXT (pre-fetched just now — trust this over guesses) ===\nCurrent datetime: ${now}\n\nTASKS (title | project | status | energy | est | due | deadline | priority | bucket):\n${rows || '(none)'}\n\nTODAY'S BRIEF: ${b ? `START HERE: ${b.start_here_task || '(none marked)'}${b.plan ? ' · plan: ' + JSON.stringify(b.plan) : ''}` : '(no brief today)'}\n\nRECENT DAILY LOG: ${JSON.stringify(logs.data || [])}\n\nWEEKLY GOALS: ${goalCounts || '(none)'}\n=== END CONTEXT ===`;
}

const tools = [{
  name: 'execute_sql',
  description: "Run ONE SQL statement against the LifeOS Postgres database. SELECT/read-CTE queries return rows as JSON. INSERT/UPDATE/DELETE return {rows_affected}. No DDL. One statement per call.",
  input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
}];

function normalize(messages: { role: string; content: unknown }[]) {
  const out: { role: string; content: unknown }[] = [];
  for (const m of messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role && typeof last.content === 'string' && typeof m.content === 'string') {
      last.content = last.content + '\n' + m.content;
    } else out.push({ role: m.role, content: m.content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user } } = await supa.auth.getUser(jwt);
    if (!user || (user.email || '').toLowerCase() !== OWNER) return json({ error: 'unauthorized' }, 401);

    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'ANTHROPIC_API_KEY secret is not set (Supabase dashboard -> Edge Functions -> Secrets).' }, 500);

    const body = await req.json();
    let convo = normalize((body.messages || []).slice(-24));
    if (!convo.length) return json({ error: 'no messages' }, 400);

    const ctx = await fetchContext(supa);
    const system = [
      { type: 'text', text: SYS_STATIC, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ctx, cache_control: { type: 'ephemeral' } },
    ];

    for (let i = 0; i < 6; i++) {
      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 1500, system, tools, messages: convo }),
      });
      const data = await resp.json();
      if (data.error) return json({ error: data.error.message || JSON.stringify(data.error) }, 500);
      if (data.stop_reason === 'tool_use') {
        const results: unknown[] = [];
        for (const block of data.content) {
          if (block.type === 'tool_use') {
            const q = (block.input?.query || '').toString();
            const { data: r, error } = await supa.rpc('lifeos_exec_sql', { q });
            const payload = error ? { error: error.message } : r;
            results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(payload).slice(0, 12000) });
          }
        }
        convo = [...convo, { role: 'assistant', content: data.content }, { role: 'user', content: results }];
        continue;
      }
      const text = (data.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('\n');
      return json({ reply: text || '(empty reply)' });
    }
    return json({ reply: 'Stopped after 6 tool rounds — try rephrasing.' });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
