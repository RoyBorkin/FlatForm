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

export const WORLDS: World[] = [
  {
    id: 'modelshop',
    name: 'Model shop',
    blurb: 'Chipboard, graphite and basswood. Calm and dense, with material-true sheets.',
    layerColors: ['#3fc6d8', '#d65aa8', '#e3a83b', '#6cc287', '#9b8cf2', '#f07a5a'],
    preview: { dark: ['#1b1916', '#24211d', '#d9b07a', '#ece6db'], light: ['#e4e1db', '#f5f4f1', '#8a5a1f', '#1f1d1a'] },
  },
  {
    id: 'tissue',
    name: 'Pattern tissue',
    blurb: 'Sewing-pattern ink on tissue. Each layer gets its own line colour and dash.',
    layerColors: ['#e0473c', '#2f6fd6', '#2f9e64', '#b06ad9', '#d68a1c', '#5b6472'],
    preview: { dark: ['#17181d', '#20222a', '#ff6b5e', '#ebe7f2'], light: ['#e8e2d3', '#f4f0e6', '#c8372d', '#1d1b18'] },
  },
  {
    id: 'drafting',
    name: 'Drafting',
    blurb: 'Blueprint and drafting film. Condensed lettering and a title-block status bar.',
    layerColors: ['#ffb347', '#7fd1ff', '#b4f08c', '#ff7fbf', '#d0b8ff', '#ffe066'],
    preview: { dark: ['#0d2136', '#132b45', '#8fd0ff', '#e6eef7'], light: ['#eef3f7', '#fbfcfd', '#1f5fa8', '#10202f'] },
  },
];

export const worldById = (id: WorldId) => WORLDS.find((w) => w.id === id) ?? WORLDS[0];

/** Pattern-tissue dash per layer (canvas setLineDash, in screen px). */
export const TISSUE_DASH: number[][] = [[], [7, 4], [2, 3], [10, 3, 2, 3], [4, 4], [1, 2]];
