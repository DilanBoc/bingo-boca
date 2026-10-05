import { admin, getRoom, json } from '@/lib/supabaseAdmin';
import { generateGrid } from '@/lib/bingo';

const MAX_CARDS_EACH = 6;
const MAX_CARDS_ROOM = 300;

// Antes de la primera balota, cada persona puede agregar o quitar cartones desde su celular.
export async function POST(req) {
  const { code, playerId, add, removeCardId } = await req.json();
  const db = admin();
  const room = await getRoom(db, code);
  if (!room) return json({ error: 'Sala no encontrada.' }, 404);
  if (room.status === 'closed') return json({ error: 'Este bingo ya terminó.' }, 409);
  if (room.drawn_count > 0) return json({ error: 'Ya empezó la ronda. Podrás cambiar tus cartones en la próxima.' }, 409);

  const { data: player } = await db.from('players').select('id').eq('id', playerId).eq('room_id', room.id).maybeSingle();
  if (!player) return json({ error: 'No estás en esta sala.' }, 403);
  const { data: mine } = await db.from('cards').select('id').eq('player_id', playerId);

  if (removeCardId) {
    if ((mine?.length || 0) <= 1) return json({ error: 'Necesitas al menos un cartón para jugar.' }, 409);
    await db.from('cards').delete().eq('id', removeCardId).eq('player_id', playerId);
  } else {
    const want = Math.max(1, Math.min(parseInt(add, 10) || 1, MAX_CARDS_EACH));
    const room_left = MAX_CARDS_ROOM - ((await db.from('cards').select('id', { count: 'exact', head: true }).eq('room_id', room.id)).count || 0);
    const take = Math.min(want, MAX_CARDS_EACH - (mine?.length || 0), room_left);
    if (take <= 0) return json({ error: `Ya tienes el máximo de ${MAX_CARDS_EACH} cartones.` }, 409);
    let ok = false;
    for (let attempt = 0; attempt < 6 && !ok; attempt++) {
      const { data: last } = await db.from('cards').select('numero').eq('room_id', room.id).order('numero', { ascending: false }).limit(1);
      const start = (last?.[0]?.numero || 0) + 1;
      const rows = Array.from({ length: take }, (_, i) => ({ room_id: room.id, player_id: playerId, numero: start + i, grid: generateGrid() }));
      const { error } = await db.from('cards').insert(rows);
      ok = !error;
      if (error && error.code !== '23505') break;
      if (!ok) await new Promise((r) => setTimeout(r, 80 + Math.random() * 200));
    }
    if (!ok) return json({ error: 'No se pudo agregar el cartón. Intenta otra vez.' }, 503);
  }
  await db.from('rooms').update({ roster_version: (room.roster_version || 0) + 1 }).eq('id', room.id);
  const { data: cards } = await db.from('cards').select('id, numero, grid').eq('player_id', playerId).order('numero');
  return json({ cards });
}
