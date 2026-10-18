import { useEffect, useState } from 'react';
import { Landing } from '../landing/Landing';
import { ArrowLeft, ArrowRight, Check, Mark, Redo, Undo } from './icons';
import { AvailabilityPage } from './pages/AvailabilityPage';
import { ClassesPage, RoomsPage, SubjectsPage, TeachersPage } from './pages/DataPages';
import { GeneratePage } from './pages/GeneratePage';
import { HomePage } from './pages/HomePage';
import { LessonsPage } from './pages/LessonsPage';
import { ReportsPage } from './pages/ReportsPage';
import { SchoolPage } from './pages/SchoolPage';
import { TimetablePage } from './pages/TimetablePage';
import { SaveBanner, SaveStatus } from './SaveBanner';
import { useProject } from './store';

export type PageId =
  | 'welcome' | 'home' | 'school' | 'subjects' | 'teachers' | 'classes' | 'rooms' | 'lessons'
  | 'availability' | 'generate' | 'timetable' | 'reports';

/** The steps of making a timetable, in order. */
const STEPS: { id: PageId; label: string; next: string }[] = [
  { id: 'school', label: 'School day', next: 'Set your days, periods and breaks.' },
  { id: 'subjects', label: 'Subjects', next: 'List the subjects your school teaches.' },
  { id: 'teachers', label: 'Teachers', next: 'Add the staff who teach.' },
  { id: 'classes', label: 'Classes', next: 'Add your classes or forms.' },
  { id: 'rooms', label: 'Rooms', next: 'Add classrooms, labs and halls.' },
  { id: 'lessons', label: 'Lessons', next: 'Say who teaches what, and how often.' },
  { id: 'availability', label: 'Availability', next: 'Mark when people or rooms are not available. You can skip this.' },
  { id: 'generate', label: 'Create timetable', next: 'Let TimetableSama fit every lesson in.' },
  { id: 'timetable', label: 'View & print', next: 'Check it, move lessons by hand, and print.' },
  { id: 'reports', label: 'Reports', next: 'See each teacher’s workload.' },
];
const ALL: PageId[] = ['welcome', 'home', ...STEPS.map((s) => s.id)];

const readHash = (hasData: boolean): PageId => {
  const h = window.location.hash.replace('#/', '') as PageId;
  if (ALL.includes(h)) return h;
  return hasData ? 'home' : 'welcome';
};

export function App() {
  const { project, undo, redo, canUndo, canRedo, projects, active, openProject } = useProject();
  const hasData = project.classes.length + project.lessons.length + project.teachers.length > 0;
  const [page, setPage] = useState<PageId>(() => readHash(hasData));
  const [theme, setTheme] = useState<string>(() => {
    try {
      return localStorage.getItem('timetablesama.theme') ?? 'auto';
    } catch {
      return 'auto';
    }
  });

  useEffect(() => {
    const onHash = () => setPage(readHash(hasData));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [hasData]);
  useEffect(() => {
    if (theme === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('timetablesama.theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  // On phones the step bar scrolls sideways: keep the current step in view.
  useEffect(() => {
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    document.querySelector('.sidebar .nav-item.active')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [page]);

  const go = (id: PageId) => {
    window.location.hash = `#/${id}`;
    setPage(id);
    window.scrollTo(0, 0);
  };

  if (page === 'welcome') return <Landing go={go} />;

  const counts: Partial<Record<PageId, number>> = {
    subjects: project.subjects.length,
    teachers: project.teachers.length,
    classes: project.classes.length,
    rooms: project.rooms.length,
    lessons: project.lessons.length,
    timetable: project.cards.length,
  };
  const done: Partial<Record<PageId, boolean>> = {
    school: project.school.days.length > 0 && project.school.periods.some((p) => !p.isBreak),
    subjects: project.subjects.length > 0,
    teachers: project.teachers.length > 0,
    classes: project.classes.length > 0,
    rooms: project.rooms.length > 0,
    lessons: project.lessons.length > 0,
    generate: project.cards.length > 0,
  };
  const stepIndex = STEPS.findIndex((s) => s.id === page);

  return (
    <div className="app">
      <a className="skip-link" href="#main">Skip to content</a>
      <nav className="sidebar" aria-label="Steps">
        <a className="brand" href="#/welcome" onClick={(e) => { e.preventDefault(); go('welcome'); }}>
          <Mark />
          <span>TimetableSama</span>
        </a>
        <button className={`nav-item${page === 'home' ? ' active' : ''}`} onClick={() => go('home')} aria-current={page === 'home' ? 'page' : undefined}>
          <span className="nav-step" aria-hidden><Mark style={{ width: 16, height: 16 }} /></span>
          My timetables
        </button>
        <ol className="steps-nav">
          {STEPS.map((s, i) => (
            <li key={s.id}>
              <button
                className={`nav-item${page === s.id ? ' active' : ''}${done[s.id] ? ' done' : ''}`}
                onClick={() => go(s.id)}
                aria-current={page === s.id ? 'step' : undefined}
              >
                <span className="nav-step">{done[s.id] ? <Check aria-label="Done" /> : i + 1}</span>
                {s.label}
                {counts[s.id] !== undefined && <span className="count">{counts[s.id]}</span>}
              </button>
            </li>
          ))}
        </ol>
        <div className="sidebar-foot">
          <label className="field">
            Timetable you are working on
            <select value={active.id} onChange={(e) => openProject(e.target.value)}>
              {projects.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </label>
          <SaveStatus />
          <div className="row">
            <button className="btn sm" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo className="icon" />Undo</button>
            <button className="btn sm" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"><Redo className="icon" />Redo</button>
          </div>
          <label className="field">
            Colours
            <select value={theme} onChange={(e) => setTheme(e.target.value)}>
              <option value="auto">Match my computer</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </nav>
      <main className="main" id="main">
        <div className="mobile-status">
          <SaveStatus />
          <select value={active.id} aria-label="Timetable you are working on" onChange={(e) => openProject(e.target.value)}>
            {projects.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <SaveBanner />
        {page === 'home' && <HomePage go={go} />}
        {page === 'school' && <SchoolPage />}
        {page === 'subjects' && <SubjectsPage />}
        {page === 'teachers' && <TeachersPage />}
        {page === 'classes' && <ClassesPage />}
        {page === 'rooms' && <RoomsPage />}
        {page === 'lessons' && <LessonsPage />}
        {page === 'availability' && <AvailabilityPage />}
        {page === 'generate' && <GeneratePage go={go} />}
        {page === 'timetable' && <TimetablePage />}
        {page === 'reports' && <ReportsPage />}
        {stepIndex >= 0 && <NextStep index={stepIndex} go={go} />}
      </main>
    </div>
  );
}

function NextStep({ index, go }: { index: number; go: (p: PageId) => void }) {
  const prev = STEPS[index - 1];
  const next = STEPS[index + 1];
  return (
    <nav className="next-step no-print" aria-label="Next step">
      <p>{next ? <><b>Next: {next.label}.</b> {next.next}</> : <b>That’s every step. Your timetable saves as you go.</b>}</p>
      <div className="row">
        {prev && <button className="btn" onClick={() => go(prev.id)}><ArrowLeft className="icon" />{prev.label}</button>}
        {next && <button className="btn primary" onClick={() => go(next.id)}>{next.label}<ArrowRight className="icon" /></button>}
      </div>
    </nav>
  );
}
