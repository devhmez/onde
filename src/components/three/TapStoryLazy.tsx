"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { createContext, useContext, type ComponentProps } from "react";
import { PRODUCTS, type TapProduct } from "./config";
import type TapStoryComponent from "./TapStory";

// TapStory as the page should load it. Its module (and its CSS) loads right after hydration, outside the critical
// path; until then the server-rendered shell holds the place with TapStory's exact footprint — the pinned height
// (no layout shift, no ScrollTrigger refresh mid-scroll) and the product still where the stage shows it (same
// responsive image TapStory uses, so the swap is a cache hit). The section is never blank, even before any JS.

type Props = ComponentProps<typeof TapStoryComponent>;

const ShellContext = createContext<{ product: TapProduct; distance: number }>({ product: "stand-white", distance: 3 });

// mirrors .section / .stage / .stagePoster in three.module.css (that stylesheet only arrives with the chunk)
const SHELL_CSS = `.onde-tap-shell{position:relative;width:100%;background:var(--color-ink,#050407)}
.onde-tap-shell-stage{position:sticky;top:0;width:100%;height:100vh;height:100svh;overflow:hidden}
.onde-tap-shell-still{position:absolute;left:65%;top:52%;width:min(54svh,70vw);height:auto;aspect-ratio:1;transform:translate(-50%,-50%);object-fit:contain;filter:drop-shadow(0 30px 80px rgba(70,28,247,.5))}
@media (max-aspect-ratio:1/1),(max-width:767px){.onde-tap-shell-still{left:50%;top:42%}}`;

function TapStoryShell() {
  const { product, distance } = useContext(ShellContext);
  return (
    <div className="onde-tap-shell" style={{ height: `calc(100svh + ${distance * 100}vh)` }} aria-hidden="true">
      <style>{SHELL_CSS}</style>
      <div className="onde-tap-shell-stage">
        <Image
          className="onde-tap-shell-still"
          src={PRODUCTS[product].still}
          alt=""
          width={900}
          height={900}
          sizes="(max-width: 767px) 70vw, 54vh"
          loading="eager"
        />
      </div>
    </div>
  );
}

const TapStory = dynamic(() => import("./TapStory"), { ssr: false, loading: () => <TapStoryShell /> });

export default function TapStoryLazy(props: Props) {
  return (
    <ShellContext.Provider value={{ product: props.product, distance: props.distance ?? 3 }}>
      <TapStory {...props} />
    </ShellContext.Provider>
  );
}
