import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, teachingPeriods } from '../model/defaults';
import { sampleProject } from '../model/sample';
import type { Card, Project } from '../model/types';
import {
  buildGrid, cardLength, cardsToCsv, describeCell, exportProjectJson, gridToCsv, parseProjectJson,
  projectToExcelXml, sheetNamer, xmlEscape,
} from './index';

/** Sample school plus three hand-placed cards: a science double, a joint PE lesson and a single maths lesson. */
function fixture() {
  const p = sampleProject();
  const [c6A, c6B] = p.classes;
  const subj = (code: string) => p.subjects.find((s) => s.code === code)!;
  const lessonOf = (code: string, classIds: string[]) =>
    p.lessons.find((l) => l.subjectId === subj(code).id && classIds.every((c) => l.classIds.includes(c)))!;
  const room = (name: string) => p.rooms.find((r) => r.name === name)!;
  const sci = lessonOf('SCI', [c6A.id]), pe = lessonOf('PE', [c6A.id, c6B.id]), math = lessonOf('MATH', [c6A.id]);
  const card = (id: string, lessonId: string, day: number, period: number, roomId?: string, locked = false): Card =>
    ({ id, lessonId, unit: 0, day, period, roomId, locked });
  p.cards = [
    card('k1', sci.id, 0, 0, room('Science Lab 1').id, true),
    card('k2', pe.id, 0, 2, room('Sports Hall').id),
    card('k3', math.id, 1, 3, room('Room 101').id),
  ];
  return { p, c6A, c6B, sci, pe, math, room };
}

describe('grid', () => {
  it('fills every period of a multi-period card and marks only the first as start', () => {
    const { p, c6A, sci } = fixture();
    const grid = buildGrid(p, 'class', c6A.id);
    expect(grid).toHaveLength(p.school.days.length);
    expect(grid[0]).toHaveLength(teachingPeriods(p.school.periods).length);
    expect(cardLength(p, p.cards[0])).toBe(2);
    expect(grid[0][0]).toMatchObject({ isStart: true, lesson: { id: sci.id } });
    expect(grid[0][1]).toMatchObject({ isStart: false, card: { id: 'k1' } });
    expect(grid[0][2]?.card.id).toBe('k2');
    expect(grid[1][3]?.card.id).toBe('k3');
    expect(grid.flat().filter(Boolean)).toHaveLength(4);
  });

  it('includes joint lessons in each class and filters by teacher and room', () => {
    const { p, c6B, pe, room } = fixture();
    const b = buildGrid(p, 'class', c6B.id);
    expect(b.flat().filter(Boolean).map((e) => e!.card.id)).toEqual(['k2']);
    expect(buildGrid(p, 'teacher', pe.teacherIds[0])[0][2]?.card.id).toBe('k2');
    const lab = buildGrid(p, 'room', room('Science Lab 1').id);
    expect(lab.flat().filter(Boolean).map((e) => e!.card.id)).toEqual(['k1', 'k1']);
  });

  it('describes cells per view', () => {
    const { p, c6A, math, room } = fixture();
    const t = p.teachers.find((x) => x.id === math.teacherIds[0])!;
    const entry = buildGrid(p, 'class', c6A.id)[1][3];
    expect(describeCell(entry, 'class')).toBe(`MATH · ${t.code} · Room 101`);
    expect(describeCell(buildGrid(p, 'teacher', t.id)[1][3], 'teacher')).toBe('MATH · 6A · Room 101');
    expect(describeCell(buildGrid(p, 'room', room('Room 101').id)[1][3], 'room')).toBe(`MATH · 6A · ${t.code}`);
    expect(describeCell(buildGrid(p, 'class', c6A.id)[0][2], 'teacher')).toBe('PE · 6A+6B · Sports Hall');
    expect(describeCell(null, 'class')).toBe('');
  });
});

describe('csv', () => {
  it('writes one row per card with escaping and CRLF', () => {
    const { p, sci } = fixture();
    p.subjects.find((s) => s.id === sci.subjectId)!.name = 'Science, "Lab"\nwork';
    const csv = cardsToCsv(p);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Day,Start,End,Period,Class,Subject,Subject Code,Teacher,Room,Length,Locked');
    expect(csv).toContain('"Science, ""Lab""\nwork"');
    // The embedded newline lives inside a quoted field, so split on CRLF still yields header + 3 rows.
    expect(lines).toHaveLength(1 + p.cards.length);
    expect(lines[1]).toMatch(/^Monday,08:00,09:30,1-2,6A,/);
    expect(lines[1]).toMatch(/,Science Lab 1,2,Yes$/);
    expect(lines[2]).toContain(',6A + 6B,Physical Education,PE,');
  });

  it('writes a grid CSV with period headers and day rows', () => {
    const { p, c6A } = fixture();
    const lines = gridToCsv(p, 'class', c6A.id).split('\r\n');
    expect(lines[0].startsWith(',Period 1 (08:00-08:45),Period 2 (08:45-09:30),')).toBe(true);
    expect(lines).toHaveLength(1 + p.school.days.length);
    expect(lines[1].startsWith('Monday,SCI')).toBe(true);
    expect(lines[1].split(',')).toHaveLength(1 + teachingPeriods(p.school.periods).length);
  });
});

describe('excel', () => {
  it('produces one worksheet per class, teacher and room plus All Lessons', () => {
    const { p } = fixture();
    p.teachers[0].name = 'Dr. O\'Brien / Smith: [Head] & <Co> — a very long name';
    p.teachers[1].name = 'Dr. O\'Brien / Smith: [Head] & <Co> — another one';
    p.subjects.find((x) => x.code === 'SCI')!.name = 'Science <Co> & "Lab"';
    const xml = projectToExcelXml(p);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<?mso-application progid="Excel.Sheet"?>')).toBe(true);
    expect(xml).toContain('<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"');
    expect(xml).toContain('<Font ss:Bold="1"/>');
    const names = [...xml.matchAll(/<Worksheet ss:Name="([^"]*)"/g)].map((m) =>
      m[1].replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
    expect(names).toHaveLength(1 + p.classes.length + p.teachers.length + p.rooms.length);
    expect(names[0]).toBe('All Lessons');
    expect(names).toContain('Class 6A');
    expect(names).toContain('Room Science Lab 1');
    expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(names.length);
    for (const n of names) {
      expect(n.length).toBeLessThanOrEqual(31);
      expect(n).not.toMatch(/[:\\/?*[\]]/);
    }
    // Well-formed-ish: balanced tags, no raw ampersands or angle brackets in data.
    expect(xml.match(/<Worksheet /g)).toHaveLength(names.length);
    expect(xml.match(/<\/Worksheet>/g)).toHaveLength(names.length);
    expect(xml.match(/<Row>/g)?.length).toBe(xml.match(/<\/Row>/g)?.length);
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;|#10;)/);
    expect(xml).toContain('Science &lt;Co&gt; &amp; &quot;Lab&quot;');
    expect(xml).toContain('ss:Name="Teacher Dr. O&apos;Brien - Smith- -H"');
    expect(xml).not.toContain('<Co>');
  });

  it('merges multi-period cards across columns', () => {
    const { p } = fixture();
    const sheet = projectToExcelXml(p).split('<Worksheet ').find((s) => s.startsWith('ss:Name="Class 6A"'))!;
    expect(sheet).toMatch(/<Cell ss:MergeAcross="1"><Data ss:Type="String">SCI · /);
    expect(sheet).toContain('<Cell ss:Index="4">');
  });

  it('sanitizes sheet names and escapes XML', () => {
    const name = sheetNamer();
    expect(name('a/b:c?d*e[f]g\\h')).toBe('a-b-c-d-e-f-g-h');
    const long = 'x'.repeat(40);
    expect(name(long)).toBe('x'.repeat(31));
    expect(name(long)).toBe(`${'x'.repeat(27)} (2)`);
    expect(name('')).toBe('Sheet');
    expect(xmlEscape(`<a & "b" 'c'>\n`)).toBe('&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;&#10;');
  });
});

describe('json', () => {
  it('roundtrips a project', () => {
    const { p } = fixture();
    expect(parseProjectJson(exportProjectJson(p))).toEqual(p);
    expect(exportProjectJson(p)).toContain('\n  "version": 1');
  });

  it('fills defaults for optional data', () => {
    const { p } = fixture();
    const raw = JSON.parse(exportProjectJson(p)) as Record<string, any>;
    delete raw.cards;
    delete raw.unplaced;
    delete raw.teachers[0].unavailable;
    delete raw.rooms[0].unavailable;
    raw.school.settings = { seed: 42 };
    const parsed: Project = parseProjectJson(JSON.stringify(raw));
    expect(parsed.cards).toEqual([]);
    expect(parsed.unplaced).toEqual([]);
    expect(parsed.teachers[0].unavailable).toEqual([]);
    expect(parsed.rooms[0].unavailable).toEqual([]);
    expect(parsed.school.settings).toEqual({ ...DEFAULT_SETTINGS, seed: 42 });
  });

  it('rejects invalid input with clear errors', () => {
    const good = () => JSON.parse(exportProjectJson(fixture().p)) as Record<string, any>;
    const bad = (mut: (r: Record<string, any>) => void) => {
      const r = good();
      mut(r);
      return () => parseProjectJson(JSON.stringify(r));
    };
    expect(() => parseProjectJson('{nope')).toThrow(/isn't a TimetableSama backup/);
    expect(() => parseProjectJson('Day,Start,End')).toThrow(/isn't a TimetableSama backup/);
    expect(() => parseProjectJson('[]')).toThrow(/isn't a TimetableSama backup/);
    expect(() => parseProjectJson('{"hello":"world"}')).toThrow(/isn't a TimetableSama backup/);
    expect(bad((r) => (r.version = 2))).toThrow(/version 2/);
    expect(bad((r) => delete r.school)).toThrow(/"school"/);
    expect(bad((r) => delete r.school.days)).toThrow(/school\.days/);
    expect(bad((r) => (r.school.periods = 'x'))).toThrow(/school\.periods/);
    expect(bad((r) => delete r.lessons)).toThrow(/"lessons" must be an array/);
    expect(bad((r) => (r.teachers[2] = 5))).toThrow(/teachers\[2\]/);
    expect(bad((r) => delete r.lessons[0].classIds)).toThrow(/lessons\[0\]\.classIds/);
    expect(bad((r) => (r.cards[1].day = 'Mon'))).toThrow(/cards\[1\]\.day/);
  });
});
