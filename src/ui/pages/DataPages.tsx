import { newClass, newRoom, newSubject, newTeacher, uniqueCode, unitLengths } from '../../model/defaults';
import type { Project } from '../../model/types';
import { BulkAdd, NumberInput, PageHead } from '../components';
import { removeReferences, useProject } from '../store';

type Key = 'subjects' | 'teachers' | 'classes' | 'rooms';

function useCollection<K extends Key>(key: K) {
  const { project, update } = useProject();
  type T = Project[K][number];
  const items = project[key] as T[];
  return {
    project,
    items,
    patch: (id: string, patch: Partial<T>) =>
      update((p) => ({ ...p, [key]: (p[key] as T[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
    add: (...xs: T[]) => update((p) => ({ ...p, [key]: [...(p[key] as T[]), ...xs] })),
    remove: (id: string, name: string) => {
      const used = project.lessons.some((l) => [...l.classIds, ...l.teacherIds, ...l.roomIds, l.subjectId].includes(id));
      if (used && !window.confirm(`"${name}" is used by lessons. Delete it and update those lessons?`)) return;
      update((p) => removeReferences(p, id));
    },
  };
}

/** Periods per week a resource is booked for across all lessons. */
function load(project: Project, pred: (l: Project['lessons'][number]) => boolean): number {
  return project.lessons.filter(pred).reduce((n, l) => n + unitLengths(l).reduce((a, b) => a + b, 0), 0);
}

const DeleteBtn = ({ onClick, name }: { onClick: () => void; name: string }) => (
  <button className="btn sm danger" aria-label={`Delete ${name}`} onClick={onClick}>Delete</button>
);

const Empty = ({ what, fromLessons = false }: { what: string; fromLessons?: boolean }) => (
  <tr>
    <td colSpan={9} className="empty">
      <b>No {what} yet</b>Use the Add button above, or paste a list you already have.
      {fromLessons && <> If you have a spreadsheet of lessons, <a href="#/lessons">import it on the Lessons step</a> and the {what} in it are added for you.</>}
    </td>
  </tr>
);

/** Shown inside "Paste a list" on the pages the lessons import can fill in. */
const LessonsTip = ({ what }: { what: string }) => (
  <p className="help">Have a spreadsheet of lessons? <a href="#/lessons">Import it on the Lessons step</a> and the {what} in it are added for you.</p>
);

/** Short codes not used yet, made for the rows of a pasted list that don't give their own. */
function withUniqueCodes<T extends { code: string }>(items: T[], taken: string[], given: (i: number) => string | undefined): T[] {
  const codes = [...taken];
  return items.map((x, i) => {
    const code = given(i) ? x.code : uniqueCode(x.code, codes);
    codes.push(code);
    return { ...x, code };
  });
}

export function SubjectsPage() {
  const { project, items, patch, add, remove } = useCollection('subjects');
  const taken = items.map((s) => s.code);
  return (
    <>
      <PageHead title="Subjects" desc="Type each subject your school teaches. The short code and colour show on the printed timetable.">
        <button className="btn primary" onClick={() => add(newSubject(`Subject ${items.length + 1}`, undefined, items.length))}>+ Add subject</button>
        <BulkAdd
          hint="Name, code (optional)."
          existing={items.map((s) => s.name)}
          onAdd={(rows) => add(...withUniqueCodes(rows.map((r, i) => newSubject(r[0], r[1], items.length + i)), taken, (i) => rows[i][1]))}
        >
          <LessonsTip what="subjects" />
        </BulkAdd>
      </PageHead>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Colour</th><th>Name</th><th>Code</th><th>Periods / week</th><th /></tr></thead>
          <tbody>
            {!items.length && <Empty what="subjects" fromLessons />}
            {items.map((s) => (
              <tr key={s.id}>
                <td data-label="Colour"><input type="color" value={s.color} aria-label="Colour" onChange={(e) => patch(s.id, { color: e.target.value })} /></td>
                <td data-label="Name"><input value={s.name} aria-label="Name" onChange={(e) => patch(s.id, { name: e.target.value })} /></td>
                <td data-label="Code"><input value={s.code} aria-label="Code" style={{ maxWidth: 100 }} onChange={(e) => patch(s.id, { code: e.target.value })} /></td>
                <td data-label="Lessons a week" className="muted">{load(project, (l) => l.subjectId === s.id)}</td>
                <td className="actions"><DeleteBtn name={s.name} onClick={() => remove(s.id, s.name)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function TeachersPage() {
  const { project, items, patch, add, remove } = useCollection('teachers');
  const taken = items.map((t) => t.code);
  const max = project.school.settings.maxTeacherPeriodsPerDay;
  return (
    <>
      <PageHead title="Teachers" desc="Type each teacher’s name. If someone works part-time, you can mark their days off in the Availability step.">
        <button className="btn primary" onClick={() => add(newTeacher(`Teacher ${items.length + 1}`))}>+ Add teacher</button>
        <BulkAdd
          hint="Name, short code (optional), email (optional)."
          existing={items.map((t) => t.name)}
          onAdd={(rows) => add(...withUniqueCodes(rows.map((r) => newTeacher(r[0], r[1], r[2])), taken, (i) => rows[i][1]))}
        >
          <LessonsTip what="teachers" />
        </BulkAdd>
      </PageHead>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Name</th><th>Code</th><th>Email</th><th>Max periods/day</th><th>Periods / week</th><th>Unavailable</th><th /></tr></thead>
          <tbody>
            {!items.length && <Empty what="teachers" fromLessons />}
            {items.map((t) => (
              <tr key={t.id}>
                <td data-label="Name" className="wide"><input value={t.name} aria-label="Name" onChange={(e) => patch(t.id, { name: e.target.value })} /></td>
                <td data-label="Code"><input value={t.code} aria-label="Code" style={{ maxWidth: 80 }} onChange={(e) => patch(t.id, { code: e.target.value })} /></td>
                <td data-label="Email"><input value={t.email ?? ''} aria-label="Email" type="email" onChange={(e) => patch(t.id, { email: e.target.value })} /></td>
                <td data-label="Most a day">
                  <NumberInput value={t.maxPerDay || undefined} ariaLabel="Max periods per day" max={16} onChange={(n) => patch(t.id, { maxPerDay: n || undefined })} />
                  {!t.maxPerDay && <span className="muted small"> usual {max || 'no limit'}</span>}
                </td>
                <td data-label="Lessons a week" className="muted">{load(project, (l) => l.teacherIds.includes(t.id))}</td>
                <td data-label="Days off" className="muted">{t.unavailable.length ? `${t.unavailable.length} slots` : '—'}</td>
                <td className="actions"><DeleteBtn name={t.name} onClick={() => remove(t.id, t.name)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ClassesPage() {
  const { project, items, patch, add, remove } = useCollection('classes');
  const weekly = project.school.days.length * project.school.periods.filter((p) => !p.isBreak).length;
  return (
    <>
      <PageHead title="Classes" desc="Add each class or form, for example 7A or Year 9 Blue. Give a class a home room and its lessons will go there unless you choose another room.">
        <button className="btn primary" onClick={() => add(newClass(`Class ${items.length + 1}`))}>+ Add class</button>
        <BulkAdd hint="Name, number of students (optional)." existing={items.map((c) => c.name)} onAdd={(rows) => add(...rows.map((r) => newClass(r[0], r[1])))}>
          <LessonsTip what="classes" />
        </BulkAdd>
      </PageHead>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Name</th><th>Class teacher</th><th>Home room</th><th>Students</th><th>Periods / week</th><th /></tr></thead>
          <tbody>
            {!items.length && <Empty what="classes" fromLessons />}
            {items.map((c) => {
              const used = load(project, (l) => l.classIds.includes(c.id));
              return (
                <tr key={c.id}>
                  <td data-label="Name" className="wide"><input value={c.name} aria-label="Name" onChange={(e) => patch(c.id, { name: e.target.value })} /></td>
                  <td data-label="Class teacher">
                    <select value={c.classTeacherId ?? ''} aria-label="Class teacher" onChange={(e) => patch(c.id, { classTeacherId: e.target.value || undefined })}>
                      <option value="">—</option>
                      {project.teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td data-label="Home room">
                    <select value={c.homeRoomId ?? ''} aria-label="Home room" onChange={(e) => patch(c.id, { homeRoomId: e.target.value || undefined })}>
                      <option value="">—</option>
                      {project.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  </td>
                  <td data-label="Students"><NumberInput value={c.students} max={2000} ariaLabel="Students" onChange={(n) => patch(c.id, { students: n || undefined })} /></td>
                  <td data-label="Lessons a week" style={{ color: used > weekly ? 'var(--danger)' : 'var(--muted)' }}>{used} / {weekly}</td>
                  <td className="actions"><DeleteBtn name={c.name} onClick={() => remove(c.id, c.name)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function RoomsPage() {
  const { project, items, patch, add, remove } = useCollection('rooms');
  const types = [...new Set(items.map((r) => r.type).filter(Boolean))];
  return (
    <>
      <PageHead title="Rooms" desc="Add the rooms you timetable: classrooms, labs, the hall. If a lesson needs a special room, you choose it in the Lessons step.">
        <button className="btn primary" onClick={() => add(newRoom(`Room ${items.length + 1}`))}>+ Add room</button>
        <BulkAdd hint="Name, type (optional), capacity (optional)." existing={items.map((r) => r.name)} onAdd={(rows) => add(...rows.map((r) => newRoom(r[0], r[1], r[2])))} />
      </PageHead>
      <datalist id="room-types">{types.map((t) => <option key={t} value={t} />)}</datalist>
      <div className="card table-wrap">
        <table className="data">
          <thead><tr><th>Name</th><th>Type</th><th>Capacity</th><th>Home room of</th><th /></tr></thead>
          <tbody>
            {!items.length && <Empty what="rooms" />}
            {items.map((r) => (
              <tr key={r.id}>
                <td data-label="Name" className="wide"><input value={r.name} aria-label="Name" onChange={(e) => patch(r.id, { name: e.target.value })} /></td>
                <td data-label="Type"><input value={r.type} aria-label="Type" list="room-types" onChange={(e) => patch(r.id, { type: e.target.value })} /></td>
                <td data-label="Capacity"><NumberInput value={r.capacity} max={5000} ariaLabel="Capacity" onChange={(n) => patch(r.id, { capacity: n || undefined })} /></td>
                <td data-label="Home room of" className="muted">{project.classes.filter((c) => c.homeRoomId === r.id).map((c) => c.name).join(', ') || '—'}</td>
                <td className="actions"><DeleteBtn name={r.name} onClick={() => remove(r.id, r.name)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
