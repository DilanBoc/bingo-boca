import { randomInt } from 'crypto';
import { admin, getRoom, isHost, json } from '@/lib/supabaseAdmin';
import { isWinner } from '@/lib/bingo';

// Girar la balotera: saca un número y (si está activa) busca ganadores
export async function POST(req) {
  const { code, secret } = await req.json();
  const db = admin();
  const room = await getRoom(db, code);
  if (!room) return json({ error: 'Sala no encontrada.' }, 404);
  if (!(await isHost(db, room.id, secret))) return json({ error: 'Solo el anfitrión puede girar.' }, 403);
  if (room.status === 'finished') return json({ error: 'Ya hay ganador. Empieza una ronda nueva.' }, 409);

  const used = new Set(room.drawn);
  const left = [];
  for (let i = 1; i <= 75; i++) if (!used.has(i)) left.push(i);
  if (!left.length) return json({ error: 'Ya salieron las 75 balotas.' }, 409);

  const number = left[randomInt(left.length)];
  const drawn = [...room.drawn, number];

  let winners = [];
  if (room.auto_check) {
    const { data: cards } = await db.from('cards')
      .select('id, numero, grid, player_id, players(name)').eq('room_id', room.id);
    winners = (cards || [])
      .filter((c) => isWinner(c.grid, drawn, room.pattern))
      .map((c) => ({ cardId: c.id, numero: c.numero, playerId: c.player_id, name: c.players?.name || 'Jugador' }));
  }

  // drawn_count evita que dos giros simultáneos se pisen
  const { data: updated } = await db.from('rooms').update({
    drawn,
    drawn_count: drawn.length,
    status: winners.length ? 'finished' : 'playing',
    winners,
  }).eq('id', room.id).eq('drawn_count', room.drawn_count).select();

  if (!updated?.length) return json({ error: 'Giro duplicado, intenta de nuevo.' }, 409);
  return json({ number, winners });
}
