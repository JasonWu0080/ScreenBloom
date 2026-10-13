declare module "gifenc" {
  export type Palette = number[][];
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    options?: { format?: "rgb565" | "rgb444" | "rgba4444"; useSqrt?: boolean },
  ): Palette;
}
