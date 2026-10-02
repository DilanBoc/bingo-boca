'use client';
import { letterFor, previewCells } from './bingo';

export function Ball({ n, size = 160 }) {
  const l = n ? letterFor(n) : null;
  return (
    <div className={`ball c-${l || 'N'}`} style={{ '--s': size + 'px' }}>
      <div className="face">{n ? <div><small>{l}</small><span>{n}</span></div> : <span>?</span>}</div>
    </div>
  );
}

export function PatternMini({ k }) {
  const on = previewCells(k);
  return <div className="mini" aria-hidden>{Array.from({ length: 25 }, (_, i) => <i key={i} className={on.has(i) ? 'on' : ''} />)}</div>;
}

