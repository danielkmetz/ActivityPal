export type ComposeResult = {
  uri: string;
  width?: number;
  height?: number;
  durationMs?: number;
};

export type Caption = {
  text: string;
  x?: number;      // 0..1
  y?: number;      // 0..1
  startMs?: number;
  endMs?: number;
  fontSize?: number;
  color?: string;  // '#RRGGBB' | '#RRGGBBAA' | 'rgba(r,g,b,a)'
  bgColor?: string;
  padding?: number;
};

export type Segment = {
  uri: string;
  startMs?: number;
  endMs?: number;
};

export type ComposeOptions = {
  segments: Segment[];
  captions?: Caption[];
  outFileName?: string;
  video?: any;
  audio?: any;
};

export declare function compose(options: ComposeOptions): Promise<ComposeResult>;

export declare function addProgressListener(
  listener: (e: { progress: number }) => void
): { remove: () => void };

declare const _default: {
  compose: typeof compose;
  addProgressListener: typeof addProgressListener;
};
export default _default;
