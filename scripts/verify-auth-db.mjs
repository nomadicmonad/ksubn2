import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const { data, error } = await sb.from('profiles').select('id, onboarding_completed').limit(3);
if (error) { console.error(error.message); process.exit(1); }
console.log(JSON.stringify({ ok:true, rows:data?.length ?? 0, sample:data }, null, 2));
