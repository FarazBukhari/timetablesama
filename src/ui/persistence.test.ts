import { describe, expect, it } from 'vitest';
import { sampleProject } from '../model/sample';
import {
  INDEX_KEY, LEGACY_KEY, loadIndex, needsBackup, projectKey, readProject, saveProject, type KV, type ProjectMeta,
} from './persistence';

function fakeKV(seed: Record<string, string> = {}, opts: { failWrites?: boolean } = {}): KV & { data: Map<string, string> } {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (opts.failWrites) throw new DOMException('full', 'QuotaExceededError');
      data.set(k, v);
    },
    removeItem: (k) => void data.delete(k),
  };
}

describe('loadIndex', () => {
  it('creates a blank project on first visit', () => {
    const kv = fakeKV();
    const { index, project } = loadIndex(kv);
    expect(index.projects).toHaveLength(1);
    expect(index.activeId).toBe(index.projects[0].id);
    expect(project.lessons).toEqual([]);
    expect(kv.data.has(INDEX_KEY)).toBe(true);
    expect(kv.data.has(projectKey(index.activeId))).toBe(true);
  });

  it('migrates the single-project v1 storage', () => {
    const legacy = sampleProject();
    const kv = fakeKV({ [LEGACY_KEY]: JSON.stringify(legacy) });
    const { index, project } = loadIndex(kv);
    expect(index.projects).toHaveLength(1);
    expect(index.projects[0].name).toBe(legacy.school.name);
    expect(project.lessons).toHaveLength(legacy.lessons.length);
    expect(kv.data.has(LEGACY_KEY)).toBe(false);
  });

  it('drops index entries whose data is missing and keeps the rest', () => {
    const kv = fakeKV();
    const p = sampleProject();
    saveProject(kv, 'a', p);
    const meta = (id: string): ProjectMeta => ({ id, name: id, createdAt: '2026-01-01', updatedAt: '2026-01-01' });
    kv.setItem(INDEX_KEY, JSON.stringify({ activeId: 'gone', projects: [meta('gone'), meta('a')] }));
    const { index, project } = loadIndex(kv);
    expect(index.projects.map((m) => m.id)).toEqual(['a']);
    expect(index.activeId).toBe('a');
    expect(project.school.name).toBe(p.school.name);
  });

  it('survives corrupt index JSON', () => {
    const kv = fakeKV({ [INDEX_KEY]: '{nope' });
    expect(loadIndex(kv).index.projects).toHaveLength(1);
  });
});

describe('saveProject', () => {
  it('reports a friendly error when storage is full', () => {
    const r = saveProject(fakeKV({}, { failWrites: true }), 'x', sampleProject());
    expect(r).toEqual({ ok: false, error: 'Browser storage is full.' });
  });

  it('round-trips and fills missing solver settings', () => {
    const kv = fakeKV();
    const p = sampleProject();
    const partial = { ...p, school: { ...p.school, settings: { seed: 5 } } };
    kv.setItem(projectKey('x'), JSON.stringify(partial));
    const back = readProject(kv, 'x')!;
    expect(back.school.settings.seed).toBe(5);
    expect(back.school.settings.timeLimitSec).toBeGreaterThan(0);
  });
});

describe('needsBackup', () => {
  const meta: ProjectMeta = { id: 'a', name: 'a', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' };
  const withCards = { ...sampleProject(), cards: [{ id: 'k', lessonId: 'l', unit: 0, day: 0, period: 0, locked: false }] };

  it('is false until a timetable exists', () => {
    expect(needsBackup(meta, sampleProject())).toBe(false);
  });
  it('is true when never backed up or edited since the last backup', () => {
    expect(needsBackup(meta, withCards)).toBe(true);
    expect(needsBackup({ ...meta, lastBackupAt: '2026-01-01T12:00:00Z' }, withCards)).toBe(true);
  });
  it('is false right after a backup', () => {
    expect(needsBackup({ ...meta, lastBackupAt: '2026-01-03T00:00:00Z' }, withCards)).toBe(false);
  });
});
