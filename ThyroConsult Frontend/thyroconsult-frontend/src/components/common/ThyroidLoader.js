// src/components/common/ThyroidLoader.js
//
// Replaces the generic spinner with the ThyroConsult thyroid mark: a small
// dark strip travels the outline while something is loading, and stops +
// fades out once the operation completes.
//
// Drop-in usage — same `size` prop as the old <Spinner size={32} />:
//   <ThyroidLoader size={32} />                      // spinning while true
//   <ThyroidLoader size={32} active={!dataLoaded} />  // stops when data arrives
//
// Technique: the path has pathLength="100" (an SVG feature that normalises
// the path's length to 100 units regardless of its actual geometry), so the
// stroke-dasharray/stroke-dashoffset values below are plain percentages —
// no need to measure the real path length by hand or in JS.

import React, { useEffect } from 'react';

// Same outline as thyroid-outline.svg — upper flat segment moved to just
// below the vertical midline; lower flat segment, both side curves, and
// bottom rounding untouched from the previous revision.
const OUTLINE_PATH = 'M93,125 L107,125 C112,142 122,162 138,168 C156,177 176,170 185,150 C194,129 192,102 180,80 C171,63 170,48 159,37 C148,26 129,27 119,43 C112,70 109,85 107,104 L93,104 C91,85 88,70 81,43 C71,27 52,26 41,37 C30,48 29,63 20,80 C8,102 6,129 15,150 C24,170 44,177 62,168 C78,162 88,142 93,125 Z';

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes thyro-loader-trace {
      from { stroke-dashoffset: 0; }
      to   { stroke-dashoffset: -100; }
    }
    .thyro-loader-strip {
      animation: thyro-loader-trace 1.6s linear infinite;
    }
    @media (prefers-reduced-motion: reduce) {
      .thyro-loader-strip { animation: none; opacity: 0.6; }
    }
  `;
  document.head.appendChild(style);
}

export default function ThyroidLoader({ size = 32, active = true, label = 'Loading', color = 'currentColor' }) {
  useEffect(() => { injectStyles(); }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={active ? label : undefined}
      style={{
        width: size, height: size,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        opacity: active ? 1 : 0,
        transition: 'opacity 0.3s ease',
      }}
    >
      <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden="true">
        {/* Faint static outline so the mark reads even between strip passes */}
        <path
          d={OUTLINE_PATH}
          fill="none" stroke={color} strokeOpacity="0.15"
          strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"
        />
        {/* Moving dark strip tracing the outline — only mounted while active,
            so it doesn't keep animating (or costing a rendered frame) once
            the operation is done and the wrapper has faded to opacity 0. */}
        {active && (
          <path
            d={OUTLINE_PATH}
            pathLength="100"
            fill="none" stroke={color}
            strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"
            strokeDasharray="12 88"
            className="thyro-loader-strip"
          />
        )}
      </svg>
    </div>
  );
}
