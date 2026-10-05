'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRoom } from '@/lib/useRoom';
import { supabase } from '@/lib/supabaseClient';
import { LETTERS, PATTERNS, previewCells, activePattern, hasSecondPrize, stageLabel, missingFor } from '@/lib/bingo';
import { Ball, PatternMini, RecentBalls, useWakeLock, useToast } from '@/lib/ui';
import { callNumber } from '@/lib/voice';

const MAX_EACH = 6;

function useMarks(cardId, round) {
  const key = `bingo-marks-${cardId}-${round}`;
  const [marks, setMarks] = useState(() => new Set());
  useEffect(() => {
    try { setMarks(new Set(JSON.parse(localStorage.getItem(key) || '[]'))); } catch { setMarks(new Set()); }
  }, [key]);
  const toggle = (n) => setMarks((prev) => {
    const next = new Set(prev);
    next.has(n) ? next.delete(n) : next.add(n);
    try { localStorage.setItem(key, JSON.stringify([...next])); } catch {}
    return next;
  });
  return [marks, toggle];
}

function Card({ card, room, auto, canRemove, onClaim, onReroll, onRemove, busy, won }) {
  const [marks, toggle] = useMarks(card.id, room.round);
  const drawn = new Set(room.drawn);
  const pat = activePattern(room);
  const target = previewCells(pat);
  const last = room.drawn[room.drawn.length - 1];
  const lobby = room.drawn_count === 0;
  const finished = room.status === 'finished';
  const left = missingFor(card.grid, drawn, pat);
  const status = lobby || finished ? null
    : left === 0 ? { cls: 'ready', text: '¡Canta bingo!' }
    : left === 1 ? { cls: 'hot', text: '¡Te falta 1!' }
    : left <= 3 ? { cls: 'warm', text: `Te faltan ${left}` }
    : { cls: '', text: `Te faltan ${left}` };

  return (
    <article className={`card ${status?.cls || ''} ${won ? 'won' : ''}`}>
      <header className="card-head">
        <span className="card-num">Cartón {card.numero}{won && ' 🏆'}</span>
        {status && <span className={`left ${status.cls}`}>{status.text}</span>}
        {lobby && (
          <span className="card-tools">
            <button className="tool" disabled={busy} onClick={() => onReroll(card.id)} title="Cambiar números">🔄 <span>Cambiar</span></button>
            {canRemove && <button className="tool" disabled={busy} onClick={() => onRemove(card.id)} title="Quitar cartón" aria-label="Quitar cartón">🗑</button>}
          </span>
        )}
      </header>
      <div className="grid5">
        {LETTERS.map((l) => <div key={l} className={`hd c-${l}`}>{l}</div>)}
        {card.grid.map((n, i) => {
          if (n === 0) return <div key={i} className="sq free marked">★</div>;
          const on = auto ? drawn.has(n) : marks.has(n);
          return (
            <button key={i}
              className={`sq ${on ? 'marked' : ''} ${target.has(i) && pat !== 'lleno' ? 'target' : ''} ${n === last ? 'just' : ''}`}
              onClick={() => !auto && toggle(n)} aria-pressed={on} aria-label={`${n}${on ? ', marcado' : ''}`}>
              {n}
            </button>
          );
        })}
      </div>
      <button className={`btn big bingo ${left === 0 && !finished ? 'go' : ''}`}
        disabled={finished || lobby} onClick={() => onClaim(card)}>¡Bingo!</button>
    </article>
  );
}

export default function Sala() {
  const { code } = useParams();
  const { room, missing } = useRoom(code);
  const storeKey = 'bingo-player-' + String(code).toUpperCase();
  const [playerId, setPlayerId] = useState(undefined);
  const [cards, setCards] = useState([]);
  const [name, setName] = useState('');
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(false);
  const [sound, setSound] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [toast, flash] = useToast();
  const lastSpoken = useRef(null);
  useWakeLock(!!playerId && room?.status !== 'closed');

  useEffect(() => {
    setPlayerId(localStorage.getItem(storeKey) || null);
    setAuto(localStorage.getItem('bingo-auto') === '1');
    setName(localStorage.getItem('bingo-name') || '');
  }, [storeKey]);

  // Recuperar sesión y detectar si el anfitrión sacó a la persona
  useEffect(() => {
    if (!playerId) return;
    supabase().from('cards').select('id, numero, grid').eq('player_id', playerId).order('numero')
      .then(({ data }) => {
        if (data?.length) setCards(data);
        else {
          localStorage.removeItem(storeKey);
          setCards((prev) => { if (prev.length) setRemoved(true); return []; });
          setPlayerId(null);
        }
      });
  }, [playerId, storeKey, room?.round, room?.roster_version]);

  const last = room?.drawn?.[room.drawn.length - 1];
  useEffect(() => {
    if (sound && last && lastSpoken.current !== last) callNumber(last);
    lastSpoken.current = last;
  }, [last, sound]);

  async function api(path, body) {
    setBusy(true);
    const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, playerId, ...body }) });
    const d = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { flash(d.error || 'Algo falló.'); return null; }
    return d;
  }

  async function join(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name, count }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    if (d.capped) flash(`Solo quedaban ${d.capped} cartones disponibles en esta sala.`);
    localStorage.setItem(storeKey, d.playerId);
    localStorage.setItem('bingo-name', name.trim());
    setRemoved(false);
    setCards(d.cards);
    setPlayerId(d.playerId);
  }

  async function reroll(cardId) {
    const d = await api('/api/reroll', { cardId });
    if (d) { setCards(d.cards); flash(cardId ? 'Números nuevos para ese cartón.' : 'Todos tus cartones tienen números nuevos.'); }
  }
  async function addCard() {
    const d = await api('/api/addcards', { add: 1 });
    if (d) { setCards(d.cards); flash('Cartón agregado.'); }
  }
  async function removeCard(cardId) {
    if (!confirm('¿Quitar este cartón?')) return;
    const d = await api('/api/addcards', { removeCardId: cardId });
    if (d) { setCards(d.cards); flash('Cartón quitado.'); }
  }
  async function claim(card) {
    const d = await api('/api/claim', { cardId: card.id });
    if (d) flash(d.valid ? '¡Bingo verificado! 🎉' : d.reason || `Todavía no: al cartón ${card.numero} le faltan balotas.`);
  }

  if (missing) return <main className="wrap center-page"><h1>Esta sala ya no existe</h1><p className="muted">El bingo terminó o el enlace no es correcto. Revisa con quien está cantando.</p></main>;
  if (room?.status === 'closed') return (
    <main className="wrap center-page"><h1>El bingo terminó</h1><p className="muted">¡Gracias por jugar! El anfitrión cerró la sala {room.code}.</p></main>
  );
  if (!room || playerId === undefined) return <main className="wrap center-page"><p className="muted">Cargando…</p></main>;

  if (!playerId) {
    const saved = typeof window !== 'undefined' && localStorage.getItem('bingo-name');
    return (
      <main className="wrap join">
        <div className="join-balls" aria-hidden>
          {['B', 'I', 'N', 'G', 'O'].map((l, i) => <Ball key={l} n={i * 15 + 7} size={46} />)}
        </div>
        <p className="eyebrow">Sala {room.code}</p>
        <h1 className="join-title">{saved ? `¡Hola de nuevo, ${saved}!` : 'Entra al bingo'}</h1>
        {removed && (
          <p className="note">El anfitrión te sacó de la sala. Si fue para corregir tus cartones, vuelve a entrar y elige la cantidad correcta.</p>
        )}
        <form onSubmit={join} className="join-form">
          <label className="field"><span>Tu nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} required
              autoFocus={!saved} autoComplete="given-name" placeholder="Cómo te conoce la familia" />
          </label>
          <div className="field">
            <span>¿Cuántos cartones?</span>
            <div className="seg count" role="radiogroup">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <button type="button" key={n} role="radio" aria-checked={count === n} className={count === n ? 'on' : ''} onClick={() => setCount(n)}>{n}</button>
              ))}
            </div>
            <span className="muted small">Puedes agregar o quitar cartones antes de que salga la primera balota.</span>
          </div>
          <button className="btn big" disabled={busy || !name.trim()}>{busy ? 'Entrando…' : 'Entrar a jugar'}</button>
          {err && <p className="err">{err}</p>}
        </form>
        {toast}
      </main>
    );
  }

  const me = room.winners.filter((w) => w.playerId === playerId);
  const pat = activePattern(room);
  const finished = room.status === 'finished';
  const lobby = room.drawn_count === 0;
  const second = hasSecondPrize(room);
  const wonCards = new Set(me.map((w) => w.cardId));

  return (
    <main className="wrap play">
      <header className="play-head">
        <Ball n={last} size={72} />
        <div className="play-info">
          <p className="play-label">{last ? 'Último número' : 'Esperando la primera balota'}</p>
          <RecentBalls drawn={room.drawn} count={4} size={30} />
          {!last && <p className="muted small">Sala {room.code}</p>}
        </div>
        <div className="play-pattern" title={PATTERNS[pat].label}>
          <PatternMini k={pat} size={10} />
          <span>{second && !finished ? `${room.stage === 2 ? '2º' : '1º'} · ` : ''}{PATTERNS[pat].label}</span>
        </div>
      </header>

      {room.winners.length > 0 && (
        <section className={`banner ${finished ? '' : 'soft'}`}>
          {me.length > 0 && <h2>¡Ganaste! 🎉</h2>}
          {[1, 2].map((s) => {
            const ws = room.winners.filter((w) => (w.stage || 1) === s);
            if (!ws.length) return null;
            return (
              <p key={s} className="banner-line">
                <b>{stageLabel(room, s)}:</b> {ws.map((w) => `${w.name} (cartón ${w.numero})`).join(' · ')}
                {ws.some((w) => w.tiebreak) && <span className="tiebreak"> · ganó el desempate con la balota más alta</span>}
              </p>
            );
          })}
          <p className="banner-next">{finished ? 'Espera a que empiece la ronda nueva.' : `¡Sigue jugando! Ahora vamos por ${PATTERNS[pat].label}.`}</p>
        </section>
      )}

      {lobby && (
        <section className="note lobby">
          <span>Antes de la primera balota puedes ajustar tus cartones.</span>
          <span className="lobby-actions">
            {cards.length < MAX_EACH && <button className="btn small" disabled={busy} onClick={addCard}>+ Agregar cartón</button>}
            {cards.length > 1 && <button className="btn ghost small" disabled={busy} onClick={() => reroll(null)}>🔄 Cambiar todos</button>}
          </span>
        </section>
      )}

      <div className="toggles">
        <label className="chip-toggle"><input type="checkbox" checked={auto}
          onChange={(e) => { setAuto(e.target.checked); localStorage.setItem('bingo-auto', e.target.checked ? '1' : '0'); }} /><span>Marcar solo</span></label>
        <label className="chip-toggle"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /><span>🔊 Escuchar números</span></label>
      </div>

      <div className="cards">
        {cards.map((c) => (
          <Card key={c.id + c.grid.join('-')} card={c} room={room} auto={auto} busy={busy}
            canRemove={cards.length > 1} won={wonCards.has(c.id)}
            onClaim={claim} onReroll={reroll} onRemove={removeCard} />
        ))}
      </div>
      {toast}
    </main>
  );
}
