"use client";

/**
 * Logo AssistJur.IA — Brand Book docs/BRAND-BOOK-ASSISTJUR.md
 * Ícone: rede neural (círculo central roxo, 8 linhas/nós: 4 dourado, 4 cinza).
 * Texto: Assist (dourado), Jur. (cinza), IA (roxo).
 */

const PURPLE = "var(--assistjur-purple)";
const PURPLE_LIGHT = "var(--assistjur-purple-light)";
const GOLD = "var(--assistjur-gold)";
const GRAY = "var(--assistjur-gray-light)";

/** Ângulos em graus para os 8 nós: 0, 45, 90, ... (gold nas posições 10h, 12h, 2h, 7h ≈ 120°, 90°, 60°, 210°) */
const NODES = [
  { angle: 90, color: GOLD },
  { angle: 45, color: GRAY },
  { angle: 0, color: GOLD },
  { angle: 315, color: GRAY },
  { angle: 270, color: GRAY },
  { angle: 225, color: GOLD },
  { angle: 180, color: GRAY },
  { angle: 135, color: GOLD },
] as const;

function LogoIcon({ size = 30 }: Readonly<{ size?: number }>) {
  const cx = size / 2;
  const cy = size / 2;
  const centerR = size * 0.18;
  const innerR = size * 0.08;
  const nodeRadius = size * 0.06;
  const armLength = size * 0.38;

  return (
    <svg
      aria-hidden
      className="shrink-0"
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      width={size}
    >
      <title>AssistJur.IA — rede neural</title>
      {/* Círculo central roxo */}
      <circle cx={cx} cy={cy} fill={PURPLE} r={centerR} />
      <circle cx={cx} cy={cy} fill={PURPLE_LIGHT} r={innerR} />
      {/* Linhas e nós */}
      {NODES.map(({ angle, color }) => {
        const rad = (angle * Math.PI) / 180;
        const x2 = cx + armLength * Math.cos(rad);
        const y2 = cy - armLength * Math.sin(rad);
        return (
          <g key={angle}>
            <line
              stroke={color}
              strokeWidth={Math.max(1, size / 25)}
              x1={cx}
              x2={x2}
              y1={cy}
              y2={y2}
            />
            <circle cx={x2} cy={y2} fill={color} r={nodeRadius} />
          </g>
        );
      })}
    </svg>
  );
}

interface AssistJurLogoProps {
  /** Mostrar ícone + texto (default) ou só ícone ou só texto */
  variant?: "full" | "icon" | "text";
  /** Tamanho do ícone em px */
  iconSize?: number;
  /** Classe para o texto (tamanho e peso) */
  className?: string;
}

export function AssistJurLogo({
  variant = "full",
  iconSize = 30,
  className = "font-semibold text-[17px]",
}: Readonly<AssistJurLogoProps>) {
  if (variant === "icon") {
    return <LogoIcon size={iconSize} />;
  }

  const text = (
    <span className={`inline-flex items-baseline ${className}`}>
      <span style={{ color: GOLD }}>Assist</span>
      <span style={{ color: GRAY }}>Jur.</span>
      <span style={{ color: PURPLE }}>IA</span>
    </span>
  );

  if (variant === "text") {
    return text;
  }

  return (
    <span className="inline-flex items-center gap-2">
      <LogoIcon size={iconSize} />
      {text}
    </span>
  );
}
