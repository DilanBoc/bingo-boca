import { randomInt } from 'crypto';
import { admin, getRoom, isHost, json } from '@/lib/supabaseAdmin';
import { resolveStages } from '@/lib/bingo';

export async function POST(req) {
  const { code, secret } = await req.json();
  const db = admin();
  const room = await getRoom(db, code);
  if (!room) return json({ error: 'Sala no encontrada.' }, 404);
  if (!(await isHost(db, room.id, secret))) return json({ error: 'Solo el anfitrión puede girar.' }, 403);
  if (room.status === 'closed') return json({ error: 'Este bingo ya terminó.' }, 409);
  if (room.status === 'finished') return json({ error: 'La ronda terminó. Empieza una ronda nueva.' }, 409);

  const { count } = await db.from('cards').select('id', { count: 'exact', head: true }).eq('room_id', room.id);
  if (!count) return json({ error: 'Todavía no hay cartones en juego. Espera a que entre alguien.' }, 409);

  const used = new Set(room.drawn);
  const left = [];
  for (let i = 1; i <= 75; i++) if (!used.has(i)) left.push(i);
  if (!left.length) return json({ error: 'Ya salieron las 75 balotas.' }, 409);

  const number = left[randomInt(left.length)];
  const drawn = [...room.drawn, number];

  let next = { stage: room.stage, winners: room.winners, finished: false };
  // Con la balota 75 todos los cartones están completos: se revisa siempre para que nunca quede sin ganador.
  if (room.auto_check || drawn.length === 75) {
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
  }).eq('id', room.id).eq('drawn_count', room.drawn_count).eq('stage', room.stage).eq('status', room.status)
    .select().maybeSingle();

  if (!updated) return json({ error: 'Alguien cantó bingo justo ahora. Revisa y vuelve a girar.' }, 409);
  return json({ number, room: updated });
}
