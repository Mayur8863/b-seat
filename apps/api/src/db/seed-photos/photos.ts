/** Seed photos (R-11): file in this folder -> space, position (1 = cover) and description (max 150 chars). */
export interface SeedPhoto {
  file: string;
  spaceName: 'London HQ' | 'Pune Hub';
  position: number;
  description: string;
}

export const SEED_PHOTOS: readonly SeedPhoto[] = [
  {
    file: 'london-hq-1.jpg',
    spaceName: 'London HQ',
    position: 1,
    description: 'Bright open-plan floor with a lounge area and rows of desks',
  },
  {
    file: 'london-hq-2.jpg',
    spaceName: 'London HQ',
    position: 2,
    description: 'Private office desk with shelving and a monitor',
  },
  {
    file: 'london-hq-3.jpg',
    spaceName: 'London HQ',
    position: 3,
    description: 'Two quiet focus booths with fitted desks and lamps',
  },
  {
    file: 'london-hq-4.jpg',
    spaceName: 'London HQ',
    position: 4,
    description: 'Meeting room table with six chairs by the windows',
  },
  {
    file: 'london-hq-5.jpg',
    spaceName: 'London HQ',
    position: 5,
    description: 'Window-side seating with a view over the city',
  },
  {
    file: 'pune-hub-1.jpg',
    spaceName: 'Pune Hub',
    position: 1,
    description: 'Clean white desk with a monitor and a laptop',
  },
  {
    file: 'pune-hub-2.jpg',
    spaceName: 'Pune Hub',
    position: 2,
    description: 'Quiet desk by a large window',
  },
  {
    file: 'pune-hub-3.jpg',
    spaceName: 'Pune Hub',
    position: 3,
    description: 'Tidy overhead view of a desk workspace',
  },
  {
    file: 'pune-hub-4.jpg',
    spaceName: 'Pune Hub',
    position: 4,
    description: 'Desk with a monitor, tablet and a plant',
  },
];
