import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  buildGrid, cardResolver, cardsToCsv, downloadText, gridToCsv, projectToExcelXml,
  type CellEntry, type ResolvedCard, type ViewKind,
} from '../../export';
import { teachingPeriods, unitLengths } from '../../model/defaults';
import { slotKey, type Card, type Project } from '../../model/types';
import { lessonRooms } from '../../solver/context';
import { applyMove, checkMove, clearCards, findViolations, planMove, type MoveMode, type MovePlan, type MoveSource } from '../../solver';
import { PageHead } from '../components';
import { ArrowLeft, ArrowRight, IconPin, Lock } from '../icons';
import { useProject } from '../store';

type View = ViewKind | 'overview';
type Pending = { src: MoveSource; day: number; period: number; plan: MovePlan };

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'timetable';
const sameSource = (a: MoveSource | null, b: MoveSource | null) =>
  !!a && !!b && (a.type === 'card' && b.type === 'card' ? a.cardId === b.cardId
    : a.type === 'unit' && b.type === 'unit' && a.lessonId === b.lessonId && a.unit === b.unit);

export function TimetablePage() {
  const { project, update, backup } = useProject();
  const [view, setView] = useState<View>('class');
  const [entityId, setEntityId] = useState('');
  const [drag, setDrag] = useState<MoveSource | null>(null);
  const [pick, setPick] = useState<MoveSource | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const [printAll, setPrintAll] = useState<ViewKind | null>(null);
  const autoLock = project.school.settings.autoLockMoves;

  const kind: ViewKind = view === 'overview' ? 'class' : view;
  const list = kind === 'class' ? project.classes : kind === 'teacher' ? project.teachers : project.rooms;
  const entity = list.find((e) => e.id === entityId) ?? list[0];
  const tp = teachingPeriods(project.school.periods);
  const resolve = useMemo(() => cardResolver(project), [project]);
  const violations = useMemo(() => findViolations(project), [project]);
  const clashIds = useMemo(() => new Set(violations.flatMap((v) => v.cardIds)), [violations]);

  // While a lesson is being dragged or has been tapped, work out what every box would do.
  const moving = drag ?? pick;
  const dropMap = useMemo(() => {
    if (!moving) return null;
    const m = new Map<string, MovePlan>();
    project.school.days.forEach((_, d) => tp.forEach((_, p) => m.set(slotKey(d, p), planMove(project, moving, d, p))));
    return m;
  }, [moving, project, tp]);

  useEffect(() => {
    if (!printAll) return;
    const t = setTimeout(() => {
      window.print();
      setPrintAll(null);
    }, 100);
    return () => clearTimeout(t);
  }, [printAll]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setPending(null);
      setPick(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flash = (kind: 'error' | 'ok', text: string) => {
    setMessage({ kind, text });
    setTimeout(() => setMessage((m) => (m?.text === text ? null : m)), 5000);
  };

  const commit = (src: MoveSource, day: number, period: number, mode: MoveMode) => {
    update((p) => applyMove(p, src, day, period, mode, autoLock));
    setPending(null);
    setPick(null);
    const where = `${project.school.days[day]}, ${tp[period]?.period.name ?? `period ${period + 1}`}`;
    const what = mode === 'swap' ? 'Swapped' : mode === 'bump' ? 'Moved, and the other lesson went to Unscheduled' : 'Moved';
    flash('ok', `${what}: ${where}.${autoLock ? ' Locked in place, so creating the timetable again keeps it there.' : ''}`);
  };

  /** Called when a lesson is dropped on, or tapped onto, a box. */
  const attempt = (src: MoveSource, day: number, period: number) => {
    const plan = planMove(project, src, day, period);
    if (plan.status === 'free') commit(src, day, period, 'place');
    else if (plan.status === 'occupied' && (plan.canBump || plan.canSwap)) setPending({ src, day, period, plan });
    else flash('error', `Can't move there: ${plan.reason ?? 'it would cause a clash'}`);
  };

  const onDrop = (day: number, period: number) => {
    if (!drag) return;
    const src = drag;
    setDrag(null);
    attempt(src, day, period);
  };
  const onTarget = (day: number, period: number) => {
    if (pick) attempt(pick, day, period);
  };

  const pickedCard = pick?.type === 'card' ? project.cards.find((c) => c.id === pick.cardId) : undefined;
  const pickedInfo = pickedCard ? resolve(pickedCard) : null;
  const pickedUnit = pick?.type === 'unit' ? project.lessons.find((l) => l.id === pick.lessonId) : undefined;
  const patchCard = (id: string, patch: Partial<Card>) => update((p) => ({ ...p, cards: p.cards.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const unschedule = (c: Card) => {
    const l = project.lessons.find((x) => x.id === c.lessonId);
    update((p) => ({
      ...p,
      cards: p.cards.filter((x) => x.id !== c.id),
      unplaced: [...p.unplaced, { lessonId: c.lessonId, unit: c.unit, length: l ? unitLengths(l)[c.unit] ?? 1 : 1, reason: 'Removed by hand.' }],
    }));
    setPick(null);
  };
  const clear = (keepLocked: boolean) => {
    const n = project.cards.filter((c) => !c.fixed && !(keepLocked && c.locked)).length;
    if (!n) return flash('ok', 'Nothing to clear.');
    const what = keepLocked ? 'unlocked lessons' : 'lessons (fixed ones stay)';
    if (!window.confirm(`Move ${n} ${what} back to Unscheduled? You can undo this.`)) return;
    update((p) => clearCards(p, keepLocked));
    setPick(null);
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

  const unlocked = project.cards.filter((c) => !c.locked && !c.fixed).length;
  const lockedCount = project.cards.filter((c) => c.locked && !c.fixed).length;

  return (
    <>
      <PageHead
        title="View & print"
        desc="To move a lesson, drag it to another box, or tap it and then tap the box. Green boxes are free. Amber boxes are taken, but you can swap or make room. Red boxes aren't allowed."
      >
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
        </div>

        <div className="row no-print tt-tools">
          <label className="check">
            <input
              type="checkbox"
              checked={autoLock}
              onChange={(e) => update((p) => ({ ...p, school: { ...p.school, settings: { ...p.school.settings, autoLockMoves: e.target.checked } } }))}
            />
            Lock lessons I move by hand
          </label>
          <span className="spacer" />
          <button className="btn sm" disabled={!unlocked} onClick={() => update((p) => ({ ...p, cards: p.cards.map((c) => (c.fixed ? c : { ...c, locked: true })) }))}>Lock all</button>
          <button className="btn sm" disabled={!lockedCount} onClick={() => update((p) => ({ ...p, cards: p.cards.map((c) => (c.fixed ? c : { ...c, locked: false })) }))}>Unlock all</button>
          <button className="btn sm" disabled={!unlocked} onClick={() => clear(true)}>Clear unlocked lessons</button>
          <button className="btn sm danger" disabled={!project.cards.some((c) => !c.fixed)} onClick={() => clear(false)}>Clear all</button>
        </div>

        <div className="print-only">
          <h2>{project.school.name} · {view === 'overview' ? 'All classes' : entity?.name}</h2>
          <p>{project.school.academicYear}</p>
        </div>

        {message && <div className={`alert ${message.kind}`} role="status">{message.text}</div>}

        {moving && view !== 'overview' && (
          <div className="legend drop-legend no-print" aria-live="polite">
            <span><span className="dot" style={{ background: 'var(--ok-field)' }} /> Free</span>
            <span><span className="dot" style={{ background: 'var(--warn-field)' }} /> Taken: swap or make room</span>
            <span><span className="dot" style={{ background: 'var(--danger-field)' }} /> Not allowed</span>
          </div>
        )}

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
            picked={pick?.type === 'card' ? pick.cardId : null}
            onCardTap={(card) => {
              if (pick && !sameSource(pick, { type: 'card', cardId: card.id })) attempt(pick, card.day, card.period);
              else setPick(pick ? null : { type: 'card', cardId: card.id });
            }}
            onCellTap={onTarget}
            onDragStart={(src) => { setPick(null); setDrag(src); }}
            onDragEnd={() => setDrag(null)}
            onDrop={onDrop}
          />
        ) : (
          <div className="empty">Nothing to show.</div>
        )}
        {!project.cards.length && <p className="muted" style={{ marginTop: 10 }}>No timetable yet. Go to <b>Create timetable</b>, or place lessons from Unscheduled below.</p>}
      </div>

      {pickedCard && pickedInfo && (
        <div className="card no-print picked-panel">
          <div className="row">
            <span className="dot" style={{ background: pickedInfo.subject?.color }} />
            <h3 style={{ margin: 0 }}>{pickedInfo.subject?.name}</h3>
            <span className="muted">
              {pickedInfo.classes.map((c) => c.name).join(' + ')} · {pickedInfo.teachers.map((t) => t.name).join(', ') || 'no teacher'} ·{' '}
              {project.school.days[pickedCard.day]}, {tp[pickedCard.period]?.period.name}
              {pickedCard.fixed ? ' · fixed to this slot' : pickedCard.locked ? ' · locked' : ''}
            </span>
            <span className="spacer" />
            {lessonRooms(project, pickedInfo.lesson).length > 0 && (
              <select value={pickedCard.roomId ?? ''} aria-label="Room" onChange={(e) => {
                const v = checkMove(project, pickedCard.id, pickedCard.day, pickedCard.period, e.target.value);
                if (v.length) flash('error', v[0].message);
                else patchCard(pickedCard.id, { roomId: e.target.value || undefined });
              }}>
                {lessonRooms(project, pickedInfo.lesson).map((r) => (
                  <option key={r} value={r}>{project.rooms.find((x) => x.id === r)?.name}</option>
                ))}
              </select>
            )}
            {!pickedCard.fixed && (
              <button className="btn sm" onClick={() => patchCard(pickedCard.id, { locked: !pickedCard.locked })}>
                {pickedCard.locked ? 'Unlock' : 'Lock in place'}
              </button>
            )}
            <button className="btn sm" onClick={() => patchCard(pickedCard.id, pickedCard.fixed ? { fixed: false } : { fixed: true, locked: true })}>
              {pickedCard.fixed ? 'Unfix' : 'Fix to this slot'}
            </button>
            {!pickedCard.fixed && <button className="btn sm" onClick={() => unschedule(pickedCard)}>Unschedule</button>}
            <button className="btn sm ghost" onClick={() => setPick(null)}>Close</button>
          </div>
          <p className="help">
            {pickedCard.fixed
              ? 'Fixed lessons never move, even with “Unlock all” or “Clear all”. Unfix it to move it.'
              : 'To move it, tap a green or amber box above, or drag it.'}
          </p>
          {violations.filter((v) => v.cardIds.includes(pickedCard.id)).map((v, i) => (
            <div key={i} className="alert error" style={{ marginTop: 8, marginBottom: 0 }}>{v.message}</div>
          ))}
        </div>
      )}

      {pickedUnit && pick?.type === 'unit' && (
        <div className="card no-print picked-panel">
          <div className="row">
            <h3 style={{ margin: 0 }}>Placing {project.subjects.find((s) => s.id === pickedUnit.subjectId)?.name}</h3>
            <span className="muted">{pickedUnit.classIds.map((c) => project.classes.find((x) => x.id === c)?.name).join(' + ')}</span>
            <span className="spacer" />
            <button className="btn sm ghost" onClick={() => setPick(null)}>Cancel</button>
          </div>
          <p className="help">Tap a green box to put it there, or an amber box to make room for it.</p>
        </div>
      )}

      {tray.length > 0 && (
        <div className="card no-print tray-card">
          <h3>Unscheduled ({tray.length})</h3>
          <p className="muted small">Drag one onto the timetable, or tap it and then tap a box. Reasons from the generator are on the Create timetable page.</p>
          <div className="tray">
            {tray.map(({ lesson, unit, len }) => {
              const s = project.subjects.find((x) => x.id === lesson.subjectId);
              const reason = project.unplaced.find((u) => u.lessonId === lesson.id && u.unit === unit)?.reason;
              const src: MoveSource = { type: 'unit', lessonId: lesson.id, unit };
              const isPicked = sameSource(pick, src);
              return (
                <div
                  key={`${lesson.id}#${unit}`}
                  className={`lesson-card${isPicked ? ' selected' : ''}`}
                  style={{ '--c': s?.color } as CSSProperties}
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-pressed={isPicked}
                  title={reason}
                  onClick={() => setPick(isPicked ? null : src)}
                  onKeyDown={(e) => e.key === 'Enter' && setPick(isPicked ? null : src)}
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', lesson.id); setPick(null); setDrag(src); }}
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

      {pending && <MoveDialog project={project} pending={pending} onChoose={(mode) => commit(pending.src, pending.day, pending.period, mode)} onCancel={() => setPending(null)} />}
    </>
  );
}

// ---------- the "that box is taken" dialog ----------

function MoveDialog({ project, pending, onChoose, onCancel }: { project: Project; pending: Pending; onChoose: (m: MoveMode) => void; onCancel: () => void }) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => first.current?.focus(), []);
  const resolve = cardResolver(project);
  const src = pending.src;
  const movingLesson = project.lessons.find((l) =>
    src.type === 'unit' ? l.id === src.lessonId : l.id === project.cards.find((c) => c.id === src.cardId)?.lessonId);
  /** Says why each lesson is in the way: same class, same teacher or same room. */
  const why = (r: ResolvedCard) => {
    if (!movingLesson) return '';
    if (r.lesson.classIds.some((c) => movingLesson.classIds.includes(c))) return 'same class';
    const t = r.teachers.find((x) => movingLesson.teacherIds.includes(x.id));
    if (t) return `${t.name} teaches it`;
    return r.room ? `uses ${r.room.name}` : '';
  };
  const items = pending.plan.blockers
    .map((b) => resolve(b))
    .filter((r): r is ResolvedCard => !!r)
    .map((r) => `${r.subject?.name ?? 'Lesson'} for ${r.classes.map((c) => c.name).join(' + ')}${why(r) ? ` (${why(r)})` : ''}${r.card.locked ? ', locked' : ''}`);
  const names = items;
  const where = `${project.school.days[pending.day]}, ${teachingPeriods(project.school.periods)[pending.period]?.period.name ?? ''}`;
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="move-dialog-title" onClick={(e) => e.stopPropagation()}>
        <h2 id="move-dialog-title">Something is in the way</h2>
        <p>On {where}, this would clash with {names.join(' and ')}. What would you like to do?</p>
        <div className="dialog-actions">
          {pending.plan.canSwap && (
            <button ref={first} className="btn primary" onClick={() => onChoose('swap')}>Swap the two lessons</button>
          )}
          {pending.plan.canBump && (
            <button ref={pending.plan.canSwap ? undefined : first} className={`btn${pending.plan.canSwap ? '' : ' primary'}`} onClick={() => onChoose('bump')}>
              Move {names.length > 1 ? 'those lessons' : 'that lesson'} to Unscheduled
            </button>
          )}
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------- grid ----------

interface GridProps {
  project: Project;
  kind: ViewKind;
  entityId: string;
  resolve: (c: Card) => ResolvedCard | null;
  readOnly?: boolean;
  dropMap?: Map<string, MovePlan> | null;
  clashIds?: Set<string>;
  picked?: string | null;
  onCardTap?: (card: Card) => void;
  onCellTap?: (day: number, period: number) => void;
  onDragStart?: (src: MoveSource) => void;
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

const dropClass = (plan?: MovePlan) =>
  !plan ? '' : plan.status === 'free' ? 'drop-ok' : plan.status === 'occupied' && (plan.canBump || plan.canSwap) ? 'drop-maybe' : 'drop-bad';

function TimetableGrid({ project, kind, entityId, resolve, readOnly, dropMap, clashIds, picked, onCardTap, onCellTap, onDragStart, onDragEnd, onDrop }: GridProps) {
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
              const cls = [dropClass(dropMap?.get(key)), unavailable.has(key) ? 'unavail' : ''].join(' ');
              const handlers = readOnly ? {} : {
                onDragOver: (e: React.DragEvent) => e.preventDefault(),
                onDrop: (e: React.DragEvent) => { e.preventDefault(); onDrop?.(d, p); },
                onClick: () => { if (!entry) onCellTap?.(d, p); },
              };
              if (entry && !entry.isStart) continue; // covered by colSpan of the starting cell
              let span = 1;
              if (entry) {
                // Span consecutive teaching columns with no break column in between.
                while (i + span < cols.length && !('brk' in cols[i + span]) && grid[d]?.[p + span]?.card.id === entry.card.id) span++;
              }
              cells.push(
                <td key={i} className={cls} colSpan={span} {...handlers}>
                  {entry && (
                    <LessonCard
                      entry={entry}
                      kind={kind}
                      readOnly={readOnly}
                      clash={clashIds?.has(entry.card.id)}
                      selected={picked === entry.card.id}
                      onTap={() => onCardTap?.(entry.card)}
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

function LessonCard({ entry, kind, readOnly, clash, selected, onTap, onDragStart, onDragEnd }: {
  entry: CellEntry; kind: ViewKind; readOnly?: boolean; clash?: boolean; selected?: boolean;
  onTap: () => void; onDragStart: () => void; onDragEnd?: () => void;
}) {
  const [a, b] = cardLines(entry, kind);
  const { locked, fixed } = entry.card;
  const draggable = !readOnly && !fixed;
  return (
    <div
      className={`lesson-card${locked ? ' locked' : ''}${fixed ? ' fixed' : ''}${clash ? ' clash' : ''}${selected ? ' selected' : ''}`}
      style={{ '--c': entry.subject?.color } as CSSProperties}
      draggable={draggable}
      role={readOnly ? undefined : 'button'}
      tabIndex={readOnly ? undefined : 0}
      aria-pressed={readOnly ? undefined : selected}
      onClick={readOnly ? undefined : (e) => { e.stopPropagation(); onTap(); }}
      onKeyDown={(e) => !readOnly && e.key === 'Enter' && onTap()}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', entry.card.id); e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={onDragEnd}
      title={`${entry.subject?.name ?? ''}${fixed ? ' (fixed to this slot)' : locked ? ' (locked)' : ''}`}
    >
      {fixed ? <IconPin className="lock" aria-label="Fixed to this slot" /> : locked && <Lock className="lock" aria-label="Locked in place" />}
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
