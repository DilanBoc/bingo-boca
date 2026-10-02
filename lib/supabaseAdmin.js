import { createClient } from '@supabase/supabase-js';

export function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
}

export async function getRoom(db, code) {
  const { data } = await db.from('rooms').select('*')
    .eq('code', String(code || '').toUpperCase()).maybeSingle();
  return data;
}

export async function isHost(db, roomId, secret) {
  const { data } = await db.from('room_hosts').select('secret').eq('room_id', roomId).maybeSingle();
  return !!data && !!secret && data.secret === secret;
}

export const json = (body, status = 200) => Response.json(body, { status });
