import { useEffect, useState } from 'react';

const TOKENS = ['safe', 'warn', 'danger', 'accent', 'violet', 'muted', 'faint', 'line', 'surface', 'raised', 'ink'] as const;
export type ThemeColors = Record<(typeof TOKENS)[number], string>;

function read(): ThemeColors {
  const style = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    TOKENS.map((t) => {
      const v = style.getPropertyValue(`--${t}`).trim();
      return [t, v ? `rgb(${v.split(/\s+/).join(',')})` : '#888'];
    }),
  ) as ThemeColors;
}

/** SVG presentation attributes can't use CSS variables, so resolve tokens for charts. */
export function useThemeColors(): ThemeColors {
  const [colors, setColors] = useState<ThemeColors>(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setColors(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return colors;
}
