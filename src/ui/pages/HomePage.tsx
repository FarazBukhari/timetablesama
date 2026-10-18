import { useRef, useState } from 'react';
import { emptyProject } from '../../model/defaults';
import { sampleProject } from '../../model/sample';
import { downloadText, exportProjectJson, parseProjectJson } from '../../export';
import type { PageId } from '../App';
import { PageHead, Stat } from '../components';
import { useProject } from '../store';

export function HomePage({ go }: { go: (p: PageId) => void }) {
  const { project, replace } = useProject();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const hasData = project.subjects.length + project.teachers.length + project.classes.length > 0;

  const confirmReplace = () => !hasData || window.confirm('This replaces your current school data. Continue?');

  const importFile = async (file: File) => {
    try {
      replace(parseProjectJson(await file.text()));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const slug = project.school.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'timetable';

  return (
    <>
      <PageHead
        title={hasData ? project.school.name : 'Free school timetable generator'}
        desc="Build a clash-free timetable in minutes: no account, no plan limits, and free exports. Everything stays in your browser."
      />

      {hasData && (
        <div className="stats">
          <Stat value={project.classes.length} label="Classes" />
          <Stat value={project.teachers.length} label="Teachers" />
          <Stat value={project.subjects.length} label="Subjects" />
          <Stat value={project.rooms.length} label="Rooms" />
          <Stat value={project.lessons.length} label="Lessons" />
          <Stat value={project.cards.length ? `${project.cards.length} placed` : '—'} label="Timetable" />
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h2>How it works</h2>
          <ol className="steps">
            <li><div><b>School & bells.</b> <span className="muted">Set the working days, the periods and the breaks.</span></div></li>
            <li><div><b>Add data.</b> <span className="muted">Add subjects, teachers, classes and rooms, by hand or pasted from a spreadsheet.</span></div></li>
            <li><div><b>Lessons.</b> <span className="muted">Choose who teaches what to which class, how many periods a week, and singles or doubles.</span></div></li>
            <li><div><b>Availability.</b> <span className="muted">Block the times teachers, classes, rooms or subjects can't be used.</span></div></li>
            <li><div><b>Generate.</b> <span className="muted">The generator places every lesson with no clashes and tells you why if one won't fit.</span></div></li>
            <li><div><b>Adjust & export.</b> <span className="muted">Drag and drop, lock cards, then print, PDF, Excel or CSV.</span></div></li>
          </ol>
        </div>

        <div className="card">
          <h2>Get started</h2>
          <p className="muted">Try the sample school first to see a full timetable, or start from a blank school.</p>
          <div className="row" style={{ marginBottom: 12 }}>
            <button className="btn primary lg" onClick={() => confirmReplace() && (replace(sampleProject()), go('generate'))}>
              Load sample school
            </button>
            <button className="btn lg" onClick={() => confirmReplace() && (replace(emptyProject()), go('school'))}>
              Start blank
            </button>
          </div>
          {hasData && (
            <p>
              <button className="btn" onClick={() => go(project.cards.length ? 'timetable' : 'lessons')}>
                Continue where you left off →
              </button>
            </p>
          )}
          <h3 style={{ marginTop: 16 }}>Backup & share</h3>
          <p className="muted small">Projects save automatically in this browser. Export a file to back it up or move it to another computer.</p>
          <div className="row">
            <button className="btn" onClick={() => downloadText(`${slug}.timetable.json`, exportProjectJson(project), 'application/json')}>
              Export project (.json)
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>Import project…</button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && confirmReplace()) importFile(f);
                e.target.value = '';
              }}
            />
          </div>
          {error && <div className="alert error" style={{ marginTop: 10 }}>{error}</div>}
        </div>
      </div>
    </>
  );
}
