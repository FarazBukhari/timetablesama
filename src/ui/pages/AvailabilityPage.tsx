import { useEffect, useRef, useState } from 'react';
import { teachingPeriods } from '../../model/defaults';
import { slotKey, type EntityKind, type Project } from '../../model/types';
import { PageHead } from '../components';
import { useProject } from '../store';

const KINDS: { kind: EntityKind; key: 'teachers' | 'classes' | 'rooms' | 'subjects'; label: string }[] = [
  { kind: 'teacher', key: 'teachers', label: 'Teachers' },
  { kind: 'class', key: 'classes', label: 'Classes' },
  { kind: 'room', key: 'rooms', label: 'Rooms' },
  { kind: 'subject', key: 'subjects', label: 'Subjects' },
];

export function AvailabilityPage() {
  const { project, update } = useProject();
  const [kind, setKind] = useState<EntityKind>('teacher');
  const meta = KINDS.find((k) => k.kind === kind)!;
  const list = project[meta.key] as { id: string; name: string; unavailable: string[] }[];
  const [selected, setSelected] = useState('');
  const entity = list.find((e) => e.id === selected) ?? list[0];
  const tp = teachingPeriods(project.school.periods);
  const days = project.school.days;
  const drag = useRef<{ on: boolean } | null>(null);

  useEffect(() => {
    const stop = () => (drag.current = null);
    window.addEventListener('pointerup', stop);
    return () => window.removeEventListener('pointerup', stop);
  }, []);

  const setSlots = (keys: string[], off: boolean) => {
    if (!entity) return;
    update((p: Project) => ({
      ...p,
      [meta.key]: (p[meta.key] as typeof list).map((e) => {
        if (e.id !== entity.id) return e;
        const set = new Set(e.unavailable);
        keys.forEach((k) => (off ? set.add(k) : set.delete(k)));
        return { ...e, unavailable: [...set] };
      }),
    }));
  };
  const isOff = (k: string) => !!entity?.unavailable.includes(k);
  const toggleAll = (keys: string[]) => setSlots(keys, !keys.every(isOff));

  return (
    <>
      <PageHead
        title="Availability"
        desc="Click a box to mark a time when someone or something is not available. Click again to undo. You can drag across several boxes."
      />
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <div className="tabs" role="tablist">
            {KINDS.map((k) => (
              <button key={k.kind} role="tab" aria-selected={kind === k.kind} className={kind === k.kind ? 'active' : ''}
                onClick={() => { setKind(k.kind); setSelected(''); }}>
                {k.label}
              </button>
            ))}
          </div>
          <select value={entity?.id ?? ''} aria-label={`Choose ${meta.label}`} onChange={(e) => setSelected(e.target.value)} style={{ minWidth: 200 }}>
            {list.map((e) => (
              <option key={e.id} value={e.id}>{e.name}{e.unavailable.length ? ` (${e.unavailable.length} blocked)` : ''}</option>
            ))}
          </select>
          <span className="spacer" />
          {entity && <button className="btn sm" onClick={() => setSlots(entity.unavailable, false)}>Clear all</button>}
        </div>

        {!entity ? (
          <div className="empty">No {meta.label.toLowerCase()} yet.</div>
        ) : !tp.length || !days.length ? (
          <div className="empty">Set up days and periods on the School page first.</div>
        ) : (
          <div className="table-wrap">
            <table className="avail">
              <thead>
                <tr>
                  <th />
                  {tp.map((t, p) => (
                    <th key={t.period.id} style={{ cursor: 'pointer' }} title="Toggle this period on every day"
                      onClick={() => toggleAll(days.map((_, d) => slotKey(d, p)))}>
                      {t.period.name.replace(/^Period\s*/i, 'P')}
                      <div className="muted" style={{ fontWeight: 400 }}>{t.period.start}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {days.map((day, d) => (
                  <tr key={d}>
                    <th style={{ textAlign: 'left', cursor: 'pointer' }} title="Toggle the whole day"
                      onClick={() => toggleAll(tp.map((_, p) => slotKey(d, p)))}>{day}</th>
                    {tp.map((_, p) => {
                      const k = slotKey(d, p);
                      const off = isOff(k);
                      return (
                        <td key={k} className={`slot${off ? ' off' : ''}`} aria-label={`${day} period ${p + 1}: ${off ? 'unavailable' : 'available'}`}
                          role="checkbox" aria-checked={!off} tabIndex={0}
                          onPointerDown={(e) => { e.preventDefault(); drag.current = { on: !off }; setSlots([k], !off); }}
                          onPointerEnter={() => drag.current && isOff(k) !== drag.current.on && setSlots([k], drag.current.on)}
                          onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setSlots([k], !off))}>
                          {off ? 'Off' : 'Free'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="legend">
          <span><span className="dot" style={{ background: 'var(--ok-field)' }} /> Free: lessons can go here</span>
          <span><span className="dot" style={{ background: 'var(--danger-field)' }} /> Off: no lessons here</span>
          <span>Tip: click a day or period name to change the whole row or column.</span>
        </div>
      </div>
    </>
  );
}
