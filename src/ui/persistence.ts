import { DEFAULT_SETTINGS, emptyProject, uid } from '../model/defaults';
import type { Project } from '../model/types';

/** The subset of the Web Storage API we use, so tests can pass an in-memory fake. */
export type KV = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  /** When the project was last exported to a backup file. */
  lastBackupAt?: string;
}

export interface ProjectIndex {
  activeId: string;
  projects: ProjectMeta[];
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export const INDEX_KEY = 'timetablesama.index.v1';
export const LEGACY_KEY = 'timetablesama.project.v1';
export const projectKey = (id: string) => `timetablesama.project.${id}`;

const now = () => new Date().toISOString();

/** Returns the browser's localStorage if it can actually be written to, else null. */
export function browserStorage(): KV | null {
  try {
    const s = window.localStorage;
    const probe = '__timetablesama_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function describeError(e: unknown): string {
  const name = e instanceof DOMException || e instanceof Error ? e.name : '';
  if (/quota/i.test(name) || /quota/i.test(String(e))) return 'Browser storage is full.';
  return 'The browser refused to save (storage blocked or private mode).';
}

function write(kv: KV, key: string, value: string): SaveResult {
  try {
    kv.setItem(key, value);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export function normalizeProject(p: Project): Project {
  return { ...p, school: { ...p.school, settings: { ...DEFAULT_SETTINGS, ...p.school.settings } } };
}

export function readProject(kv: KV, id: string): Project | null {
  try {
    const raw = kv.getItem(projectKey(id));
    if (!raw) return null;
    const p = JSON.parse(raw) as Project;
    return p && p.version === 1 && p.school ? normalizeProject(p) : null;
  } catch {
    return null;
  }
}

export const saveProject = (kv: KV, id: string, project: Project): SaveResult =>
  write(kv, projectKey(id), JSON.stringify(project));

export const saveIndex = (kv: KV, index: ProjectIndex): SaveResult => write(kv, INDEX_KEY, JSON.stringify(index));

export function newMeta(name: string): ProjectMeta {
  const t = now();
  return { id: uid('prj'), name: name.trim() || 'Untitled school', createdAt: t, updatedAt: t };
}

/**
 * Loads the project index, migrating the single-project format from v1 and dropping entries
 * whose data has gone missing. Always returns an index with at least one project.
 */
export function loadIndex(kv: KV): { index: ProjectIndex; project: Project } {
  let index: ProjectIndex | null = null;
  try {
    const raw = kv.getItem(INDEX_KEY);
    if (raw) index = JSON.parse(raw) as ProjectIndex;
  } catch {
    index = null;
  }

  if (!index || !Array.isArray(index.projects)) {
    index = { activeId: '', projects: [] };
    // Migrate the original single-project storage.
    try {
      const legacy = kv.getItem(LEGACY_KEY);
      const p = legacy ? (JSON.parse(legacy) as Project) : null;
      if (p && p.version === 1 && p.school) {
        const meta = newMeta(p.school.name);
        if (saveProject(kv, meta.id, p).ok) {
          index.projects.push(meta);
          index.activeId = meta.id;
          kv.removeItem(LEGACY_KEY);
        }
      }
    } catch {
      /* unreadable legacy data: start fresh */
    }
  }

  index.projects = index.projects.filter((m) => kv.getItem(projectKey(m.id)) !== null);
  let active = index.projects.find((m) => m.id === index!.activeId) ?? index.projects[0];
  let project = active ? readProject(kv, active.id) : null;
  if (!active || !project) {
    project = emptyProject();
    active = newMeta(project.school.name);
    saveProject(kv, active.id, project);
    index.projects.push(active);
  }
  index.activeId = active.id;
  saveIndex(kv, index);
  return { index, project };
}

/** Whether the project has changes that are not in any exported backup file. */
export function needsBackup(meta: ProjectMeta | undefined, project: Project): boolean {
  if (!meta || !project.cards.length) return false;
  return !meta.lastBackupAt || meta.updatedAt > meta.lastBackupAt;
}
