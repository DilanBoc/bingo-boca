'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useRoom } from '@/lib/useRoom';
import { supabase } from '@/lib/supabaseClient';
import { LETTERS, PATTERNS, activePattern, hasSecondPrize, stageLabel } from '@/lib/bingo';
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
  const announced = useRef(null);
  const claimSeen = useRef(0);

  useEffect(() => {
    setSecret(localStorage.getItem('bingo-host-' + code) || '');
    setOrigin(window.location.origin);
  }, [code]);

  // Jugadores con su número de cartones
  useEffect(() => {
    if (!room?.id) return;
    const load = () => supabase().from('players').select('id, name, cards(count)').eq('room_id', room.id)
      .order('created_at').then(({ data }) => data && setPlayers(
        data.map((p) => ({ id: p.id, name: p.name, cards: p.cards?.[0]?.count || 0 }))));
    load();
    const t = setInterval(load, 6000);
    const ch = supabase().channel('players-' + room.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}` }, () => setTimeout(load, 800))
      .subscribe();
    return () => { clearInterval(t); supabase().removeChannel(ch); };
  }, [room?.id]);

  // Anunciar ganadores nuevos y bingos falsos con voz
  useEffect(() => {
    if (!room) return;
    const key = room.round + ':' + room.winners.length;
    if (announced.current === null) { announced.current = key; }
    else if (announced.current !== key) {
      const prevCount = announced.current.split(':')[0] == room.round ? +announced.current.split(':')[1] : 0;
      announced.current = key;
      const fresh = room.winners.slice(prevCount);
      if (fresh.length) {
        const byStage = {};
        fresh.forEach((w) => (byStage[w.stage] ||= []).push(`${w.name} con el cartón ${w.numero}`));
        const text = Object.entries(byStage).map(([s, names]) =>
          `¡${stageLabel(room, +s)}! Ganó ${names.join(' y ')}`).join('. ');
        const next = room.status !== 'finished' && hasSecondPrize(room)
          ? `. Seguimos jugando por ${PATTERNS[room.pattern2].label}` : '';
        setTimeout(() => speak(text + next), 1800);
      }
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
      setRoom(d.room);
      setReveal((x) => x + 1);
      callNumber(d.number);
    }
  }

  async function settings(body) {
    const d = await post('/api/settings', body);
    if (d?.room) setRoom(d.room);
  }

  const [busy, setBusy] = useState(false);
  async function newRound(newCards) {
    setBusy(true);
    await settings({ reset: true, newCards });
    setBusy(false);
    speak(newCards ? 'Nueva ronda con cartones nuevos' : 'Nueva ronda con los mismos cartones');
  }

  if (missing) return <main className="wrap"><h1>Esta sala no existe</h1><p className="muted">Vuelve al inicio y crea una nueva.</p></main>;
  if (!room || secret === null) return <main className="wrap"><p className="muted">Cargando sala…</p></main>;
  if (room.status === 'closed') return (
    <main className="wrap" style={{ display: 'grid', gap: 18, justifyItems: 'center', textAlign: 'center', paddingTop: 60 }}>
      <h1 style={{ fontSize: 44 }}>Bingo terminado</h1>
      <p className="muted" style={{ maxWidth: 420 }}>La sala {room.code} se cerró y sus datos se borran en unos minutos. ¡Gracias por jugar!</p>
      <a className="btn big" href="/" style={{ textDecoration: 'none' }}>Crear otra sala</a>
    </main>
  );
  if (!secret) return <main className="wrap"><h1>Esta sala es de otro anfitrión</h1><p className="muted">Para jugar, entra como jugador en /sala/{room.code}.</p></main>;

  const last = room.drawn[room.drawn.length - 1];
  const drawnSet = new Set(room.drawn);
  const joinUrl = `${origin}/sala/${room.code}`;
  const canPick = room.drawn_count === 0;
  const second = hasSecondPrize(room);
  const finished = room.status === 'finished';
  const totalCards = players.reduce((s, p) => s + p.cards, 0);
  const winnersOf = (s) => room.winners.filter((w) => (w.stage || 1) === s);

  return (
    <main className="wrap" style={{ display: 'grid', gap: 28 }}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>Sala</p>
          <h1 style={{ fontSize: 48, lineHeight: 1 }}>{room.code}</h1>
          <p className="muted" style={{ margin: '6px 0 0' }}>
            {players.length} {players.length === 1 ? 'jugador' : 'jugadores'} · {totalCards} {totalCards === 1 ? 'cartón' : 'cartones'} · ronda {room.round}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{ background: '#fff', padding: 10, borderRadius: 12 }}>
            {origin && <QRCodeSVG value={joinUrl} size={132} />}
          </div>
          <p className="muted" style={{ maxWidth: 170, margin: 0, fontSize: 15 }}>Escanea para entrar con tu nombre y elegir cartones.</p>
        </div>
      </header>

      {room.winners.length > 0 && (
        <div className={finished ? 'banner' : 'banner soft'}>
          {[1, 2].filter((s) => winnersOf(s).length).map((s) => (
            <div key={s} style={{ marginBottom: 6 }}>
              <h2 style={{ fontSize: finished ? undefined : 30 }}>¡{stageLabel(room, s)}!</h2>
              {winnersOf(s).map((w) => <p key={w.cardId + s} style={{ margin: 2, fontWeight: 800, fontSize: 20 }}>{w.name}, cartón {w.numero} · {PATTERNS[w.pattern || room.pattern]?.label}</p>)}
            </div>
          ))}
          {!finished && second && <p style={{ margin: '6px 0 0', fontWeight: 800 }}>Seguimos: ahora se juega por {PATTERNS[room.pattern2].label}</p>}
          {finished && (
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
              <button className="btn" style={{ background: 'var(--ink)', color: 'var(--chalk)' }} disabled={busy}
                onClick={() => newRound(false)}>Jugar otra vez · mismos cartones</button>
              <button className="btn" style={{ background: 'var(--chalk)', color: 'var(--ink)' }} disabled={busy}
                onClick={() => newRound(true)}>Jugar otra vez · cartones nuevos</button>
            </div>
          )}
        </div>
      )}
      {room.last_claim && !room.last_claim.valid && !finished && (
        <p className="err" style={{ margin: 0 }}>{room.last_claim.name} cantó bingo con el cartón {room.last_claim.numero}, pero aún no lo completa.</p>
      )}

      <section style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18, justifyItems: 'center' }}>
          <div key={reveal} className={`drum ${spinning ? 'spinning' : reveal ? 'reveal' : ''}`}>
            <Ball n={spinning ? null : last} size={220} />
          </div>
          <button className="btn big" onClick={spin} disabled={spinning || finished || room.drawn_count >= 75 || totalCards === 0}>
            {spinning ? 'Girando…' : 'Girar balotera'}
          </button>
          {last && !spinning && <button className="btn ghost" onClick={() => callNumber(last)}>Repetir número</button>}
          <p className="muted" style={{ margin: 0 }}>
            {room.drawn_count} de 75 balotas · jugando por <b style={{ color: 'var(--chalk)' }}>{PATTERNS[activePattern(room)].label}</b>
          </p>
          {totalCards === 0 && <p className="muted" style={{ margin: 0, fontSize: 15 }}>La balotera se activa cuando haya al menos un cartón en juego.</p>}
          {err && <p className="err" style={{ margin: 0 }}>{err}</p>}
        </div>

        <div style={{ display: 'grid', gap: 16 }}>
          <label className="field">
            <span>{second ? 'Primer premio' : 'Cómo se gana'}</span>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <select value={room.pattern} disabled={!canPick} onChange={(e) => settings({ pattern: e.target.value })} style={{ flex: 1 }}>
                {Object.entries(PATTERNS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
              <PatternMini k={room.pattern} />
            </div>
          </label>

          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={!!second} disabled={!canPick}
              onChange={(e) => settings({ pattern2: e.target.checked ? 'lleno' : null })} style={{ width: 22, height: 22 }} />
            <span>Jugar también un segundo premio</span>
          </label>

          {second && (
            <label className="field">
              <span>Segundo premio</span>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <select value={room.pattern2} disabled={!canPick} onChange={(e) => settings({ pattern2: e.target.value })} style={{ flex: 1 }}>
                  {Object.entries(PATTERNS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                </select>
                <PatternMini k={room.pattern2} />
              </div>
            </label>
          )}
          {second && (
            <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <input type="checkbox" checked={room.one_prize_each} disabled={!canPick}
                onChange={(e) => settings({ onePrizeEach: e.target.checked })} style={{ width: 22, height: 22 }} />
              <span>Un premio por persona <span className="muted">(quien gane el primero no puede ganar el segundo)</span></span>
            </label>
          )}
          {!canPick && <span className="muted" style={{ fontSize: 14, marginTop: -8 }}>Los premios se cambian al empezar una ronda nueva.</span>}

          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="checkbox" checked={room.auto_check} onChange={(e) => settings({ autoCheck: e.target.checked })}
              style={{ width: 22, height: 22 }} />
            <span>Detectar ganador automáticamente <span className="muted">(si lo apagas, gana quien cante ¡Bingo! y el sistema lo verifica)</span></span>
          </label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {room.status === 'playing' && (
              <button className="btn ghost"
                onClick={() => confirm('¿Reiniciar la ronda? Se borran las balotas que han salido y se juega con los mismos cartones.') && settings({ reset: true })}>
                Reiniciar ronda
              </button>
            )}
            <button className="btn ghost danger"
              onClick={() => confirm('¿Terminar el bingo? La sala se cierra para todos y se borran sus datos.') && settings({ close: true })}>
              Terminar bingo
            </button>
          </div>
        </div>
      </section>

      <section className="players" aria-label="Jugadores en la sala">
        <h2 style={{ fontSize: 22, marginBottom: 10 }}>Jugadores</h2>
        {players.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>Todavía no entra nadie. Muestra el QR para que se unan.</p>
        ) : (
          <ul>
            {players.map((p) => {
              const won = room.winners.filter((w) => w.playerId === p.id);
              return (
                <li key={p.id}>
                  <span className="pname">{p.name}{won.length > 0 && <span className="trophy" title="Ganó"> 🏆</span>}</span>
                  <span className="pcount">{p.cards} {p.cards === 1 ? 'cartón' : 'cartones'}</span>
                </li>
              );
            })}
          </ul>
        )}
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
