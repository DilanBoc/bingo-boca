'use client';
import { useEffect, useState } from 'react';
import { letterFor, previewCells } from './bingo';

export function Ball({ n, size = 160, dim = false }) {
  const l = n ? letterFor(n) : null;
  return (
    <div className={`ball c-${l || 'N'} ${dim ? 'dim' : ''}`} style={{ '--s': size + 'px' }}>
      <div className="face">{n ? <div><small>{l}</small><span>{n}</span></div> : <span>?</span>}</div>
    </div>
  );
}

export function PatternMini({ k, size = 12 }) {
  const on = previewCells(k);
  return (
    <div className="mini" aria-hidden style={{ '--m': size + 'px' }}>
      {Array.from({ length: 25 }, (_, i) => <i key={i} className={on.has(i) ? 'on' : ''} />)}
    </div>
  );
}

export function RecentBalls({ drawn, count = 5, size = 44 }) {
  const recent = drawn.slice(-count - 1, -1).reverse();
  if (!recent.length) return null;
  return (
    <div className="recent" aria-label="Balotas anteriores">
      {recent.map((n, i) => <Ball key={n} n={n} size={size} dim={i > 1} />)}
    </div>
  );
}

// Mantiene la pantalla encendida mientras la página está abierta (si el navegador lo permite)
export function useWakeLock(active = true) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !navigator.wakeLock) return;
    let lock = null;
    let cancelled = false;
    const request = async () => {
      try { lock = await navigator.wakeLock.request('screen'); } catch {}
      if (cancelled && lock) lock.release().catch(() => {});
    };
    const onVisible = () => document.visibilityState === 'visible' && request();
    request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

export function useToast() {
  const [toast, setToast] = useState('');
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 3800);
    return () => clearTimeout(t);
  }, [toast]);
  const node = toast ? <div className="toast" role="status">{toast}</div> : null;
  return [node, setToast];
}

export function ShareLink({ url, compact = false }) {
  const [copied, setCopied] = useState(false);
  const text = `¡Vamos a jugar bingo! 🎱 Entra aquí y elige tus cartones: ${url}`;
  async function copy() {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt('Copia este enlace:', url); }
  }
  async function share() {
    if (navigator.share) { try { await navigator.share({ title: 'Bingo en familia', text, url }); return; } catch { return; } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  }
  return (
    <div className={`share ${compact ? 'compact' : ''}`}>
      <code className="link">{url.replace(/^https?:\/\//, '')}</code>
      <div className="share-actions">
        <button className="btn small" onClick={copy}>{copied ? '¡Copiado!' : 'Copiar enlace'}</button>
        <a className="btn small wa" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
          onClick={(e) => { if (navigator.share) { e.preventDefault(); share(); } }}>
          Enviar por WhatsApp
        </a>
      </div>
    </div>
  );
}
