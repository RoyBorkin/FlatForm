/* FlatForm — © 2026 Roy Borkin · royborkin@gmail.com · https://royborkin.github.io/ · All rights reserved */
/**
 * Three interface worlds sharing one layout. Each world lends type, palette,
 * density and its own default part/layer colours; everything else is shared.
 */
export type WorldId = 'modelshop' | 'tissue' | 'drafting';
export type Mode = 'dark' | 'light';

export interface World {
  id: WorldId;
  name: string;
  blurb: string;
  layerColors: string[]; // A, B, C, D (+ more for waffle families / slices)
  /** Swatches shown in the settings preview: ground, panel, accent, text. */
  preview: Record<Mode, [string, string, string, string]>;
}

/** The FlatForm palette: orange-red, amber yellow and dark grey, plus tints of each for extra groups. */
export const PALETTE = { red: '#ee4036', amber: '#faaf40', grey: '#262626' } as const;
const PALETTE_LAYERS = ['#ee4036', '#262626', '#faaf40', '#f4837b', '#6b6b6b', '#fcd08a', '#a82a22', '#c47d17'];

export const WORLDS: World[] = [
  {
    id: 'modelshop',
    name: 'Model shop',
    blurb: 'Chipboard, graphite and basswood. Calm and dense, with material-true sheets.',
    layerColors: PALETTE_LAYERS,
    preview: { dark: ['#1b1916', '#24211d', '#d9b07a', '#ece6db'], light: ['#e4e1db', '#f5f4f1', '#8a5a1f', '#1f1d1a'] },
  },
  {
    id: 'tissue',
    name: 'Pattern tissue',
    blurb: 'Sewing-pattern ink on tissue. Each layer gets its own line colour and dash.',
    layerColors: PALETTE_LAYERS,
    preview: { dark: ['#17181d', '#20222a', '#ff6b5e', '#ebe7f2'], light: ['#e8e2d3', '#f4f0e6', '#c8372d', '#1d1b18'] },
  },
  {
    id: 'drafting',
    name: 'Drafting',
    blurb: 'Blueprint and drafting film. Condensed lettering and a title-block status bar.',
    layerColors: PALETTE_LAYERS,
    preview: { dark: ['#0d2136', '#132b45', '#8fd0ff', '#e6eef7'], light: ['#eef3f7', '#fbfcfd', '#1f5fa8', '#10202f'] },
  },
];

export const worldById = (id: WorldId) => WORLDS.find((w) => w.id === id) ?? WORLDS[0];

/** Pattern-tissue dash per layer (canvas setLineDash, in screen px). */
export const TISSUE_DASH: number[][] = [[], [7, 4], [2, 3], [10, 3, 2, 3], [4, 4], [1, 2]];
