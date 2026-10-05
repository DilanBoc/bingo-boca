import { admin, getRoom, isHost, json } from '@/lib/supabaseAdmin';
import { PATTERNS } from '@/lib/bingo';

export async function POST(req) {
  const body = await req.json();
  const { code, secret, pattern, pattern2, autoCheck, onePrizeEach, reset, newCards, close, removePlayer } = body;
  const db = admin();
  const room = await getRoom(db, code);
  if (!room) return json({ error: 'Sala no encontrada.' }, 404);
  if (!(await isHost(db, room.id, secret))) return json({ error: 'Solo el anfitrión cambia esto.' }, 403);

  if (close) {
    const { data } = await db.from('rooms').update({ status: 'closed' }).eq('id', room.id).select().single();
    return json({ room: data });
  }
  if (room.status === 'closed') return json({ error: 'Este bingo ya terminó.' }, 409);

  // Sacar a una persona: se borran ella y sus cartones; puede volver a entrar con el QR.
  if (removePlayer) {
    const { data: gone } = await db.from('players').delete()
      .eq('id', removePlayer).eq('room_id', room.id).select('id');
    if (!gone?.length) return json({ error: 'Esa persona ya no está en la sala.' }, 404);
    const { data } = await db.from('rooms').update({ roster_version: (room.roster_version || 0) + 1 })
      .eq('id', room.id).select().single();
    return json({ room: data });
  }

  const changingPrizes = pattern !== undefined || 'pattern2' in body;
  if (changingPrizes && room.drawn_count > 0 && !reset)
    return json({ error: 'Los premios se eligen antes de girar.' }, 409);

  const patch = {};
  if (pattern && PATTERNS[pattern]) patch.pattern = pattern;
  if ('pattern2' in body) patch.pattern2 = pattern2 && PATTERNS[pattern2] ? pattern2 : null;
  if (typeof autoCheck === 'boolean') patch.auto_check = autoCheck;
  if (typeof onePrizeEach === 'boolean') {
    if (room.drawn_count > 0 && !reset) return json({ error: 'Esta regla se elige antes de girar.' }, 409);
    patch.one_prize_each = onePrizeEach;
  }
  if (reset && newCards) {
    const { error } = await db.rpc('regenerate_room_cards', { p_room: room.id });
    if (error) return json({ error: 'No se pudieron repartir cartones nuevos. Intenta otra vez.' }, 500);
  }
  if (reset) Object.assign(patch, {
    drawn: [], drawn_count: 0, status: 'lobby', winners: [], last_claim: null, stage: 1, round: room.round + 1,
  });

  const { data } = await db.from('rooms').update(patch).eq('id', room.id).select().single();
  return json({ room: data });
}
