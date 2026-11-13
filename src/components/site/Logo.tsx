// ONDE wordmark as inline SVG (letters use currentColor, arcs violet). Works in server and client components.
import logoPaths from "@/logo-paths.json";

type LogoProps = {
  className?: string;
  /** "solid" = filled letters + violet arcs · "outline" = stroked letters (footer wordmark) */
  variant?: "solid" | "outline";
  arcs?: boolean;
  title?: string;
  strokeWidth?: number;
  pathClassName?: string;
  /** Marks the navbar wordmark — the intro flies its logo onto it. */
  navTarget?: boolean;
};

const LETTERS = ["o", "n", "d", "e"] as const;
const ARCS = ["arc1", "arc2", "arc3"] as const;

export default function Logo({
  className,
  variant = "solid",
  arcs = true,
  title,
  strokeWidth = 6,
  pathClassName,
  navTarget,
}: LogoProps) {
  const outline = variant === "outline";
  return (
    <svg
      viewBox="0 0 4048 1520"
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      overflow="visible"
      data-nav-logo={navTarget ? "" : undefined}
    >
      {LETTERS.map((k) => (
        <path
          key={k}
          d={logoPaths[k]}
          fillRule="evenodd"
          className={pathClassName}
          fill={outline ? "none" : "currentColor"}
          stroke={outline ? "currentColor" : undefined}
          strokeWidth={outline ? strokeWidth : undefined}
          vectorEffect={outline ? "non-scaling-stroke" : undefined}
        />
      ))}
      {arcs &&
        ARCS.map((k) => (
          <path
            key={k}
            d={logoPaths[k]}
            className={outline ? pathClassName : undefined}
            fill={outline ? "none" : "#461CF7"}
            stroke={outline ? "#7B5CFF" : undefined}
            strokeWidth={outline ? strokeWidth : undefined}
            vectorEffect={outline ? "non-scaling-stroke" : undefined}
          />
        ))}
    </svg>
  );
}
