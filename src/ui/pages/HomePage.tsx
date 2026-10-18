import { useRef, useState } from 'react';
import { emptyProject } from '../../model/defaults';
import { sampleProject } from '../../model/sample';
import { parseProjectJson } from '../../export';
import type { PageId } from '../App';
import { PageHead, Stat } from '../components';
import { timeAgo } from '../SaveBanner';
import { useProject } from '../store';

export function HomePage({ go }: { go: (p: PageId) => void }) {
  const { project, projects, active, createProject, openProject, renameProject, duplicateProject, deleteProject, backup } = useProject();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const hasData = project.subjects.length + project.teachers.length + project.classes.length > 0;

  const importFile = async (file: File) => {
    try {
      const p = parseProjectJson(await file.text());
      createProject(p, file.name.replace(/\.timetable\.json$|\.json$/i, '') || p.school.name);
      setError('');
      go(p.cards.length ? 'timetable' : 'school');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <PageHead
        title={hasData ? active.name : 'Free school timetable generator'}
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

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Your projects</h2>
          <span className="muted small">Saved in this browser</span>
          <span className="spacer" />
          <button className="btn primary" onClick={() => { createProject(sampleProject()); go('generate'); }}>+ Sample school</button>
          <button className="btn" onClick={() => { createProject(emptyProject(), 'New school'); go('school'); }}>+ Blank project</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Import backup…</button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {error && <div className="alert error">{error}</div>}
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Name</th><th>Last edited</th><th>Last backup</th><th /></tr></thead>
            <tbody>
              {[...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map((m) => {
                const current = m.id === active.id;
                return (
                  <tr key={m.id} className={`project-row${current ? ' current' : ''}`}>
                    <td style={{ minWidth: 180 }}>
                      {renaming === m.id ? (
                        <input
                          autoFocus
                          defaultValue={m.name}
                          aria-label="Project name"
                          onBlur={(e) => { renameProject(m.id, e.target.value.trim() || m.name); setRenaming(null); }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setRenaming(null);
                          }}
                        />
                      ) : (
                        <span>{m.name} {current && <span className="chip">open</span>}</span>
                      )}
                    </td>
                    <td className="muted">{timeAgo(m.updatedAt)}</td>
                    <td className="muted">{timeAgo(m.lastBackupAt)}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {current ? (
                        <button className="btn sm" onClick={backup}>Download backup</button>
                      ) : (
                        <button className="btn sm primary" onClick={() => openProject(m.id)}>Open</button>
                      )}
                      <button className="btn ghost sm" onClick={() => setRenaming(m.id)}>Rename</button>
                      <button className="btn ghost sm" onClick={() => duplicateProject(m.id)}>Duplicate</button>
                      <button
                        className="btn ghost sm danger"
                        onClick={() => window.confirm(`Delete "${m.name}" from this browser? This can't be undone unless you have a backup file.`) && deleteProject(m.id)}
                      >Delete</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {hasData && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => go(project.cards.length ? 'timetable' : 'lessons')}>Continue with {active.name} →</button>
          </div>
        )}
      </div>

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
          <h2>Where is my work saved?</h2>
          <p className="muted">
            Projects save automatically in <b>this browser on this device</b>. There's no account, so nothing is uploaded.
          </p>
          <p className="muted">
            To keep a project safe or open it somewhere else, use <b>Download backup</b>, then <b>Import backup</b> on the
            other computer. Clearing browser data or using a private window removes saved projects.
          </p>
        </div>
      </div>
    </>
  );
}
