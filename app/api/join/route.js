import { admin, getRoom, json } from '@/lib/supabaseAdmin';
import { generateGrid } from '@/lib/bingo';

const MAX_PLAYERS = 50;      // personas por sala
const MAX_CARDS_EACH = 6;    // cartones por persona
const MAX_CARDS_ROOM = 300;  // cartones por sala

export async function POST(req) {
  const { code, name, count } = await req.json();
  const clean = String(name || '').trim().slice(0, 24);
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), MAX_CARDS_EACH);
  if (!clean) return json({ error: 'Escribe tu nombre para entrar.' }, 400);

  const db = admin();
  const room = await getRoom(db, code);
  if (!room) return json({ error: 'Esa sala no existe. Revisa el código.' }, 404);
  if (room.status === 'closed') return json({ error: 'Este bingo ya terminó.' }, 409);

  const [{ count: players }, { count: cardsInRoom }] = await Promise.all([
    db.from('players').select('id', { count: 'exact', head: true }).eq('room_id', room.id),
    db.from('cards').select('id', { count: 'exact', head: true }).eq('room_id', room.id),
  ]);
  if (players >= MAX_PLAYERS) return json({ error: `La sala está llena (máximo ${MAX_PLAYERS} personas).` }, 409);
  const free = MAX_CARDS_ROOM - (cardsInRoom || 0);
  if (free <= 0) return json({ error: `Ya no quedan cartones en esta sala (máximo ${MAX_CARDS_ROOM}).` }, 409);
  const take = Math.min(n, free);

  const { data: player, error } = await db.from('players')
    .insert({ room_id: room.id, name: clean }).select().single();
  if (error) return json({ error: 'No se pudo entrar a la sala.' }, 500);

  // La base de datos impide números o cartones repetidos en la sala; si dos
  // personas entran al mismo tiempo y chocan, se reintenta con números nuevos.
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: last } = await db.from('cards').select('numero')
      .eq('room_id', room.id).order('numero', { ascending: false }).limit(1);
    const start = (last?.[0]?.numero || 0) + 1;
    const rows = Array.from({ length: take }, (_, i) => ({
      room_id: room.id, player_id: player.id, numero: start + i, grid: generateGrid(),
    }));
    const { data: cards, error: e } = await db.from('cards').insert(rows).select();
    if (!e) return json({ playerId: player.id, cards, capped: take < n ? take : null });
    if (e.code !== '23505') break; // otro error distinto a "repetido"
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 200));
  }
  await db.from('players').delete().eq('id', player.id);
  return json({ error: 'Mucha gente entrando a la vez. Intenta de nuevo.' }, 503);
}
