'use client';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from './supabaseClient';

// Estado de la sala en vivo: tiempo real + consulta cada 5 s como respaldo
// (un celular que se durmió o perdió señal se pone al día solo).
export function useRoom(code) {
  const [room, setRoom] = useState(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase().from('rooms').select('*')
      .eq('code', String(code).toUpperCase()).maybeSingle();
    if (data) setRoom(data);
    else setMissing(true);
  }, [code]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  useEffect(() => {
    if (!room?.id) return;
    const ch = supabase()
      .channel('room-' + room.id)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}` },
        (p) => setRoom(p.new))
      .subscribe();
    return () => { supabase().removeChannel(ch); };
  }, [room?.id]);

  return { room, setRoom, missing, reload: load };
}
