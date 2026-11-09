declare module 'clipper-lib' {
  export interface IntPoint {
    X: number;
    Y: number;
  }
  export type Path = IntPoint[];
  export type Paths = Path[];
  export class Clipper {
    AddPath(path: Path, polyType: number, closed: boolean): boolean;
    AddPaths(paths: Paths, polyType: number, closed: boolean): boolean;
    Execute(clipType: number, solution: Paths | PolyTree, subjFill?: number, clipFill?: number): boolean;
    static SimplifyPolygons(polys: Paths, fillType: number): Paths;
    static CleanPolygons(polys: Paths, distance: number): Paths;
    static PolyTreeToPaths(tree: PolyTree): Paths;
    static Orientation(path: Path): boolean;
  }
  export class PolyTree {
    Childs(): PolyNode[];
  }
  export class PolyNode {
    Contour(): Path;
    Childs(): PolyNode[];
    IsHole(): boolean;
  }
  export class ClipperOffset {
    constructor(miterLimit?: number, arcTolerance?: number);
    AddPath(path: Path, joinType: number, endType: number): void;
    AddPaths(paths: Paths, joinType: number, endType: number): void;
    Execute(solution: Paths | PolyTree, delta: number): void;
    ArcTolerance: number;
    MiterLimit: number;
  }
  export const ClipType: { ctIntersection: 0; ctUnion: 1; ctDifference: 2; ctXor: 3 };
  export const PolyType: { ptSubject: 0; ptClip: 1 };
  export const PolyFillType: { pftEvenOdd: 0; pftNonZero: 1; pftPositive: 2; pftNegative: 3 };
  export const JoinType: { jtSquare: 0; jtRound: 1; jtMiter: 2 };
  export const EndType: { etOpenSquare: 0; etOpenRound: 1; etOpenButt: 2; etClosedLine: 3; etClosedPolygon: 4 };
  const ClipperLib: {
    Clipper: typeof Clipper;
    ClipperOffset: typeof ClipperOffset;
    PolyTree: typeof PolyTree;
    ClipType: typeof ClipType;
    PolyType: typeof PolyType;
    PolyFillType: typeof PolyFillType;
    JoinType: typeof JoinType;
    EndType: typeof EndType;
  };
  export default ClipperLib;
}
