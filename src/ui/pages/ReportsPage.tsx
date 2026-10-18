import { useMemo, useState } from 'react';
import { downloadText, toCsv } from '../../export';
import { teachingPeriods, unitLengths } from '../../model/defaults';
import type { Project } from '../../model/types';
import { PageHead } from '../components';
import { useProject } from '../store';

interface Workload {
  name: string;
  perDay: number[];
  total: number;
  required: number;
  gaps: number;
  maxRun: number;
}

function teacherWorkload(project: Project): Workload[] {
  const P = teachingPeriods(project.school.periods).length;
  const D = project.school.days.length;
  const lessons = new Map(project.lessons.map((l) => [l.id, l]));
  return project.teachers.map((t) => {
    const busy = Array.from({ length: D }, () => new Array<boolean>(P).fill(false));
    for (const c of project.cards) {
      const l = lessons.get(c.lessonId);
      if (!l?.teacherIds.includes(t.id)) continue;
      const len = unitLengths(l)[c.unit] ?? 1;
      for (let i = 0; i < len; i++) if (busy[c.day] && c.period + i < P) busy[c.day][c.period + i] = true;
    }
    let gaps = 0;
    let maxRun = 0;
    const perDay = busy.map((row) => {
      const first = row.indexOf(true);
      const last = row.lastIndexOf(true);
      const n = row.filter(Boolean).length;
      if (first >= 0) gaps += last - first + 1 - n;
      let run = 0;
      for (const b of row) maxRun = Math.max(maxRun, (run = b ? run + 1 : 0));
      return n;
    });
    const required = project.lessons.filter((l) => l.teacherIds.includes(t.id)).reduce((n, l) => n + Math.max(0, l.periodsPerWeek), 0);
    return { name: t.name, perDay, total: perDay.reduce((a, b) => a + b, 0), required, gaps, maxRun };
  });
}

function classSummary(project: Project) {
  const lessons = new Map(project.lessons.map((l) => [l.id, l]));
  return project.classes.map((c) => {
    const bySubject = new Map<string, { scheduled: number; required: number }>();
    for (const l of project.lessons) {
      if (!l.classIds.includes(c.id)) continue;
      const row = bySubject.get(l.subjectId) ?? { scheduled: 0, required: 0 };
      row.required += Math.max(0, l.periodsPerWeek);
      bySubject.set(l.subjectId, row);
    }
    for (const card of project.cards) {
      const l = lessons.get(card.lessonId);
      if (!l?.classIds.includes(c.id)) continue;
      const row = bySubject.get(l.subjectId);
      if (row) row.scheduled += unitLengths(l)[card.unit] ?? 1;
    }
    const teacher = project.teachers.find((t) => t.id === c.classTeacherId)?.name;
    return { cls: c, teacher, bySubject };
  });
}

export function ReportsPage() {
  const { project } = useProject();
  const [tab, setTab] = useState<'teachers' | 'classes'>('teachers');
  const work = useMemo(() => teacherWorkload(project), [project]);
  const classes = useMemo(() => classSummary(project), [project]);
  const subjects = new Map(project.subjects.map((s) => [s.id, s]));
  const days = project.school.days;

  const exportWorkload = () =>
    downloadText('teacher-workload.csv', toCsv([
      ['Teacher', ...days, 'Scheduled', 'Required', 'Gaps', 'Longest run'],
      ...work.map((w) => [w.name, ...w.perDay, w.total, w.required, w.gaps, w.maxRun]),
    ]), 'text/csv;charset=utf-8');

  return (
    <>
      <PageHead title="Reports" desc="How many lessons each teacher has on each day, and whether every class got all its lessons.">
        {tab === 'teachers' && <button className="btn" onClick={exportWorkload}>Export CSV</button>}
        <button className="btn" onClick={() => window.print()}>Print</button>
      </PageHead>
      <div className="tabs no-print" role="tablist" style={{ marginBottom: 12 }}>
        <button role="tab" aria-selected={tab === 'teachers'} className={tab === 'teachers' ? 'active' : ''} onClick={() => setTab('teachers')}>Teacher workload</button>
        <button role="tab" aria-selected={tab === 'classes'} className={tab === 'classes' ? 'active' : ''} onClick={() => setTab('classes')}>Class summary</button>
      </div>

      {tab === 'teachers' ? (
        <div className="card table-wrap">
          <table className="data">
            <thead>
              <tr><th>Teacher</th>{days.map((d) => <th key={d}>{d.slice(0, 3)}</th>)}<th>Scheduled</th><th>Required</th><th>Gaps</th><th>Longest run</th></tr>
            </thead>
            <tbody>
              {!work.length && <tr><td colSpan={days.length + 5} className="empty">No teachers yet.</td></tr>}
              {work.map((w) => (
                <tr key={w.name}>
                  <td>{w.name}</td>
                  {w.perDay.map((n, i) => <td key={i} className={n ? '' : 'muted'}>{n}</td>)}
                  <td><b>{w.total}</b></td>
                  <td style={{ color: w.total < w.required ? 'var(--danger)' : undefined }}>{w.required}</td>
                  <td>{w.gaps}</td>
                  <td>{w.maxRun}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid-2">
          {classes.map(({ cls, teacher, bySubject }) => {
            const total = [...bySubject.values()].reduce((a, r) => a + r.scheduled, 0);
            return (
              <div key={cls.id} className="card">
                <div className="row"><h3 style={{ margin: 0 }}>{cls.name}</h3><span className="muted small">{teacher ? `Class teacher: ${teacher}` : ''}</span></div>
                <table className="data" style={{ marginTop: 8 }}>
                  <thead><tr><th>Subject</th><th>Scheduled</th><th>Required</th></tr></thead>
                  <tbody>
                    {[...bySubject.entries()].map(([sid, r]) => (
                      <tr key={sid}>
                        <td><span className="dot" style={{ background: subjects.get(sid)?.color }} /> {subjects.get(sid)?.name ?? '?'}</td>
                        <td style={{ color: r.scheduled < r.required ? 'var(--danger)' : undefined }}>{r.scheduled}</td>
                        <td className="muted">{r.required}</td>
                      </tr>
                    ))}
                    <tr><td><b>Total</b></td><td><b>{total}</b></td><td /></tr>
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
