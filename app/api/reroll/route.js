import { admin, getRoom, json } from '@/lib/supabaseAdmin';
import { generateGrid } from '@/lib/bingo';

// Antes de que salga la primera balota, cada jugador puede cambiar los números
// de uno de sus cartones (cardId) o de todos (sin cardId). El número del cartón se mantiene.
export async function POST(req) {
  const { code, playerId, cardId } = await req.json();
  const db = admin();
  const room = await getRoom(db, code);
  if (!room) return json({ error: 'Sala no encontrada.' }, 404);
  if (room.status === 'closed') return json({ error: 'Este bingo ya terminó.' }, 409);
  if (room.drawn_count > 0) return json({ error: 'Ya empezó la ronda. Podrás cambiar números en la próxima.' }, 409);

  let q = db.from('cards').select('id').eq('room_id', room.id).eq('player_id', playerId);
  if (cardId) q = q.eq('id', cardId);
  const { data: mine } = await q;
  if (!mine?.length) return json({ error: 'Ese cartón no es tuyo.' }, 403);

  for (const { id } of mine) {
    let ok = false;
    for (let i = 0; i < 5 && !ok; i++) {
      const { error } = await db.from('cards').update({ grid: generateGrid() }).eq('id', id);
      ok = !error;
      if (error && error.code !== '23505') break;
    }
    if (!ok) return json({ error: 'No se pudieron cambiar los números. Intenta otra vez.' }, 500);
  }
  const { data: cards } = await db.from('cards').select('id, numero, grid')
    .eq('player_id', playerId).order('numero');
  return json({ cards });
}
