"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";

// PAD DE FIRMA (lib/firma): trazo de pluma de verdad — curvas suavizadas entre puntos medios y
// grosor según la velocidad (lento = más grueso, como una pluma), deshacer por trazos, y una
// exportación RECORTADA a la firma y en alta resolución (×3), lista para el PDF.

type Punto = { x: number; y: number; t: number; w: number };
export type PadFirmaHandle = { vacio: () => boolean; png: () => string | null; borrar: () => void; deshacer: () => void };

const TINTA = "#1a2b6d";      // azul tinta: se distingue del texto impreso del documento
const MIN_W = 1.1, MAX_W = 3.4;
const ALTO = 190;

function anchoPorVelocidad(prev: Punto, x: number, y: number, t: number) {
  const dist = Math.hypot(x - prev.x, y - prev.y);
  const v = dist / Math.max(1, t - prev.t);                 // px/ms
  const objetivo = Math.max(MIN_W, Math.min(MAX_W, MAX_W - v * 1.6));
  return prev.w * 0.6 + objetivo * 0.4;                     // suavizado: sin saltos de grosor
}

function pintarTrazo(ctx: CanvasRenderingContext2D, pts: Punto[], escala = 1, dx = 0, dy = 0) {
  if (!pts.length) return;
  ctx.fillStyle = TINTA; ctx.strokeStyle = TINTA; ctx.lineCap = "round"; ctx.lineJoin = "round";
  const P = (p: Punto) => ({ x: (p.x - dx) * escala, y: (p.y - dy) * escala, w: p.w * escala });
  if (pts.length === 1) {
    const p = P(pts[0]);
    ctx.beginPath(); ctx.arc(p.x, p.y, p.w * 0.7, 0, Math.PI * 2); ctx.fill();
    return;
  }
  for (let i = 1; i < pts.length; i++) segmento(ctx, pts.map(P), i);
  colofon(ctx, pts.map(P));
}
type PuntoE = { x: number; y: number; w: number };
const medio = (a: PuntoE, b: PuntoE) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
// Tramo i: del punto medio anterior al punto medio de (i-1, i), con el punto i-1 de control.
function segmento(ctx: CanvasRenderingContext2D, pts: PuntoE[], i: number) {
  const a = pts[i - 1], b = pts[i];
  const desde = i > 1 ? medio(pts[i - 2], a) : a;
  const hasta = medio(a, b);
  ctx.beginPath();
  ctx.lineWidth = (a.w + b.w) / 2;
  ctx.moveTo(desde.x, desde.y);
  ctx.quadraticCurveTo(a.x, a.y, hasta.x, hasta.y);
  ctx.stroke();
}
// El último medio tramo (del último punto medio al último punto), que el esquema deja suelto.
function colofon(ctx: CanvasRenderingContext2D, pts: PuntoE[]) {
  const n = pts.length; if (n < 2) return;
  const a = pts[n - 2], b = pts[n - 1], m = medio(a, b);
  ctx.beginPath(); ctx.lineWidth = b.w; ctx.moveTo(m.x, m.y); ctx.lineTo(b.x, b.y); ctx.stroke();
}

export const PadFirma = forwardRef<PadFirmaHandle, { placeholder: string; onCambio: (vacio: boolean) => void }>(function PadFirma({ placeholder, onCambio }, ref) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const trazos = useRef<Punto[][]>([]);
  const actual = useRef<Punto[] | null>(null);
  const [vacio, setVacio] = useState(true);

  const redibujar = useCallback(() => {
    const c = lienzo.current; if (!c) return;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    for (const t of trazos.current) pintarTrazo(ctx, t);
  }, []);

  // Tamaño real del lienzo = el de su caja × densidad de píxeles (nítido en retina).
  useEffect(() => {
    const ajustar = () => {
      const c = lienzo.current, b = caja.current; if (!c || !b) return;
      const dpr = window.devicePixelRatio || 1;
      const w = b.clientWidth;
      c.width = Math.round(w * dpr); c.height = Math.round(ALTO * dpr);
      c.style.width = `${w}px`; c.style.height = `${ALTO}px`;
      redibujar();
    };
    ajustar();
    const ro = new ResizeObserver(ajustar);
    if (caja.current) ro.observe(caja.current);
    return () => ro.disconnect();
  }, [redibujar]);

  const notificar = useCallback(() => {
    const v = trazos.current.length === 0;
    setVacio(v); onCambio(v);
  }, [onCambio]);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp };
  };
  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = punto(e);
    actual.current = [{ ...p, w: (MIN_W + MAX_W) / 2 }];
    trazos.current.push(actual.current);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) { const dpr = window.devicePixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); pintarTrazo(ctx, actual.current); }
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pts = actual.current; if (!pts) return;
    e.preventDefault();
    // Los eventos agrupados (coalesced) dan un trazo continuo aunque el navegador vaya lento.
    const eventos = (e.nativeEvent as PointerEvent).getCoalescedEvents?.() ?? [e.nativeEvent];
    const r = e.currentTarget.getBoundingClientRect();
    const ctx = e.currentTarget.getContext("2d"); if (!ctx) return;
    const dpr = window.devicePixelRatio || 1; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const ev of eventos) {
      const x = ev.clientX - r.left, y = ev.clientY - r.top, t = ev.timeStamp;
      const prev = pts[pts.length - 1];
      if (Math.hypot(x - prev.x, y - prev.y) < 1.2) continue;
      pts.push({ x, y, t, w: anchoPorVelocidad(prev, x, y, t) });
      ctx.strokeStyle = TINTA; ctx.lineCap = "round"; ctx.lineJoin = "round";
      segmento(ctx, pts, pts.length - 1); // solo el tramo nuevo
    }
  };
  const terminar = () => {
    if (!actual.current) return;
    redibujar(); // con el remate del trazo
    actual.current = null;
    notificar();
  };

  useImperativeHandle(ref, () => ({
    vacio: () => trazos.current.length === 0,
    borrar: () => { trazos.current = []; redibujar(); notificar(); },
    deshacer: () => { trazos.current.pop(); redibujar(); notificar(); },
    // Recortada a la firma (+ margen) y repintada a ×3: el PDF la escala sin pixelar.
    png: () => {
      const todos = trazos.current.flat();
      if (!todos.length) return null;
      const m = MAX_W * 2;
      const minX = Math.min(...todos.map((p) => p.x)) - m, maxX = Math.max(...todos.map((p) => p.x)) + m;
      const minY = Math.min(...todos.map((p) => p.y)) - m, maxY = Math.max(...todos.map((p) => p.y)) + m;
      const esc = 3;
      const off = document.createElement("canvas");
      off.width = Math.max(1, Math.round((maxX - minX) * esc)); off.height = Math.max(1, Math.round((maxY - minY) * esc));
      const ctx = off.getContext("2d"); if (!ctx) return null;
      for (const t of trazos.current) pintarTrazo(ctx, t, esc, minX, minY);
      return off.toDataURL("image/png");
    },
  }), [notificar, redibujar]);

  return (
    <div ref={caja} className="relative select-none overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-white" style={{ height: ALTO, touchAction: "none" }}>
      {/* Línea de firma y aspa, como en papel */}
      <div className="pointer-events-none absolute inset-x-6 bottom-12 border-b border-slate-300" />
      <span className="pointer-events-none absolute bottom-12 left-6 mb-1 text-lg leading-none text-slate-300">×</span>
      {vacio && <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm font-medium text-slate-300">{placeholder}</span>}
      <canvas
        ref={lienzo}
        className="absolute inset-0 cursor-crosshair"
        style={{ touchAction: "none" }}
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onPointerLeave={(e) => { if (e.buttons === 0) terminar(); }}
      />
    </div>
  );
});
