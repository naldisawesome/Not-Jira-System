"use client";
import { useCallback, useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ZoomIn, ZoomOut, Download, X, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { createStore } from "@/lib/store";

type Img = { url: string; name: string };
export const imageViewer = createStore<{ images: Img[]; index: number } | null>(null);
export const openImage = (images: Img[], index = 0) => imageViewer.set({ images, index });

/** Full-screen lightbox with zoom (buttons, wheel, keyboard), pan by drag, prev/next and download. */
export function ImageViewer() {
  const state = imageViewer.useValue();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const img = state?.images[state.index];

  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
  const step = useCallback((d: number) => {
    if (!state) return;
    imageViewer.set({ ...state, index: (state.index + d + state.images.length) % state.images.length });
    setZoom(1); setPan({ x: 0, y: 0 });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "+" || e.key === "=") setZoom((z) => Math.min(8, z * 1.25));
      if (e.key === "-") setZoom((z) => Math.max(0.25, z / 1.25));
      if (e.key === "0") reset();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, step]);

  const btn = "rounded-md p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white";
  return (
    <DialogPrimitive.Root open={!!state} onOpenChange={(o) => { if (!o) { imageViewer.set(null); reset(); } }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/90 animate-in fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-0 z-[61] flex flex-col outline-none" onWheel={(e) => setZoom((z) => Math.min(8, Math.max(0.25, z * (e.deltaY < 0 ? 1.1 : 0.9))))}>
          <DialogPrimitive.Title className="sr-only">{img?.name ?? "Image"}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">Image viewer</DialogPrimitive.Description>
          <div className="flex items-center gap-1 px-4 py-3 text-white">
            <p className="mr-auto truncate text-sm">{img?.name} {state && state.images.length > 1 && <span className="text-white/50">· {state.index + 1}/{state.images.length}</span>}</p>
            <button className={btn} onClick={() => setZoom((z) => Math.max(0.25, z / 1.25))} aria-label="Zoom out"><ZoomOut className="size-4" /></button>
            <span className="w-12 text-center text-xs tabular-nums text-white/70">{Math.round(zoom * 100)}%</span>
            <button className={btn} onClick={() => setZoom((z) => Math.min(8, z * 1.25))} aria-label="Zoom in"><ZoomIn className="size-4" /></button>
            <button className={btn} onClick={reset} aria-label="Fit"><Maximize2 className="size-4" /></button>
            {img && <a className={btn} href={`${img.url}?download=1`} aria-label="Download"><Download className="size-4" /></a>}
            <DialogPrimitive.Close className={btn} aria-label="Close"><X className="size-4" /></DialogPrimitive.Close>
          </div>
          <div
            className="relative flex flex-1 select-none items-center justify-center overflow-hidden"
            style={{ cursor: zoom > 1 ? (drag ? "grabbing" : "grab") : "zoom-in" }}
            onMouseDown={(e) => zoom > 1 && setDrag({ x: e.clientX - pan.x, y: e.clientY - pan.y })}
            onMouseMove={(e) => drag && setPan({ x: e.clientX - drag.x, y: e.clientY - drag.y })}
            onMouseUp={() => setDrag(null)}
            onMouseLeave={() => setDrag(null)}
            onDoubleClick={() => (zoom === 1 ? setZoom(2) : reset())}
            onClick={(e) => { if (e.target === e.currentTarget) imageViewer.set(null); }}
          >
            {img && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={img.url} alt={img.name} draggable={false} className="max-h-[85vh] max-w-[92vw] object-contain transition-transform duration-100" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} />
            )}
            {state && state.images.length > 1 && (
              <>
                <button className={`${btn} absolute left-4`} onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="size-6" /></button>
                <button className={`${btn} absolute right-4`} onClick={() => step(1)} aria-label="Next"><ChevronRight className="size-6" /></button>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
