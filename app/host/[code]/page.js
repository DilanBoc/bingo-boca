'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useRoom } from '@/lib/useRoom';
import { supabase } from '@/lib/supabaseClient';
import { LETTERS, PATTERNS } from '@/lib/bingo';
import { Ball, PatternMini } from '@/lib/ui';
import { callNumber, rattle, speak } from '@/lib/voice';

export default function Host() {
  const { code } = useParams();
  const { room, setRoom, missing } = useRoom(code);
  const [secret, setSecret] = useState(null);
  const [players, setPlayers] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [reveal, setReveal] = useState(0);
  const [err, setErr] = useState('');
  const [origin, setOrigin] = useState('');
  const announced = useRef('');
  const claimSeen = useRef(0);

  useEffect(() => {
    setSecret(localStorage.getItem('bingo-host-' + code) || '');
    setOrigin(window.location.origin);
  }, [code]);

  // Lista de jugadores (se refresca sola)
  useEffect(() => {
    if (!room?.id) return;
    const load = () => supabase().from('players').select('id, name').eq('room_id', room.id)
      .order('created_at').then(({ data }) => data && setPlayers(data));
    load();
    const t = setInterval(load, 6000);
    const ch = supabase().channel('players-' + room.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` }, load)
      .subscribe();
    return () => { clearInterval(t); supabase().removeChannel(ch); };
  }, [room?.id]);

  // Anunciar ganador y bingos falsos con voz
  useEffect(() => {
    if (!room) return;
    const key = room.round + ':' + room.winners.map((w) => w.cardId).join(',');
    if (room.winners.length && announced.current !== key) {
      announced.current = key;
      const names = room.winners.map((w) => `${w.name} con el cartón ${w.numero}`).join(' y ');
      setTimeout(() => speak(`¡Bingo! Ganó ${names}`), 1800);
    }
    if (room.last_claim && !room.last_claim.valid && room.last_claim.at > claimSeen.current) {
      claimSeen.current = room.last_claim.at;
      speak(`${room.last_claim.name} cantó bingo, pero todavía no`);
    }
  }, [room]);

  async function post(url, body) {
    setErr('');
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, secret, ...body }) });
    const d = await r.json();
    if (!r.ok) setErr(d.error || 'Algo falló.');
    return r.ok ? d : null;
  }

  async function spin() {
    if (spinning) return;
    setSpinning(true);
    rattle(1400);
    const [d] = await Promise.all([post('/api/draw', {}), new Promise((r) => setTimeout(r, 1500))]);
    setSpinning(false);
    if (d) {
      setRoom((prev) => prev && ({ ...prev, drawn: [...prev.drawn, d.number], drawn_count: prev.drawn_count + 1,
        status: d.winners.length ? 'finished' : 'playing', winners: d.winners }));
      setReveal((x) => x + 1);
      callNumber(d.number);
    }
  }

  async function settings(body) {
    const d = await post('/api/settings', body);
    if (d?.room) setRoom(d.room);
  }

  if (missing) return <main className="wrap"><h1>Esta sala no existe</h1><p className="muted">Vuelve al inicio y crea una nueva.</p></main>;
  if (!room || secret === null) return <main className="wrap"><p className="muted">Cargando sala…</p></main>;
  if (!secret) return <main className="wrap"><h1>Esta sala es de otro anfitrión</h1><p className="muted">Para jugar, entra como jugador en /sala/{room.code}.</p></main>;

  const last = room.drawn[room.drawn.length - 1];
  const drawnSet = new Set(room.drawn);
  const joinUrl = `${origin}/sala/${room.code}`;
  const canPickPattern = room.drawn_count === 0;

  return (
    <main className="wrap" style={{ display: 'grid', gap: 28 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>Sala</p>
          <h1 style={{ fontSize: 48, lineHeight: 1 }}>{room.code}</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>{players.length} {players.length === 1 ? 'jugador' : 'jugadores'} · ronda {room.round}</p>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ background: '#fff', padding: 10, borderRadius: 12 }}>
            {origin && <QRCodeSVG value={joinUrl} size={132} />}
          </div>
          <p className="muted" style={{ maxWidth: 170, margin: 0, fontSize: 15 }}>Escanea para entrar con tu nombre y elegir cartones.</p>
        </div>
      </header>

      {room.winners.length > 0 && (
        <div className="banner">
          <h2>¡Bingo!</h2>
          {room.winners.map((w) => <p key={w.cardId} style={{ margin: 4, fontWeight: 800, fontSize: 20 }}>{w.name}, cartón {w.numero}</p>)}
          <button className="btn" style={{ marginTop: 10, background: 'var(--ink)', color: 'var(--chalk)' }}
            onClick={() => settings({ reset: true })}>Empezar ronda nueva</button>
        </div>
      )}
      {room.last_claim && !room.last_claim.valid && room.status !== 'finished' && (
        <p className="err" style={{ margin: 0 }}>{room.last_claim.name} cantó bingo con el cartón {room.last_claim.numero}, pero aún no lo completa.</p>
      )}

      <section style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18, justifyItems: 'center' }}>
          <div key={reveal} className={`drum ${spinning ? 'spinning' : reveal ? 'reveal' : ''}`}>
            <Ball n={spinning ? null : last} size={220} />
          </div>
          <button className="btn big" onClick={spin} disabled={spinning || room.status === 'finished' || room.drawn_count >= 75}>
            {spinning ? 'Girando…' : 'Girar balotera'}
          </button>
          {last && !spinning && <button className="btn ghost" onClick={() => callNumber(last)}>Repetir número</button>}
          <p className="muted" style={{ margin: 0 }}>{room.drawn_count} de 75 balotas</p>
          {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <label className="field">
            <span>Cómo se gana</span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <select value={room.pattern} disabled={!canPickPattern} onChange={(e) => settings({ pattern: e.target.value })} style={{ flex: 1 }}>
                {Object.entries(PATTERNS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
              <PatternMini k={room.pattern} />
            </div>
            {!canPickPattern && <span className="muted" style={{ fontSize: 14 }}>Se puede cambiar al empezar una ronda nueva.</span>}
          </label>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={room.auto_check} onChange={(e) => settings({ autoCheck: e.target.checked })}
              style={{ width: 22, height: 22 }} />
            <span>Detectar ganador automáticamente <span className="muted">(si lo apagas, gana quien cante ¡Bingo! y el sistema lo verifica)</span></span>
          </label>
          {room.status === 'playing' && (
            <button className="btn ghost" style={{ justifySelf: 'start' }}
              onClick={() => confirm('¿Reiniciar la ronda? Se borran las balotas que han salido.') && settings({ reset: true })}>
              Reiniciar ronda
            </button>
          )}
          {players.length > 0 && (
            <p className="muted" style={{ margin: 0, fontSize: 15 }}>En la sala: {players.map((p) => p.name).join(', ')}</p>
          )}
        </div>
      </section>

      <section className="board" aria-label="Balotas que han salido">
        {LETTERS.map((l, r) => (
          <div key={l} className={`board-row c-${l}`}>
            <b>{l}</b>
            {Array.from({ length: 15 }, (_, i) => r * 15 + i + 1).map((n) => (
              <div key={n} className={`cell75 ${drawnSet.has(n) ? 'on' : ''}`}>{n}</div>
            ))}
          </div>
        ))}
      </section>
    </main>
  );
}
