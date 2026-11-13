"use client";
// Product still with graceful fallback (a broken custom image never leaves an empty hole in the layout).
import Image, { type ImageProps } from "next/image";
import { forwardRef, useState } from "react";
import { FALLBACK_STILL } from "./catalog";

type Props = Omit<ImageProps, "src" | "alt"> & { src: string; alt: string; fallback?: string };

const ProductImage = forwardRef<HTMLImageElement, Props>(function ProductImage(
  { src, alt, fallback = FALLBACK_STILL, ...rest },
  ref,
) {
  const [failed, setFailed] = useState<string | null>(null);
  const current = failed === src ? fallback : src;
  const remote = /^https?:\/\//i.test(current);
  return (
    <Image
      {...rest}
      ref={ref}
      src={current}
      alt={alt}
      unoptimized={remote || !!rest.unoptimized}
      onError={() => {
        if (current !== fallback) setFailed(src);
      }}
    />
  );
});

export default ProductImage;
