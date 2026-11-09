import type { SkeletonParams } from '../params';
import { tableBaseSkeleton } from '../defaults';

export const SKELETON_PRESETS: { id: string; label: string; make: () => SkeletonParams }[] = [
  { id: 'table', label: 'Low table base', make: tableBaseSkeleton },
  {
    id: 'stool',
    label: 'Tripod stool',
    make: () => ({
      blend: 60,
      resolution: 90,
      nodes: [
        { id: 0, p: [0, 0, 440], r: 130, open: true },
        { id: 1, p: [0, 0, 260], r: 80, open: false },
        { id: 2, p: [200, 0, 0], r: 75, open: true },
        { id: 3, p: [-100, 173, 0], r: 75, open: true },
        { id: 4, p: [-100, -173, 0], r: 75, open: true },
      ],
      edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 1, b: 3 }, { a: 1, b: 4 }],
    }),
  },
  {
    id: 'arch',
    label: 'Arch',
    make: () => ({
      blend: 40,
      resolution: 90,
      nodes: [
        { id: 0, p: [-300, 0, 0], r: 80, open: true },
        { id: 1, p: [-260, 0, 260], r: 70, open: false },
        { id: 2, p: [0, 0, 400], r: 65, open: false },
        { id: 3, p: [260, 0, 260], r: 70, open: false },
        { id: 4, p: [300, 0, 0], r: 80, open: true },
      ],
      edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }, { a: 3, b: 4 }],
    }),
  },
  {
    id: 'lamp',
    label: 'Y-branch lamp',
    make: () => ({
      blend: 50,
      resolution: 90,
      nodes: [
        { id: 0, p: [0, 0, 0], r: 110, open: true },
        { id: 1, p: [0, 0, 280], r: 70, open: false },
        { id: 2, p: [-180, 40, 520], r: 95, open: true },
        { id: 3, p: [170, -30, 560], r: 95, open: true },
      ],
      edges: [{ a: 0, b: 1 }, { a: 1, b: 2 }, { a: 1, b: 3 }],
    }),
  },
  {
    id: 'tube',
    label: 'Single tube',
    make: () => ({
      blend: 0,
      resolution: 80,
      nodes: [
        { id: 0, p: [0, 0, 0], r: 120, open: true },
        { id: 1, p: [0, 0, 400], r: 120, open: true },
      ],
      edges: [{ a: 0, b: 1 }],
    }),
  },
];
