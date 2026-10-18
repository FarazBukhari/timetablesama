import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  buildGrid, cardResolver, cardsToCsv, downloadText, gridToCsv, projectToExcelXml,
  type CellEntry, type ResolvedCard, type ViewKind,
} from '../../export';
import { teachingPeriods, uid, unitLengths } from '../../model/defaults';
import { slotKey, type Card, type Project } from '../../model/types';
import { lessonRooms } from '../../solver/context';
import { checkMove, findViolations, suggestRoom, type Violation } from '../../solver';
import { PageHead } from '../components';
import { ArrowLeft, ArrowRight, Lock } from '../icons';
import { useProject } from '../store';

type Drag = { type: 'card'; cardId: string } | { type: 'unit'; lessonId: string; unit: number };
type View = ViewKind | 'overview';

const TMP = '__drag__';

/** Checks whether a dragged card or tray unit may be dropped at (day, period). */
function evaluateDrop(project: Project, drag: Drag, day: number, period: number): { ok: boolean; roomId?: string; violations: Violation[] } {
  let p = project;
  let cardId: string;
  if (drag.type === 'unit') {
    p = { ...project, cards: [...project.cards, { id: TMP, lessonId: drag.lessonId, unit: drag.unit, day: -1, period: -1, locked: false }] };
    cardId = TMP;
  } else cardId = drag.cardId;
  const roomId = suggestRoom(p, cardId, day, period);
  const violations = checkMove(p, cardId, day, period, roomId ?? '');
  return { ok: !violations.length, roomId, violations };
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'timetable';

export function TimetablePage() {
  const { project, update, backup } = useProject();
  const [view, setView] = useState<View>('class');
  const [entityId, setEntityId] = useState('');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [printAll, setPrintAll] = useState<ViewKind | null>(null);

  const kind: ViewKind = view === 'overview' ? 'class' : view;
  const list = kind === 'class' ? project.classes : kind === 'teacher' ? project.teachers : project.rooms;
  const entity = list.find((e) => e.id === entityId) ?? list[0];
  const tp = teachingPeriods(project.school.periods);
  const resolve = useMemo(() => cardResolver(project), [project]);
  const violations = useMemo(() => findViolations(project), [project]);
  const clashIds = useMemo(() => new Set(violations.flatMap((v) => v.cardIds)), [violations]);

  // Precompute drop validity for every slot while dragging.
  const dropMap = useMemo(() => {
    if (!drag) return null;
    const m = new Map<string, ReturnType<typeof evaluateDrop>>();
    project.school.days.forEach((_, d) => tp.forEach((_, p) => m.set(slotKey(d, p), evaluateDrop(project, drag, d, p))));
    return m;
  }, [drag, project, tp]);

  useEffect(() => {
    if (!printAll) return;
    const t = setTimeout(() => {
      window.print();
      setPrintAll(null);
    }, 100);
    return () => clearTimeout(t);
  }, [printAll]);

  const flash = (kind: 'error' | 'ok', text: string) => {
    setMessage({ kind, text });
    setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 4000);
  };

  const drop = (day: number, period: number) => {
    if (!drag) return;
    const res = evaluateDrop(project, drag, day, period);
    setDrag(null);
    if (!res.ok) {
      flash('error', `Can't move there: ${res.violations[0]?.message ?? 'clash'}`);
      return;
    }
    if (drag.type === 'card') {
      update((p) => ({ ...p, cards: p.cards.map((c) => (c.id === drag.cardId ? { ...c, day, period, roomId: res.roomId } : c)) }));
    } else {
      const card: Card = { id: uid('k'), lessonId: drag.lessonId, unit: drag.unit, day, period, roomId: res.roomId, locked: false };
      update((p) => ({
        ...p,
        cards: [...p.cards, card],
        unplaced: p.unplaced.filter((u) => !(u.lessonId === drag.lessonId && u.unit === drag.unit)),
      }));
    }
  };

  const selectedCard = project.cards.find((c) => c.id === selected);
  const selectedInfo = selectedCard ? resolve(selectedCard) : null;
  const patchCard = (id: string, patch: Partial<Card>) => update((p) => ({ ...p, cards: p.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const unschedule = (c: Card) => {
    const l = project.lessons.find((x) => x.id === c.lessonId);
    update((p) => ({
      ...p,
      cards: p.cards.filter((x) => x.id !== c.id),
      unplaced: [...p.unplaced, { lessonId: c.lessonId, unit: c.unit, length: l ? unitLengths(l)[c.unit] ?? 1 : 1, reason: 'Removed by hand.' }],
    }));
    setSelected(null);
  };

  // Tray: units with no card (unplaced by the generator or by hand, or lessons added later).
  const tray = useMemo(() => {
    const placed = new Set(project.cards.map((c) => `${c.lessonId}#${c.unit}`));
    return project.lessons.flatMap((l) => unitLengths(l).map((len, unit) => ({ lesson: l, unit, len })).filter((u) => !placed.has(`${l.id}#${u.unit}`)));
  }, [project.cards, project.lessons]);

  const fileBase = slug(project.school.name);
  const exportsBar = (
    <>
      <button className="btn" onClick={() => downloadText(`${fileBase}.xls`, projectToExcelXml(project), 'application/vnd.ms-excel')} disabled={!project.cards.length}>Excel</button>
      <button className="btn" onClick={() => downloadText(`${fileBase}-lessons.csv`, cardsToCsv(project), 'text/csv;charset=utf-8')} disabled={!project.cards.length}>CSV</button>
      {view !== 'overview' && entity && (
        <button className="btn" onClick={() => downloadText(`${fileBase}-${slug(entity.name)}.csv`, gridToCsv(project, kind, entity.id), 'text/csv;charset=utf-8')}>CSV (this view)</button>
      )}
      <button className="btn" onClick={() => window.print()}>Print / PDF</button>
      <button className="btn" onClick={() => setPrintAll(kind)} title={`Print every ${kind} timetable, one per page`}>Print all {kind === 'class' ? 'classes' : `${kind}s`}</button>
      <button className="btn" onClick={backup} title="Download the whole project as a file you can import later">Download backup</button>
    </>
  );

  if (!project.lessons.length) {
    return (
      <>
        <PageHead title="View & print" />
        <div className="card empty">Add lessons and generate a timetable first.</div>
      </>
    );
  }

  if (printAll) {
    const all = printAll === 'class' ? project.classes : printAll === 'teacher' ? project.teachers : project.rooms;
    return (
      <div>
        {all.map((e) => (
          <div key={e.id} className="print-page">
            <h2>{project.school.name} · {e.name}</h2>
            <p className="muted small">{project.school.academicYear}</p>
            <TimetableGrid project={project} kind={printAll} entityId={e.id} resolve={resolve} readOnly />
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <PageHead title="View & print" desc="To move a lesson, drag it to another box. Green boxes are free; red boxes would cause a clash. Click a lesson to lock it in place or change its room.">
        {exportsBar}
      </PageHead>

      <div className="card">
        <div className="row no-print" style={{ marginBottom: 12 }}>
          <div className="tabs" role="tablist">
            {(['class', 'teacher', 'room', 'overview'] as View[]).map((v) => (
              <button key={v} role="tab" aria-selected={view === v} className={view === v ? 'active' : ''} onClick={() => { setView(v); setEntityId(''); }}>
                {v === 'class' ? 'Classes' : v === 'teacher' ? 'Teachers' : v === 'room' ? 'Rooms' : 'Overview'}
              </button>
            ))}
          </div>
          {view !== 'overview' && (
            <>
              <button className="btn sm" onClick={() => {
                const i = list.findIndex((e) => e.id === entity?.id);
                setEntityId(list[(i - 1 + list.length) % list.length]?.id ?? '');
              }}><ArrowLeft className="icon" />Previous</button>
              <select value={entity?.id ?? ''} onChange={(e) => setEntityId(e.target.value)} aria-label="Choose timetable" style={{ minWidth: 180 }}>
                {list.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button className="btn sm" onClick={() => {
                const i = list.findIndex((e) => e.id === entity?.id);
                setEntityId(list[(i + 1) % list.length]?.id ?? '');
              }}>Next<ArrowRight className="icon" /></button>
            </>
          )}
          <span className="spacer" />
          {violations.length > 0 && <span className="chip" style={{ color: 'var(--danger)' }}>{violations.length} clashes</span>}
          {project.cards.some((c) => !c.locked) && (
            <button className="btn sm" onClick={() => update((p) => ({ ...p, cards: p.cards.map((c) => ({ ...c, locked: true })) }))}>Lock all</button>
          )}
          {project.cards.some((c) => c.locked) && (
            <button className="btn sm" onClick={() => update((p) => ({ ...p, cards: p.cards.map((c) => ({ ...c, locked: false })) }))}>Unlock all</button>
          )}
        </div>

        <div className="print-only">
          <h2>{project.school.name} · {view === 'overview' ? 'All classes' : entity?.name}</h2>
          <p>{project.school.academicYear}</p>
        </div>

        {message && <div className={`alert ${message.kind}`} role="status">{message.text}</div>}

        {view === 'overview' ? (
          <Overview project={project} resolve={resolve} onOpen={(id) => { setView('class'); setEntityId(id); }} />
        ) : entity ? (
          <TimetableGrid
            project={project}
            kind={kind}
            entityId={entity.id}
            resolve={resolve}
            dropMap={dropMap}
            clashIds={clashIds}
            selected={selected}
            onSelect={setSelected}
            onDragStart={setDrag}
            onDragEnd={() => setDrag(null)}
            onDrop={drop}
          />
        ) : (
          <div className="empty">Nothing to show.</div>
        )}
        {!project.cards.length && <p className="muted" style={{ marginTop: 10 }}>No timetable yet. Go to <b>Generate</b>, or drag lessons from the tray below.</p>}
      </div>

      {selectedCard && selectedInfo && (
        <div className="card no-print">
          <div className="row">
            <span className="dot" style={{ background: selectedInfo.subject?.color }} />
            <h3 style={{ margin: 0 }}>{selectedInfo.subject?.name}</h3>
            <span className="muted">
              {selectedInfo.classes.map((c) => c.name).join(' + ')} · {selectedInfo.teachers.map((t) => t.name).join(', ') || 'no teacher'} ·{' '}
              {project.school.days[selectedCard.day]} P{selectedCard.period + 1}
            </span>
            <span className="spacer" />
            {lessonRooms(project, selectedInfo.lesson).length > 0 && (
              <select value={selectedCard.roomId ?? ''} aria-label="Room" onChange={(e) => {
                const v = checkMove(project, selectedCard.id, selectedCard.day, selectedCard.period, e.target.value);
                if (v.length) flash('error', v[0].message);
                else patchCard(selectedCard.id, { roomId: e.target.value || undefined });
              }}>
                {lessonRooms(project, selectedInfo.lesson).map((r) => (
                  <option key={r} value={r}>{project.rooms.find((x) => x.id === r)?.name}</option>
                ))}
              </select>
            )}
            <button className="btn sm" onClick={() => patchCard(selectedCard.id, { locked: !selectedCard.locked })}>
              {selectedCard.locked ? 'Unlock' : 'Lock in place'}
            </button>
            <button className="btn sm" onClick={() => unschedule(selectedCard)}>Unschedule</button>
            <button className="btn sm ghost" onClick={() => setSelected(null)}>Close</button>
          </div>
          {violations.filter((v) => v.cardIds.includes(selectedCard.id)).map((v, i) => (
            <div key={i} className="alert error" style={{ marginTop: 8, marginBottom: 0 }}>{v.message}</div>
          ))}
        </div>
      )}

      {tray.length > 0 && (
        <div className="card no-print tray-card">
          <h3>Unscheduled ({tray.length})</h3>
          <p className="muted small">Drag these onto the timetable, or regenerate. Generator reasons are on the Generate page.</p>
          <div className="tray">
            {tray.map(({ lesson, unit, len }) => {
              const s = project.subjects.find((x) => x.id === lesson.subjectId);
              const reason = project.unplaced.find((u) => u.lessonId === lesson.id && u.unit === unit)?.reason;
              return (
                <div
                  key={`${lesson.id}#${unit}`}
                  className="lesson-card"
                  style={{ '--c': s?.color } as CSSProperties}
                  draggable
                  title={reason}
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', lesson.id); setDrag({ type: 'unit', lessonId: lesson.id, unit }); }}
                  onDragEnd={() => setDrag(null)}
                >
                  <b>{s?.code ?? '?'} {len > 1 ? `×${len}` : ''}</b>
                  <span>{lesson.classIds.map((c) => project.classes.find((x) => x.id === c)?.name).join('+')}</span>
                  <span>{lesson.teacherIds.map((t) => project.teachers.find((x) => x.id === t)?.code).join(', ')}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

// ---------- grid ----------

interface GridProps {
  project: Project;
  kind: ViewKind;
  entityId: string;
  resolve: (c: Card) => ResolvedCard | null;
  readOnly?: boolean;
  dropMap?: Map<string, { ok: boolean }> | null;
  clashIds?: Set<string>;
  selected?: string | null;
  onSelect?: (id: string | null) => void;
  onDragStart?: (d: Drag) => void;
  onDragEnd?: () => void;
  onDrop?: (day: number, period: number) => void;
}

function cardLines(e: ResolvedCard, kind: ViewKind): [string, string] {
  const teachers = e.teachers.map((t) => t.code || t.name).join(', ');
  const classes = e.classes.map((c) => c.name).join('+');
  const room = e.room?.name ?? '';
  if (kind === 'class') return [teachers, room];
  if (kind === 'teacher') return [classes, room];
  return [classes, teachers];
}

function TimetableGrid({ project, kind, entityId, resolve, readOnly, dropMap, clashIds, selected, onSelect, onDragStart, onDragEnd, onDrop }: GridProps) {
  const grid = buildGrid(project, kind, entityId);
  const periods = project.school.periods;
  const tp = teachingPeriods(periods);
  const entity = [...project.classes, ...project.teachers, ...project.rooms].find((e) => e.id === entityId);
  const unavailable = new Set(entity?.unavailable ?? []);

  // Column list with teaching-period index or break marker.
  const cols = periods.map((p) => (p.isBreak ? { brk: p } : { idx: tp.findIndex((t) => t.period.id === p.id), p }));

  return (
    <div className="tt-wrap">
      <table className="tt">
        <thead>
          <tr>
            <th className="day" />
            {cols.map((c, i) =>
              'brk' in c ? (
                <th key={i} className="brk" title={c.brk!.name}><span>{c.brk!.name}</span></th>
              ) : (
                <th key={i}>{c.p.name}<span className="time">{c.p.start}–{c.p.end}</span></th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {project.school.days.map((day, d) => {
            const cells = [];
            for (let i = 0; i < cols.length; i++) {
              const c = cols[i];
              if ('brk' in c) {
                cells.push(<td key={i} className="brk" />);
                continue;
              }
              const p = c.idx;
              const entry: CellEntry | null = grid[d]?.[p] ?? null;
              const key = slotKey(d, p);
              const drop = dropMap?.get(key);
              const cls = [drop ? (drop.ok ? 'drop-ok' : 'drop-bad') : '', unavailable.has(key) ? 'unavail' : ''].join(' ');
              const dropHandlers = readOnly ? {} : {
                onDragOver: (e: React.DragEvent) => e.preventDefault(),
                onDrop: (e: React.DragEvent) => { e.preventDefault(); onDrop?.(d, p); },
              };
              if (entry && !entry.isStart) continue; // covered by colSpan of the starting cell
              let span = 1;
              if (entry) {
                // Span consecutive teaching columns with no break column in between.
                while (i + span < cols.length && !('brk' in cols[i + span]) && grid[d]?.[p + span]?.card.id === entry.card.id) span++;
              }
              cells.push(
                <td key={i} className={cls} colSpan={span} {...dropHandlers}>
                  {entry && (
                    <LessonCard
                      entry={entry}
                      kind={kind}
                      readOnly={readOnly}
                      clash={clashIds?.has(entry.card.id)}
                      selected={selected === entry.card.id}
                      onClick={() => onSelect?.(selected === entry.card.id ? null : entry.card.id)}
                      onDragStart={() => onDragStart?.({ type: 'card', cardId: entry.card.id })}
                      onDragEnd={onDragEnd}
                    />
                  )}
                </td>,
              );
              i += span - 1;
            }
            return (
              <tr key={d}>
                <th className="day">{day}</th>
                {cells}
              </tr>
            );
          })}
        </tbody>
      </table>
      <Legend project={project} kind={kind} entityId={entityId} resolve={resolve} />
    </div>
  );
}

function LessonCard({ entry, kind, readOnly, clash, selected, onClick, onDragStart, onDragEnd }: {
  entry: CellEntry; kind: ViewKind; readOnly?: boolean; clash?: boolean; selected?: boolean;
  onClick: () => void; onDragStart: () => void; onDragEnd?: () => void;
}) {
  const [a, b] = cardLines(entry, kind);
  const draggable = !readOnly && !entry.card.locked;
  return (
    <div
      className={`lesson-card${entry.card.locked ? ' locked' : ''}${clash ? ' clash' : ''}${selected ? ' selected' : ''}`}
      style={{ '--c': entry.subject?.color } as CSSProperties}
      draggable={draggable}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      onClick={readOnly ? undefined : onClick}
      onKeyDown={(e) => !readOnly && e.key === 'Enter' && onClick()}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', entry.card.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      title={`${entry.subject?.name ?? ''}${entry.card.locked ? ' (locked)' : ''}`}
    >
      {entry.card.locked && <Lock className="lock" aria-label="Locked in place" />}
      <b>{entry.subject?.name ?? '?'}</b>
      {a && <span>{a}</span>}
      {b && <span>{b}</span>}
    </div>
  );
}

function Legend({ project, kind, entityId, resolve }: { project: Project; kind: ViewKind; entityId: string; resolve: (c: Card) => ResolvedCard | null }) {
  const rows = new Map<string, { name: string; color?: string; periods: number; teachers: string }>();
  for (const card of project.cards) {
    const r = resolve(card);
    if (!r) continue;
    const mine = kind === 'class' ? r.lesson.classIds.includes(entityId) : kind === 'teacher' ? r.lesson.teacherIds.includes(entityId) : card.roomId === entityId;
    if (!mine) continue;
    const key = r.lesson.subjectId;
    const len = unitLengths(r.lesson)[card.unit] ?? 1;
    const prev = rows.get(key);
    rows.set(key, {
      name: r.subject?.name ?? '?',
      color: r.subject?.color,
      periods: (prev?.periods ?? 0) + len,
      teachers: prev?.teachers ?? r.teachers.map((t) => t.name).join(', '),
    });
  }
  const total = [...rows.values()].reduce((n, r) => n + r.periods, 0);
  return (
    <div className="legend">
      {[...rows.values()].map((r) => (
        <span key={r.name}><span className="dot" style={{ background: r.color }} /> {r.name} · {r.periods}{kind === 'class' && r.teachers ? ` · ${r.teachers}` : ''}</span>
      ))}
      <span><b>{total}</b> periods / week</span>
    </div>
  );
}

function Overview({ project, resolve, onOpen }: { project: Project; resolve: (c: Card) => ResolvedCard | null; onOpen: (classId: string) => void }) {
  const tp = teachingPeriods(project.school.periods);
  return (
    <div className="tt-wrap">
      <table className="tt overview" style={{ minWidth: 120 + project.school.days.length * tp.length * 46 }}>
        <thead>
          <tr>
            <th className="cls day" rowSpan={2}>Class</th>
            {project.school.days.map((d) => <th key={d} colSpan={tp.length}>{d}</th>)}
          </tr>
          <tr>{project.school.days.flatMap((d) => tp.map((_, p) => <th key={`${d}${p}`}>{p + 1}</th>))}</tr>
        </thead>
        <tbody>
          {project.classes.map((c) => {
            const grid = buildGrid(project, 'class', c.id);
            return (
              <tr key={c.id}>
                <th className="cls day" style={{ cursor: 'pointer' }} onClick={() => onOpen(c.id)}>{c.name}</th>
                {project.school.days.flatMap((_, d) =>
                  tp.map((__, p) => {
                    const e = grid[d]?.[p];
                    const r = e ? resolve(e.card) : null;
                    return (
                      <td key={`${d}:${p}`}>
                        {r && (
                          <div className="lesson-card" style={{ '--c': r.subject?.color, cursor: 'default' } as CSSProperties} title={`${r.subject?.name} · ${r.teachers.map((t) => t.name).join(', ')}`}>
                            <b>{r.subject?.code}</b>
                            <span>{r.teachers.map((t) => t.code).join(',')}</span>
                          </div>
                        )}
                      </td>
                    );
                  }),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
