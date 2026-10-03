import { randomInt } from 'crypto';
import { admin, getRoom, isHost, json } from '@/lib/supabaseAdmin';
import { resolveStages } from '@/lib/bingo';

export async function POST(req) {
  const { code, secret } = await req.json();
  const db = admin();
  const room = await getRoom(db, code);
  if (!room) return json({ error: 'Sala no encontrada.' }, 404);
  if (!(await isHost(db, room.id, secret))) return json({ error: 'Solo el anfitrión puede girar.' }, 403);
  if (room.status === 'finished') return json({ error: 'El juego terminó. Empieza una ronda nueva.' }, 409);

  const used = new Set(room.drawn);
  const left = [];
  for (let i = 1; i <= 75; i++) if (!used.has(i)) left.push(i);
  if (!left.length) return json({ error: 'Ya salieron las 75 balotas.' }, 409);

  const number = left[randomInt(left.length)];
  const drawn = [...room.drawn, number];

  let next = { stage: room.stage, winners: room.winners, finished: false };
  if (room.auto_check) {
    const { data } = await db.from('cards')
      .select('id, numero, grid, player_id, players(name)').eq('room_id', room.id);
    const cards = (data || []).map((c) => ({
      grid: c.grid,
      info: { cardId: c.id, numero: c.numero, playerId: c.player_id, name: c.players?.name || 'Jugador' },
    }));
    next = resolveStages(room, drawn, cards);
  }

  const { data: updated } = await db.from('rooms').update({
    drawn,
    drawn_count: drawn.length,
    stage: next.stage,
    winners: next.winners,
    status: next.finished ? 'finished' : 'playing',
  }).eq('id', room.id).eq('drawn_count', room.drawn_count).select().single();

  if (!updated) return json({ error: 'Giro duplicado, intenta de nuevo.' }, 409);
  return json({ number, room: updated });
}
