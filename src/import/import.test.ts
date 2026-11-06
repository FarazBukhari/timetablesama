import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyProject, initials, newClass, newLesson, newSubject, newTeacher, uniqueCode } from '../model/defaults';
import { sampleProject } from '../model/sample';
import type { Project } from '../model/types';
import {
  applyLessonImport, columnIndex, lessonsTemplateCsv, parseDelimited, pastedRows, planLessonImport, readHeader,
  readTableFile, readXlsx, splitNames, type Sheet,
} from './index';

const enc = new TextEncoder();

function crc32(b: Uint8Array): number {
  let c = ~0;
  for (const x of b) {
    c ^= x;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

async function deflateRaw(b: Uint8Array): Promise<Uint8Array> {
  const s = new Blob([b]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** A minimal ZIP writer: the even entries are stored, the odd ones deflated (unless `deflate` is off), so both read paths run. */
async function zip(files: Record<string, string>, deflate = true): Promise<Uint8Array> {
  const parts: Uint8Array[] = [], central: Uint8Array[] = [];
  let offset = 0;
  const entries = Object.entries(files);
  for (let i = 0; i < entries.length; i++) {
    const [name, text] = entries[i];
    const raw = enc.encode(text), nameBytes = enc.encode(name);
    const method = deflate && i % 2 ? 8 : 0;
    const data = method ? await deflateRaw(raw) : raw;
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(8, method, true);
    local.setUint32(14, crc32(raw), true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(10, method, true);
    cd.setUint32(16, crc32(raw), true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, raw.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, b) => n + b.length, 0));
  let p = 0;
  for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

/** A sheet laid out like a school's existing lessons export, with a blank second tab. */
const EXPORT_ROWS = [
  ['Teacher Names', 'Class Names', 'Subject Names', 'No. of Lessons'],
  ['Ms Saba', '1', 'Urdu', '5'],
  ['Ms Saba', '2', 'Urdu', '5'],
  ['Ms Saba & Sir Kamal', '1 & 3', 'Quran', '5'],
  ['Ms Saba & Sir Kamal', '2', 'Quran', '5'],
  ['Ms Naila', '1', 'English', '5'],
  ['Ms Lubna', '1', 'Math', '5'],
  ['Ms Lubna', '1', 'Islamiyat', '3'],
  ['Ms Lubna', '6', 'SST', '2'],
];

async function exportWorkbook(deflate = true): Promise<Uint8Array> {
  const strings: string[] = [];
  const si = (s: string) => (strings.includes(s) ? strings.indexOf(s) : strings.push(s) - 1);
  const rowXml = EXPORT_ROWS.map((cells, r) => `<row r="${r + 1}">${cells.map((v, c) => {
    const ref = `${'ABCD'[c]}${r + 1}`;
    // Class names and counts are stored as numbers, as Excel does.
    return /^\d+$/.test(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${si(v)}</v></c>`;
  }).join('')}</row>`).join('');
  return zip({
    '[Content_Types].xml': '<Types/>',
    'xl/workbook.xml': '<workbook xmlns:r="r"><sheets><sheet name="lessons_export" sheetId="1" r:id="rId1"/><sheet name="Sheet1" sheetId="2" r:id="rId2"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="ws" Target="/xl/worksheets/sheet2.xml"/></Relationships>',
    'xl/sharedStrings.xml': `<sst>${strings.map((s) => `<si><t>${s.replace(/&/g, '&amp;')}</t></si>`).join('')}</sst>`,
    'xl/worksheets/sheet1.xml': `<worksheet><sheetData>${rowXml}</sheetData></worksheet>`,
    'xl/worksheets/sheet2.xml': '<worksheet><sheetData/></worksheet>',
  }, deflate);
}

/** A school with no subjects, teachers or classes yet. */
const blank = (): Project => emptyProject();
const sheet = (rows: string[][], name = 'Sheet1'): Sheet[] => [{ name, rows }];

describe('parseDelimited', () => {
  it('reads quoted CSV with commas, doubled quotes, line breaks, a BOM and CRLF', () => {
    const text = '﻿Name,Note\r\n"Khan, Ali","Said ""hi""\nthen left"\r\n\r\nSara,  ok  \r\n';
    expect(parseDelimited(text)).toEqual([['Name', 'Note'], ['Khan, Ali', 'Said "hi"\nthen left'], [], ['Sara', 'ok']]);
  });

  it('reads tab-separated text pasted from Excel, keeping commas inside cells', () => {
    expect(parseDelimited('Ms Saba\t1, 3\tQuran\t5\nMs Lubna\t2\tMath\t5')).toEqual([
      ['Ms Saba', '1, 3', 'Quran', '5'], ['Ms Lubna', '2', 'Math', '5'],
    ]);
  });

  it('reads semicolon-separated CSV', () => {
    expect(parseDelimited('Teacher;Class;Subject;Lessons\nMs Saba;1;Urdu;5\n')).toEqual([
      ['Teacher', 'Class', 'Subject', 'Lessons'], ['Ms Saba', '1', 'Urdu', '5'],
    ]);
  });
});

describe('readXlsx', () => {
  it('reads every tab in order, with shared strings, numbers and both stored and deflated parts', async () => {
    const sheets = await readXlsx(await exportWorkbook());
    expect(sheets.map((s) => s.name)).toEqual(['lessons_export', 'Sheet1']);
    expect(sheets[0].rows).toEqual(EXPORT_ROWS);
    expect(sheets[1].rows).toEqual([]);
  });

  it('reads inline strings, gaps between cells, entities and booleans', async () => {
    const book = await zip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="A &amp; B" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData>'
        + '<row r="2"><c r="A2" t="inlineStr"><is><t xml:space="preserve"> Ms &lt;Saba&gt; </t></is></c><c r="C2" t="b"><v>1</v></c><c r="D2"><v>4.9999999999999</v></c></row>'
        + '<row r="3"><c r="B3" s="1"/></row></sheetData></worksheet>',
    });
    const [s] = await readXlsx(book);
    expect(s.name).toBe('A & B');
    expect(s.rows).toEqual([[], ['Ms <Saba>', '', 'TRUE', '5']]);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('says when the browser is too old to unpack Excel files, but still opens unpacked ones', async () => {
    const packed = await exportWorkbook(), plain = await exportWorkbook(false);
    vi.stubGlobal('DecompressionStream', class { constructor() { throw new TypeError('Unsupported compression format'); } });
    await expect(readXlsx(packed)).rejects.toThrow(/browser is too old to open Excel files/);
    expect((await readXlsx(plain))[0].rows).toEqual(EXPORT_ROWS);
  });

  it('explains files it cannot read in plain words', async () => {
    await expect(readXlsx(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0]))).rejects.toThrow(/older Excel file/);
    await expect(readXlsx(enc.encode('hello'))).rejects.toThrow(/isn't an Excel workbook/);
    await expect(readTableFile(enc.encode('<?xml version="1.0"?><Workbook/>').buffer as ArrayBuffer, 'x.xls')).rejects.toThrow(/isn't an Excel workbook/);
  });

  it('opens CSV files as one sheet, including Windows-1252 text from older Excel', async () => {
    const [s] = await readTableFile(new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x2c, 0x31]).buffer as ArrayBuffer, 'old.csv');
    expect(s).toEqual({ name: 'old.csv', rows: [['Café', '1']] });
  });

  it('turns column letters into indexes', () => {
    expect([columnIndex('A1'), columnIndex('D7'), columnIndex('AA3')]).toEqual([0, 3, 26]);
  });
});

describe('lesson import', () => {
  it('recognises different column names', () => {
    expect(readHeader(['Teacher Names', 'Class Names', 'Subject Names', 'No. of Lessons'])).toEqual({ teachers: 0, classes: 1, subject: 2, count: 3 });
    expect(readHeader(['Subject', 'Classes', 'Periods per week', 'Max lessons a day', 'Arrange as', 'Teachers', 'Room']))
      .toEqual({ subject: 0, classes: 1, count: 2, maxPerDay: 3, length: 4, teachers: 5, rooms: 6 });
  });

  it('splits names on &, + and commas, without repeats', () => {
    expect(splitNames('Ms Saba &  Sir Kamal')).toEqual(['Ms Saba', 'Sir Kamal']);
    expect(splitNames('1 + 3, 1')).toEqual(['1', '3']);
    expect(splitNames('')).toEqual([]);
  });

  it("imports an existing lessons sheet into a blank school, adding the names it needs", async () => {
    const p = blank();
    const plan = planLessonImport(p, await readXlsx(await exportWorkbook()));
    expect(plan.sheetName).toBe('lessons_export');
    expect(plan.rows.map((r) => r.status)).toEqual(Array(8).fill('new'));
    expect(plan.rows[0].row).toBe(2);
    expect(plan.create.teachers.map((t) => [t.name, t.code])).toEqual([['Ms Saba', 'SAB'], ['Sir Kamal', 'KAM'], ['Ms Naila', 'NAI'], ['Ms Lubna', 'LUB']]);
    expect(plan.create.classes.map((c) => c.name)).toEqual(['1', '2', '3', '6']);
    expect(plan.create.subjects.map((s) => s.name)).toEqual(['Urdu', 'Quran', 'English', 'Math', 'Islamiyat', 'SST']);

    const next = applyLessonImport(p, plan);
    expect(next.lessons).toHaveLength(8);
    const byName = (items: { id: string; name: string }[], name: string) => items.find((x) => x.name === name)!.id;
    const quran = next.lessons.find((l) => l.subjectId === byName(next.subjects, 'Quran') && l.classIds.length === 2)!;
    // "1 & 3" is one joint lesson, taught by both teachers.
    expect(quran.classIds).toEqual([byName(next.classes, '1'), byName(next.classes, '3')]);
    expect(quran.teacherIds).toEqual([byName(next.teachers, 'Ms Saba'), byName(next.teachers, 'Sir Kamal')]);
    expect(quran).toMatchObject({ periodsPerWeek: 5, length: 1, maxPerDay: 1, roomIds: [] });
    expect(p.lessons).toHaveLength(0);
  });

  it('matches existing names ignoring case, spacing and short codes, and sets most in a day so the lesson fits', () => {
    const p = blank();
    const saba = newTeacher('Ms Saba', 'SB'), urdu = newSubject('Urdu'), c1 = newClass('Class 1');
    p.teachers.push(saba);
    p.subjects.push(urdu);
    p.classes.push(c1);
    const plan = planLessonImport(p, sheet([['Teacher', 'Class', 'Subject', 'Lessons a week'], ['sb', ' class  1 ', 'URDU', '7']]));
    expect(plan.create).toEqual({ teachers: [], classes: [], subjects: [], rooms: [] });
    expect(plan.rows[0].lesson).toMatchObject({ teacherIds: [saba.id], classIds: [c1.id], subjectId: urdu.id, periodsPerWeek: 7, maxPerDay: 2 });
  });

  it('updates a matching lesson instead of adding it twice, and clears its placed pieces when the count changes', () => {
    const p = blank();
    const t = newTeacher('Ms Saba'), s = newSubject('Urdu'), c = newClass('1');
    const lesson = newLesson({ teacherIds: [t.id], subjectId: s.id, classIds: [c.id], periodsPerWeek: 3 });
    p.teachers.push(t);
    p.subjects.push(s);
    p.classes.push(c);
    p.lessons.push(lesson);
    p.cards.push({ id: 'k1', lessonId: lesson.id, unit: 0, day: 0, period: 0, locked: false });
    const head = ['Teacher', 'Class', 'Subject', 'Lessons', 'Arrange as'];

    const same = planLessonImport(p, sheet([head, ['Ms Saba', '1', 'Urdu', '3', '']]));
    expect(same.rows[0]).toMatchObject({ status: 'same', note: undefined });
    expect(applyLessonImport(p, same).cards).toHaveLength(1);

    const plan = planLessonImport(p, sheet([head, ['Ms Saba', '1', 'Urdu', '6', 'Doubles']]));
    expect(plan.rows[0]).toMatchObject({ status: 'update', note: 'Lessons a week from 3 to 6. Arrange as from Singles to Doubles.' });
    const next = applyLessonImport(p, plan);
    expect(next.lessons).toEqual([{ ...lesson, periodsPerWeek: 6, length: 2 }]);
    expect(next.cards).toHaveLength(0);
  });

  it('skips rows with problems and says why, without adding their names', () => {
    const plan = planLessonImport(blank(), sheet([
      ['Title row above the table'],
      ['Teacher Names', 'Class Names', 'Subject Names', 'No. of Lessons', 'Most in a day'],
      ['Ms Saba', '1', 'Urdu', '5'],
      ['Ms Ghost', '1', 'Art', 'five'],
      ['Ms Saba', '', 'Urdu', '5'],
      [],
      ['Ms Saba', '1', '', '5'],
      ['ms saba', '1', 'urdu', '4'],
      ['Ms Saba', '2', 'Urdu', '0'],
      ['Ms Saba', '2', 'Urdu', '2', '11'],
    ]));
    expect(plan.rows.map((r) => [r.row, r.status, r.note])).toEqual([
      [3, 'new', undefined],
      [4, 'problem', 'Lessons a week must be a whole number from 1 to 40.'],
      [5, 'problem', 'No class.'],
      [7, 'problem', 'No subject.'],
      [8, 'problem', 'Same lesson as row 3.'],
      [9, 'problem', 'Lessons a week must be a whole number from 1 to 40.'],
      [10, 'problem', 'Most in a day must be a whole number from 1 to 10.'],
    ]);
    expect(plan.create.teachers.map((t) => t.name)).toEqual(['Ms Saba']);
    expect(plan.create.classes.map((c) => c.name)).toEqual(['1']);
  });

  it('explains a sheet without the right columns', () => {
    expect(() => planLessonImport(blank(), sheet([['Name', 'Email'], ['Ms Saba', 'h@x.org']]))).toThrow(/No column names found/);
    expect(() => planLessonImport(blank(), sheet([['Teacher', 'Class', 'Subject'], ['Ms Saba', '1', 'Urdu']]))).toThrow(/no "Lessons a week" column/);
    expect(() => planLessonImport(blank(), sheet([['Teacher', 'Class', 'Subject', 'Lessons']]))).toThrow(/no lessons under them/);
  });

  it('lists new classes in order, not in the order the sheet first mentions them', () => {
    const plan = planLessonImport(blank(), sheet([['Teacher', 'Class', 'Subject', 'Lessons'], ['A', '10', 'Urdu', '5'], ['A', '6', 'Urdu', '5'], ['A', '8B', 'Urdu', '5'], ['A', '8A', 'Urdu', '5']]));
    expect(plan.create.classes.map((c) => c.name)).toEqual(['6', '8A', '8B', '10']);
  });

  it('skips a row naming someone who shares a name or code with another, instead of guessing', () => {
    const p = blank();
    const fatimaA = newTeacher('Ms Fatima', 'FA'), fatimaB = newTeacher('Ms Fatima', 'FB');
    const sana = newTeacher('Ms Sana', 'S'), sara = newTeacher('Ms Sara', 'S');
    p.teachers.push(fatimaA, fatimaB, sana, sara);
    p.classes.push(newClass('7A'), newClass('7A'));
    const plan = planLessonImport(p, sheet([
      ['Teacher', 'Class', 'Subject', 'Lessons'],
      ['ms fatima', '8', 'Art', '2'],
      ['FB', '8', 'Art', '2'],
      ['Ms Sana', '7A', 'Art', '2'],
      ['S', '8', 'Urdu', '2'],
    ]));
    expect(plan.rows.map((r) => [r.status, r.note])).toEqual([
      ['problem', 'There are 2 teachers called "Ms Fatima". Rename one, or use their short code.'],
      ['new', undefined],
      ['problem', 'There are 2 classes called "7A". Rename one.'],
      ['problem', 'There are 2 teachers with the short code "S". Give each its own code.'],
    ]);
    expect(plan.rows[1].lesson?.teacherIds).toEqual([fatimaB.id]);
    // Only the row that was imported adds names; the skipped rows add nothing.
    expect(plan.create.teachers).toEqual([]);
    expect(plan.create.classes.map((c) => c.name)).toEqual(['8']);
    expect(plan.create.subjects.map((s) => s.name)).toEqual(['Art']);
  });

  it('gives unique codes to new teachers whose initials clash', () => {
    const plan = planLessonImport(blank(), sheet([['Teacher', 'Class', 'Subject', 'Lessons'], ['Ms Huma Ali', '1', 'Urdu', '5'], ['Mr Hamza Akbar', '2', 'Urdu', '5']]));
    expect(plan.create.teachers.map((t) => t.code)).toEqual(['HA', 'HA2']);
  });

  it('round-trips through the template: every lesson of the sample school comes back unchanged', () => {
    const p = sampleProject();
    const plan = planLessonImport(p, sheet(parseDelimited(lessonsTemplateCsv(p))));
    expect(plan.rows).toHaveLength(p.lessons.length);
    expect(plan.rows.filter((r) => r.status !== 'same')).toEqual([]);
    expect(applyLessonImport(p, plan)).toEqual(p);
  });
});

describe('codes', () => {
  it('skips titles when making initials', () => {
    expect([initials('Ms Saba'), initials('Sir Kamal Ahmed'), initials('Dr. Sara'), initials('Ms'), initials('Amina Rahman')])
      .toEqual(['SAB', 'KA', 'SAR', 'MS', 'AR']);
  });

  it('adds a number to make a code unique', () => {
    expect([uniqueCode('HA', ['ha']), uniqueCode('HA', ['HA', 'HA2']), uniqueCode('XY', ['HA'])]).toEqual(['HA2', 'HA3', 'XY']);
  });
});

describe('Paste a list', () => {
  it('skips a row of column names, blank lines and names already in the list or repeated', () => {
    const text = 'Teacher Names\tCode\nMs Saba\tSB\n\nms  saba\nSir Kamal\n"Khan, Ali"\nAmina Rahman\n';
    expect(pastedRows(text, ['Amina Rahman'])).toEqual({ rows: [['Ms Saba', 'SB'], ['Sir Kamal'], ['Khan, Ali']], skipped: 2 });
    expect(pastedRows('Classes\n7A\n7B', []).rows).toEqual([['7A'], ['7B']]);
    expect(pastedRows('Urdu\nMath', []).rows).toEqual([['Urdu'], ['Math']]);
  });
});
