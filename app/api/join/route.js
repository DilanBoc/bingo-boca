import { admin, getRoom, json } from '@/lib/supabaseAdmin';
import { generateGrid } from '@/lib/bingo';

// Unirse: crea el jugador y sus cartones
export async function POST(req) {
  const { code, name, count } = await req.json();
  const clean = String(name || '').trim().slice(0, 24);
  const n = Math.min(Math.max(parseInt(count, 10) || 1, 1), 6);
  if (!clean) return json({ error: 'Escribe tu nombre para entrar.' }, 400);

  const db = admin();
  const room = await getRoom(db, code);
  if (!room) return json({ error: 'Esa sala no existe. Revisa el código.' }, 404);
  if (room.status === 'closed') return json({ error: 'Este bingo ya terminó.' }, 409);

  const { data: player, error } = await db.from('players')
    .insert({ room_id: room.id, name: clean }).select().single();
  if (error) return json({ error: 'No se pudo entrar a la sala.' }, 500);

  const { data: last } = await db.from('cards').select('numero')
    .eq('room_id', room.id).order('numero', { ascending: false }).limit(1);
  const start = (last?.[0]?.numero || 0) + 1;

  const rows = Array.from({ length: n }, (_, i) => ({
    room_id: room.id, player_id: player.id, numero: start + i, grid: generateGrid(),
  }));
  const { data: cards } = await db.from('cards').insert(rows).select();
  return json({ playerId: player.id, cards });
}
