// Guarda la ronda terminada en el historial (para el marcador de la noche y para analizar).
export async function recordRound(db, room) {
  const [{ count: players }, { count: cards }] = await Promise.all([
    db.from('players').select('id', { count: 'exact', head: true }).eq('room_id', room.id),
    db.from('cards').select('id', { count: 'exact', head: true }).eq('room_id', room.id),
  ]);
  await db.from('rounds').insert({
    room_id: room.id, room_code: room.code, round: room.round,
    pattern: room.pattern, pattern2: room.pattern2, tiebreak: room.tiebreak,
    winners: room.winners, balls: room.drawn_count,
    players: players || 0, cards: cards || 0, started_at: room.round_started_at,
  });
}
