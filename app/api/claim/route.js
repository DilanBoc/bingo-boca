import { admin, getRoom, json } from '@/lib/supabaseAdmin';
import { resolveStages, isWinner, activePattern } from '@/lib/bingo';

export async function POST(req) {
  const { code, cardId, playerId } = await req.json();
  const db = admin();
  const room = await getRoom(db, code);
  if (!room) return json({ error: 'Sala no encontrada.' }, 404);
  if (room.status === 'finished' || room.status === 'closed') return json({ error: 'El juego ya terminó.' }, 409);

  const { data: card } = await db.from('cards')
    .select('id, room_id, numero, grid, player_id, players(name)').eq('id', cardId).maybeSingle();
  if (!card || card.room_id !== room.id || card.player_id !== playerId)
    return json({ error: 'Ese cartón no es tuyo.' }, 403);

  const name = card.players?.name || 'Jugador';
  const valid = isWinner(card.grid, room.drawn, activePattern(room));
  const claim = { name, numero: card.numero, valid, at: Date.now() };

  if (!valid) {
    await db.from('rooms').update({ last_claim: claim }).eq('id', room.id);
    return json({ valid });
  }

  // Solo se acredita este cartón (quien cantó), y se revisa si también cerró la etapa 2.
  const info = { cardId: card.id, numero: card.numero, playerId: card.player_id, name };
  const next = resolveStages(room, room.drawn, [{ grid: card.grid, info }]);
  await db.from('rooms').update({
    stage: next.stage,
    winners: next.winners,
    status: next.finished ? 'finished' : 'playing',
    last_claim: claim,
  }).eq('id', room.id).eq('stage', room.stage);
  return json({ valid });
}
