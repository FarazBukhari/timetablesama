import { useMemo, useRef, useState } from 'react';
import { downloadText } from '../export';
import {
  applyLessonImport, lessonsTemplateCsv, parseDelimited, planLessonImport, readTableFile, type ImportPlan, type ImportRow, type Sheet,
} from '../import';
import { fileSlug, useProject } from './store';

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

function outcome(r: ImportRow): string {
  if (r.status === 'new') return 'New lesson';
  if (r.status === 'same') return 'Already there, no change';
  if (r.status === 'update') return `Update: ${r.note}`;
  return `Skipped: ${r.note}`;
}

function counts(plan: ImportPlan) {
  const n = (s: ImportRow['status']) => plan.rows.filter((r) => r.status === s).length;
  return { added: n('new'), updated: n('update'), same: n('same'), skipped: n('problem') };
}

/** "Also adds 4 teachers (Ms Saba, Sir Kamal, …), 8 classes (…) and 6 subjects (…)." */
function createdText(plan: ImportPlan, withNames: boolean): string {
  const parts = ([
    ['teacher', plan.create.teachers],
    ['class', plan.create.classes],
    ['subject', plan.create.subjects],
    ['room', plan.create.rooms],
  ] as const)
    .filter(([, xs]) => xs.length)
    .map(([what, xs]) => {
      const label = plural(xs.length, what, what === 'class' ? 'classes' : `${what}s`);
      return withNames ? `${label} (${xs.map((x) => x.name).join(', ')})` : label;
    });
  return parts.length ? and(parts) : '';
}

/** Adds many lessons at once from an Excel file, a CSV file or cells pasted from a spreadsheet. */
export function ImportLessons({ onClose, onDone }: { onClose: () => void; onDone: (message: string) => void }) {
  const { project, update } = useProject();
  const fileRef = useRef<HTMLInputElement>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [source, setSource] = useState('');
  const [paste, setPaste] = useState('');
  const [readError, setReadError] = useState('');

  const result = useMemo(() => {
    if (!sheets) return null;
    try {
      return { plan: planLessonImport(project, sheets) };
    } catch (e) {
      return { error: message(e) };
    }
  }, [sheets, project]);
  const plan = result && 'plan' in result ? result.plan : undefined;
  const error = readError || (result && 'error' in result ? result.error : '');

  const openFile = async (file: File) => {
    try {
      setSheets(await readTableFile(await file.arrayBuffer(), file.name));
      setSource(file.name);
      setReadError('');
    } catch (e) {
      setSheets(null);
      setReadError(message(e));
    }
  };
  const checkPaste = () => {
    setSheets([{ name: 'Pasted cells', rows: parseDelimited(paste) }]);
    setSource('');
    setReadError('');
  };
  const reset = () => {
    setSheets(null);
    setReadError('');
  };
  const downloadTemplate = () =>
    downloadText(
      project.lessons.length ? `${fileSlug(project.school.name)}-lessons.csv` : 'lessons-template.csv',
      lessonsTemplateCsv(project),
      'text/csv;charset=utf-8',
    );

  const doImport = () => {
    if (!plan) return;
    const c = counts(plan);
    update((p) => applyLessonImport(p, plan));
    const made = createdText(plan, false);
    onDone(
      [
        `Added ${plural(c.added, 'lesson')}${c.updated ? ` and updated ${c.updated}` : ''}.`,
        made && `Also added ${made}. You can check them on their own steps.`,
        c.skipped && `${plural(c.skipped, 'row was', 'rows were')} skipped.`,
        'To take it all back, press Undo at the bottom of the menu.',
      ].filter(Boolean).join(' '),
    );
  };

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      hidden
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) openFile(f);
        e.target.value = '';
      }}
    />
  );

  if (plan) {
    const c = counts(plan);
    const ready = c.added + c.updated;
    const made = createdText(plan, true);
    return (
      <div className="card import-lessons">
        <h2>Check before importing</h2>
        <p className="muted">
          From {source ? <><b>{source}</b>{plan.sheetName !== source && <>, sheet <b>{plan.sheetName}</b></>}</> : 'the pasted cells'}:
        </p>
        <ul className="import-summary">
          {(c.added > 0 || !(c.updated + c.same)) && <li><b>{plural(c.added, 'new lesson')}</b></li>}
          {c.updated > 0 && <li><b>{plural(c.updated, 'lesson')} updated</b> (same classes, subject and teachers as a lesson you already have)</li>}
          {c.same > 0 && <li>{plural(c.same, 'lesson is', 'lessons are')} already there with the same numbers</li>}
          {c.skipped > 0 && <li className="warn-text"><b>{plural(c.skipped, 'row')} skipped</b> because of a problem. They are marked below. Fix them in the sheet and import it again.</li>}
          {made && <li>Also adds {made}.</li>}
        </ul>
        <div className="row import-actions">
          <button className="btn primary" disabled={!ready} onClick={doImport}>
            {ready ? `Import ${plural(ready, 'lesson')}` : 'Nothing new to import'}
          </button>
          <button className="btn" onClick={reset}>Choose another file</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
        <div className="table-wrap">
          <table className="data import-preview">
            <thead><tr><th>Row</th><th>Teachers</th><th>Classes</th><th>Subject</th><th>Lessons a week</th><th>What happens</th></tr></thead>
            <tbody>
              {plan.rows.map((r) => (
                <tr key={r.row} className={`import-${r.status}`}>
                  <td data-label="Row">{r.row}</td>
                  <td data-label="Teachers">{r.teachers.join(' and ') || <span className="muted">No teacher</span>}</td>
                  <td data-label="Classes">{r.classes.length > 1 ? `${and(r.classes)} together` : r.classes[0] ?? ''}</td>
                  <td data-label="Subject">{r.subject}</td>
                  <td data-label="Lessons a week">{r.count}</td>
                  <td data-label="What happens" className="wide">{outcome(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="card import-lessons">
      <h2>Import lessons from a spreadsheet</h2>
      <p>
        Add all your lessons at once from Excel or Google Sheets. Use one row per lesson, with these columns. The first
        row must have the column names:
      </p>
      <div className="table-wrap import-example-wrap">
        <table className="import-example">
          <thead><tr><th>Teachers</th><th>Classes</th><th>Subject</th><th>Lessons a week</th></tr></thead>
          <tbody>
            <tr><td>Ms Saba</td><td>1</td><td>Urdu</td><td>5</td></tr>
            <tr><td>Ms Saba &amp; Sir Kamal</td><td>1 &amp; 3</td><td>Quran</td><td>5</td></tr>
          </tbody>
        </table>
      </div>
      <ul className="muted import-notes">
        <li>Put <b>&amp;</b> between names when a lesson has several teachers or classes. Classes on the same row are taught together.</li>
        <li>Teachers, classes and subjects you haven't added yet are added for you.</li>
        <li>You can also add the columns <b>Arrange as</b> (Singles, Doubles, Triples), <b>Most in a day</b> and <b>Rooms</b>.</li>
        <li>Importing the same lesson again updates it instead of adding it twice.</li>
      </ul>
      {error && <div className="alert error" role="alert">{error}</div>}
      <div className="row import-actions">
        <button className="btn primary" onClick={() => fileRef.current?.click()}>Choose a file…</button>
        <button className="btn" onClick={downloadTemplate}>Download template</button>
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        {fileInput}
      </div>
      <p className="help">
        Excel (.xlsx) or CSV files work.{' '}
        {project.lessons.length > 0 && 'The template includes the lessons you already have, so you can change them in Excel and import the file again.'}
      </p>
      <h3 className="import-paste-title">Or paste the cells</h3>
      <p className="help">In Excel, select the table including the column names, copy it, and paste it here.</p>
      <textarea
        value={paste}
        aria-label="Pasted cells"
        placeholder={'Teachers\tClasses\tSubject\tLessons a week\nMs Saba\t1\tUrdu\t5'}
        onChange={(e) => setPaste(e.target.value)}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn" disabled={!paste.trim()} onClick={checkPaste}>Check pasted cells</button>
      </div>
    </div>
  );
}
