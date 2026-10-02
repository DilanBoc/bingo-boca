import { admin, getRoom, json } from '@/lib/supabaseAdmin';
import { isWinner } from '@/lib/bingo';

// Un jugador canta ¡Bingo!: el servidor lo verifica contra las balotas que salieron
export async function POST(req) {
  const { code, cardId, playerId } = await req.json();
  const db = admin();
  const room = await getRoom(db, code);
  if (!room) return json({ error: 'Sala no encontrada.' }, 404);

  const { data: card } = await db.from('cards')
    .select('id, room_id, numero, grid, player_id, players(name)').eq('id', cardId).maybeSingle();
  if (!card || card.room_id !== room.id || card.player_id !== playerId)
    return json({ error: 'Ese cartón no es tuyo.' }, 403);

  const name = card.players?.name || 'Jugador';
  const valid = isWinner(card.grid, room.drawn, room.pattern);
  const claim = { name, numero: card.numero, valid, at: Date.now() };

  if (valid && room.status !== 'finished') {
    await db.from('rooms').update({
      status: 'finished',
      winners: [{ cardId: card.id, numero: card.numero, playerId: card.player_id, name }],
      last_claim: claim,
    }).eq('id', room.id);
  } else {
    await db.from('rooms').update({ last_claim: claim }).eq('id', room.id);
  }
  return json({ valid });
}
