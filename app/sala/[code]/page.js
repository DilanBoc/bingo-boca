'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useRoom } from '@/lib/useRoom';
import { supabase } from '@/lib/supabaseClient';
import { LETTERS, PATTERNS, previewCells, activePattern, hasSecondPrize, stageLabel } from '@/lib/bingo';
import { Ball, PatternMini } from '@/lib/ui';
import { callNumber } from '@/lib/voice';

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

function Card({ card, room, auto, onClaim }) {
  const [marks, toggle] = useMarks(card.id, room.round);
  const drawn = new Set(room.drawn);
  const pat = activePattern(room);
  const target = previewCells(pat);
  return (
    <div className="card">
      <div className="card-head"><span>Cartón {card.numero}</span></div>
      <div className="grid5">
        {LETTERS.map((l) => <div key={l} className={`hd c-${l}`}>{l}</div>)}
        {card.grid.map((n, i) => {
          if (n === 0) return <div key={i} className="sq free marked" style={{ display: 'grid', placeItems: 'center' }}>LIBRE</div>;
          const on = auto ? drawn.has(n) : marks.has(n);
          return (
            <button key={i} className={`sq ${on ? 'marked' : ''} ${target.has(i) && pat !== 'lleno' ? 'target' : ''}`}
              onClick={() => !auto && toggle(n)} aria-pressed={on} aria-label={`${n}${on ? ', marcado' : ''}`}>
              {n}
            </button>
          );
        })}
      </div>
      <button className="btn big" style={{ width: '100%', marginTop: 10, fontSize: 22 }}
        disabled={room.status === 'finished' || room.drawn_count === 0} onClick={() => onClaim(card)}>
        ¡Bingo!
      </button>
    </div>
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
  const [toast, setToast] = useState('');
  const [auto, setAuto] = useState(false);
  const [sound, setSound] = useState(false);
  const lastSpoken = useRef(null);

  useEffect(() => {
    setPlayerId(localStorage.getItem(storeKey) || null);
    setAuto(localStorage.getItem('bingo-auto') === '1');
  }, [storeKey]);

  // Recuperar sesión: con el id guardado en este celular se vuelven a cargar los cartones
  useEffect(() => {
    if (!playerId) return;
    supabase().from('cards').select('id, numero, grid').eq('player_id', playerId).order('numero')
      .then(({ data }) => {
        if (data?.length) setCards(data);
        else { localStorage.removeItem(storeKey); setPlayerId(null); }
      });
  }, [playerId, storeKey]);

  // Voz opcional también en el celular
  const last = room?.drawn?.[room.drawn.length - 1];
  useEffect(() => {
    if (sound && last && lastSpoken.current !== last) callNumber(last);
    lastSpoken.current = last;
  }, [last, sound]);

  function flash(t) { setToast(t); setTimeout(() => setToast(''), 3500); }

  async function join(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    const r = await fetch('/api/join', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, name, count }) });
    const d = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(d.error);
    if (d.capped) flash(`Solo quedaban ${d.capped} cartones disponibles en esta sala.`);
    localStorage.setItem(storeKey, d.playerId);
    setCards(d.cards);
    setPlayerId(d.playerId);
  }

  async function claim(card) {
    const r = await fetch('/api/claim', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, cardId: card.id, playerId }) });
    const d = await r.json();
    if (!r.ok) return flash(d.error);
    flash(d.valid ? '¡Bingo verificado!' : `Todavía no: al cartón ${card.numero} le faltan balotas.`);
  }

  if (missing) return <main className="wrap"><h1>Esta sala ya no existe</h1><p className="muted">El bingo terminó o el código no es correcto. Revisa con quien está cantando.</p></main>;
  if (room?.status === 'closed') return (
    <main className="wrap" style={{ display: 'grid', gap: 14, textAlign: 'center', paddingTop: 60 }}>
      <h1 style={{ fontSize: 40 }}>El bingo terminó</h1>
      <p className="muted">¡Gracias por jugar! El anfitrión cerró la sala {room.code}.</p>
    </main>
  );
  if (!room || playerId === undefined) return <main className="wrap"><p className="muted">Cargando…</p></main>;

  if (!playerId) {
    return (
      <main className="wrap" style={{ maxWidth: 440, display: 'grid', gap: 22, paddingTop: 40 }}>
        <div>
          <p className="muted" style={{ margin: 0 }}>Sala {room.code}</p>
          <h1 style={{ fontSize: 40, lineHeight: 1.05 }}>Entra al bingo</h1>
        </div>
        <form onSubmit={join} style={{ display: 'grid', gap: 16 }}>
          <label className="field"><span>Tu nombre</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} autoFocus required />
          </label>
          <label className="field"><span>¿Cuántos cartones?</span>
            <select value={count} onChange={(e) => setCount(e.target.value)}>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="btn big" disabled={busy}>{busy ? 'Entrando…' : 'Entrar a jugar'}</button>
          {err && <p className="err">{err}</p>}
        </form>
      </main>
    );
  }

  const me = room.winners.filter((w) => w.playerId === playerId);
  const pat = activePattern(room);
  const finished = room.status === 'finished';
  const second = hasSecondPrize(room);
  return (
    <main className="wrap" style={{ display: 'grid', gap: 18, maxWidth: 560 }}>
      <header style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <Ball n={last} size={92} />
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 800 }}>{last ? 'Último número' : 'Esperando la primera balota'}</p>
          <p className="muted" style={{ margin: 0, fontSize: 15 }}>
            {room.drawn.slice(-6, -1).reverse().join('  ') || `Sala ${room.code}`}
          </p>
        </div>
        <div style={{ display: 'grid', justifyItems: 'center', gap: 4 }} title={PATTERNS[pat].label}>
          <PatternMini k={pat} />
          <span className="muted" style={{ fontSize: 13, textAlign: 'center' }}>
            {second && !finished ? `${room.stage === 2 ? '2º' : '1º'} premio: ` : ''}{PATTERNS[pat].label}
          </span>
        </div>
      </header>

      {room.winners.length > 0 && (
        <div className={finished ? 'banner' : 'banner soft'}>
          {me.length > 0 && <h2>¡Ganaste!</h2>}
          {[1, 2].map((s) => {
            const ws = room.winners.filter((w) => (w.stage || 1) === s);
            if (!ws.length) return null;
            return (
              <p key={s} style={{ margin: 4, fontWeight: 800 }}>
                {stageLabel(room, s)}: {ws.map((w) => `${w.name}, cartón ${w.numero}`).join(' · ')}
              </p>
            );
          })}
          <p style={{ margin: 0 }}>
            {finished ? 'Espera a que empiece la ronda nueva.' : `¡Sigue jugando! Ahora vamos por ${PATTERNS[pat].label}.`}
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); localStorage.setItem('bingo-auto', e.target.checked ? '1' : '0'); }} />
          Marcar solo
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} />
          Escuchar números aquí
        </label>
      </div>

      <div style={{ display: 'grid', gap: 18 }}>
        {cards.map((c) => <Card key={c.id} card={c} room={room} auto={auto} onClaim={claim} />)}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}
