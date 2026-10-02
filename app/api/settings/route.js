import { admin, getRoom, isHost, json } from '@/lib/supabaseAdmin';
import { PATTERNS } from '@/lib/bingo';

// Ajustes del anfitrión: patrón, detección automática y ronda nueva
export async function POST(req) {
  const { code, secret, pattern, autoCheck, reset } = await req.json();
  const db = admin();
  const room = await getRoom(db, code);
  if (!room) return json({ error: 'Sala no encontrada.' }, 404);
  if (!(await isHost(db, room.id, secret))) return json({ error: 'Solo el anfitrión cambia esto.' }, 403);

  const patch = {};
  if (pattern && PATTERNS[pattern]) {
    if (room.drawn_count > 0 && !reset) return json({ error: 'El patrón se elige antes de girar.' }, 409);
    patch.pattern = pattern;
  }
  if (typeof autoCheck === 'boolean') patch.auto_check = autoCheck;
  if (reset) Object.assign(patch, {
    drawn: [], drawn_count: 0, status: 'lobby', winners: [], last_claim: null, round: room.round + 1,
  });

  const { data } = await db.from('rooms').update(patch).eq('id', room.id).select().single();
  return json({ room: data });
}
