// Keyframes + a few composite styles for the pages module. Rendered as a React 19 hoisted <style>
// (href + precedence ⇒ inserted once in <head>, deduplicated across components). Server-safe.
// Everything that moves is transform/opacity only, and is disabled under prefers-reduced-motion.

const CSS = String.raw`
@keyframes op-rise{from{opacity:0;transform:translate3d(0,.55em,0) rotate(4deg);filter:blur(10px)}to{opacity:1;transform:none;filter:blur(0)}}
@keyframes op-rise-v{from{transform:translate3d(0,.4em,0) rotate(3deg);filter:blur(7px)}to{transform:none;filter:blur(0)}}
@keyframes op-fade-up{from{opacity:0;transform:translate3d(0,26px,0)}to{opacity:1;transform:none}}
@keyframes op-fade{from{opacity:0}to{opacity:1}}
@keyframes op-ring{0%{transform:translate(-50%,-50%) scale(.12);opacity:0}12%{opacity:var(--ring-o,.75)}100%{transform:translate(-50%,-50%) scale(1);opacity:0}}
@keyframes op-drift{0%,100%{transform:translate3d(0,0,0) scale(1)}50%{transform:translate3d(var(--dx,24px),var(--dy,-32px),0) scale(var(--ds,1.08))}}
@keyframes op-marquee{from{transform:translate3d(0,0,0)}to{transform:translate3d(-50%,0,0)}}
@keyframes op-spin{to{transform:rotate(360deg)}}
@keyframes op-halo{0%{transform:scale(1);opacity:.55}100%{transform:scale(1.85);opacity:0}}
@keyframes op-caret{50%{opacity:0}}
@keyframes op-dock-in{from{opacity:0;transform:translate3d(0,28px,0) scale(.9)}to{opacity:1;transform:none}}
@keyframes op-toast{0%{opacity:0;transform:translate3d(0,12px,0)}12%,78%{opacity:1;transform:none}100%{opacity:0;transform:translate3d(0,-8px,0)}}
@keyframes op-float{0%,100%{transform:translate3d(0,0,0)}50%{transform:translate3d(0,-10px,0)}}
@keyframes op-dash{to{stroke-dashoffset:-28}}
@keyframes op-blink-ok{0%,100%{opacity:0;transform:translate3d(0,6px,0) scale(.96)}10%,70%{opacity:1;transform:none}}
@keyframes op-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}
@keyframes op-tap-phone{0%,12%{transform:translate3d(46%,-14%,0) rotate(-14deg)}36%,60%{transform:translate3d(4%,0,0) rotate(-5deg)}39%{transform:translate3d(2%,1%,0) rotate(-4deg)}42%{transform:translate3d(6%,-1%,0) rotate(-6deg)}45%{transform:translate3d(4%,0,0) rotate(-5deg)}84%,100%{transform:translate3d(46%,-14%,0) rotate(-14deg)}}
@keyframes op-tap-ring{0%,36%{transform:translate(-50%,-50%) scale(.15);opacity:0}40%{opacity:.95}72%,100%{transform:translate(-50%,-50%) scale(1.7);opacity:0}}
@keyframes op-tap-banner{0%,44%{transform:translate3d(0,-130%,0);opacity:0}52%,74%{transform:none;opacity:1}82%,100%{transform:translate3d(0,-130%,0);opacity:0}}
@keyframes op-star{0%,4%{color:#3a3847;transform:scale(.82)}10%{color:#f5a524;transform:scale(1.28)}16%,78%{color:#f5a524;transform:scale(1)}88%,100%{color:#3a3847;transform:scale(.82)}}
@keyframes op-type{0%,30%{transform:scaleX(0)}58%,82%{transform:scaleX(1)}94%,100%{transform:scaleX(0)}}
@keyframes op-post{0%,58%{background-color:#2a2935;color:#8e8ba0}62%,84%{background-color:#1a73e8;color:#fff}94%,100%{background-color:#2a2935;color:#8e8ba0}}
@keyframes op-climb{0%,14%{transform:translate3d(0,300%,0)}30%{transform:translate3d(0,200%,0)}46%{transform:translate3d(0,100%,0)}62%,90%{transform:translate3d(0,0,0)}100%{transform:translate3d(0,300%,0)}}
@keyframes op-rank{0%,58%{opacity:0;transform:scale(.6)}64%,90%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.6)}}
@keyframes op-glitch{0%,86%,100%{transform:none;text-shadow:none}88%{transform:translate3d(-3px,1px,0) skewX(-6deg);text-shadow:3px 0 rgba(123,92,255,.9),-3px 0 rgba(240,89,106,.7)}90%{transform:translate3d(3px,-1px,0) skewX(5deg);text-shadow:-3px 0 rgba(123,92,255,.9),3px 0 rgba(43,212,138,.6)}92%{transform:translate3d(-1px,0,0);text-shadow:2px 0 rgba(123,92,255,.8)}}
@keyframes op-wobble{0%,100%{transform:rotate(0)}25%{transform:rotate(-1.4deg)}75%{transform:rotate(1.4deg)}}
@keyframes op-strike{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes op-pop{0%{transform:translate(-50%,-50%) scale(.1);opacity:1}100%{transform:translate(-50%,-50%) scale(1);opacity:0}}

.op-char{display:inline-block;opacity:0;animation:op-rise 1.15s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(var(--intro-delay,0s) + var(--i,0) * 55ms + var(--d,0ms))}
.op-char-v{display:inline-block;animation:op-rise-v 1s cubic-bezier(.16,1,.3,1) both;animation-delay:calc(var(--intro-delay,0s) + var(--i,0) * 24ms + var(--d,0ms))}
.op-fade-up{opacity:0;animation:op-fade-up 1s cubic-bezier(.16,1,.3,1) forwards;animation-delay:calc(var(--intro-delay,0s) + var(--d,0ms))}
.op-fade-in{animation:op-fade 1.4s cubic-bezier(.16,1,.3,1) backwards;animation-delay:calc(var(--intro-delay,0s) + var(--d,0ms))}
html[data-intro="play"] .op-char,html[data-intro="reduced"] .op-char,html[data-intro="play"] .op-char-v,html[data-intro="reduced"] .op-char-v,html[data-intro="play"] .op-fade-up,html[data-intro="reduced"] .op-fade-up,html[data-intro="play"] .op-fade-in,html[data-intro="reduced"] .op-fade-in{animation-play-state:paused}
.op-ring{position:absolute;left:50%;top:50%;width:var(--ring-size,100%);aspect-ratio:1;border-radius:9999px;border:1.5px solid rgb(var(--ring-rgb,123 92 255) / .55);box-shadow:inset 0 0 40px rgb(var(--ring-rgb,70 28 247) / .22),0 0 28px rgb(var(--ring-rgb,70 28 247) / .22);opacity:0;transform:translate(-50%,-50%) scale(.12);animation:op-ring var(--ring-dur,6s) cubic-bezier(.2,.6,.3,1) infinite;animation-delay:var(--ring-delay,0s);pointer-events:none}
.op-bokeh{position:absolute;border-radius:9999px;background:radial-gradient(circle at 38% 36%,rgb(255 205 140 / .62),rgb(245 165 36 / .2) 55%,transparent 70%);filter:blur(var(--blur,2px));opacity:var(--o,.35);animation:op-drift var(--dur,18s) ease-in-out infinite;animation-delay:var(--delay,0s);pointer-events:none}
.op-marquee{display:flex;width:max-content;animation:op-marquee var(--dur,48s) linear infinite}
.op-marquee[data-reverse="true"]{animation-direction:reverse}
.op-spin{animation:op-spin 1s linear infinite}
.op-halo{animation:op-halo 2.4s cubic-bezier(.2,.6,.3,1) infinite}
.op-caret{animation:op-caret 1s steps(1) infinite}
.op-dock-in{animation:op-dock-in .55s cubic-bezier(.16,1,.3,1)}
.op-toast{animation:op-toast 2.6s cubic-bezier(.16,1,.3,1) forwards}
.op-float{animation:op-float 6s ease-in-out infinite}
.op-dash{stroke-dasharray:6 8;animation:op-dash 1s linear infinite}
.op-shimmer{background-size:200% 100%;animation:op-shimmer 3.2s linear infinite}
.op-glitch{animation:op-glitch 4.2s steps(1) infinite}
.op-wobble{animation:op-wobble 2.8s ease-in-out infinite}
.op-pop{position:absolute;left:var(--x);top:var(--y);width:220px;aspect-ratio:1;border-radius:9999px;border:2px solid rgb(140 123 255 / .9);pointer-events:none;animation:op-pop .9s cubic-bezier(.16,1,.3,1) forwards}

[data-play="false"] *,[data-play="false"]{animation-play-state:paused!important}

.op-text-glow{text-shadow:0 0 28px rgb(70 28 247 / .55),0 0 2px rgb(255 255 255 / .35)}
.op-outline{color:transparent;-webkit-text-stroke:1px rgb(236 235 242 / .28)}
.op-noscroll{scrollbar-width:none}.op-noscroll::-webkit-scrollbar{display:none}
.op-range{-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer}
.op-range::-webkit-slider-runnable-track{height:4px;border-radius:9999px;background:linear-gradient(to right,#fff var(--fill,100%),rgb(255 255 255 / .28) var(--fill,100%))}
.op-range::-moz-range-track{height:4px;border-radius:9999px;background:rgb(255 255 255 / .28)}
.op-range::-moz-range-progress{height:4px;border-radius:9999px;background:#fff}
.op-range::-webkit-slider-thumb{-webkit-appearance:none;margin-top:-5px;width:14px;height:14px;border-radius:9999px;background:#fff;box-shadow:0 0 0 4px rgb(70 28 247 / .35)}
.op-range::-moz-range-thumb{width:14px;height:14px;border:0;border-radius:9999px;background:#fff}
.op-details[open] .op-details-icon{transform:rotate(45deg)}
.op-details summary::-webkit-details-marker{display:none}
.op-prose a{color:#8c7bff;text-decoration:underline;text-underline-offset:3px}

@media (prefers-reduced-motion: reduce){
  .op-char,.op-char-v,.op-fade-up,.op-fade-in{animation:none!important;opacity:1!important;transform:none!important;filter:none!important}
  .op-ring{animation:none!important;opacity:.28;transform:translate(-50%,-50%) scale(var(--ring-static,.7))}
  .op-bokeh,.op-marquee,.op-halo,.op-float,.op-dash,.op-shimmer,.op-glitch,.op-wobble,.op-loop{animation:none!important}
  .op-dock-in,.op-toast{animation-duration:.01ms!important}
  .op-reduce-final{animation:none!important;transform:none!important;opacity:1!important}
}
@media print{
  .op-noprint{display:none!important}
  .op-print-plain{color:#000!important;background:#fff!important}
}
`;

export default function PagesStyles() {
  return (
    <style href="onde-pages-styles" precedence="medium">
      {CSS}
    </style>
  );
}
