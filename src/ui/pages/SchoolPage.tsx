import { useState } from 'react';
import { WEEKDAYS, buildBellSchedule, uid } from '../../model/defaults';
import type { Period, Project } from '../../model/types';
import { NumberInput, PageHead } from '../components';
import { useProject } from '../store';

const PRESETS: { label: string; days: string[] }[] = [
  { label: 'Mon–Fri', days: WEEKDAYS.slice(0, 5) },
  { label: 'Mon–Sat', days: WEEKDAYS.slice(0, 6) },
  { label: 'Sun–Thu', days: ['Sunday', ...WEEKDAYS.slice(0, 4)] },
];

const teachingCount = (ps: Period[]) => ps.filter((p) => !p.isBreak).length;

/** Structural changes (days or teaching periods) invalidate placed cards. */
function withStructure(p: Project, days: string[], periods: Period[]): Project {
  const changed = days.length !== p.school.days.length || teachingCount(periods) !== teachingCount(p.school.periods);
  const breaksChanged = periods.map((x) => x.isBreak).join() !== p.school.periods.map((x) => x.isBreak).join();
  return {
    ...p,
    school: { ...p.school, days, periods },
    ...(changed || breaksChanged ? { cards: [], unplaced: [] } : {}),
  };
}

export function SchoolPage() {
  const { project, update } = useProject();
  const { school } = project;
  const [gen, setGen] = useState({ count: 7, start: '08:00', mins: 45, b1: 2, b1m: 15, b2: 4, b2m: 30 });

  const setSchool = (patch: Partial<typeof school>) => update((p) => ({ ...p, school: { ...p.school, ...patch } }));
  const setDays = (days: string[]) => {
    if (project.cards.length && days.length !== school.days.length && !window.confirm('Changing the number of days clears the generated timetable. Continue?')) return;
    update((p) => withStructure(p, days, p.school.periods));
  };
  const setPeriods = (periods: Period[]) => update((p) => withStructure(p, p.school.days, periods));
  const patchPeriod = (id: string, patch: Partial<Period>) => setPeriods(school.periods.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const move = (i: number, dir: -1 | 1) => {
    const ps = [...school.periods];
    const j = i + dir;
    if (j < 0 || j >= ps.length) return;
    [ps[i], ps[j]] = [ps[j], ps[i]];
    setPeriods(ps);
  };

  let teach = 0;
  return (
    <>
      <PageHead title="School day" desc="Tell us which days your school is open and when each lesson and break starts and ends." />
      <div className="card">
        <div className="grid-2">
          <label className="field">School name<input value={school.name} onChange={(e) => setSchool({ name: e.target.value })} /></label>
          <label className="field">Academic year / term<input value={school.academicYear} onChange={(e) => setSchool({ academicYear: e.target.value })} /></label>
        </div>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Working days</h2>
          <span className="spacer" />
          {PRESETS.map((pr) => (
            <button key={pr.label} className="btn sm" onClick={() => setDays(pr.days)}>{pr.label}</button>
          ))}
        </div>
        <div className="row">
          {school.days.map((d, i) => (
            <span key={i} className="row" style={{ gap: 2 }}>
              <input
                value={d}
                aria-label={`Day ${i + 1} name`}
                style={{ width: 120 }}
                onChange={(e) => update((p) => ({ ...p, school: { ...p.school, days: p.school.days.map((x, j) => (j === i ? e.target.value : x)) } }))}
              />
              <button className="btn sm danger" aria-label={`Remove ${d}`} onClick={() => setDays(school.days.filter((_, j) => j !== i))}>Remove</button>
            </span>
          ))}
          <button className="btn sm" onClick={() => setDays([...school.days, `Day ${school.days.length + 1}`])}>+ Add day</button>
        </div>
        <p className="muted small" style={{ marginTop: 8 }}>
          Cycles such as a two-week or six-day rotation work too: add days named "Week A Mon", "Day 6" and so on.
        </p>
      </div>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Bell schedule</h2>
          <span className="muted">{teachingCount(school.periods)} teaching periods per day · {teachingCount(school.periods) * school.days.length} per week</span>
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>#</th><th>Name</th><th>Start</th><th>End</th><th>Break?</th><th /></tr>
            </thead>
            <tbody>
              {school.periods.map((p, i) => (
                <tr key={p.id}>
                  <td data-label="Lesson" className="muted hide-phone">{p.isBreak ? '—' : ++teach}</td>
                  <td data-label="Name" className="wide"><input value={p.name} aria-label="Period name" onChange={(e) => patchPeriod(p.id, { name: e.target.value })} /></td>
                  <td data-label="Starts"><input type="time" value={p.start} aria-label="Start time" onChange={(e) => patchPeriod(p.id, { start: e.target.value })} /></td>
                  <td data-label="Ends"><input type="time" value={p.end} aria-label="End time" onChange={(e) => patchPeriod(p.id, { end: e.target.value })} /></td>
                  <td data-label="Break"><input type="checkbox" checked={p.isBreak} aria-label="Is break" onChange={(e) => patchPeriod(p.id, { isBreak: e.target.checked })} /></td>
                  <td className="actions" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn ghost sm" onClick={() => move(i, -1)} disabled={i === 0}>Up</button>
                    <button className="btn ghost sm" onClick={() => move(i, 1)} disabled={i === school.periods.length - 1}>Down</button>
                    <button className="btn sm danger" onClick={() => setPeriods(school.periods.filter((x) => x.id !== p.id))}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn sm" onClick={() => {
            const last = school.periods[school.periods.length - 1];
            setPeriods([...school.periods, { id: uid('p'), name: `Period ${teachingCount(school.periods) + 1}`, start: last?.end ?? '08:00', end: last?.end ?? '08:45', isBreak: false }]);
          }}>+ Period</button>
          <button className="btn sm" onClick={() => {
            const last = school.periods[school.periods.length - 1];
            setPeriods([...school.periods, { id: uid('p'), name: 'Break', start: last?.end ?? '10:00', end: last?.end ?? '10:15', isBreak: true }]);
          }}>+ Break</button>
        </div>
      </div>

      <div className="card">
        <h2>Quick build</h2>
        <p className="muted small">Rebuild the bell schedule from a few numbers. This replaces the table above.</p>
        <div className="row">
          <label className="field">Periods<NumberInput value={gen.count} min={1} max={16} onChange={(count) => setGen({ ...gen, count })} /></label>
          <label className="field">First starts<input type="time" value={gen.start} onChange={(e) => setGen({ ...gen, start: e.target.value })} /></label>
          <label className="field">Minutes each<NumberInput value={gen.mins} min={5} max={180} onChange={(mins) => setGen({ ...gen, mins })} /></label>
          <label className="field">Break after #<NumberInput value={gen.b1} max={16} onChange={(b1) => setGen({ ...gen, b1 })} /></label>
          <label className="field">mins<NumberInput value={gen.b1m} max={120} onChange={(b1m) => setGen({ ...gen, b1m })} /></label>
          <label className="field">Lunch after #<NumberInput value={gen.b2} max={16} onChange={(b2) => setGen({ ...gen, b2 })} /></label>
          <label className="field">mins<NumberInput value={gen.b2m} max={180} onChange={(b2m) => setGen({ ...gen, b2m })} /></label>
          <button className="btn primary" style={{ alignSelf: 'flex-end' }} onClick={() => setPeriods(buildBellSchedule(gen.count, gen.start, gen.mins, [
            ...(gen.b1 ? [{ after: gen.b1, mins: gen.b1m, name: 'Break' }] : []),
            ...(gen.b2 ? [{ after: gen.b2, mins: gen.b2m, name: 'Lunch' }] : []),
          ]))}>Build schedule</button>
        </div>
      </div>
    </>
  );
}
