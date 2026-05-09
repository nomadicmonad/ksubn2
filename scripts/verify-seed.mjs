import { createClient } from '@supabase/supabase-js';

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const [{ count: entitiesCount, error: eErr }, { count: claimsCount, error: cErr }] = await Promise.all([
  sb.from('entities').select('*', { count: 'exact', head: true }),
  sb.from('claims').select('*', { count: 'exact', head: true }),
]);
if (eErr) throw eErr;
if (cErr) throw cErr;

const { data: sampleEntities } = await sb
  .from('entities')
  .select('id,name,type,wikipedia_url')
  .order('created_at', { ascending: false })
  .limit(5);

const { data: sampleClaims } = await sb
  .from('claims')
  .select('id,relation_type,description,source_domain')
  .order('created_at', { ascending: false })
  .limit(5);

console.log(JSON.stringify({ entitiesCount, claimsCount, sampleEntities, sampleClaims }, null, 2));
