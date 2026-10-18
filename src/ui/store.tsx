import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { downloadText, exportProjectJson } from '../export';
import type { Project } from '../model/types';
import {
  browserStorage, loadIndex, newMeta, projectKey, readProject, saveIndex, saveProject,
  type KV, type ProjectIndex, type ProjectMeta,
} from './persistence';

const HISTORY = 40;

export type SaveStatus =
  | { state: 'saved'; at?: number }
  | { state: 'pending' }
  | { state: 'error'; error: string }
  /** Storage is blocked entirely (e.g. some private modes): nothing persists. */
  | { state: 'unavailable' };

export type Updater = (p: Project) => Project;

interface Store {
  project: Project;
  update: (fn: Updater) => void;
  /** Replaces the current project's content (undoable). */
  replace: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  projects: ProjectMeta[];
  active: ProjectMeta;
  save: SaveStatus;
  createProject: (p: Project, name?: string) => void;
  openProject: (id: string) => void;
  renameProject: (id: string, name: string) => void;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  /** Downloads the active project as a JSON backup and records the backup time. */
  backup: () => void;
}

const Ctx = createContext<Store | null>(null);

function memoryKV(): KV {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

const nowIso = () => new Date().toISOString();
export const fileSlug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'timetable';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [boot] = useState(() => {
    const real = browserStorage();
    const kv = real ?? memoryKV();
    return { kv, persistent: !!real, ...loadIndex(kv) };
  });
  const { kv, persistent } = boot;
  const [project, setProject] = useState<Project>(boot.project);
  const [index, setIndex] = useState<ProjectIndex>(boot.index);
  const [save, setSave] = useState<SaveStatus>(persistent ? { state: 'saved' } : { state: 'unavailable' });
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const [, bump] = useState(0);
  const latest = useRef({ project, index });
  latest.current = { project, index };
  const firstRender = useRef(true);

  const report = useCallback(
    (ok: boolean, error = '') => setSave(!persistent ? { state: 'unavailable' } : ok ? { state: 'saved', at: Date.now() } : { state: 'error', error }),
    [persistent],
  );

  const flush = useCallback(() => {
    const { project: p, index: ix } = latest.current;
    const r = saveProject(kv, ix.activeId, p);
    report(r.ok, r.ok ? '' : r.error);
    return r.ok;
  }, [kv, report]);

  const touch = useCallback(
    () => setIndex((ix) => ({ ...ix, projects: ix.projects.map((m) => (m.id === ix.activeId ? { ...m, updatedAt: nowIso() } : m)) })),
    [],
  );

  // Debounced autosave of the active project.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    touch();
    if (persistent) setSave((s) => (s.state === 'error' ? s : { state: 'pending' }));
    const t = setTimeout(flush, 250);
    return () => clearTimeout(t);
  }, [project, flush, persistent, touch]);

  useEffect(() => {
    const r = saveIndex(kv, index);
    if (!r.ok) report(false, r.error);
  }, [index, kv, report]);

  // Save on tab close, and warn if the work can't be kept.
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      const ok = flush();
      const { project: p } = latest.current;
      if ((!ok || !persistent) && (p.lessons.length || p.cards.length)) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [flush, persistent]);

  // Keep the project list in sync with other tabs.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== 'timetablesama.index.v1' || !e.newValue) return;
      try {
        const other = JSON.parse(e.newValue) as ProjectIndex;
        setIndex((ix) => ({ ...ix, projects: other.projects }));
      } catch {
        /* ignore malformed */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((fn: Updater) => {
    setProject((prev) => {
      const next = fn(prev);
      if (next === prev) return prev;
      past.current = [...past.current.slice(-HISTORY + 1), prev];
      future.current = [];
      return next;
    });
    bump((n) => n + 1);
  }, []);

  const replace = useCallback((p: Project) => update(() => p), [update]);

  const step = useCallback((from: React.MutableRefObject<Project[]>, to: React.MutableRefObject<Project[]>) => {
    setProject((cur) => {
      const target = from.current.pop();
      if (!target) return cur;
      to.current.push(cur);
      return target;
    });
    bump((n) => n + 1);
  }, []);
  const undo = useCallback(() => step(past, future), [step]);
  const redo = useCallback(() => step(future, past), [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  /** Saves the current project, then makes `id` active with `p` as its content. */
  const activate = useCallback((id: string, p: Project, extra: ProjectMeta[] = []) => {
    flush();
    past.current = [];
    future.current = [];
    firstRender.current = true; // loading isn't an edit; skip the autosave for it
    setProject(p);
    setIndex((ix) => ({ activeId: id, projects: [...ix.projects, ...extra] }));
    bump((n) => n + 1);
  }, [flush]);

  const createProject = useCallback((p: Project, name?: string) => {
    const meta = newMeta(name ?? p.school.name);
    const r = saveProject(kv, meta.id, p);
    if (!r.ok) report(false, r.error);
    activate(meta.id, p, [meta]);
  }, [kv, activate, report]);

  const openProject = useCallback((id: string) => {
    if (id === latest.current.index.activeId) return;
    const p = readProject(kv, id);
    if (p) activate(id, p);
  }, [kv, activate]);

  const renameProject = useCallback((id: string, name: string) => {
    setIndex((ix) => ({ ...ix, projects: ix.projects.map((m) => (m.id === id ? { ...m, name } : m)) }));
  }, []);

  const duplicateProject = useCallback((id: string) => {
    const isActive = id === latest.current.index.activeId;
    const src = isActive ? latest.current.project : readProject(kv, id);
    const meta = latest.current.index.projects.find((m) => m.id === id);
    if (src) createProject(structuredClone(src), `${meta?.name ?? 'Project'} (copy)`);
  }, [kv, createProject]);

  const deleteProject = useCallback((id: string) => {
    const { index: ix } = latest.current;
    const rest = ix.projects.filter((m) => m.id !== id);
    kv.removeItem(projectKey(id));
    if (id !== ix.activeId) {
      setIndex({ ...ix, projects: rest });
      return;
    }
    const next = rest[0];
    const p = next ? readProject(kv, next.id) : null;
    past.current = [];
    future.current = [];
    firstRender.current = true;
    if (next && p) {
      setProject(p);
      setIndex({ activeId: next.id, projects: rest });
    } else {
      // Deleted the last project: start a fresh blank one.
      const blank = loadIndex(kv);
      setProject(blank.project);
      setIndex(blank.index);
    }
    bump((n) => n + 1);
  }, [kv]);

  const backup = useCallback(() => {
    const { project: p, index: ix } = latest.current;
    const meta = ix.projects.find((m) => m.id === ix.activeId);
    downloadText(`${fileSlug(meta?.name ?? p.school.name)}.timetable.json`, exportProjectJson(p), 'application/json');
    const t = nowIso();
    setIndex((cur) => ({ ...cur, projects: cur.projects.map((m) => (m.id === cur.activeId ? { ...m, lastBackupAt: t } : m)) }));
  }, []);

  const active = index.projects.find((m) => m.id === index.activeId) ?? index.projects[0];
  const value = useMemo<Store>(
    () => ({
      project, update, replace, undo, redo,
      canUndo: past.current.length > 0, canRedo: future.current.length > 0,
      projects: index.projects, active, save,
      createProject, openProject, renameProject, duplicateProject, deleteProject, backup,
    }),
    [project, update, replace, undo, redo, index.projects, active, save, createProject, openProject, renameProject, duplicateProject, deleteProject, backup, past.current.length, future.current.length],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProject(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useProject must be used inside ProjectProvider');
  return s;
}

/** Removes an entity id from every reference and clears the generated timetable if lessons change. */
export function removeReferences(p: Project, id: string): Project {
  // Drop lessons that lose their subject or their only class; strip the id elsewhere.
  const lessons = p.lessons
    .filter((l) => l.id !== id && l.subjectId !== id && !(l.classIds.length === 1 && l.classIds[0] === id))
    .map((l) => ({
      ...l,
      classIds: l.classIds.filter((x) => x !== id),
      teacherIds: l.teacherIds.filter((x) => x !== id),
      roomIds: l.roomIds.filter((x) => x !== id),
    }));
  const keep = new Set(lessons.map((l) => l.id));
  return {
    ...p,
    subjects: p.subjects.filter((x) => x.id !== id),
    teachers: p.teachers.filter((x) => x.id !== id),
    classes: p.classes
      .filter((x) => x.id !== id)
      .map((c) => ({
        ...c,
        classTeacherId: c.classTeacherId === id ? undefined : c.classTeacherId,
        homeRoomId: c.homeRoomId === id ? undefined : c.homeRoomId,
      })),
    rooms: p.rooms.filter((x) => x.id !== id),
    lessons,
    cards: p.cards
      .filter((c) => keep.has(c.lessonId))
      .map((c) => (c.roomId === id ? { ...c, roomId: undefined } : c)),
    unplaced: p.unplaced.filter((u) => keep.has(u.lessonId)),
  };
}
