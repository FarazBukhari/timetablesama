/** Openly licensed pictures used on the landing page, with the credit each licence asks for. */
export const PICTURES = {
  classroom1924: {
    src: 'pictures/classroom-1924.jpg', width: 1280, height: 1124,
    alt: 'A 1924 illustration of a teacher pointing at a blackboard while children sit at wooden desks',
    credit: '“Teacher at blackboard” (1924), public domain, via Wikimedia Commons',
    page: 'https://commons.wikimedia.org/wiki/File:Teacher_at_blackboard_(1924).jpg',
  },
  timetable1914: {
    src: 'pictures/timetable-1914.jpg', width: 1280, height: 733,
    alt: 'A printed weekly school programme from 1914, with days across the top and lessons and names in each column',
    credit: '“What one school did and how it did it” by Grace Wyman (1914), no known copyright restrictions, via Wikimedia Commons',
    page: 'https://commons.wikimedia.org/wiki/File:What_one_school_did_and_how_it_did_it_(1914)_(14780450241).jpg',
  },
  handwritten: {
    src: 'pictures/timetable-handwritten.jpg', width: 1280, height: 1339,
    alt: 'A handwritten school timetable grid with days across the top, periods down the side and teacher initials in each box',
    credit: '“School timetable” by Supercarwaar, CC BY-SA 3.0, via Wikimedia Commons',
    page: 'https://commons.wikimedia.org/w/index.php?curid=31401282',
  },
  timetable1890s: {
    src: 'pictures/timetable-1890s.jpg', width: 1022, height: 564,
    alt: 'A Victorian printed “Time Table” for a country school, ruled into standards and half-hour lessons',
    credit: '“Gladman Small Timetable” by J. F. Gladman, public domain, via Wikimedia Commons',
    page: 'https://commons.wikimedia.org/wiki/File:Gladman_Small_Timetable.jpg',
  },
  cabinetCard: {
    src: 'pictures/teacher-cabinet-card.jpg', width: 936, height: 1400,
    alt: 'An 1893 studio photograph of a teacher with two pupils beside a chalkboard',
    credit: '“Teacher with Two Students near Chalkboard” by Frank Woodward (1893), public domain (CC0), The Metropolitan Museum of Art',
    page: 'https://www.metmuseum.org/art/collection/search/926173',
  },
} as const;

export type PictureKey = keyof typeof PICTURES;
