'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Ball } from '@/lib/ui';

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const [mine, setMine] = useState([]);

  // Salas abiertas en este dispositivo (como anfitrión o jugador)
  useEffect(() => {
    const found = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      const m = k && k.match(/^bingo-(host|player)-([A-Z0-9]{5})$/);
      if (m) found.push({ role: m[1], code: m[2] });
    }
    if (!found.length) return;
    supabase().from('rooms').select('code, status, round, drawn_count')
      .in('code', [...new Set(found.map((f) => f.code))]).neq('status', 'closed')
      .then(({ data }) => {
        const alive = new Map((data || []).map((r) => [r.code, r]));
        found.forEach((f) => { if (!alive.has(f.code)) localStorage.removeItem(`bingo-${f.role}-${f.code}`); });
        const list = found.filter((f) => alive.has(f.code)).map((f) => ({ ...f, room: alive.get(f.code) }));
        list.sort((a, b) => (a.role === 'host' ? -1 : 1) - (b.role === 'host' ? -1 : 1));
        setMine(list.filter((f, i) => list.findIndex((g) => g.code === f.code) === i));
      });
  }, []);

  async function create() {
    setBusy(true); setErr('');
    const r = await fetch('/api/rooms', { method: 'POST' });
    const d = await r.json().catch(() => ({ error: 'No se pudo conectar. Intenta de nuevo.' }));
    if (!r.ok) { setErr(d.error || 'No se pudo crear la sala.'); setBusy(false); return; }
    localStorage.setItem('bingo-host-' + d.code, d.secret);
    router.push('/host/' + d.code);
  }

  const hostRoom = mine.find((m) => m.role === 'host');

  return (
    <main className="wrap home">
      <div className="home-balls" aria-hidden>
        {['B', 'I', 'N', 'G', 'O'].map((l, i) => (
          <div key={l} className="float" style={{ animationDelay: `${i * 0.15}s` }}>
            <div className={`ball c-${l}`} style={{ '--s': '68px' }}><div className="face"><span style={{ fontSize: 24 }}>{l}</span></div></div>
          </div>
        ))}
      </div>
      <h1 className="home-title">Bingo en familia</h1>
      <p className="muted home-sub">Una pantalla gira la balotera. Cada quien juega con sus cartones desde el celular.</p>

      {mine.length > 0 && (
        <section className="panel resume">
          <p className="eyebrow">Tienes salas abiertas</p>
          {mine.map((m) => (
            <a key={m.role + m.code} className="resume-row" href={m.role === 'host' ? `/host/${m.code}` : `/sala/${m.code}`}>
              <span><b className="display">{m.code}</b> · {m.role === 'host' ? 'eres el anfitrión' : 'estás jugando'}</span>
              <span className="muted small">Ronda {m.room.round}{m.room.drawn_count ? ` · ${m.room.drawn_count} balotas` : ' · sin empezar'}</span>
              <span className="go">Volver →</span>
            </a>
          ))}
        </section>
      )}

      <div className="home-actions">
        <button className="btn big" onClick={() => {
          if (hostRoom && !confirm(`Ya tienes abierta la sala ${hostRoom.code}. ¿Crear otra de todas formas?`)) return;
          create();
        }} disabled={busy}>{busy ? 'Creando…' : 'Crear sala'}</button>
        {err && <p className="err">{err}</p>}
        <form className="join-code" onSubmit={(e) => { e.preventDefault(); if (code.trim()) router.push('/sala/' + code.trim().toUpperCase()); }}>
          <label className="field"><span className="muted">¿Te pasaron un código?</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC12" maxLength={5} autoCapitalize="characters" />
          </label>
          <button className="btn ghost" type="submit">Entrar</button>
        </form>
      </div>
    </main>
  );
}
