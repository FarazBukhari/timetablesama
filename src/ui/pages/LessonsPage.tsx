import { useMemo, useState } from 'react';
import { newLesson, unitLengths } from '../../model/defaults';
import type { Lesson } from '../../model/types';
import { MultiSelect, NumberInput, PageHead, type Option } from '../components';
import { useProject } from '../store';

const LENGTHS = [
  { v: 1, label: 'Singles' },
  { v: 2, label: 'Doubles' },
  { v: 3, label: 'Triples' },
  { v: 4, label: 'Blocks of 4' },
];

export function LessonsPage() {
  const { project, update } = useProject();
  const [filter, setFilter] = useState('');
  const [draft, setDraft] = useState<Lesson>(() => newLesson());
  const [joint, setJoint] = useState(false);

  const classOpts: Option[] = project.classes.map((c) => ({ value: c.id, label: c.name }));
  const teacherOpts: Option[] = project.teachers.map((t) => ({ value: t.id, label: t.name }));
  const roomOpts: Option[] = project.rooms.map((r) => ({ value: r.id, label: r.name }));
  const subjects = new Map(project.subjects.map((s) => [s.id, s]));

  const patch = (id: string, p: Partial<Lesson>) =>
    update((pr) => {
      // Changing how a lesson splits into units invalidates its placed cards.
      const resplit = p.periodsPerWeek !== undefined || p.length !== undefined;
      return {
        ...pr,
        lessons: pr.lessons.map((l) => (l.id === id ? { ...l, ...p } : l)),
        cards: resplit ? pr.cards.filter((c) => c.lessonId !== id) : pr.cards,
        unplaced: resplit ? pr.unplaced.filter((u) => u.lessonId !== id) : pr.unplaced,
      };
    });
  const remove = (id: string) =>
    update((pr) => ({
      ...pr,
      lessons: pr.lessons.filter((l) => l.id !== id),
      cards: pr.cards.filter((c) => c.lessonId !== id),
      unplaced: pr.unplaced.filter((u) => u.lessonId !== id),
    }));

  const canAdd = draft.subjectId && draft.classIds.length > 0;
  const addDraft = () => {
    if (!canAdd) return;
    const groups = joint || draft.classIds.length === 1 ? [draft.classIds] : draft.classIds.map((c) => [c]);
    const made = groups.map((classIds) => ({ ...draft, classIds, id: newLesson().id }));
    update((p) => ({ ...p, lessons: [...p.lessons, ...made] }));
    // Keep the chosen classes for the next subject, but never carry "joint" over by accident.
    setDraft({ ...newLesson(), teacherIds: [], subjectId: '', classIds: draft.classIds });
    setJoint(false);
  };

  const shown = useMemo(
    () =>
      project.lessons.filter(
        (l) => !filter || l.classIds.includes(filter) || l.teacherIds.includes(filter) || l.subjectId === filter,
      ),
    [project.lessons, filter],
  );
  const totalPeriods = shown.reduce((n, l) => n + Math.max(0, l.periodsPerWeek), 0);

  const missing = !project.subjects.length || !project.classes.length;

  return (
    <>
      <PageHead
        title="Lessons"
        desc="Each lesson is a subject taught to one or more classes by one or more teachers, a number of periods each week."
      />

      {missing ? (
        <div className="alert warning">Add at least one subject and one class first.</div>
      ) : (
        <div className="card">
          <h2>Add lessons</h2>
          <div className="grid-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <label className="field">Classes
              <MultiSelect ariaLabel="Classes" options={classOpts} value={draft.classIds} onChange={(classIds) => setDraft({ ...draft, classIds })} placeholder="Choose classes" />
            </label>
            <label className="field">Subject
              <select value={draft.subjectId} onChange={(e) => setDraft({ ...draft, subjectId: e.target.value })}>
                <option value="">Choose…</option>
                {project.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="field">Teachers
              <MultiSelect ariaLabel="Teachers" options={teacherOpts} value={draft.teacherIds} onChange={(teacherIds) => setDraft({ ...draft, teacherIds })} placeholder="Choose teachers" />
            </label>
            <label className="field">Allowed rooms
              <MultiSelect ariaLabel="Rooms" options={roomOpts} value={draft.roomIds} onChange={(roomIds) => setDraft({ ...draft, roomIds })} placeholder="Home room / any" />
            </label>
            <label className="field">Lessons a week
              <NumberInput value={draft.periodsPerWeek} min={1} max={40} onChange={(periodsPerWeek) => setDraft({ ...draft, periodsPerWeek })} />
            </label>
            <label className="field">Arrange as
              <select value={draft.length} onChange={(e) => setDraft({ ...draft, length: Number(e.target.value) })}>
                {LENGTHS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
              </select>
            </label>
            <label className="field">Most in a day
              <NumberInput value={draft.maxPerDay} min={1} max={10} onChange={(maxPerDay) => setDraft({ ...draft, maxPerDay })} />
            </label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            {draft.classIds.length > 1 && (
              <label className="check">
                <input type="checkbox" checked={joint} onChange={(e) => setJoint(e.target.checked)} />
                Joint lesson (classes are taught together)
              </label>
            )}
            <span className="spacer" />
            <span className="muted small">
              Units: {unitLengths(draft).join(' + ') || '—'}
              {draft.classIds.length > 1 && !joint && ` × ${draft.classIds.length} classes`}
            </span>
            <button className="btn primary" disabled={!canAdd} onClick={addDraft}>
              + Add {draft.classIds.length > 1 && !joint ? `${draft.classIds.length} lessons` : 'lesson'}
            </button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>All lessons</h2>
          <span className="muted">{shown.length} lessons · {totalPeriods} periods / week</span>
          <span className="spacer" />
          <select value={filter} aria-label="Filter" onChange={(e) => setFilter(e.target.value)}>
            <option value="">All</option>
            <optgroup label="Classes">{project.classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            <optgroup label="Teachers">{project.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
            <optgroup label="Subjects">{project.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
          </select>
        </div>
        <div className="table-wrap">
          <table className="data lessons-table">
            <thead>
              <tr><th>Classes</th><th>Subject</th><th>Teachers</th><th>Lessons a week</th><th>Arrange as</th><th>Most in a day</th><th>Rooms</th><th /></tr>
            </thead>
            <tbody>
              {!shown.length && <tr><td colSpan={8} className="empty">No lessons yet.</td></tr>}
              {shown.map((l) => (
                <tr key={l.id}>
                  <td data-label="Classes"><MultiSelect ariaLabel="Classes" options={classOpts} value={l.classIds} onChange={(classIds) => patch(l.id, { classIds })} /></td>
                  <td data-label="Subject">
                    <div className="row" style={{ flexWrap: 'nowrap', gap: 6 }}>
                      <span className="dot" style={{ background: subjects.get(l.subjectId)?.color }} />
                      <select value={l.subjectId} aria-label="Subject" onChange={(e) => patch(l.id, { subjectId: e.target.value })}>
                        {!subjects.has(l.subjectId) && <option value="">—</option>}
                        {project.subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </div>
                  </td>
                  <td data-label="Teachers"><MultiSelect ariaLabel="Teachers" options={teacherOpts} value={l.teacherIds} onChange={(teacherIds) => patch(l.id, { teacherIds })} /></td>
                  <td data-label="Lessons a week"><NumberInput value={l.periodsPerWeek} min={0} max={40} ariaLabel="Periods per week" onChange={(periodsPerWeek) => patch(l.id, { periodsPerWeek })} /></td>
                  <td data-label="Arrange as">
                    <select value={l.length} aria-label="Arrange" onChange={(e) => patch(l.id, { length: Number(e.target.value) })}>
                      {LENGTHS.map((x) => <option key={x.v} value={x.v}>{x.label}</option>)}
                    </select>
                    {l.length > 1 && <span className="placed muted small">Placed as {unitLengths(l).join(' + ')}</span>}
                  </td>
                  <td data-label="Most in a day"><NumberInput value={l.maxPerDay} min={1} max={10} ariaLabel="Max per day" onChange={(maxPerDay) => patch(l.id, { maxPerDay })} /></td>
                  <td data-label="Rooms"><MultiSelect ariaLabel="Rooms" options={roomOpts} value={l.roomIds} onChange={(roomIds) => patch(l.id, { roomIds })} placeholder="Home room" /></td>
                  <td className="actions"><button className="btn sm danger" aria-label="Delete lesson" onClick={() => remove(l.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
