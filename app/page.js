'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');

  async function create() {
    setBusy(true); setErr('');
    const r = await fetch('/api/rooms', { method: 'POST' });
    const d = await r.json();
    if (!r.ok) { setErr(d.error); setBusy(false); return; }
    localStorage.setItem('bingo-host-' + d.code, d.secret);
    router.push('/host/' + d.code);
  }

  return (
    <main className="wrap" style={{ display: 'grid', gap: 40, justifyItems: 'center', textAlign: 'center', paddingTop: 48 }}>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['B', 'I', 'N', 'G', 'O'].map((l) => (
          <div key={l} className={`ball c-${l}`} style={{ '--s': '64px' }}>
            <div className="face"><span style={{ fontSize: 22 }}>{l}</span></div>
          </div>
        ))}
      </div>
      <div style={{ maxWidth: 520 }}>
        <h1 style={{ fontSize: 'clamp(36px, 8vw, 60px)', lineHeight: 1 }}>Bingo en familia</h1>
        <p className="muted">Una pantalla gira la balotera. Cada quien juega con sus cartones desde el celular.</p>
      </div>
      <button className="btn big" onClick={create} disabled={busy}>{busy ? 'Creando…' : 'Crear sala'}</button>
      {err && <p className="err">{err}</p>}
      <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) router.push('/sala/' + code.trim().toUpperCase()); }}
        style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
        <label className="field" style={{ textAlign: 'left' }}>
          <span className="muted">¿Ya tienes un código?</span>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC12" maxLength={5}
            style={{ textTransform: 'uppercase', width: 140 }} />
        </label>
        <button className="btn ghost" type="submit">Entrar</button>
      </form>
    </main>
  );
}
