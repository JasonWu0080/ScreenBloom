"use client";

import { useRef, useState } from "react";
import { dragRect, toView, type Handle } from "@/lib/edit/crop";
import type { Rect } from "@/lib/edit/types";

const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const CURSORS: Record<Handle, string> = {
  move: "move",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

function handleStyle(h: Handle): React.CSSProperties {
  const s: React.CSSProperties = { cursor: CURSORS[h] };
  const edge = "calc(100% - 7px)";
  s.left = h.includes("w") ? -7 : h.includes("e") ? edge : "calc(50% - 7px)";
  s.top = h.includes("n") ? -7 : h.includes("s") ? edge : "calc(50% - 7px)";
  return s;
}

/**
 * Crop box drawn over the preview. Geometry is stored in source pixels; `scale` converts to
 * CSS pixels, so resizing the window only changes the scale and never the crop itself.
 */
export function CropOverlay({
  crop,
  scale,
  sourceW,
  sourceH,
  ratio,
  disabled,
  onChange,
  label,
}: {
  crop: Rect;
  scale: number;
  sourceW: number;
  sourceH: number;
  ratio: number | null;
  disabled?: boolean;
  onChange: (r: Rect) => void;
  label: string;
}) {
  const drag = useRef<{ handle: Handle; x: number; y: number; start: Rect } | null>(null);
  const [active, setActive] = useState(false);
  const v = toView(crop, { scale });

  const onDown = (e: React.PointerEvent<HTMLElement>) => {
    if (disabled || e.button !== 0) return;
    const handle = (e.currentTarget.dataset.handle ?? "move") as Handle;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { handle, x: e.clientX, y: e.clientY, start: crop };
    setActive(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / scale;
    const dy = (e.clientY - d.y) / scale;
    onChange(dragRect(d.start, d.handle, dx, dy, ratio, sourceW, sourceH));
  };
  const onUp = () => {
    drag.current = null;
    setActive(false);
  };

  // Keyboard: arrows move the box by 1 source px (10 with Shift).
  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step = e.shiftKey ? 10 : 1;
    const map: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = map[e.key];
    if (!m) return;
    e.preventDefault();
    onChange(dragRect(crop, "move", m[0], m[1], ratio, sourceW, sourceH));
  };

  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        role="group"
        aria-label={label}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={onKey}
        className="pointer-events-auto absolute touch-none outline-offset-0"
        style={{
          left: v.x,
          top: v.y,
          width: v.width,
          height: v.height,
          boxShadow: "0 0 0 9999px rgba(10,10,12,0.55)",
          border: "1px solid rgba(255,255,255,0.95)",
          cursor: disabled ? "default" : "move",
        }}
        data-handle="move"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {active && (
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-y-0 left-1/3 w-px bg-white/40" />
            <div className="absolute inset-y-0 left-2/3 w-px bg-white/40" />
            <div className="absolute inset-x-0 top-1/3 h-px bg-white/40" />
            <div className="absolute inset-x-0 top-2/3 h-px bg-white/40" />
          </div>
        )}
        {!disabled &&
          HANDLES.map((h) => (
            <div
              key={h}
              data-handle={h}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className="absolute h-[14px] w-[14px] touch-none rounded-[3px] border border-black/30 bg-white shadow"
              style={handleStyle(h)}
            />
          ))}
      </div>
    </div>
  );
}
