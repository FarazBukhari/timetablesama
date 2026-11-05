import { useEffect, useRef, useState, type ReactNode } from 'react';
import { pastedRows } from '../import';
import { Chevron } from './icons';

export function PageHead({ title, desc, children, className = '' }: { title: string; desc?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={`page-head ${className}`.trim()}>
      <div>
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="row no-print">{children}</div>}
    </div>
  );
}

export interface Option {
  value: string;
  label: string;
  color?: string;
}

export function MultiSelect({
  options, value, onChange, placeholder = 'None', ariaLabel,
}: {
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const selected = options.filter((o) => value.includes(o.value));
  return (
    <div className="ms" ref={ref}>
      <button type="button" className="btn ms-btn" aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="row" style={{ gap: 4 }}>
          {selected.length ? selected.map((o) => <span key={o.value} className="chip">{o.label}</span>) : <span className="muted">{placeholder}</span>}
        </span>
        <Chevron className="icon" />
      </button>
      {open && (
        <div className="ms-pop" role="listbox">
          {!options.length && <div className="muted small" style={{ padding: 8 }}>Nothing to choose yet. Add some on the earlier steps first.</div>}
          {options.map((o) => (
            <label key={o.value}>
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={(e) => onChange(e.target.checked ? [...value, o.value] : value.filter((v) => v !== o.value))}
              />
              {o.color && <span className="dot" style={{ background: o.color }} />}
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

/** Paste-one-per-line bulk entry. */
export function BulkAdd({ hint, existing, onAdd, children }: {
  hint: string;
  /** Names already in the list, so pasting the same list twice doesn't add them again. */
  existing: string[];
  onAdd: (lines: string[][]) => void;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [status, setStatus] = useState('');
  if (!open) {
    return (
      <>
        <button className="btn" onClick={() => { setStatus(''); setOpen(true); }}>Paste a list</button>
        {status && <span className="muted small" role="status">{status}</span>}
      </>
    );
  }
  const submit = () => {
    const { rows, skipped } = pastedRows(text, existing);
    if (rows.length) onAdd(rows);
    setStatus(`Added ${rows.length}.${skipped ? ` Skipped ${skipped} already in the list.` : ''}`);
    setText('');
    setOpen(false);
  };
  return (
    <div className="card" style={{ width: '100%' }}>
      <h3>Paste a list</h3>
      <p className="help">{hint} Put one on each line. You can copy a column straight from Excel or Google Sheets and paste it here.</p>
      {children}
      <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus aria-label="List to paste" />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary" onClick={submit}>Add</button>
        <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: string }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function NumberInput({
  value, onChange, min = 0, max = 99, ariaLabel, style,
}: {
  value: number | undefined;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  ariaLabel?: string;
  style?: React.CSSProperties;
}) {
  return (
    <input
      type="number"
      aria-label={ariaLabel}
      min={min}
      max={max}
      value={value ?? ''}
      style={{ width: 72, ...style }}
      onChange={(e) => {
        const n = e.target.value === '' ? 0 : Number(e.target.value);
        if (!Number.isNaN(n)) onChange(Math.max(min, Math.min(max, n)));
      }}
    />
  );
}
