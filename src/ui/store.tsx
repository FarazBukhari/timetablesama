import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, emptyProject } from '../model/defaults';
import type { Project } from '../model/types';

const STORAGE_KEY = 'timetablesama.project.v1';
const HISTORY = 40;

function load(): Project {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Project;
      if (p && p.version === 1 && p.school) {
        p.school.settings = { ...DEFAULT_SETTINGS, ...p.school.settings };
        return p;
      }
    }
  } catch {
    /* storage unavailable or corrupt: start fresh */
  }
  return emptyProject();
}

export type Updater = (p: Project) => Project;

interface Store {
  project: Project;
  update: (fn: Updater) => void;
  replace: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const Ctx = createContext<Store | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [project, setProject] = useState<Project>(load);
  const past = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const [, bump] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(project));
      } catch {
        /* quota or private mode: keep working in memory */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [project]);

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

  const undo = useCallback(() => {
    setProject((cur) => {
      const prev = past.current.pop();
      if (!prev) return cur;
      future.current.push(cur);
      return prev;
    });
    bump((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    setProject((cur) => {
      const next = future.current.pop();
      if (!next) return cur;
      past.current.push(cur);
      return next;
    });
    bump((n) => n + 1);
  }, []);

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

  const value = useMemo<Store>(
    () => ({
      project, update, replace, undo, redo,
      canUndo: past.current.length > 0, canRedo: future.current.length > 0,
    }),
    [project, update, replace, undo, redo, past.current.length, future.current.length],
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
