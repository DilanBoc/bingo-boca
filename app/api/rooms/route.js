import { randomUUID } from 'crypto';
import { admin, json } from '@/lib/supabaseAdmin';
import { makeRoomCode } from '@/lib/bingo';

// Crear sala nueva
export async function POST() {
  const db = admin();
  for (let i = 0; i < 5; i++) {
    const code = makeRoomCode();
    const { data: room, error } = await db.from('rooms').insert({ code }).select().single();
    if (error) continue; // código repetido: intenta otro
    const secret = randomUUID();
    await db.from('room_hosts').insert({ room_id: room.id, secret });
    return json({ code, secret });
  }
  return json({ error: 'No se pudo crear la sala. Intenta de nuevo.' }, 500);
}
