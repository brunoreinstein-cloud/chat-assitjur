"use client";

import { useEffect, useState } from "react";

// ─── Colors ─────────────────────────────────────────────────────────────────────

const GOLD = "#D4A04A";
const GOLD_LIGHT = "#E8C878";
const PURPLE = "#7C5CBF";
const PURPLE_LIGHT = "#A78BFA";
const PURPLE_DEEP = "#5B3A9E";
const GRAY = "#9CA3AF";
const GRAY_LIGHT = "#D1D5DB";

// ─── Node topology ──────────────────────────────────────────────────────────────

const NODES = [
  { id: 0, angle: 0, dist: 82, size: 7, color: GOLD, delay: 0 },
  { id: 1, angle: 45, dist: 72, size: 5.5, color: GRAY_LIGHT, delay: 0.08 },
  { id: 2, angle: 90, dist: 88, size: 8, color: GOLD, delay: 0.04 },
  { id: 3, angle: 135, dist: 68, size: 5, color: GRAY, delay: 0.12 },
  { id: 4, angle: 180, dist: 85, size: 7.5, color: GOLD_LIGHT, delay: 0.02 },
  { id: 5, angle: 225, dist: 75, size: 6, color: GRAY_LIGHT, delay: 0.1 },
  { id: 6, angle: 270, dist: 90, size: 6.5, color: GOLD, delay: 0.06 },
  { id: 7, angle: 315, dist: 70, size: 5, color: GRAY, delay: 0.14 },
] as const;

type NodeDef = (typeof NODES)[number];

const CX = 200;
const CY = 130;

function getNodePos(angle: number, dist: number) {
  const rad = (angle * Math.PI) / 180;
  return { x: Math.cos(rad) * dist, y: Math.sin(rad) * dist };
}

// ─── Sub-components ─────────────────────────────────────────────────────────────

function Particles({ active }: { active: boolean }) {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    angle: (i / 12) * 360 + ((i * 17) % 20),
    dist: 50 + ((i * 13) % 55),
    size: 1 + ((i * 7) % 20) / 10,
    duration: 3 + ((i * 11) % 40) / 10,
    delay: ((i * 7) % 30) / 10,
  }));

  return (
    <g style={{ opacity: active ? 1 : 0, transition: "opacity 1.5s ease" }}>
      {particles.map((p) => {
        const pos = getNodePos(p.angle, p.dist);
        return (
          <circle
            cx={CX + pos.x}
            cy={CY + pos.y}
            fill={p.id % 3 === 0 ? GOLD : PURPLE_LIGHT}
            key={p.id}
            opacity="0"
            r={p.size}
          >
            <animate
              attributeName="opacity"
              begin={`${p.delay}s`}
              dur={`${p.duration}s`}
              repeatCount="indefinite"
              values="0;0.6;0"
            />
            <animate
              attributeName="r"
              begin={`${p.delay}s`}
              dur={`${p.duration}s`}
              repeatCount="indefinite"
              values={`${p.size};${p.size * 0.4};${p.size}`}
            />
          </circle>
        );
      })}
    </g>
  );
}

function CentralHub({ active }: { active: boolean }) {
  return (
    <g
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "scale(1)" : "scale(0)",
        transformOrigin: `${CX}px ${CY}px`,
        transition: "all 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <circle cx={CX} cy={CY} fill={PURPLE_DEEP} opacity="0.15" r="28">
        <animate
          attributeName="r"
          dur="4s"
          repeatCount="indefinite"
          values="28;34;28"
        />
        <animate
          attributeName="opacity"
          dur="4s"
          repeatCount="indefinite"
          values="0.15;0.08;0.15"
        />
      </circle>
      <circle cx={CX} cy={CY} fill={PURPLE} opacity="0.25" r="20">
        <animate
          attributeName="r"
          dur="3s"
          repeatCount="indefinite"
          values="20;24;20"
        />
      </circle>
      <circle cx={CX} cy={CY} fill={PURPLE} r="13" />
      <circle cx={CX - 3} cy={CY - 3} fill={PURPLE_LIGHT} opacity="0.5" r="5" />
      <circle cx={CX} cy={CY} fill="white" opacity="0.3" r="3.5">
        <animate
          attributeName="opacity"
          dur="2.5s"
          repeatCount="indefinite"
          values="0.3;0.5;0.3"
        />
      </circle>
    </g>
  );
}

function OrbitRing({ active }: { active: boolean }) {
  return (
    <g style={{ opacity: active ? 1 : 0, transition: "opacity 1s ease 0.4s" }}>
      <circle
        cx={CX}
        cy={CY}
        fill="none"
        opacity="0.12"
        r="55"
        stroke={PURPLE}
        strokeDasharray="3 8"
        strokeWidth="0.5"
      >
        <animateTransform
          attributeName="transform"
          dur="40s"
          from={`0 ${CX} ${CY}`}
          repeatCount="indefinite"
          to={`360 ${CX} ${CY}`}
          type="rotate"
        />
      </circle>
      <circle
        cx={CX}
        cy={CY}
        fill="none"
        opacity="0.06"
        r="105"
        stroke={GOLD}
        strokeDasharray="2 12"
        strokeWidth="0.3"
      >
        <animateTransform
          attributeName="transform"
          dur="60s"
          from={`360 ${CX} ${CY}`}
          repeatCount="indefinite"
          to={`0 ${CX} ${CY}`}
          type="rotate"
        />
      </circle>
    </g>
  );
}

function ConnectionLine({
  node,
  active,
  phaseDelay,
}: {
  node: NodeDef;
  active: boolean;
  phaseDelay: number;
}) {
  const pos = getNodePos(node.angle, node.dist);
  const endX = CX + pos.x;
  const endY = CY + pos.y;

  return (
    <line
      opacity={active ? 0.5 : 0}
      stroke={node.color === GOLD || node.color === GOLD_LIGHT ? GOLD : GRAY}
      strokeLinecap="round"
      strokeWidth="1.5"
      style={{
        transition: `all 0.6s cubic-bezier(0.22, 1, 0.36, 1) ${phaseDelay + node.delay}s`,
      }}
      x1={CX}
      x2={active ? endX : CX}
      y1={CY}
      y2={active ? endY : CY}
    />
  );
}

function AgentNode({
  node,
  active,
  phaseDelay,
}: {
  node: NodeDef;
  active: boolean;
  phaseDelay: number;
}) {
  const pos = getNodePos(node.angle, node.dist);
  const cx = CX + pos.x;
  const cy = CY + pos.y;

  return (
    <g
      style={{
        opacity: active ? 1 : 0,
        transform: active ? "scale(1)" : "scale(0)",
        transformOrigin: `${cx}px ${cy}px`,
        transition: `all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) ${phaseDelay + node.delay + 0.15}s`,
      }}
    >
      <circle cx={cx} cy={cy} fill={node.color} opacity="0.1" r={node.size + 4}>
        <animate
          attributeName="r"
          dur={`${3 + node.id * 0.3}s`}
          repeatCount="indefinite"
          values={`${node.size + 4};${node.size + 7};${node.size + 4}`}
        />
      </circle>
      <circle cx={cx} cy={cy} fill={node.color} r={node.size}>
        <animate
          attributeName="cy"
          dur={`${4 + node.id * 0.5}s`}
          repeatCount="indefinite"
          values={`${cy};${cy - 2};${cy + 1};${cy}`}
        />
      </circle>
      <circle
        cx={cx - node.size * 0.2}
        cy={cy - node.size * 0.25}
        fill="white"
        opacity="0.25"
        r={node.size * 0.35}
      >
        <animate
          attributeName="cy"
          dur={`${4 + node.id * 0.5}s`}
          repeatCount="indefinite"
          values={`${cy - node.size * 0.25};${cy - node.size * 0.25 - 2};${cy - node.size * 0.25 + 1};${cy - node.size * 0.25}`}
        />
      </circle>
    </g>
  );
}

function DataPulse({ node, active }: { node: NodeDef; active: boolean }) {
  const pos = getNodePos(node.angle, node.dist);
  const endX = CX + pos.x;
  const endY = CY + pos.y;
  const dur = 2.5 + node.id * 0.4;

  if (!active) {
    return null;
  }

  return (
    <circle fill="white" opacity="0" r="2">
      <animate
        attributeName="cx"
        begin={`${node.id * 0.8}s`}
        dur={`${dur}s`}
        repeatCount="indefinite"
        values={`${CX};${endX};${CX}`}
      />
      <animate
        attributeName="cy"
        begin={`${node.id * 0.8}s`}
        dur={`${dur}s`}
        repeatCount="indefinite"
        values={`${CY};${endY};${CY}`}
      />
      <animate
        attributeName="opacity"
        begin={`${node.id * 0.8}s`}
        dur={`${dur}s`}
        repeatCount="indefinite"
        values="0;0.8;0.4;0.8;0"
      />
    </circle>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────

interface AnimatedLogoProps {
  className?: string;
  style?: React.CSSProperties;
}

export default function AnimatedLogo({ className, style }: AnimatedLogoProps) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 1000),
      setTimeout(() => setPhase(3), 1400),
      setTimeout(() => setPhase(4), 2000),
      setTimeout(() => setPhase(5), 3200),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <svg
      className={className}
      style={{ width: "100%", height: "auto", overflow: "visible", ...style }}
      viewBox="60 0 280 260"
    >
      <title>AssistJur.IA — Rede de agentes de IA</title>
      <defs>
        <radialGradient cx="50%" cy="50%" id="hubGlow" r="50%">
          <stop offset="0%" stopColor={PURPLE_LIGHT} stopOpacity="0.3" />
          <stop offset="100%" stopColor={PURPLE_DEEP} stopOpacity="0" />
        </radialGradient>
        <filter id="softGlow">
          <feGaussianBlur result="blur" stdDeviation="3" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Orbit rings */}
      <OrbitRing active={phase >= 2} />

      {/* Connection lines */}
      {NODES.map((node) => (
        <ConnectionLine
          active={phase >= 2}
          key={`line-${node.id}`}
          node={node}
          phaseDelay={0}
        />
      ))}

      {/* Data pulses */}
      {NODES.filter((_, i) => i % 2 === 0).map((node) => (
        <DataPulse active={phase >= 5} key={`pulse-${node.id}`} node={node} />
      ))}

      {/* Central hub */}
      <CentralHub active={phase >= 1} />

      {/* Agent nodes */}
      {NODES.map((node) => (
        <AgentNode
          active={phase >= 3}
          key={`node-${node.id}`}
          node={node}
          phaseDelay={0}
        />
      ))}

      {/* Particles */}
      <Particles active={phase >= 3} />
    </svg>
  );
}
