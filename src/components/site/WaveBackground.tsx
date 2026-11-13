"use client";
// Living wave background (spec §6.2): one full-screen fragment shader (raw WebGL1, no three.js) painting
// concentric violet NFC ripple rings emanating from a focal point, periodic "tap" pulses, drifting dust /
// motes / warm bokeh, organic noise warp, vignette. Reacts to the cursor (focus parallax + local ripple) and to
// scroll velocity (rings speed up). Pauses off-screen / in hidden tabs, DPR ≤ 1.5 with a pixel budget,
// 30 fps on touch devices, single static frame for reduced motion, CSS fallback underneath (no WebGL,
// low-power devices, before the first frame, or on mobile when webglOnMobile=false).
import { useEffect, useRef, useState, type CSSProperties } from "react";
import clsx from "clsx";
import {
  gsap,
  clampDpr,
  getScrollVelocity,
  isFinePointer,
  isLowPowerDevice,
  prefersReducedMotion,
} from "@/lib/motion";

type WaveBackgroundProps = {
  /** 0..1.5 — strength of rings / particles (default 1) */
  intensity?: number;
  /** Positioning/size classes. Defaults to "absolute inset-0". */
  className?: string;
  /** Focal point of the ripples, [x, y] in 0..1 from the top-left of the box (default center). */
  focus?: [number, number];
  /** When false, phones/tablets get the CSS fallback (keeps ≤ 1 WebGL canvas on screen). Default true. */
  webglOnMobile?: boolean;
};

const VERT = `attribute vec2 aPos;void main(){gl_Position=vec4(aPos,0.0,1.0);}`;

const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uFocus;
uniform vec2 uMouse;
uniform float uMouseOn;
uniform float uBoost;
uniform float uIntensity;

float hash12(vec2 p){vec3 p3=fract(vec3(p.xyx)*0.1031);p3+=dot(p3,p3.yzx+33.33);return fract((p3.x+p3.y)*p3.z);}
vec2 hash22(vec2 p){vec3 p3=fract(vec3(p.xyx)*vec3(0.1031,0.1030,0.0973));p3+=dot(p3,p3.yzx+33.33);return fract((p3.xx+p3.yz)*p3.zy);}
float vnoise(vec2 p){vec2 i=floor(p);vec2 f=fract(p);vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1.0,0.0)),u.x),mix(hash12(i+vec2(0.0,1.0)),hash12(i+vec2(1.0,1.0)),u.x),u.y);}

float particles(vec2 p,float scale,float speed,float size,float density,float t){
  vec2 q=p*scale;
  q.y-=t*speed;
  q.x+=sin(q.y*0.35+t*0.15)*0.35;
  vec2 id=floor(q);
  vec2 gv=fract(q)-0.5;
  vec2 h=hash22(id);
  float on=step(h.x,density);
  vec2 off=(h-0.5)*max(0.0,0.9-2.0*size);
  float d=length(gv-off);
  float tw=0.55+0.45*sin(t*(0.6+h.y*1.8)+h.x*6.2831);
  return on*tw*(1.0-smoothstep(size*0.15,size,d));
}

void main(){
  vec2 uv=gl_FragCoord.xy/uRes;
  float aspect=uRes.x/uRes.y;
  vec2 p=vec2(uv.x*aspect,uv.y);
  vec2 m=vec2(uMouse.x*aspect,uMouse.y);
  vec2 f=vec2(uFocus.x*aspect,uFocus.y);
  f+=(m-f)*0.06*uMouseOn;
  float t=uTime;

  float n=vnoise(p*2.0+vec2(t*0.05,-t*0.04));
  float d=length(p-f)+(n-0.5)*0.045;

  vec3 ink=vec3(0.019,0.016,0.027);
  vec3 deep=vec3(0.105,0.045,0.40);
  vec3 violet=vec3(0.275,0.110,0.969);
  vec3 lilac=vec3(0.55,0.48,1.0);

  float glow=exp(-d*2.4);
  vec3 col=mix(ink,deep,glow*0.9);
  col+=violet*exp(-d*7.0)*0.35;

  float phase=d*30.0-t*(1.1+uBoost*2.5);
  float ring=pow(max(0.0,0.5+0.5*cos(phase)),22.0);
  float ringFade=exp(-d*1.35)*smoothstep(0.0,0.06,d);
  col+=lilac*ring*ringFade*0.32*uIntensity;

  for(int k=0;k<3;k++){
    float period=4.2;
    float age=fract((t+float(k)*period/3.0)/period);
    float r=age*1.9;
    float w=0.010+age*0.03;
    float z=(d-r)/w;
    float front=exp(-z*z);
    float life=1.0-age;
    col+=mix(lilac,violet,age)*front*life*life*0.75*uIntensity;
  }

  float dm=length(p-m);
  float mr=pow(max(0.0,0.5+0.5*cos(dm*46.0-t*4.0)),14.0)*exp(-dm*8.0);
  col+=lilac*mr*0.22*uMouseOn*uIntensity;

  float dust=particles(p,26.0,0.10,0.07,0.35,t);
  float motes=particles(p+3.1,9.0,0.05,0.10,0.28,t*0.8);
  float bokeh=particles(p+7.7,3.2,0.018,0.28,0.22,t*0.6);
  col+=vec3(0.85,0.82,1.0)*dust*0.22*uIntensity;
  col+=lilac*motes*0.35*uIntensity;
  col+=vec3(0.95,0.72,0.45)*bokeh*0.07*uIntensity;

  vec2 vc=(uv-0.5)*vec2(aspect,1.0);
  col*=mix(0.45,1.0,1.0-smoothstep(0.15,1.25,length(vc)));

  col+=(hash12(gl_FragCoord.xy+fract(t)*91.0)-0.5)/255.0;
  gl_FragColor=vec4(col,1.0);
}`;

/** Creates and compiles a shader without querying its status (that would block until the driver is done). */
function shader(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  return s;
}

type ParallelCompile = { COMPLETION_STATUS_KHR: number };

const PIXEL_BUDGET = 2_200_000;

export default function WaveBackground({
  intensity = 1,
  className,
  focus = [0.5, 0.5],
  webglOnMobile = true,
}: WaveBackgroundProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [fx, fy] = focus;
  const live = useRef({ intensity, fx, fy });
  useEffect(() => {
    live.current = { intensity, fx, fy };
  }, [intensity, fx, fy]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const reduced = prefersReducedMotion();
    const fine = isFinePointer();
    const small = window.innerWidth < 768;
    if ((!webglOnMobile && (!fine || small)) || isLowPowerDevice()) return;

    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "low-power",
    });
    if (!gl || gl.isContextLost()) return;

    const vs = shader(gl, gl.VERTEX_SHADER, VERT);
    const fs = shader(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    const run = (): (() => void) => {
      gl.useProgram(prog);

      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, "aPos");
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      const u = {
        res: gl.getUniformLocation(prog, "uRes"),
        time: gl.getUniformLocation(prog, "uTime"),
        focus: gl.getUniformLocation(prog, "uFocus"),
        mouse: gl.getUniformLocation(prog, "uMouse"),
        mouseOn: gl.getUniformLocation(prog, "uMouseOn"),
        boost: gl.getUniformLocation(prog, "uBoost"),
        intensity: gl.getUniformLocation(prog, "uIntensity"),
      };

      const s = {
        t: reduced ? 12 : Math.random() * 20,
        mx: live.current.fx,
        my: 1 - live.current.fy,
        tmx: live.current.fx,
        tmy: 1 - live.current.fy,
        on: 0,
        ton: 0,
        boost: 0,
        frame: 0,
        drawn: false,
        visible: false,
        lost: false,
      };

      const resize = () => {
        const w = Math.max(1, wrap.clientWidth);
        const h = Math.max(1, wrap.clientHeight);
        let dpr = clampDpr(1.5);
        if (w * h * dpr * dpr > PIXEL_BUDGET) dpr = Math.max(0.6, Math.sqrt(PIXEL_BUDGET / (w * h)));
        const cw = Math.round(w * dpr);
        const ch = Math.round(h * dpr);
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw;
          canvas.height = ch;
          gl.viewport(0, 0, cw, ch);
        }
        if (reduced || !s.visible) draw();
      };

      const draw = () => {
        if (s.lost) return;
        const L = live.current;
        gl.uniform2f(u.res, canvas.width, canvas.height);
        gl.uniform1f(u.time, s.t);
        gl.uniform2f(u.focus, L.fx, 1 - L.fy);
        gl.uniform2f(u.mouse, s.mx, s.my);
        gl.uniform1f(u.mouseOn, s.on);
        gl.uniform1f(u.boost, s.boost);
        gl.uniform1f(u.intensity, L.intensity);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        if (!s.drawn) {
          s.drawn = true;
          setReady(true);
        }
      };

      const tick = (_time: number, deltaMs: number) => {
        s.frame++;
        if (!fine && s.frame % 2 === 1) return; // ~30 fps on touch devices
        const dt = Math.min(0.05, (deltaMs || 16.7) / 1000) * (fine ? 1 : 2);
        s.t = (s.t + dt) % 1000;
        s.mx += (s.tmx - s.mx) * 0.06;
        s.my += (s.tmy - s.my) * 0.06;
        s.on += (s.ton - s.on) * 0.05;
        const target = Math.min(Math.abs(getScrollVelocity()) * 0.035, 1.4);
        s.boost += (target - s.boost) * 0.08;
        draw();
      };

      let ticking = false;
      const setTicking = (on: boolean) => {
        if (reduced) return;
        if (on && !ticking) {
          gsap.ticker.add(tick);
          ticking = true;
        } else if (!on && ticking) {
          gsap.ticker.remove(tick);
          ticking = false;
        }
      };
      const sync = () => setTicking(s.visible && !document.hidden && !s.lost);

      const io = new IntersectionObserver(
        (entries) => {
          s.visible = entries[0]?.isIntersecting ?? false;
          sync();
        },
        { rootMargin: "120px 0px" },
      );
      io.observe(wrap);
      const ro = new ResizeObserver(resize);
      ro.observe(wrap);
      resize();

      const onVis = () => sync();
      document.addEventListener("visibilitychange", onVis);

      // Pointer → box coordinates from a cached document-space rect (re-measured at most 4×/s) instead of a
      // getBoundingClientRect() per pointermove, which forced a synchronous layout mid-scroll on every event.
      const box = { left: 0, top: 0, width: 1, height: 1, at: -1e9 };
      const measure = () => {
        const r = wrap.getBoundingClientRect();
        box.left = r.left + window.scrollX;
        box.top = r.top + window.scrollY;
        box.width = Math.max(1, r.width);
        box.height = Math.max(1, r.height);
        box.at = performance.now();
      };
      const onPointer = (e: PointerEvent) => {
        if (!s.visible) return;
        if (performance.now() - box.at > 250) measure();
        const x = (e.clientX + window.scrollX - box.left) / box.width;
        const y = (e.clientY + window.scrollY - box.top) / box.height;
        const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
        s.ton = inside && fine ? 1 : 0;
        if (inside) {
          s.tmx = x;
          s.tmy = 1 - y;
        }
      };
      if (!reduced) window.addEventListener("pointermove", onPointer, { passive: true });

      const onLost = (e: Event) => {
        e.preventDefault();
        s.lost = true;
        sync();
        setReady(false);
      };
      canvas.addEventListener("webglcontextlost", onLost);

      return () => {
        setTicking(false);
        io.disconnect();
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        window.removeEventListener("pointermove", onPointer);
        canvas.removeEventListener("webglcontextlost", onLost);
        gl.deleteBuffer(buf);
      };
    };

    // Let the driver link in the background (KHR_parallel_shader_compile) instead of blocking the main thread on
    // LINK_STATUS during hydration; the CSS fallback shows until the first frame anyway.
    const parallel = gl.getExtension("KHR_parallel_shader_compile") as ParallelCompile | null;
    let disposed = false;
    let wait: ReturnType<typeof setTimeout> | undefined;
    let stop: (() => void) | undefined;
    const begin = () => {
      if (disposed || gl.isContextLost()) return;
      if (parallel && !gl.getProgramParameter(prog, parallel.COMPLETION_STATUS_KHR)) {
        wait = setTimeout(begin, 32);
        return;
      }
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
      stop = run();
    };
    begin();

    return () => {
      disposed = true;
      if (wait) clearTimeout(wait);
      stop?.();
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      // No loseContext() here: a canvas keeps the same context for life, so an effect re-run (StrictMode, HMR,
      // prop change) would get the dead context back and paint a blank canvas over the hero.
    };
  }, [webglOnMobile]);

  const style = {
    "--wx": `${focus[0] * 100}%`,
    "--wy": `${focus[1] * 100}%`,
  } as CSSProperties;

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      className={clsx("pointer-events-none overflow-hidden", className ?? "absolute inset-0")}
      style={style}
    >
      <div className="wave-fallback" />
      <canvas
        ref={canvasRef}
        className={clsx(
          "absolute inset-0 h-full w-full transition-opacity duration-[1200ms] ease-out",
          ready ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
