// LifeOS regen-brief edge function (OPTIONAL — powers the "new brief" button).
// Deploy as function name "regen-brief" (verify_jwt ON).
// REPLACE: __OWNER_EMAIL__ (lowercase).
// Secrets needed: ROUTINE_TRIGGER_URL + ROUTINE_TRIGGER_TOKEN
// (from your morning-brief routine's API trigger at claude.ai/code/routines)
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const OWNER = '__OWNER_EMAIL__';
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '');
    const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: { user } } = await supa.auth.getUser(jwt);
    if (!user || (user.email || '').toLowerCase() !== OWNER) return json({ error: 'unauthorized' }, 401);

    const url = Deno.env.get('ROUTINE_TRIGGER_URL');
    const token = Deno.env.get('ROUTINE_TRIGGER_TOKEN');
    if (!url || !token) return json({ error: 'Add ROUTINE_TRIGGER_URL and ROUTINE_TRIGGER_TOKEN secrets (Supabase dashboard -> Edge Functions -> Secrets), from your routine API trigger settings.' }, 500);

    const r = await fetch(url, { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: '{}' });
    if (!r.ok) return json({ error: `Routine trigger failed: HTTP ${r.status} — ${(await r.text()).slice(0, 300)}` }, 502);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
