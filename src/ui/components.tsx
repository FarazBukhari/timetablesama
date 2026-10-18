import { useEffect, useRef, useState, type ReactNode } from 'react';

export function PageHead({ title, desc, children }: { title: string; desc?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-head">
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
        <span className="muted">▾</span>
      </button>
      {open && (
        <div className="ms-pop" role="listbox">
          {!options.length && <div className="muted small" style={{ padding: 6 }}>Nothing to choose yet.</div>}
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
export function BulkAdd({ hint, onAdd }: { hint: string; onAdd: (lines: string[][]) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>Bulk add</button>;
  const submit = () => {
    const rows = text
      .split(/\r?\n/)
      .map((l) => l.split(/\t|,/).map((x) => x.trim()))
      .filter((r) => r[0]);
    if (rows.length) onAdd(rows);
    setText('');
    setOpen(false);
  };
  return (
    <div className="card" style={{ width: '100%' }}>
      <h3>Bulk add</h3>
      <p className="muted small">{hint} One per line, columns separated by commas or tabs (paste straight from a spreadsheet).</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus />
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
