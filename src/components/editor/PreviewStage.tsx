"use client";

import { useEffect, useRef, useState } from "react";
import { CropOverlay } from "./CropOverlay";
import type { Rect } from "@/lib/edit/types";

/**
 * Shows the source video letterboxed in the available space, with the crop overlay on top.
 * The displayed box always has the source's display aspect ratio, so one `scale` number maps
 * source pixels to CSS pixels in both directions.
 */
export function PreviewStage({
  url,
  sourceW,
  sourceH,
  crop,
  ratio,
  onCrop,
  onVideo,
  disabled,
  cropLabel,
  unavailableText,
}: {
  url: string;
  sourceW: number;
  sourceH: number;
  crop: Rect;
  ratio: number | null;
  onCrop: (r: Rect) => void;
  onVideo: (v: HTMLVideoElement | null) => void;
  disabled?: boolean;
  cropLabel: string;
  unavailableText: string;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const PAD = 14; // room for the crop handles at the frame edges
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.max(0.01, Math.min((width - PAD * 2) / sourceW, (height - PAD * 2) / sourceH)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [sourceW, sourceH]);

  const w = Math.round(sourceW * scale);
  const h = Math.round(sourceH * scale);

  return (
    <div ref={boxRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-stage">
      <div className="relative" style={{ width: w, height: h }}>
        <video
          ref={onVideo}
          src={url}
          className="block h-full w-full bg-black"
          muted
          playsInline
          preload="auto"
          onError={() => setFailed(true)}
          onLoadedData={() => setFailed(false)}
        />
        {scale > 0 && (
          <CropOverlay crop={crop} scale={scale} sourceW={sourceW} sourceH={sourceH} ratio={ratio} onChange={onCrop} disabled={disabled} label={cropLabel} />
        )}
      </div>
      {failed && (
        <div className="absolute inset-x-4 top-4 rounded-md bg-black/70 px-3 py-2 text-xs leading-relaxed text-white">{unavailableText}</div>
      )}
    </div>
  );
}
