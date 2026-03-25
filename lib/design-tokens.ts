/**
 * AssistJur Design Tokens — referência JS/TS
 *
 * Use estes valores quando precisar de cores/tokens em lógica JavaScript
 * (framer-motion, canvas, geração de PDF, e2e tests, etc.).
 *
 * Para uso em CSS/Tailwind, sempre prefira as classes utilitárias e
 * custom properties definidas em app/globals.css.
 *
 * Fonte da verdade: docs/DESIGN-SYSTEM.md
 */

// ---------------------------------------------------------------------------
// Paleta de marca — valores primitivos
// ---------------------------------------------------------------------------

export const brand = {
  purple: {
    50: "#f5f3ff",
    100: "#ede9fe",
    200: "#ddd6fe",
    300: "#c4b5fd",
    400: "#a78bfa",
    500: "#8b5cf6",
    600: "#7c3aed", // brand primary
    700: "#6d28d9",
    800: "#4c1d95",
    900: "#3f1c6b", // brand dark
    950: "#2e1065", // brand darker
    deepest: "#180a38",
  },

  gold: {
    50: "#fefce8",
    100: "#fef9c3",
    200: "#fef08a",
    300: "#fde047",
    400: "#facc15",
    500: "#eab308", // brand gold
    600: "#ca8a04",
    700: "#a16207",
    800: "#854d0e",
  },

  neutral: {
    50: "#fafafa",
    100: "#f4f4f8",
    200: "#e8e8f0",
    300: "#d1d1e0",
    400: "#a0a0b8",
    500: "#6b6b85",
    600: "#525268",
    700: "#3d3d52",
    800: "#272738",
    900: "#17172a",
    950: "#0d0d1a",
  },
} as const;

// ---------------------------------------------------------------------------
// Status semânticos
// ---------------------------------------------------------------------------

export const status = {
  success: "#16a34a",
  successLight: "#dcfce7",
  warning: "#d97706",
  warningLight: "#fef3c7",
  error: "#dc2626",
  errorLight: "#fee2e2",
  info: "#2563eb",
  infoLight: "#dbeafe",
} as const;

// ---------------------------------------------------------------------------
// Tokens de UI semânticos — light mode
// ---------------------------------------------------------------------------

export const light = {
  background: "hsl(0 0% 100%)",
  foreground: "hsl(252 25% 9%)",
  card: "hsl(0 0% 100%)",
  primary: "hsl(262 83% 57%)",
  primaryFg: "hsl(0 0% 100%)",
  secondary: "hsl(262 30% 95%)",
  muted: "hsl(262 15% 96%)",
  mutedFg: "hsl(252 15% 45%)",
  accent: "hsl(262 30% 93%)",
  border: "hsl(262 20% 88%)",
  ring: "hsl(262 83% 57%)",
  sidebar: "hsl(262 25% 97%)",
} as const;

// ---------------------------------------------------------------------------
// Tokens de UI semânticos — dark mode
// ---------------------------------------------------------------------------

export const dark = {
  background: "hsl(256 32% 5%)",
  foreground: "hsl(262 15% 93%)",
  card: "hsl(256 26% 8%)",
  primary: "hsl(262 75% 67%)",
  primaryFg: "hsl(256 32% 5%)",
  secondary: "hsl(256 22% 14%)",
  muted: "hsl(256 22% 13%)",
  mutedFg: "hsl(256 18% 56%)",
  accent: "hsl(256 22% 16%)",
  border: "hsl(256 22% 16%)",
  ring: "hsl(262 75% 67%)",
  sidebar: "hsl(256 35% 4%)",
} as const;

// ---------------------------------------------------------------------------
// Escala de espaçamento (grid de 4px — padrão Tailwind)
// ---------------------------------------------------------------------------

export const spacing = {
  0: "0px",
  0.5: "2px",
  1: "4px",
  1.5: "6px",
  2: "8px",
  2.5: "10px",
  3: "12px",
  3.5: "14px",
  4: "16px",
  5: "20px",
  6: "24px",
  7: "28px",
  8: "32px",
  9: "36px",
  10: "40px",
  11: "44px",
  12: "48px",
  14: "56px",
  16: "64px",
  20: "80px",
  24: "96px",
} as const;

// ---------------------------------------------------------------------------
// Tipografia
// ---------------------------------------------------------------------------

export const typography = {
  fontSans: "var(--font-geist), ui-sans-serif, system-ui, sans-serif",
  fontMono: "var(--font-geist-mono), ui-monospace, monospace",

  size: {
    xs: "0.75rem", // 12px
    sm: "0.875rem", // 14px
    base: "1rem", // 16px
    lg: "1.125rem", // 18px
    xl: "1.25rem", // 20px
    "2xl": "1.5rem", // 24px
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem", // 36px
    "5xl": "3rem", // 48px
  },

  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },

  leading: {
    tight: 1.25,
    snug: 1.375,
    normal: 1.5,
    relaxed: 1.625,
    loose: 2,
  },

  tracking: {
    tight: "-0.025em",
    normal: "0em",
    wide: "0.025em",
    wider: "0.05em",
    widest: "0.1em",
  },
} as const;

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

export const radius = {
  none: "0px",
  xs: "6px",
  sm: "8px",
  md: "10px", // base (--radius)
  lg: "12px",
  xl: "16px",
  "2xl": "24px",
  full: "9999px",
} as const;

// ---------------------------------------------------------------------------
// Elevação / sombras — light
// ---------------------------------------------------------------------------

export const shadowLight = {
  xs: "0 1px 2px 0 hsl(252 40% 10% / 0.04)",
  sm: "0 1px 3px 0 hsl(252 40% 10% / 0.08), 0 1px 2px -1px hsl(252 40% 10% / 0.06)",
  md: "0 4px 6px -1px hsl(252 40% 10% / 0.08), 0 2px 4px -2px hsl(252 40% 10% / 0.05)",
  lg: "0 10px 15px -3px hsl(252 40% 10% / 0.1), 0 4px 6px -4px hsl(252 40% 10% / 0.06)",
  xl: "0 20px 25px -5px hsl(252 40% 10% / 0.1), 0 8px 10px -6px hsl(252 40% 10% / 0.06)",
  brand: "0 0 0 3px hsl(262 83% 57% / 0.18)",
  gold: "0 0 0 3px hsl(43 96% 50% / 0.22)",
} as const;

// ---------------------------------------------------------------------------
// Elevação / sombras — dark
// ---------------------------------------------------------------------------

export const shadowDark = {
  xs: "0 1px 2px 0 hsl(256 60% 3% / 0.4)",
  sm: "0 1px 3px 0 hsl(256 60% 3% / 0.5), 0 1px 2px -1px hsl(256 60% 3% / 0.4)",
  md: "0 4px 6px -1px hsl(256 60% 3% / 0.5), 0 2px 4px -2px hsl(256 60% 3% / 0.35)",
  lg: "0 10px 15px -3px hsl(256 60% 3% / 0.6), 0 4px 6px -4px hsl(256 60% 3% / 0.4)",
  xl: "0 20px 25px -5px hsl(256 60% 3% / 0.6), 0 8px 10px -6px hsl(256 60% 3% / 0.4)",
  brand: "0 0 0 3px hsl(262 75% 67% / 0.22)",
  gold: "0 0 0 3px hsl(43 95% 60% / 0.25)",
} as const;

// ---------------------------------------------------------------------------
// Workflow — status de caso/processo
// ---------------------------------------------------------------------------

export const workflow = {
  draft: "hsl(252 15% 60%)",
  draftBg: "hsl(252 20% 95%)",
  active: "hsl(262 83% 57%)",
  activeBg: "hsl(262 30% 95%)",
  review: "hsl(38 92% 50%)",
  reviewBg: "hsl(48 96% 95%)",
  done: "hsl(142 71% 36%)",
  doneBg: "hsl(142 76% 95%)",
  blocked: "hsl(0 72% 50%)",
  blockedBg: "hsl(0 72% 95%)",
} as const;

// ---------------------------------------------------------------------------
// Confiança — rastreabilidade de fontes e inferências
// ---------------------------------------------------------------------------

export const confidence = {
  source: "hsl(210 85% 53%)",
  sourceBg: "hsl(210 85% 95%)",
  inference: "hsl(38 92% 50%)",
  inferenceBg: "hsl(48 96% 95%)",
  alert: "hsl(0 72% 50%)",
  alertBg: "hsl(0 72% 95%)",
  verified: "hsl(142 71% 36%)",
  verifiedBg: "hsl(142 76% 95%)",
} as const;

// ---------------------------------------------------------------------------
// Layout surfaces
// ---------------------------------------------------------------------------

export const surface = {
  workspace: "hsl(262 15% 98%)",
  panel: "hsl(0 0% 100%)",
  artifact: "hsl(0 0% 100%)",
  composer: "hsl(0 0% 100%)",
  sidebarActive: "hsl(262 30% 93%)",
  borderSubtle: "hsl(262 15% 92%)",
  borderSplit: "hsl(262 20% 88%)",
} as const;

// ---------------------------------------------------------------------------
// Breakpoints
// ---------------------------------------------------------------------------

export const breakpoints = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const;

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export const sidebar = {
  width: "16rem", // 256px — desktop
  widthMobile: "18rem", // 288px — mobile drawer
  widthIcon: "3rem", // 48px — colapsado
  keyboardShortcut: "b",
} as const;
