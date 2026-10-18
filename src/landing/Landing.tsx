import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { buildGrid, type ViewKind } from '../export';
import { teachingPeriods } from '../model/defaults';
import { sampleProject } from '../model/sample';
import type { Project } from '../model/types';
import type { WorkerRequest, WorkerResponse } from '../solver/worker';
import type { PageId } from '../ui/App';
import { ArrowLeft, ArrowRight, Mark } from '../ui/icons';
import { useProject } from '../ui/store';
import { PICTURES, type PictureKey } from './credits';
import './landing.css';

const FOLDERS = [
  { href: '#questions', label: 'Questions', tone: 'slate' },
  { href: '#print', label: 'Print it', tone: 'blush' },
  { href: '#clashes', label: 'No clashes', tone: 'sage' },
  { href: '#how', label: 'How it works', tone: 'mist' },
] as const;

const FAQ = [
  { topic: 'Cost', q: 'Is it really free?', a: 'Yes. There is no trial, no paid plan and no limit on teachers, classes or how many times you create a timetable. Printing and Excel files are free too.' },
  { topic: 'Account', q: 'Do I need to sign up?', a: 'No. Open the page and start. There is no email, password or account to remember.' },
  { topic: 'Saving', q: 'Where is my timetable kept?', a: 'On your own computer, in this browser. It saves as you type. Press Download backup to keep a copy or to open it on another computer. Clearing your browser’s data removes it.' },
  { topic: 'Your week', q: 'Our week isn’t Monday to Friday.', a: 'Choose Monday to Saturday or Sunday to Thursday in one click, or add your own days, including a two-week cycle such as Week A and Week B.' },
  { topic: 'Doubles', q: 'Can some lessons be doubles?', a: 'Yes. Choose singles, doubles or triples for any lesson. A double is never split by break or lunch unless you say it may be.' },
  { topic: 'Changes', q: 'Can I move a lesson myself?', a: 'Yes. Drag it to another box. Free boxes turn green and boxes that would cause a clash turn red. Lock a lesson and it stays where you put it when you create the timetable again.' },
];

const CHECKS = [
  'No teacher in two rooms', 'No class in two lessons', 'No lab booked twice', 'Doubles never cross lunch',
  'Days off respected', 'Subjects spread across the week', 'No gaps in a class’s day', 'Locked lessons stay put',
  'At most six lessons a day for a teacher',
];

/** Adds `is-in` to elements marked `data-reveal` once they scroll into view. Content stays visible without script. */
function useReveal() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !('IntersectionObserver' in window)) return;
    root.classList.add('lp-motion');
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }),
      { rootMargin: '0px 0px -8% 0px' },
    );
    document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.classList.remove('lp-motion');
    };
  }, []);
}

const Reveal = ({ i = 0, as: Tag = 'div', className, children, style }: { i?: number; as?: 'div' | 'h2' | 'p' | 'figure' | 'li'; className?: string; children: ReactNode; style?: CSSProperties }) => (
  <Tag data-reveal className={className} style={{ ...style, '--i': i } as CSSProperties}>{children}</Tag>
);

function Picture({ k, className, eager }: { k: PictureKey; className?: string; eager?: boolean }) {
  const p = PICTURES[k];
  return <img className={className} src={p.src} width={p.width} height={p.height} alt={p.alt} loading={eager ? undefined : 'lazy'} decoding="async" />;
}

/** A printed week sheet for one class, teacher or room, built from real generated data. */
function Sheet({ project, kind, entityId, generation = 0 }: { project: Project; kind: ViewKind; entityId: string; generation?: number }) {
  const grid = buildGrid(project, kind, entityId);
  const tp = teachingPeriods(project.school.periods);
  return (
    <div className="lp-sheet" data-ui>
      <table>
        <thead>
          <tr>
            <th scope="col"><span className="lp-sr">Day</span></th>
            {tp.map((t) => (
              <th key={t.period.id} scope="col">{t.period.start}<span className="lp-sheet-end">–{t.period.end}</span></th>
            ))}
          </tr>
        </thead>
        <tbody key={generation}>
          {project.school.days.map((day, d) => {
            const cells: ReactNode[] = [];
            for (let p = 0; p < tp.length; p++) {
              const e = grid[d]?.[p];
              if (e && !e.isStart) continue;
              let span = 1;
              while (e && grid[d]?.[p + span]?.card.id === e.card.id) span++;
              const who = kind === 'class' ? e?.teachers.map((t) => t.code).join(' ') : e?.classes.map((c) => c.name).join('+');
              const where = kind === 'room' ? e?.teachers.map((t) => t.code).join(' ') : e?.room?.name;
              cells.push(
                <td key={p} colSpan={span}>
                  {e && (
                    <div className="lp-lesson" style={{ '--c': e.subject?.color, '--d': `${(d * tp.length + p) * 12}ms` } as CSSProperties}>
                      <b><span className="lp-long">{e.subject?.name}</span><span className="lp-short">{e.subject?.code}</span></b>
                      <span>{[who, where].filter(Boolean).join(' · ')}</span>
                    </div>
                  )}
                </td>,
              );
            }
            return (
              <tr key={day}>
                <th scope="row"><span className="lp-long">{day}</span><span className="lp-short">{day.slice(0, 3)}</span></th>
                {cells}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Small honest fragments of the real app, used as the pictures of the how-it-works row. */
function Fragment({ kind, project }: { kind: 'bells' | 'people' | 'lessons' | 'days' | 'result'; project: Project }) {
  const subjects = new Map(project.subjects.map((s) => [s.id, s]));
  const name = (id: string, xs: { id: string; name: string }[]) => xs.find((x) => x.id === id)?.name ?? '';
  if (kind === 'bells')
    return (
      <div className="lp-frag" data-ui>
        <b>School day</b>
        <table>
          <tbody>
            {project.school.periods.slice(0, 7).map((p) => (
              <tr key={p.id} className={p.isBreak ? 'brk' : ''}><td>{p.name}</td><td>{p.start}</td><td>{p.end}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (kind === 'people')
    return (
      <div className="lp-frag" data-ui>
        <b>Teachers</b>
        <table>
          <tbody>
            {project.teachers.slice(0, 8).map((t) => <tr key={t.id}><td>{t.name}</td><td>{t.code}</td></tr>)}
          </tbody>
        </table>
      </div>
    );
  if (kind === 'lessons')
    return (
      <div className="lp-frag" data-ui>
        <b>Lessons</b>
        <table>
          <tbody>
            {project.lessons.filter((_, i) => i % 7 === 2 || i % 11 === 0).slice(0, 6).map((l) => (
              <tr key={l.id}>
                <td><span className="lp-swatch" style={{ background: subjects.get(l.subjectId)?.color }} />{subjects.get(l.subjectId)?.name}</td>
                <td>{l.classIds.map((c) => name(c, project.classes)).join('+')}</td>
                <td>{l.periodsPerWeek}{l.length > 1 ? ' as doubles' : ' a week'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (kind === 'days')
    return (
      <div className="lp-frag" data-ui>
        <b>Hannah Price, part-time</b>
        <div className="lp-days">
          {project.school.days.map((d, di) => (
            <div key={d} className="lp-days-row">
              <span>{d.slice(0, 3)}</span>
              {Array.from({ length: 7 }, (_, p) => <i key={p} className={di === 4 ? 'off' : ''}>{di === 4 ? 'Off' : 'Free'}</i>)}
            </div>
          ))}
        </div>
      </div>
    );
  return (
    <div className="lp-frag" data-ui>
      <b>Create timetable</b>
      <p className="lp-frag-ok">All lessons placed. 150 lessons, no clashes.</p>
      <div className="lp-frag-bar"><span /></div>
      <p>Finished in 0.3 seconds.</p>
    </div>
  );
}

export function Landing({ go }: { go: (p: PageId) => void }) {
  const { project, createProject } = useProject();
  const hasData = project.classes.length + project.lessons.length + project.teachers.length > 0;
  const [demo, setDemo] = useState<Project>(() => sampleProject());
  const [generation, setGeneration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'class' | 'teacher' | 'room'>('class');
  const worker = useRef<Worker | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const [openFaq, setOpenFaq] = useState(0);
  useReveal();

  const ids = useMemo(() => ({
    class: demo.classes.find((c) => c.name === '7A')!.id,
    teacher: demo.teachers.find((t) => t.name === 'Sara Qureshi')!.id,
    room: demo.rooms.find((r) => r.name === 'Science Lab 1')!.id,
  }), [demo.classes, demo.teachers, demo.rooms]);

  const shuffle = (seed = Math.floor(Math.random() * 1e9)) => {
    worker.current?.terminate();
    const w = new Worker(new URL('../solver/worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    setBusy(true);
    w.onmessage = (e: MessageEvent<WorkerResponse>) => {
      if (e.data.type === 'progress') return;
      if (e.data.type === 'done') {
        const { cards, unplaced } = e.data.result;
        setDemo((d) => ({ ...d, cards, unplaced }));
        setGeneration((g) => g + 1);
      }
      setBusy(false);
      w.terminate();
    };
    const p = { ...demo, school: { ...demo.school, settings: { ...demo.school.settings, timeLimitSec: 2 } } };
    w.postMessage({ type: 'generate', project: p, seed } satisfies WorkerRequest);
  };

  useEffect(() => {
    shuffle(7);
    return () => worker.current?.terminate();
  }, []); // generate the first week once on arrival

  const start = () => go(hasData ? 'home' : 'school');
  const tryExample = () => {
    createProject(sampleProject(), 'Example school');
    go('generate');
  };

  const scrollRow = (dir: 1 | -1) => rowRef.current?.scrollBy({ left: dir * 312, behavior: 'smooth' });
  const onRowScroll = () => {
    const el = rowRef.current;
    if (el) setProgress(el.scrollLeft / Math.max(1, el.scrollWidth - el.clientWidth));
  };

  const views: { id: 'class' | 'teacher' | 'room'; label: string; who: string }[] = [
    { id: 'class', label: 'Class 7A', who: 'One sheet for every class, for the classroom door.' },
    { id: 'teacher', label: 'Sara Qureshi', who: 'One for every teacher, with rooms on it.' },
    { id: 'room', label: 'Science Lab 1', who: 'One for every room, so nobody double-books the lab.' },
  ];

  return (
    <div className="lp">
      <a className="skip-link" href="#how">Skip to content</a>

      {/* Hero: the stack of school-office folders */}
      <header className="lp-hero">
        <div className="lp-top">
          <a className="lp-toplink lp-toplink-start" href="guide/"><span className="lp-long">How to use it</span><span className="lp-short">Guide</span></a>
          <a className="lp-wordmark" href="#/welcome"><Mark /> TimetableSama</a>
          <a className="lp-toplink" href={hasData ? '#/home' : '#/school'} onClick={(e) => { e.preventDefault(); start(); }}>
            {hasData ? 'My timetables' : 'Start now'}
          </a>
        </div>
        <div className="lp-hero-words">
          <h1>Done by lunch.</h1>
          <p className="lp-lead">
            Type in your teachers, classes and bell times, and TimetableSama builds a clash-free week for the whole
            school, free and without an account.
          </p>
        </div>
        <nav className="lp-folders" aria-label="On this page">
          {FOLDERS.map((f, i) => (
            <a key={f.href} href={f.href} className={`lp-folder tone-${f.tone}`} style={{ '--tab-x': `${6 + i * 21}%` } as CSSProperties}>
              <span className="lp-tab">{f.label}</span>
            </a>
          ))}
          <div className="lp-folder lp-front tone-paper" style={{ '--tab-x': '78%' } as CSSProperties}>
            <span className="lp-tab">Your school</span>
            <div className="lp-front-head">
              <button className="lp-btn" onClick={start}>Make my timetable</button>
              <p>
                Below is class 7A in our example school. Press <b>Shuffle the week</b> and the whole school is arranged
                again, every class, teacher and room, with no clashes.
              </p>
              <button className="lp-btn lp-btn-quiet" onClick={() => shuffle()} disabled={busy} aria-live="polite">
                {busy ? 'Arranging…' : 'Shuffle the week'}
              </button>
            </div>
            <div className="lp-front-sheet">
              <div className="lp-sheet-title">
                <span>Greenfield Secondary School, an example</span>
                <b>Class 7A</b>
              </div>
              <Sheet project={demo} kind="class" entityId={ids.class} generation={generation} />
            </div>
          </div>
        </nav>
      </header>

      <main>
        {/* How it works: a row of moments, left to right */}
        <section id="how" className="lp-how tone-mist">
          <div className="lp-how-head">
            <Reveal as="h2">What you type in</Reveal>
            <div className="lp-row-buttons">
              <button className="lp-square" onClick={() => scrollRow(-1)} aria-label="Scroll back"><ArrowLeft className="icon" /></button>
              <button className="lp-square" onClick={() => scrollRow(1)} aria-label="Scroll forward"><ArrowRight className="icon" /></button>
            </div>
          </div>
          <div className="lp-progress" aria-hidden><span style={{ transform: `scaleX(${Math.max(0.08, progress)})` }} /></div>
          <div className="lp-row" ref={rowRef} onScroll={onRowScroll} tabIndex={0} aria-label="How it works, scroll sideways">
            {[
              { cap: 'Long before computers', text: 'Schools have always had to fit every class, teacher and room into one week.', pic: <Picture k="classroom1924" className="lp-drift" />, gap: 120 },
              { cap: 'In 1914, by hand', text: 'Days across the top, lessons down the side, every name written in with a pen.', pic: <Picture k="timetable1914" />, gap: 80 },
              { cap: 'Every summer, again', text: 'Someone in the office still does it each year, with a pencil, a rubber and a lot of patience.', pic: <Picture k="handwritten" />, gap: 140 },
              { cap: 'First, your school day', text: 'Choose your school days and type your bell times: lessons, short break and lunch.', pic: <Fragment kind="bells" project={demo} />, gap: 96 },
              { cap: 'Then your people and rooms', text: 'List your teachers, classes and rooms. You can paste a list straight from a spreadsheet.', pic: <Fragment kind="people" project={demo} />, gap: 132 },
              { cap: 'Then who teaches what', text: 'Say who teaches each subject to which class, how many lessons a week, and which are doubles.', pic: <Fragment kind="lessons" project={demo} />, gap: 84 },
              { cap: 'Mark the days off', text: 'Click the times a part-time teacher, or the hall, is not available.', pic: <Fragment kind="days" project={demo} />, gap: 124 },
              { cap: 'Press Create', text: 'In about a second every lesson has a place. If one can’t fit, it tells you why, in plain words.', pic: <Fragment kind="result" project={demo} />, gap: 100 },
            ].map((m, i) => (
              <Reveal key={m.cap} className="lp-moment" i={i % 4}>
                <h3>{m.cap}</h3>
                <p>{m.text}</p>
                <div className="lp-moment-gap" style={{ height: m.gap }} />
                <figure className="lp-plate">{m.pic}</figure>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Proof: the printed list of what it checks */}
        <section id="clashes" className="lp-proof tone-sage">
          <div className="lp-card lp-tilt-left">
            <Reveal as="h2">Never double-booked</Reveal>
            <Reveal as="figure" className="lp-tipped" i={1}><Picture k="timetable1890s" /></Reveal>
            <Reveal as="p" className="lp-names" i={2}>
              {CHECKS.map((c, i) => (
                <span key={c}>{c}{i < CHECKS.length - 1 && <span aria-hidden>{' · '}</span>} </span>
              ))}
            </Reveal>
            <Reveal as="p" className="lp-quote" i={3}>
              And when something truly can’t fit, it says so plainly: “No valid slot: teacher Hannah Price is unavailable.”
            </Reveal>
          </div>
        </section>

        {/* Showcase: the sheets you print, with an index that previews each */}
        <section id="print" className="lp-show tone-blush">
          <div className="lp-plate-square">
            {views.map((v) => (
              <div key={v.id} className={`lp-preview${view === v.id ? ' is-active' : ''}`} aria-hidden={view !== v.id}>
                <div className="lp-sheet-title"><span>Greenfield Secondary School, an example</span><b>{v.label}</b></div>
                <Sheet project={demo} kind={v.id} entityId={ids[v.id]} />
              </div>
            ))}
          </div>
          <div className="lp-show-text">
            <div className="lp-index" role="tablist" aria-label="Example sheets">
              {views.map((v) => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={view === v.id}
                  className={view === v.id ? 'is-active' : ''}
                  onMouseEnter={() => setView(v.id)}
                  onFocus={() => setView(v.id)}
                  onClick={() => setView(v.id)}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <div>
              <Reveal as="h2">Ready to pin up</Reveal>
              <Reveal as="p" i={1} className="lp-show-desc">
                {views.find((v) => v.id === view)!.who} Print it, save it as a PDF, or open it in Excel.
              </Reveal>
            </div>
            <div className="lp-cells">
              <button className="lp-cell lp-cell-ink" onClick={start}>Make my timetable</button>
              <button className="lp-cell" onClick={tryExample}>Open the example school</button>
            </div>
          </div>
        </section>

        {/* Questions: index cards in a drawer */}
        <section id="questions" className="lp-faq tone-slate">
          <Reveal as="h2">Before you start</Reveal>
          <div className="lp-drawer">
            {FAQ.map((f, i) => (
              <div key={f.topic} className={`lp-index-card tone-${['sage', 'blush', 'paper'][i % 3]}${openFaq === i ? ' is-open' : ''}`} style={{ '--step': i } as CSSProperties}>
                <span className="lp-card-tab" aria-hidden>{f.topic}</span>
                <h3>
                  <button aria-expanded={openFaq === i} aria-controls={`faq-${i}`} onClick={() => setOpenFaq(i)}>{f.q}</button>
                </h3>
                <div id={`faq-${i}`} className="lp-answer" hidden={openFaq !== i}><p>{f.a}</p></div>
              </div>
            ))}
          </div>
        </section>

        {/* The reply card */}
        <section className="lp-cta tone-olive">
          <Reveal as="p" className="lp-cta-note">
            Most of the work is typing in what you already know. The timetable itself takes about a second.
          </Reveal>
          <div className="lp-card lp-reply">
            <h2>Start your timetable</h2>
            <p>Begin with your bell times. Everything saves on your computer as you go.</p>
            <button className="lp-bar" onClick={start}>Make my timetable</button>
          </div>
        </section>
      </main>

      {/* The back of the card */}
      <footer className="lp-footer tone-slate">
        <div className="lp-back">
          <svg className="lp-scallops" viewBox="0 0 1200 50" preserveAspectRatio="none" aria-hidden>
            <path d={`M0 50 ${Array.from({ length: 12 }, (_, i) => `A50 50 0 0 1 ${(i + 1) * 100} 50`).join(' ')} Z`} />
          </svg>
          <div className="lp-back-msg">
            <h2>From one staffroom to another</h2>
            <p>TimetableSama is free and made for schools. Nothing you type leaves your computer.</p>
          </div>
          <div className="lp-back-addr">
            <figure className="lp-stamp"><Picture k="cabinetCard" /></figure>
            <a href="#/school" onClick={(e) => { e.preventDefault(); start(); }}>Make my timetable</a>
            <a href="#/generate" onClick={(e) => { e.preventDefault(); tryExample(); }}>Open the example school</a>
            <a href="#/home" onClick={(e) => { e.preventDefault(); go('home'); }}>My saved timetables</a>
            <a href="guide/">How to use TimetableSama</a>
            <a href="#questions">How saving works</a>
          </div>
          <div className="lp-imprint">
            <p>TimetableSama. Pictures, all openly licensed:</p>
            <ul>
              {Object.values(PICTURES).map((p) => <li key={p.src}><a href={p.page} rel="noopener noreferrer" target="_blank">{p.credit}</a></li>)}
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
