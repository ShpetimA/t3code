import { useId } from "react";

import { cn } from "../lib/utils";

function LandingEdgeArtifact({ side }: { readonly side: "left" | "right" }) {
  const idPrefix = useId().replaceAll(":", "");
  const glowId = `${idPrefix}-landing-artifact-glow`;
  const fadeId = `${idPrefix}-landing-artifact-fade`;
  const lineColor = "color-mix(in oklch, var(--foreground) 28%, var(--background))";
  const glowColor = "color-mix(in oklch, var(--primary) 24%, var(--background))";

  return (
    <svg
      className={cn(
        "absolute top-1/2 h-[min(64vh,40rem)] w-[clamp(12rem,18vw,19rem)] -translate-y-1/2",
        side === "left" ? "-left-12" : "-right-12 -scale-x-100",
      )}
      fill="none"
      preserveAspectRatio="xMidYMid meet"
      viewBox="0 0 240 480"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient
          id={glowId}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(112 240) rotate(90) scale(224 124)"
        >
          <stop style={{ stopColor: glowColor }} stopOpacity="0.06" />
          <stop offset="0.66" style={{ stopColor: glowColor }} stopOpacity="0.018" />
          <stop offset="1" style={{ stopColor: glowColor }} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="480" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: lineColor }} stopOpacity="0" />
          <stop offset="0.18" style={{ stopColor: lineColor }} stopOpacity="0.15" />
          <stop offset="0.5" style={{ stopColor: lineColor }} stopOpacity="0.25" />
          <stop offset="0.82" style={{ stopColor: lineColor }} stopOpacity="0.15" />
          <stop offset="1" style={{ stopColor: lineColor }} stopOpacity="0" />
        </linearGradient>
      </defs>

      <ellipse cx="112" cy="240" rx="124" ry="224" fill={`url(#${glowId})`} />
      <g
        stroke={`url(#${fadeId})`}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{
          filter:
            "drop-shadow(0 1px 0 color-mix(in srgb, var(--foreground) 3%, transparent)) drop-shadow(0 -1px 0 color-mix(in srgb, var(--background) 42%, transparent))",
        }}
      >
        <g strokeOpacity="0.16" strokeWidth="0.6">
          <path d="M24 56V424M64 28V452M104 18V462M144 28V452M184 56V424" />
          <path d="M6 80H210M0 120H224M0 160H230M0 200H220M0 240H232M0 280H220M0 320H230M0 360H224M6 400H210" />
        </g>
        <g strokeOpacity="0.64" strokeWidth="1.1">
          <path d="M12 74H92V42H180V112H142V158H206V244H166V214H112V278H48V338H94V390H174V346H218" />
          <path d="M0 184H58V130H112V94H152" />
          <path d="M22 436V374H58V310H18V250H74V202H126V174" />
          <path d="M226 294H186V326H140V300H102" />
        </g>
        <g strokeDasharray="4 6" strokeOpacity="0.4" strokeWidth="0.75">
          <path d="M20 104H72M150 136H214M86 422H164" />
          <circle cx="88" cy="242" r="26" />
          <circle cx="184" cy="274" r="15" />
        </g>
        <g strokeOpacity="0.48" strokeWidth="0.8">
          <path d="M84 238H92M88 234V242M180 270H188M184 266V274" />
          <path d="M196 64H216M206 54V74" />
          <path d="M16 350H28M22 344V356" />
        </g>
      </g>
    </svg>
  );
}

/** Faint semantic-theme blueprint fragments that frame the global-tab launcher. */
export function GlobalTabsLandingBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden select-none overflow-hidden lg:block"
      data-global-tabs-landing-backdrop=""
    >
      <LandingEdgeArtifact side="left" />
      <LandingEdgeArtifact side="right" />
    </div>
  );
}
