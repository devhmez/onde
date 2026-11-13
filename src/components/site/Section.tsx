// Layout primitives shared by every public page: <Section>, <Eyebrow>, <Container>.
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import clsx from "clsx";

type Spacing = "none" | "sm" | "md" | "lg";

const SPACING: Record<Spacing, string> = {
  none: "",
  sm: "py-[clamp(3rem,7vw,5rem)]",
  md: "py-[clamp(4rem,9vw,7.5rem)]",
  lg: "py-[clamp(5rem,12vw,10rem)]",
};

type SectionProps = {
  as?: "section" | "div" | "article" | "aside" | "header";
  /** Full-bleed: children are not wrapped in the site container. */
  bleed?: boolean;
  spacing?: Spacing;
  containerClassName?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"section">, "children">;

export default function Section({
  as: Tag = "section",
  bleed = false,
  spacing = "lg",
  className,
  containerClassName,
  children,
  ...rest
}: SectionProps) {
  return (
    <Tag className={clsx("relative", SPACING[spacing], className)} {...rest}>
      {bleed ? children : <div className={clsx("container-site", containerClassName)}>{children}</div>}
    </Tag>
  );
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={clsx("container-site", className)}>{children}</div>;
}

/** Small uppercase kicker above section titles (violet, wide tracking, hairline lead). */
export function Eyebrow({
  children,
  className,
  as: Tag = "p",
}: {
  children: ReactNode;
  className?: string;
  as?: "p" | "span" | "h2" | "h3";
}) {
  return (
    <Tag className={clsx("eyebrow inline-flex items-center gap-3", className)}>
      <span aria-hidden="true" className="h-px w-7 bg-gradient-to-r from-transparent to-violet-3/80" />
      {children}
    </Tag>
  );
}
