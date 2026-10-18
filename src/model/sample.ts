import { PALETTE, defaultSchool, initials, newLesson, uid } from './defaults';
import { slotKey, type Project, type Room, type SchoolClass, type Subject, type Teacher } from './types';

/** A realistic small secondary school used for demos and tests. */
export function sampleProject(): Project {
  const school = { ...defaultSchool(), name: 'Greenfield Secondary School' };

  const subj = (name: string, code: string, i: number): Subject => ({
    id: uid('s'), name, code, color: PALETTE[i % PALETTE.length], unavailable: [],
  });
  const S = {
    eng: subj('English', 'ENG', 0),
    math: subj('Mathematics', 'MATH', 1),
    sci: subj('Science', 'SCI', 2),
    hist: subj('History', 'HIST', 3),
    geo: subj('Geography', 'GEO', 4),
    urdu: subj('Urdu', 'URD', 5),
    comp: subj('Computer Science', 'CS', 6),
    art: subj('Art', 'ART', 7),
    pe: subj('Physical Education', 'PE', 8),
    rel: subj('Religious Studies', 'RS', 9),
    mus: subj('Music', 'MUS', 10),
  };

  const teacher = (name: string, unavailable: string[] = []): Teacher => ({
    id: uid('t'), name, code: initials(name), unavailable,
  });
  // A part-time teacher who is never in on Fridays.
  const fridayOff = Array.from({ length: 7 }, (_, p) => slotKey(4, p));
  const T = {
    eng1: teacher('Amina Rahman'),
    eng2: teacher('Daniel Brooks'),
    math1: teacher('Sara Qureshi'),
    math2: teacher('Michael Chen'),
    sci1: teacher('Fatima Noor'),
    sci2: teacher('Oliver Grant'),
    hist: teacher('Hannah Price', fridayOff),
    geo: teacher('Bilal Ahmed'),
    urdu: teacher('Zainab Malik'),
    comp: teacher('Ravi Patel'),
    art: teacher('Laura Kim'),
    pe: teacher('Tom Walker'),
    rel: teacher('Yusuf Karim'),
  };

  const room = (name: string, type: string, capacity = 35): Room => ({
    id: uid('r'), name, type, capacity, unavailable: [],
  });
  const R = {
    lab1: room('Science Lab 1', 'Lab'),
    lab2: room('Science Lab 2', 'Lab'),
    cs: room('Computer Lab', 'Computer Lab', 30),
    art: room('Art Studio', 'Studio', 30),
    gym: room('Sports Hall', 'Gym', 80),
    music: room('Music Room', 'Studio', 30),
  };
  const homeRooms = ['101', '102', '201', '202', '301', '302'].map((n) => room(`Room ${n}`, 'Classroom'));

  const classNames = ['6A', '6B', '7A', '7B', '8A', '8B'];
  const classes: SchoolClass[] = classNames.map((name, i) => ({
    id: uid('c'), name, homeRoomId: homeRooms[i].id, students: 30, unavailable: [],
  }));
  const classTeachers = [T.eng1, T.math1, T.sci1, T.eng2, T.math2, T.geo];
  classes.forEach((c, i) => (c.classTeacherId = classTeachers[i].id));

  const lessons = [];
  for (let i = 0; i < classes.length; i++) {
    const c = classes[i].id;
    const half = i % 2 === 0;
    lessons.push(
      newLesson({ classIds: [c], subjectId: S.eng.id, teacherIds: [half ? T.eng1.id : T.eng2.id], periodsPerWeek: 5 }),
      newLesson({ classIds: [c], subjectId: S.math.id, teacherIds: [half ? T.math1.id : T.math2.id], periodsPerWeek: 5 }),
      newLesson({
        classIds: [c], subjectId: S.sci.id, teacherIds: [i < 3 ? T.sci1.id : T.sci2.id],
        periodsPerWeek: 4, length: 2, roomIds: [R.lab1.id, R.lab2.id],
      }),
      newLesson({ classIds: [c], subjectId: S.hist.id, teacherIds: [T.hist.id], periodsPerWeek: 2 }),
      newLesson({ classIds: [c], subjectId: S.geo.id, teacherIds: [T.geo.id], periodsPerWeek: 2 }),
      newLesson({ classIds: [c], subjectId: S.urdu.id, teacherIds: [T.urdu.id], periodsPerWeek: 3 }),
      newLesson({
        classIds: [c], subjectId: S.comp.id, teacherIds: [T.comp.id], periodsPerWeek: 2, length: 2, roomIds: [R.cs.id],
      }),
      newLesson({
        classIds: [c], subjectId: S.art.id, teacherIds: [T.art.id], periodsPerWeek: 2, length: 2, roomIds: [R.art.id],
      }),
      newLesson({ classIds: [c], subjectId: S.rel.id, teacherIds: [T.rel.id], periodsPerWeek: 2 }),
      newLesson({ classIds: [c], subjectId: S.mus.id, teacherIds: [T.art.id], periodsPerWeek: 1, roomIds: [R.music.id] }),
    );
  }
  // Joint PE lessons: both sections of a grade share the sports hall.
  for (let g = 0; g < 3; g++) {
    lessons.push(
      newLesson({
        classIds: [classes[g * 2].id, classes[g * 2 + 1].id], subjectId: S.pe.id, teacherIds: [T.pe.id],
        periodsPerWeek: 2, roomIds: [R.gym.id],
      }),
    );
  }

  return {
    version: 1,
    school,
    subjects: Object.values(S),
    teachers: Object.values(T),
    classes,
    rooms: [...homeRooms, ...Object.values(R)],
    lessons,
    cards: [],
    unplaced: [],
  };
}
