import { admin, getRoom, json } from '@/lib/supabaseAdmin';
import { recordRound } from '@/lib/rounds';
import { resolveStages, isWinner, activePattern, hasSecondPrize } from '@/lib/bingo';

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

  // Un premio por persona: si ya ganó el primero y hay otros que pueden ganar, no aplica al segundo.
  const firstWinners = [...new Set(room.winners.filter((w) => (w.stage || 1) === 1).map((w) => w.playerId))];
  let othersExist = true;
  if (room.one_prize_each && hasSecondPrize(room)) {
    let q = db.from('cards').select('id', { count: 'exact', head: true }).eq('room_id', room.id);
    if (firstWinners.length) q = q.not('player_id', 'in', `(${firstWinners.join(',')})`);
    const { count } = await q;
    othersExist = count > 0;
    if (room.stage === 2 && firstWinners.includes(card.player_id) && othersExist)
      return json({ valid: false, reason: 'Ya ganaste el primer premio. El segundo es para otra persona.' });
  }
  const valid = isWinner(card.grid, room.drawn, activePattern(room));
  const claim = { name, numero: card.numero, valid, at: Date.now() };

  if (!valid) {
    await db.from('rooms').update({ last_claim: claim }).eq('id', room.id);
    return json({ valid });
  }

  // Solo se acredita este cartón; si otro bingo entró al mismo tiempo, se reintenta sobre el estado nuevo.
  const info = { cardId: card.id, numero: card.numero, playerId: card.player_id, name };
  let current = room;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (current.status === 'finished' || current.status === 'closed') break;
    if (current.winners.some((w) => w.cardId === card.id && w.stage === (current.stage || 1))) break;
    if (!isWinner(card.grid, current.drawn, activePattern(current))) break;
    const next = resolveStages(current, current.drawn, [{ grid: card.grid, info }], { fallbackToAll: !othersExist });
    const { data: ok } = await db.from('rooms').update({
      stage: next.stage,
      winners: next.winners,
      status: next.finished ? 'finished' : 'playing',
      last_claim: claim,
    }).eq('id', room.id).eq('stage', current.stage).eq('status', current.status)
      .eq('drawn_count', current.drawn_count).select('*').maybeSingle();
    if (ok) { if (ok.status === 'finished') await recordRound(db, ok); break; }
    current = await getRoom(db, code);
  }
  return json({ valid });
}
