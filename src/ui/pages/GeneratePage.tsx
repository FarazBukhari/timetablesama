import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConstraintMode, SolverSettings } from '../../model/types';
import { checkFeasibility, findViolations, type GenerateProgress } from '../../solver';
import type { WorkerRequest, WorkerResponse } from '../../solver/worker';
import type { PageId } from '../App';
import { NumberInput, PageHead, Stat } from '../components';
import { useProject } from '../store';

export function GeneratePage({ go }: { go: (p: PageId) => void }) {
  const { project, update } = useProject();
  const settings = project.school.settings;
  const report = useMemo(() => checkFeasibility(project), [project]);
  const violations = useMemo(() => findViolations(project), [project]);
  const [progress, setProgress] = useState<GenerateProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);

  useEffect(() => () => worker.current?.terminate(), []);

  const set = (patch: Partial<SolverSettings>) =>
    update((p) => ({ ...p, school: { ...p.school, settings: { ...p.school.settings, ...patch } } }));

  const errors = report.issues.filter((i) => i.severity === 'error');
  const warnings = report.issues.filter((i) => i.severity === 'warning');
  const lockedCount = project.cards.filter((c) => c.locked).length;
  const unplacedPeriods = project.unplaced.reduce((n, u) => n + u.length, 0);
  const subjects = new Map(project.subjects.map((s) => [s.id, s]));
  const lessons = new Map(project.lessons.map((l) => [l.id, l]));
  const classNames = new Map(project.classes.map((c) => [c.id, c.name]));

  const run = (seed = settings.seed) => {
    worker.current?.terminate();
    const w = new Worker(new URL('../../solver/worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setRunning(true);
    setError('');
    setProgress(null);
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') setProgress(msg.progress);
      else if (msg.type === 'done') {
        update((p) => ({ ...p, cards: msg.result.cards, unplaced: msg.result.unplaced, generatedAt: new Date().toISOString() }));
        setRunning(false);
        w.terminate();
      } else {
        setError(msg.message);
        setRunning(false);
        w.terminate();
      }
    };
    w.onerror = (e) => {
      setError(e.message || 'The generator crashed.');
      setRunning(false);
    };
    w.postMessage({ type: 'generate', project, seed } satisfies WorkerRequest);
  };

  const stop = () => {
    worker.current?.terminate();
    setRunning(false);
  };

  const pct = progress ? Math.round((progress.placed / Math.max(1, progress.total)) * 100) : 0;

  return (
    <>
      <PageHead title="Generate timetable" desc="Check your data, adjust the rules, then let the generator place every lesson.">
        {running ? (
          <button className="btn lg" onClick={stop}>Stop</button>
        ) : (
          <>
            <button className="btn lg" disabled={!report.totalUnits} onClick={() => {
              const seed = Math.floor(Math.random() * 1e9);
              set({ seed });
              run(seed);
            }} title="Try a different arrangement">Shuffle & generate</button>
            <button className="btn primary lg" disabled={!report.totalUnits} onClick={() => run()}>
              {project.cards.length ? 'Regenerate' : 'Generate'}
            </button>
          </>
        )}
      </PageHead>

      <div className="stats">
        <Stat value={report.totalUnits} label="Lesson units to place" />
        <Stat value={report.totalPeriods} label="Periods per week" />
        <Stat value={report.slotsPerWeek} label="Slots per class per week" />
        <Stat value={lockedCount} label="Locked cards (kept)" />
      </div>

      {(running || progress) && (
        <div className="card" aria-live="polite">
          <div className="row" style={{ marginBottom: 8 }}>
            <b>{running ? 'Generating…' : 'Finished'}</b>
            {progress && <span className="muted">{progress.phase} · {progress.placed}/{progress.total} placed · {(progress.elapsedMs / 1000).toFixed(1)}s</span>}
          </div>
          <div className="progress"><div style={{ width: `${running ? pct : 100}%` }} /></div>
        </div>
      )}
      {error && <div className="alert error"><b>Error</b>{error}</div>}

      {project.cards.length > 0 && !running && (
        <div className="card">
          <h2>Result</h2>
          {project.unplaced.length === 0 ? (
            <div className="alert ok"><b>All lessons placed.</b>{project.cards.length} cards, no clashes.</div>
          ) : (
            <div className="alert warning"><b>{project.unplaced.length} units ({unplacedPeriods} periods) could not be placed.</b>See the reasons below, adjust your data, and generate again.</div>
          )}
          {violations.length > 0 && (
            <div className="alert error"><b>{violations.length} clashes</b>from manual edits. Open the timetable to fix them, or regenerate.</div>
          )}
          {project.unplaced.length > 0 && (
            <div className="table-wrap">
              <table className="data">
                <thead><tr><th>Lesson</th><th>Classes</th><th>Length</th><th>Why</th></tr></thead>
                <tbody>
                  {project.unplaced.map((u) => {
                    const l = lessons.get(u.lessonId);
                    return (
                      <tr key={`${u.lessonId}#${u.unit}`}>
                        <td>{subjects.get(l?.subjectId ?? '')?.name ?? '?'}</td>
                        <td>{l?.classIds.map((c) => classNames.get(c)).join(' + ')}</td>
                        <td>{u.length}</td>
                        <td className="small">{u.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={() => go('timetable')}>Open timetable →</button>
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h2>Pre-check</h2>
          {!report.issues.length && <div className="alert ok"><b>Looks good.</b>Every teacher, class and room has enough free periods.</div>}
          {errors.map((i, k) => <div key={`e${k}`} className="alert error"><b>{i.scope}</b>{i.message}</div>)}
          {warnings.map((i, k) => <div key={`w${k}`} className="alert warning"><b>{i.scope}</b>{i.message}</div>)}
          {errors.length > 0 && <p className="muted small">You can still generate. Lessons that can't fit are listed with a reason.</p>}
        </div>

        <div className="card">
          <h2>Rules</h2>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="row">
              <span style={{ flex: 1 }}>Max periods per teacher per day</span>
              <NumberInput value={settings.maxTeacherPeriodsPerDay} max={16} onChange={(maxTeacherPeriodsPerDay) => set({ maxTeacherPeriodsPerDay })} />
              <select value={settings.maxTeacherPeriodsPerDayMode} aria-label="Mode" onChange={(e) => set({ maxTeacherPeriodsPerDayMode: e.target.value as ConstraintMode })}>
                <option value="hard">Strict</option>
                <option value="soft">Preferred</option>
                <option value="off">Off</option>
              </select>
            </div>
            <div className="row">
              <span style={{ flex: 1 }}>Max consecutive periods for a teacher</span>
              <NumberInput value={settings.maxConsecutivePeriods} max={16} onChange={(maxConsecutivePeriods) => set({ maxConsecutivePeriods })} />
            </div>
            <Weight label="Avoid gaps in class days" value={settings.classGapWeight} onChange={(classGapWeight) => set({ classGapWeight })} />
            <Weight label="Avoid gaps in teacher days" value={settings.teacherGapWeight} onChange={(teacherGapWeight) => set({ teacherGapWeight })} />
            <Weight label="Spread a subject across the week" value={settings.spreadWeight} onChange={(spreadWeight) => set({ spreadWeight })} />
            <Weight label="Respect max consecutive periods" value={settings.maxConsecutiveWeight} onChange={(maxConsecutiveWeight) => set({ maxConsecutiveWeight })} />
            <label className="check">
              <input type="checkbox" checked={settings.avoidBreaksInMultiPeriod} onChange={(e) => set({ avoidBreaksInMultiPeriod: e.target.checked })} />
              Don't split double periods across a break
            </label>
            <label className="check">
              <input type="checkbox" checked={settings.periodConsistency} onChange={(e) => set({ periodConsistency: e.target.checked })} />
              Prefer the same period each day for a subject
            </label>
            <div className="row">
              <span style={{ flex: 1 }}>Time limit (seconds)</span>
              <NumberInput value={settings.timeLimitSec} min={1} max={300} onChange={(timeLimitSec) => set({ timeLimitSec })} />
            </div>
            <div className="row">
              <span style={{ flex: 1 }}>Seed <span className="muted small">(same seed, same result)</span></span>
              <NumberInput value={settings.seed} min={0} max={1e9} style={{ width: 110 }} onChange={(seed) => set({ seed })} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Weight({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="row" style={{ cursor: 'pointer' }}>
      <span style={{ flex: 1 }}>{label}</span>
      <input type="range" min={0} max={30} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
      <span className="muted small" style={{ width: 24, textAlign: 'right' }}>{value}</span>
    </label>
  );
}
