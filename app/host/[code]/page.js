'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useRoom } from '@/lib/useRoom';
import { supabase } from '@/lib/supabaseClient';
import { LETTERS, PATTERNS, TIEBREAKS, activePattern, hasSecondPrize, stageLabel } from '@/lib/bingo';
import { Ball, PatternMini, RecentBalls, ShareLink, useWakeLock, useToast } from '@/lib/ui';
import { callNumber, rattle, speak } from '@/lib/voice';

function WinnerLine({ w, room }) {
  return (
    <div className="winner-line">
      <b>{w.name}</b> · cartón {w.numero}
      {w.tiebreak && (
        <div className="tiebreak">
          Desempate: {w.tiebreak.map((t) => `${t.name} sacó ${t.ball}`).join(' · ')}
        </div>
      )}
    </div>
  );
}

export default function Host() {
  const { code } = useParams();
  const { room, setRoom, missing } = useRoom(code);
  const [secret, setSecret] = useState(null);
  const [players, setPlayers] = useState([]);
  const [history, setHistory] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [reveal, setReveal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [origin, setOrigin] = useState('');
  const [toast, flash] = useToast();
  const announced = useRef(null);
  const claimSeen = useRef(0);
  useWakeLock(!!room && room.status !== 'closed');

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
  }, [room?.id, room?.roster_version]);

  // Historial de rondas para el marcador de la noche
  useEffect(() => {
    if (!room?.id) return;
    supabase().from('rounds').select('round, winners, balls, started_at, ended_at').eq('room_id', room.id)
      .order('ended_at').then(({ data }) => data && setHistory(data));
  }, [room?.id, room?.status, room?.round]);

  // Anuncios con voz
  useEffect(() => {
    if (!room) return;
    const key = room.round + ':' + room.winners.length;
    if (announced.current === null) announced.current = key;
    else if (announced.current !== key) {
      const [prevRound, prevLen] = announced.current.split(':').map(Number);
      announced.current = key;
      const fresh = room.winners.slice(prevRound === room.round ? prevLen : 0);
      if (fresh.length) {
        const byStage = {};
        fresh.forEach((w) => (byStage[w.stage] ||= []).push(w));
        const text = Object.entries(byStage).map(([s, ws]) => {
          const tb = ws.find((w) => w.tiebreak);
          const intro = tb ? `Hubo empate y se desempató con balota. ` : '';
          return `${intro}¡${stageLabel(room, +s)}! Ganó ${ws.map((w) => `${w.name} con el cartón ${w.numero}`).join(' y ')}`;
        }).join('. ');
        const next = room.status !== 'finished' && hasSecondPrize(room) ? `. Seguimos jugando por ${PATTERNS[room.pattern2].label}` : '';
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
  async function settings(body) {
    const d = await post('/api/settings', body);
    if (d?.room) setRoom(d.room);
    return d;
  }
  async function spin() {
    if (spinning) return;
    setSpinning(true);
    rattle(1400);
    const [d] = await Promise.all([post('/api/draw', {}), new Promise((r) => setTimeout(r, 1500))]);
    setSpinning(false);
    if (d) { setRoom(d.room); setReveal((x) => x + 1); callNumber(d.number); }
  }
  async function newRound(newCards) {
    setBusy(true);
    const d = await settings({ reset: true, newCards });
    setBusy(false);
    if (d) speak(newCards ? 'Nueva ronda con cartones nuevos' : 'Nueva ronda con los mismos cartones');
  }

  // Marcador: premios por persona en toda la noche
  const score = useMemo(() => {
    const m = new Map();
    history.forEach((r) => r.winners.forEach((w) => {
      const k = w.playerId || w.name;
      m.set(k, { name: w.name, wins: (m.get(k)?.wins || 0) + 1 });
    }));
    return [...m.values()].sort((a, b) => b.wins - a.wins);
  }, [history]);

  if (missing) return <main className="wrap center-page"><h1>Esta sala no existe</h1><p className="muted">Vuelve al inicio y crea una nueva.</p><a className="btn big" href="/">Ir al inicio</a></main>;
  if (!room || secret === null) return <main className="wrap center-page"><p className="muted">Cargando sala…</p></main>;
  if (room.status === 'closed') return (
    <main className="wrap center-page">
      <h1 style={{ fontSize: 44 }}>Bingo terminado</h1>
      <p className="muted" style={{ maxWidth: 420 }}>La sala {room.code} se cerró y sus datos se borran en unos minutos. ¡Gracias por jugar!</p>
      <a className="btn big" href="/">Crear otra sala</a>
    </main>
  );
  if (!secret) return <main className="wrap center-page"><h1>Esta sala es de otro anfitrión</h1><p className="muted">Para jugar, entra como jugador.</p><a className="btn big" href={`/sala/${room.code}`}>Entrar a jugar</a></main>;

  const last = room.drawn[room.drawn.length - 1];
  const drawnSet = new Set(room.drawn);
  const joinUrl = `${origin}/sala/${room.code}`;
  const lobby = room.drawn_count === 0;
  const second = hasSecondPrize(room);
  const finished = room.status === 'finished';
  const totalCards = players.reduce((s, p) => s + p.cards, 0);
  const winnersOf = (s) => room.winners.filter((w) => (w.stage || 1) === s);
  const pat = activePattern(room);
  const minutes = room.round_started_at ? Math.max(1, Math.round((Date.now() - new Date(room.round_started_at)) / 60000)) : 0;

  return (
    <main className="wrap host">
      <header className="topbar">
        <div className="brand"><span className="display">Bingo</span> en familia</div>
        <div className="room-chip">Sala <b className="display">{room.code}</b></div>
        <div className="topbar-stats">
          <span><b>{players.length}</b> {players.length === 1 ? 'jugador' : 'jugadores'}</span>
          <span><b>{totalCards}</b> {totalCards === 1 ? 'cartón' : 'cartones'}</span>
          <span>Ronda <b>{room.round}</b></span>
        </div>
      </header>

      {room.winners.length > 0 && (
        <section className={`banner ${finished ? '' : 'soft'}`}>
          {[1, 2].filter((s) => winnersOf(s).length).map((s) => (
            <div key={s}>
              <h2>¡{stageLabel(room, s)}!</h2>
              {winnersOf(s).map((w) => <WinnerLine key={w.cardId + s} w={w} room={room} />)}
            </div>
          ))}
          {!finished && second && <p className="banner-next">Seguimos: ahora se juega por <b>{PATTERNS[room.pattern2].label}</b></p>}
          {finished && (
            <div className="banner-actions">
              <button className="btn ink" disabled={busy} onClick={() => newRound(false)}>Otra ronda · mismos cartones</button>
              <button className="btn" disabled={busy} onClick={() => newRound(true)}>Otra ronda · cartones nuevos</button>
            </div>
          )}
        </section>
      )}
      {room.last_claim && !room.last_claim.valid && !finished && (
        <p className="err">{room.last_claim.name} cantó bingo con el cartón {room.last_claim.numero}, pero aún no lo completa.</p>
      )}

      <section className="host-main">
        <div className="panel stage">
          <div key={reveal} className={`drum ${spinning ? 'spinning' : reveal ? 'reveal' : ''}`}>
            <Ball n={spinning ? null : last} size={230} />
          </div>
          <RecentBalls drawn={spinning ? [...room.drawn, 0] : room.drawn} />
          <button className="btn big spin" onClick={spin} disabled={spinning || finished || room.drawn_count >= 75 || totalCards === 0}>
            {spinning ? 'Girando…' : lobby ? 'Empezar a girar' : 'Girar balotera'}
          </button>
          <div className="stage-meta">
            <span>{room.drawn_count} de 75 balotas{minutes ? ` · ${minutes} min` : ''}</span>
            {last && !spinning && <button className="link-btn" onClick={() => callNumber(last)}>🔊 Repetir número</button>}
          </div>
          {totalCards === 0 && <p className="muted small">La balotera se activa cuando haya al menos un cartón en juego.</p>}
          {err && <p className="err">{err}</p>}
        </div>

        <div className="side">
          <div className="panel now">
            <p className="eyebrow">{finished ? 'Ronda terminada' : second ? `Se juega por el ${room.stage === 2 ? 'segundo' : 'primer'} premio` : 'Se juega por'}</p>
            <div className="now-row">
              <PatternMini k={pat} size={22} />
              <div>
                <h2 className="now-title">{PATTERNS[pat].label}</h2>
                {second && room.stage === 1 && <p className="muted small">Después: {PATTERNS[room.pattern2].label}</p>}
                {room.tiebreak === 'balota' && <p className="muted small">Empates: balota más alta</p>}
              </div>
            </div>
          </div>

          <div className="panel invite">
            <p className="eyebrow">Invita a la familia</p>
            <div className="invite-row">
              <div className="qr">{origin && <QRCodeSVG value={joinUrl} size={128} />}</div>
              <p className="muted small">Escanean el código o abren el enlace, ponen su nombre y eligen cartones.</p>
            </div>
            {origin && <ShareLink url={joinUrl} />}
          </div>
        </div>
      </section>

      <section className="host-grid">
        <div className="panel">
          <p className="eyebrow">Reglas de la ronda {lobby ? '' : '· bloqueadas mientras se juega'}</p>
          <label className="field">
            <span>{second ? 'Primer premio' : 'Cómo se gana'}</span>
            <div className="field-row">
              <select value={room.pattern} disabled={!lobby} onChange={(e) => settings({ pattern: e.target.value })}>
                {Object.entries(PATTERNS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
              </select>
              <PatternMini k={room.pattern} />
            </div>
          </label>
          <label className="check">
            <input type="checkbox" checked={!!second} disabled={!lobby}
              onChange={(e) => settings({ pattern2: e.target.checked ? (room.pattern === 'lleno' ? 'o' : 'lleno') : null })} />
            <span>Jugar también un segundo premio</span>
          </label>
          {second && (
            <>
              <label className="field">
                <span>Segundo premio</span>
                <div className="field-row">
                  <select value={room.pattern2} disabled={!lobby} onChange={(e) => settings({ pattern2: e.target.value })}>
                    {Object.entries(PATTERNS).filter(([k]) => k !== room.pattern).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                  </select>
                  <PatternMini k={room.pattern2} />
                </div>
              </label>
              <label className="check">
                <input type="checkbox" checked={room.one_prize_each} disabled={!lobby} onChange={(e) => settings({ onePrizeEach: e.target.checked })} />
                <span>Un premio por persona</span>
              </label>
            </>
          )}
          <div className="field">
            <span>Si hay empate</span>
            <div className="seg" role="radiogroup">
              {Object.entries(TIEBREAKS).map(([k, label]) => (
                <button key={k} role="radio" aria-checked={room.tiebreak === k} disabled={!lobby}
                  className={room.tiebreak === k ? 'on' : ''} onClick={() => settings({ tiebreak: k })}>{label}</button>
              ))}
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={room.auto_check} onChange={(e) => settings({ autoCheck: e.target.checked })} />
            <span>Detectar ganador automáticamente</span>
          </label>
          <div className="row-actions">
            {room.status === 'playing' && (
              <button className="btn ghost small" onClick={() => confirm('¿Reiniciar la ronda? Se borran las balotas que han salido y se juega con los mismos cartones.') && settings({ reset: true })}>Reiniciar ronda</button>
            )}
            <button className="btn ghost small danger" onClick={() => confirm('¿Terminar el bingo? La sala se cierra para todos y se borran sus datos.') && settings({ close: true })}>Terminar bingo</button>
          </div>
        </div>

        <div className="panel players">
          <p className="eyebrow">Jugadores · {players.length}</p>
          {players.length === 0 ? (
            <p className="muted">Todavía no entra nadie. Comparte el enlace o muestra el código QR.</p>
          ) : (
            <ul>
              {players.map((p) => {
                const won = room.winners.some((w) => w.playerId === p.id);
                return (
                  <li key={p.id} className={won ? 'won' : ''}>
                    <span className="pname">{p.name}{won && ' 🏆'}</span>
                    <span className="pcount">{p.cards} {p.cards === 1 ? 'cartón' : 'cartones'}</span>
                    <button className="kick" aria-label={`Sacar a ${p.name}`} title="Sacar de la sala"
                      onClick={() => confirm(`¿Sacar a ${p.name} de la sala? Se borran sus ${p.cards} ${p.cards === 1 ? 'cartón' : 'cartones'}. Podrá volver a entrar con el enlace.`)
                        && settings({ removePlayer: p.id }).then((d) => d && flash(`${p.name} salió de la sala.`))}>✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="panel score">
          <p className="eyebrow">Marcador de la noche</p>
          {score.length === 0 ? (
            <p className="muted">Aquí aparecen los premios de cada persona a medida que terminan las rondas.</p>
          ) : (
            <ol>
              {score.map((s, i) => (
                <li key={s.name + i}><span className="rank">{i + 1}</span><span className="pname">{s.name}</span><b>{s.wins} {s.wins === 1 ? 'premio' : 'premios'}</b></li>
              ))}
            </ol>
          )}
          {history.length > 0 && <p className="muted small">{history.length} {history.length === 1 ? 'ronda jugada' : 'rondas jugadas'} · promedio {Math.round(history.reduce((s, r) => s + r.balls, 0) / history.length)} balotas por ronda</p>}
        </div>
      </section>

      <section className="panel board" aria-label="Balotas que han salido">
        {LETTERS.map((l, r) => (
          <div key={l} className={`board-row c-${l}`}>
            <b>{l}</b>
            {Array.from({ length: 15 }, (_, i) => r * 15 + i + 1).map((n) => (
              <div key={n} className={`cell75 ${drawnSet.has(n) ? 'on' : ''} ${n === last ? 'last' : ''}`}>{n}</div>
            ))}
          </div>
        ))}
      </section>
      {toast}
    </main>
  );
}
