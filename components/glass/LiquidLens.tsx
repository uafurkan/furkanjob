"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Signature liquid-glass lens — a real refraction (displacement map → SVG feDisplacementMap),
 * ported from the cross-browser technique (fresh filter id per frame for Safari). Use ONCE, in the
 * hero. Everything else uses the cheap static .glass. Honors prefers-reduced-motion (no drift).
 */
const PAD = 22;
const RADIUS = 28;
const BOOST = 0.8;
// fixed "thick glass" look
const DEPTH = 70; // displacement scale (px)
const SPLAY = 6; // rim width
const FEATHER = 22;
const CURVE = 1.6;
const GLINT = 0.45;

export default function LiquidLens({
  width = 132,
  height = 132,
  children,
}: {
  width?: number;
  height?: number;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const refrRef = useRef<HTMLDivElement>(null);
  const cloneRef = useRef<HTMLDivElement>(null);
  const housingRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const stage = stageRef.current,
      lens = lensRef.current,
      refr = refrRef.current,
      clone = cloneRef.current,
      housing = housingRef.current;
    if (!stage || !lens || !refr || !clone || !housing) return;

    const LW = width,
      LH = height;
    const MAPW = (LW + 2 * PAD),
      MAPH = (LH + 2 * PAD);
    let version = 0;
    const mapCache = new Map<string, string>();
    const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

    function buildMap(): string {
      const key = `${MAPW}:${LW}:${RADIUS}:${SPLAY}:${CURVE}:${FEATHER}`;
      const hit = mapCache.get(key);
      if (hit) return hit;
      const cv = document.createElement("canvas");
      cv.width = MAPW;
      cv.height = MAPH;
      const ctx = cv.getContext("2d")!;
      const img = ctx.createImageData(MAPW, MAPH),
        px = img.data;
      const hx = LW / 2,
        hy = LH / 2;
      const sdf = (x: number, y: number) => {
        const qx = Math.abs(x - MAPW / 2) - (hx - RADIUS);
        const qy = Math.abs(y - MAPH / 2) - (hy - RADIUS);
        const ox = Math.max(qx, 0),
          oy = Math.max(qy, 0);
        return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - RADIUS;
      };
      for (let y = 0; y < MAPH; y++) {
        for (let x = 0; x < MAPW; x++) {
          const cx = x + 0.5,
            cy = y + 0.5;
          const s = sdf(cx, cy);
          const gx = sdf(cx + 1, cy) - sdf(cx - 1, cy);
          const gy = sdf(cx, cy + 1) - sdf(cx, cy - 1);
          const len = Math.hypot(gx, gy) || 1;
          const nx = gx / len,
            ny = gy / len;
          const span = s < 0 ? SPLAY + FEATHER : SPLAY;
          let amt = Math.max(0, 1 - Math.abs(s) / span);
          amt = amt * amt * amt * (amt * (amt * 6 - 15) + 10);
          amt = Math.pow(amt, CURVE);
          const i = (y * MAPW + x) * 4;
          px[i] = clamp255(Math.round(127.5 - nx * amt * 127 * BOOST));
          px[i + 1] = clamp255(Math.round(127.5 - ny * amt * 127 * BOOST));
          px[i + 2] = 128;
          px[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      const url = cv.toDataURL("image/png");
      mapCache.set(key, url);
      return url;
    }

    function applyFilter(mapUrl: string) {
      const id = `lens-v${++version}`;
      housing!.innerHTML = `<defs><filter id="${id}" x="0" y="0" width="100%" height="100%" filterUnits="objectBoundingBox" color-interpolation-filters="sRGB">
        <feImage href="${mapUrl}" x="0" y="0" width="${MAPW}" height="${MAPH}" preserveAspectRatio="none" result="map"/>
        <feDisplacementMap in="SourceGraphic" in2="map" scale="${DEPTH}" xChannelSelector="R" yChannelSelector="G"/>
      </filter></defs>`;
      refr!.style.filter = `url(#${id})`;
    }

    let curLeft = (stage.clientWidth - LW) / 2;
    let curTop = (stage.clientHeight - LH) / 2;

    function place() {
      lens!.style.left = curLeft + "px";
      lens!.style.top = curTop + "px";
      lens!.style.width = LW + "px";
      lens!.style.height = LH + "px";
      refr!.style.width = MAPW + "px";
      refr!.style.height = MAPH + "px";
      refr!.style.left = -PAD + "px";
      refr!.style.top = -PAD + "px";
      refr!.style.clipPath = `inset(${PAD}px round ${RADIUS}px)`;
      clone!.style.left = `${-(curLeft - PAD)}px`;
      clone!.style.top = `${-(curTop - PAD)}px`;
      clone!.style.width = stage!.clientWidth + "px";
      clone!.style.height = stage!.clientHeight + "px";
    }

    const mapUrl = buildMap();
    place();
    applyFilter(mapUrl);

    // drag
    let drag = false,
      sx = 0,
      sy = 0,
      ox = 0,
      oy = 0;
    const onDown = (e: PointerEvent) => {
      drag = true;
      sx = e.clientX;
      sy = e.clientY;
      ox = curLeft;
      oy = curTop;
      lens!.setPointerCapture(e.pointerId);
      lens!.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      curLeft = Math.max(0, Math.min(ox + (e.clientX - sx), stage!.clientWidth - LW));
      curTop = Math.max(0, Math.min(oy + (e.clientY - sy), stage!.clientHeight - LH));
      place();
      applyFilter(mapUrl);
    };
    const onUp = () => {
      drag = false;
      lens!.style.cursor = "grab";
    };
    lens.addEventListener("pointerdown", onDown);
    lens.addEventListener("pointermove", onMove);
    lens.addEventListener("pointerup", onUp);

    // gentle idle drift (alive), disabled for reduced motion
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0,
      t0 = 0;
    const baseL = curLeft,
      baseT = curTop;
    function loop(t: number) {
      if (!t0) t0 = t;
      const dt = (t - t0) / 1000;
      if (!drag) {
        curLeft = baseL + Math.cos(dt * 0.5) * 26;
        curTop = baseT + Math.sin(dt * 0.7) * 16;
        place();
        applyFilter(mapUrl);
      }
      raf = requestAnimationFrame(loop);
    }
    if (!reduce) raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lens.removeEventListener("pointerdown", onDown);
      lens.removeEventListener("pointermove", onMove);
      lens.removeEventListener("pointerup", onUp);
    };
  }, [width, height]);

  return (
    <div className="lens-stage" ref={stageRef}>
      <div className="lens-scene">{children}</div>
      <div className="lens" ref={lensRef} aria-hidden>
        <div className="lens-clip">
          <div className="lens-refraction" ref={refrRef}>
            <div className="lens-scene-clone" ref={cloneRef}>
              {children}
            </div>
          </div>
          <div className="lens-tint" />
          <div className="lens-glint" style={{ opacity: GLINT }} />
        </div>
      </div>
      <svg className="lens-housing" ref={housingRef} width="0" height="0" aria-hidden />
    </div>
  );
}
