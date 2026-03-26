/**
 * AssistJur Design Tokens v3.0 — referência JS/TS
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
    800: "#5b21b6",
    900: "#4c1d95",
    950: "#2e1065", // brand darker
  },

  gold: {
    400: "#facc15",
    500: "#eab308", // brand gold
    600: "#ca8a04",
    700: "#a16207",
  },

  neutral: {
    50: "#fafaf9",
    100: "#f5f5f4",
    200: "#e7e5e4",
    300: "#d6d3d1",
    400: "#a8a29e",
    500: "#78716c",
    600: "#57534e",
    700: "#44403c",
    800: "#292524",
    900: "#1c1917",
    950: "#0c0a09",
  },
} as const;

// ---------------------------------------------------------------------------
// Status semânticos
// ---------------------------------------------------------------------------

export const status = {
  success: "#16a34a",
  successLight: "#f0fdf4",
  warning: "#d97706",
  warningLight: "#fffbeb",
  error: "#dc2626",
  errorLight: "#fef2f2",
  info: "#2563eb",
  infoLight: "#eff6ff",
} as const;

// ---------------------------------------------------------------------------
// Tokens de UI semânticos — light mode
// ---------------------------------------------------------------------------

export const light = {
  background: "hsl(0 0% 100%)",
  foreground: "hsl(24 10% 10%)",
  card: "hsl(0 0% 100%)",
  primary: "hsl(262 83% 57%)",
  primaryFg: "hsl(0 0% 100%)",
  secondary: "hsl(30 6% 96%)",
  muted: "hsl(30 6% 96%)",
  mutedFg: "hsl(24 6% 45%)",
  accent: "hsl(30 6% 94%)",
  border: "hsl(24 6% 90%)",
  ring: "hsl(262 83% 57%)",
  sidebar: "hsl(30 6% 97%)",
} as const;

// ---------------------------------------------------------------------------
// Tokens de UI semânticos — dark mode
// ---------------------------------------------------------------------------

export const dark = {
  background: "hsl(256 20% 6%)",
  foreground: "hsl(30 6% 90%)",
  card: "hsl(256 18% 9%)",
  primary: "hsl(262 70% 65%)",
  primaryFg: "hsl(0 0% 100%)",
  secondary: "hsl(256 12% 14%)",
  muted: "hsl(256 12% 14%)",
  mutedFg: "hsl(30 4% 55%)",
  accent: "hsl(256 12% 16%)",
  border: "hsl(256 16% 16%)",
  ring: "hsl(262 70% 65%)",
  sidebar: "hsl(256 24% 4%)",
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
  fontSans: "var(--font-inter), ui-sans-serif, system-ui, sans-serif",
  fontMono: "var(--font-jetbrains-mono), ui-monospace, monospace",

  size: {
    xs: "0.75rem", // 12px
    sm: "0.875rem", // 14px
    base: "1rem", // 16px
    lg: "1.125rem", // 18px
    xl: "1.25rem", // 20px
    "2xl": "1.5rem", // 24px
    "3xl": "1.875rem", // 30px
    "4xl": "2.25rem", // 36px
  },

  weight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },

  leading: {
    tight: 1.2,
    snug: 1.3,
    normal: 1.5,
    relaxed: 1.6,
    loose: 2,
  },

  tracking: {
    tight: "-0.025em",
    normal: "0em",
    wide: "0.025em",
  },
} as const;

// ---------------------------------------------------------------------------
// Border radius
// ---------------------------------------------------------------------------

export const radius = {
  none: "0px",
  xs: "4px",
  sm: "6px",
  md: "8px", // base (--radius)
  lg: "10px",
  xl: "12px",
  "2xl": "16px",
  full: "9999px",
} as const;

// ---------------------------------------------------------------------------
// Elevação / sombras — neutras (sem glow de marca)
// ---------------------------------------------------------------------------

export const shadowLight = {
  xs: "0 1px 2px 0 rgb(0 0 0 / 0.03)",
  sm: "0 1px 3px 0 rgb(0 0 0 / 0.06)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.07)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.08)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.1)",
} as const;

export const shadowDark = {
  xs: "0 1px 2px 0 rgb(0 0 0 / 0.4)",
  sm: "0 1px 3px 0 rgb(0 0 0 / 0.5)",
  md: "0 4px 6px -1px rgb(0 0 0 / 0.5)",
  lg: "0 10px 15px -3px rgb(0 0 0 / 0.6)",
  xl: "0 20px 25px -5px rgb(0 0 0 / 0.6)",
} as const;

// ---------------------------------------------------------------------------
// Workflow — status de caso/processo
// ---------------------------------------------------------------------------

export const workflow = {
  draft: "hsl(220 12% 55%)",
  draftBg: "hsl(220 14% 96%)",
  active: "hsl(262 83% 57%)",
  activeBg: "hsl(262 30% 96%)",
  review: "hsl(38 92% 50%)",
  reviewBg: "hsl(48 96% 96%)",
  done: "hsl(142 71% 36%)",
  doneBg: "hsl(142 76% 96%)",
  blocked: "hsl(0 72% 50%)",
  blockedBg: "hsl(0 72% 96%)",
} as const;

// ---------------------------------------------------------------------------
// Rastreabilidade — origem de informação (nomenclatura centrada no usuário)
// ---------------------------------------------------------------------------

export const source = {
  document: "hsl(210 85% 53%)",
  documentBg: "hsl(210 85% 96%)",
  suggested: "hsl(38 80% 52%)",
  suggestedBg: "hsl(48 90% 96%)",
  review: "hsl(0 72% 50%)",
  reviewBg: "hsl(0 72% 96%)",
  verified: "hsl(142 71% 36%)",
  verifiedBg: "hsl(142 76% 96%)",
} as const;

// ---------------------------------------------------------------------------
// Layout surfaces
// ---------------------------------------------------------------------------

export const surface = {
  workspace: "hsl(30 4% 98%)",
  panel: "hsl(0 0% 100%)",
  artifact: "hsl(0 0% 100%)",
  composer: "hsl(0 0% 100%)",
  sidebarActive: "hsl(262 30% 95%)",
  borderSubtle: "hsl(24 5% 93%)",
  borderSplit: "hsl(24 6% 90%)",
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
  width: "15rem", // 240px — desktop
  widthMobile: "15rem", // 240px — mobile drawer
  widthIcon: "3.5rem", // 56px — colapsado
  keyboardShortcut: "b",
} as const;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

export const motion = {
  durationFast: "100ms",
  durationBase: "150ms",
  durationSlow: "250ms",
  durationSlower: "400ms",
} as const;
