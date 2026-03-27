"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const AnimatedLogo = dynamic(() => import("@/components/animated-logo"), {
  ssr: false,
  loading: () => <div style={{ width: "100%", aspectRatio: "280/260" }} />,
});

// ─── Data ──────────────────────────────────────────────────────────────────────

const CAPABILITIES = [
  {
    area: "Contestações e Defesas",
    detail:
      "Redação, revisão e auditoria de peças — da contestação trabalhista às contrarrazões de recurso de revista. Cada documento passa por 6 gates de validação antes da entrega.",
    count: 11,
    type: "Minutas",
  },
  {
    area: "Relatórios por Cliente",
    detail:
      "Formulários, pareceres e relatórios executivos modelados para cada operação: Oxxo, GPA, DPSP, Qualicorp. Template-lock garante fidelidade ao layout exigido.",
    count: 11,
    type: "Relatórios",
  },
  {
    area: "Análise Processual",
    detail:
      "Extração estruturada de 92 campos por processo, due diligence de migração, confronto de bases e geração de indicadores financeiros de carteira.",
    count: 8,
    type: "Análise",
  },
  {
    area: "Audiência e Prova Oral",
    detail:
      "Transcrição literal de mídia de audiência trabalhista e geração de pré-pauta estruturada em PPT para preposto e advogado.",
    count: 2,
    type: "Prova Oral",
  },
  {
    area: "Pesquisa e Dossiê",
    detail:
      "Dossiê completo de cliente com foco trabalhista via pesquisa web, e pesquisa jurisprudencial automatizada para Recursos de Revista.",
    count: 2,
    type: "Diversos",
  },
];

const PRINCIPLES = [
  {
    code: "01",
    title: "Melhor vazio que inventado",
    body: "Se o dado não está no processo, o campo fica em branco. Jamais inventar, estimar ou preencher por inferência.",
  },
  {
    code: "02",
    title: "Rastreabilidade tripla",
    body: "Cada informação extraída carrega: número da página, trecho literal do documento e identificação da fonte.",
  },
  {
    code: "03",
    title: "Precedência de fonte",
    body: "Sentença prevalece sobre Acórdão, que prevalece sobre Ata, Cálculos, Contestação e Inicial — nesta ordem.",
  },
  {
    code: "04",
    title: "Validação em camadas",
    body: "Formato, plausibilidade e contexto. O dado precisa passar por três filtros antes de ser aceito como válido.",
  },
  {
    code: "05",
    title: "Perspectiva da reclamada",
    body: "Todo conteúdo é produzido na perspectiva de quem defende. Nunca na posição do reclamante ou neutra.",
  },
  {
    code: "06",
    title: "Revisão humana obrigatória",
    body: "Nenhum documento sai sem a revisão de um advogado. A IA produz; o profissional aprova e assina.",
  },
];

const STATS = [
  { val: 34, suffix: "", label: "Assistentes especializados" },
  { val: 92, suffix: "", label: "Campos de dados mapeados" },
  { val: 20, suffix: "", label: "Padrões de comportamento" },
  { val: 0.5, suffix: "%", label: "Tolerância a alucinação", prefix: "< " },
];

const METHOD_STEPS = [
  {
    title: "Leitura integral",
    body: "100% das páginas do PDF. Para processos acima de 1.000 páginas, múltiplas passagens. Nunca encerrar antes de ler tudo.",
  },
  {
    title: "Mapeamento de landmarks",
    body: "Capa, sentença, acórdão, cálculos de liquidação, dispositivo, índice cronológico. Cada ponto de referência registrado com número de página.",
  },
  {
    title: "Extração com rastreio",
    body: "Cada campo extraído carrega página, trecho literal e documento-fonte. A hierarquia de fontes é respeitada sem exceção.",
  },
  {
    title: "Validação automática",
    body: "Seis gates de validação: temporal, financeiro, classificatório, processual, documental e de execução. Falha em qualquer um gera flag.",
  },
  {
    title: "Entrega para revisão humana",
    body: "Documento gerado no formato exigido pelo cliente — DOCX, XLSX ou PPTX. Apontamentos no início, observações no final. Sempre revisado por advogado.",
  },
];

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useInView(ref: React.RefObject<HTMLElement | null>, threshold = 0.15) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, threshold]);
  return visible;
}

function useScrollY() {
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const handle = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", handle, { passive: true });
    return () => window.removeEventListener("scroll", handle);
  }, []);
  return scrollY;
}

function useCountUp(end: number, visible: boolean, duration = 1800) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!visible) {
      return;
    }
    const start = performance.now();
    const isDecimal = end % 1 !== 0;
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - (1 - progress) ** 3;
      const current = eased * end;
      setValue(isDecimal ? Math.round(current * 10) / 10 : Math.round(current));
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  }, [end, visible, duration]);
  return value;
}

// ─── Components ───────────────────────────────────────────────────────────────

function FadeIn({
  children,
  delay = 0,
  className = "",
  direction = "up",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: "up" | "left" | "right" | "none";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const vis = useInView(ref);
  const transforms: Record<string, string> = {
    up: "translateY(32px)",
    left: "translateX(-32px)",
    right: "translateX(32px)",
    none: "none",
  };
  return (
    <div
      className={className}
      ref={ref}
      style={{
        opacity: vis ? 1 : 0,
        transform: vis ? "none" : transforms[direction],
        transition: `opacity 0.8s cubic-bezier(.22,1,.36,1) ${delay}s, transform 0.8s cubic-bezier(.22,1,.36,1) ${delay}s`,
      }}
    >
      {children}
    </div>
  );
}

function AnimatedCounter({
  stat,
  visible,
}: {
  stat: (typeof STATS)[number];
  visible: boolean;
}) {
  const count = useCountUp(stat.val, visible);
  return (
    <div className="lp-number-val">
      {stat.prefix || ""}
      {stat.val % 1 !== 0 ? count.toFixed(1) : count}
      {stat.suffix}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AssistJurLP() {
  const [time, setTime] = useState("");
  const scrollY = useScrollY();
  const statsRef = useRef<HTMLDivElement>(null);
  const statsVisible = useInView(statsRef, 0.3);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(
        d.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "America/Sao_Paulo",
        })
      );
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, []);

  const navScrolled = scrollY > 40;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap');

        :root {
          --lp-deep: #08090E;
          --lp-surface: #0E1018;
          --lp-card: #12151F;
          --lp-card-hover: #181C2A;
          --lp-border: #1A1E2D;
          --lp-border-l: #252A3C;
          --lp-t1: #E8ECF4;
          --lp-t2: #9AA0B4;
          --lp-t3: #5C6274;
          --lp-gold: #D4A04A;
          --lp-gold-dim: rgba(212,160,74,0.12);
          --lp-gold-glow: rgba(212,160,74,0.25);
          --lp-purple: #7C3AED;
          --lp-purple-dim: rgba(124,58,237,0.08);
          --lp-serif: 'Cormorant Garamond', 'Georgia', serif;
          --lp-sans: 'DM Sans', system-ui, -apple-system, sans-serif;
          --lp-mono: var(--font-jetbrains-mono, 'JetBrains Mono'), monospace;
        }

        .lp-page { min-height:100vh; position:relative; background:var(--lp-deep); color:var(--lp-t1); font-family:var(--lp-sans); overflow-x:hidden; }
        .lp-page *, .lp-page *::before, .lp-page *::after { box-sizing:border-box; }
        .lp-page ::selection { background:rgba(212,160,74,0.25); color:#fff; }

        /* ── ANIMATED MESH GRADIENT ── */
        .lp-mesh {
          position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0;
        }
        .lp-mesh::before, .lp-mesh::after {
          content:''; position:absolute; border-radius:50%; filter:blur(120px); opacity:0.35;
          animation: lp-float 20s ease-in-out infinite;
        }
        .lp-mesh::before {
          width:800px; height:800px; top:-200px; left:-200px;
          background:radial-gradient(circle, rgba(124,58,237,0.3) 0%, transparent 70%);
          animation-delay:0s;
        }
        .lp-mesh::after {
          width:600px; height:600px; bottom:-100px; right:-150px;
          background:radial-gradient(circle, rgba(212,160,74,0.15) 0%, transparent 70%);
          animation-delay:-10s; animation-duration:25s;
        }
        @keyframes lp-float {
          0%, 100% { transform:translate(0,0) rotate(0deg); }
          33% { transform:translate(30px,-40px) rotate(5deg); }
          66% { transform:translate(-20px,30px) rotate(-3deg); }
        }

        /* ── NAV ── */
        .lp-nav {
          position:fixed; top:0; left:0; right:0; z-index:90;
          display:flex; align-items:center; justify-content:space-between;
          padding:0 clamp(24px, 4vw, 64px); height:64px;
          transition:background 0.4s, border-color 0.4s, box-shadow 0.4s;
        }
        .lp-nav--top {
          background:transparent; border-bottom:1px solid transparent;
        }
        .lp-nav--scrolled {
          background:rgba(8,9,14,0.85); backdrop-filter:blur(24px) saturate(1.4);
          border-bottom:1px solid var(--lp-border);
          box-shadow:0 4px 24px rgba(0,0,0,0.3);
        }
        .lp-nav-brand { display:flex; align-items:center; gap:12px; text-decoration:none; }
        .lp-nav-mark {
          width:8px; height:8px; border-radius:50%; background:var(--lp-gold);
          box-shadow:0 0 16px var(--lp-gold-glow);
          animation: lp-pulse 3s ease-in-out infinite;
        }
        @keyframes lp-pulse {
          0%, 100% { box-shadow:0 0 16px var(--lp-gold-glow); }
          50% { box-shadow:0 0 24px var(--lp-gold-glow), 0 0 48px rgba(212,160,74,0.1); }
        }
        .lp-nav-name { font-family:var(--lp-sans); font-size:14px; font-weight:500; color:var(--lp-t1); letter-spacing:0.6px; }
        .lp-nav-name em { font-style:normal; color:var(--lp-gold); font-weight:400; }
        .lp-nav-links { display:flex; align-items:center; gap:28px; }
        .lp-nav-links a {
          font-size:12px; font-weight:400; color:var(--lp-t3); text-decoration:none;
          letter-spacing:0.8px; text-transform:uppercase; transition:color 0.3s;
          position:relative;
        }
        .lp-nav-links a::after {
          content:''; position:absolute; bottom:-4px; left:0; width:0; height:1px;
          background:var(--lp-gold); transition:width 0.3s ease;
        }
        .lp-nav-links a:hover { color:var(--lp-t1); }
        .lp-nav-links a:hover::after { width:100%; }
        .lp-nav-time { font-family:var(--lp-mono); font-size:11px; color:var(--lp-t3); letter-spacing:1px; }
        .lp-nav-cta {
          font-size:12px; font-weight:500; color:var(--lp-deep);
          background:var(--lp-gold); padding:8px 20px; border-radius:4px;
          text-decoration:none; letter-spacing:0.5px;
          transition:transform 0.2s, box-shadow 0.3s;
        }
        .lp-nav-cta:hover {
          transform:translateY(-1px);
          box-shadow:0 4px 20px var(--lp-gold-glow);
        }

        /* ── HERO ── */
        .lp-hero {
          min-height:100vh; display:grid; grid-template-columns:1fr 1fr;
          align-items:center; gap:40px;
          padding:0 clamp(32px, 8vw, 120px); position:relative; z-index:1;
        }
        .lp-hero-content { display:flex; flex-direction:column; justify-content:center; }
        .lp-hero-visual {
          display:flex; align-items:center; justify-content:center;
          position:relative;
        }
        .lp-hero-visual svg { max-width:520px; width:100%; }
        .lp-hero-tag {
          font-family:var(--lp-mono); font-size:11px; color:var(--lp-gold); letter-spacing:2.5px;
          text-transform:uppercase; margin-bottom:40px; opacity:0.8;
          display:flex; align-items:center; gap:12px;
        }
        .lp-hero-tag::before {
          content:''; width:32px; height:1px; background:var(--lp-gold); opacity:0.5;
        }
        .lp-hero-title {
          font-family:var(--lp-serif); font-weight:300; font-size:clamp(44px, 7vw, 92px);
          line-height:1.02; letter-spacing:-2px; color:var(--lp-t1); max-width:920px;
        }
        .lp-hero-title em {
          font-style:italic; font-weight:300;
          background:linear-gradient(135deg, var(--lp-gold), #E8C87A);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          background-clip:text;
        }
        .lp-hero-body {
          margin-top:40px; font-size:17px; font-weight:300; color:var(--lp-t2); line-height:1.85;
          max-width:560px; letter-spacing:0.1px;
        }
        .lp-hero-actions {
          display:flex; gap:16px; margin-top:48px; flex-wrap:wrap;
        }
        .lp-btn-primary {
          display:inline-flex; align-items:center; gap:8px;
          font-family:var(--lp-sans); font-size:14px; font-weight:500;
          color:var(--lp-deep); background:var(--lp-gold);
          padding:14px 32px; border-radius:4px; text-decoration:none;
          letter-spacing:0.3px; position:relative; overflow:hidden;
          transition:transform 0.2s, box-shadow 0.3s;
        }
        .lp-btn-primary::before {
          content:''; position:absolute; inset:0;
          background:linear-gradient(135deg, transparent, rgba(255,255,255,0.2), transparent);
          transform:translateX(-100%); transition:transform 0.5s;
        }
        .lp-btn-primary:hover {
          transform:translateY(-2px);
          box-shadow:0 8px 32px var(--lp-gold-glow);
        }
        .lp-btn-primary:hover::before { transform:translateX(100%); }
        .lp-btn-secondary {
          display:inline-flex; align-items:center; gap:8px;
          font-family:var(--lp-sans); font-size:14px; font-weight:400;
          color:var(--lp-t2); background:transparent;
          border:1px solid var(--lp-border-l); padding:14px 32px;
          border-radius:4px; text-decoration:none; letter-spacing:0.3px;
          transition:color 0.3s, border-color 0.3s, transform 0.2s;
        }
        .lp-btn-secondary:hover {
          color:var(--lp-t1); border-color:var(--lp-t3);
          transform:translateY(-1px);
        }

        .lp-hero-scroll {
          position:absolute; bottom:40px; left:50%; transform:translateX(-50%);
          font-size:11px; color:var(--lp-t3); letter-spacing:1.5px; text-transform:uppercase;
          display:flex; flex-direction:column; align-items:center; gap:10px;
          animation: lp-scroll-hint 2.5s ease-in-out infinite;
          grid-column:1 / -1;
        }
        .lp-hero-scroll-line {
          width:1px; height:32px;
          background:linear-gradient(var(--lp-t3), transparent);
        }
        @keyframes lp-scroll-hint {
          0%, 100% { opacity:0.6; transform:translateX(-50%) translateY(0); }
          50% { opacity:1; transform:translateX(-50%) translateY(6px); }
        }

        /* ── SECTION ── */
        .lp-section {
          padding:clamp(80px,12vh,140px) clamp(32px,8vw,120px);
          border-top:1px solid var(--lp-border); position:relative; z-index:1;
        }
        .lp-section-label {
          font-family:var(--lp-mono); font-size:10px; color:var(--lp-t3); letter-spacing:2.5px;
          text-transform:uppercase; margin-bottom:16px;
        }
        .lp-section-heading {
          font-family:var(--lp-serif); font-weight:400; font-size:clamp(28px,4vw,48px);
          line-height:1.12; letter-spacing:-0.8px; max-width:680px; margin-bottom:48px;
        }
        .lp-section-heading em {
          font-style:italic;
          background:linear-gradient(135deg, var(--lp-gold), #E8C87A);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          background-clip:text;
        }
        .lp-section-prose {
          font-size:15px; font-weight:300; color:var(--lp-t2); line-height:1.85;
          max-width:560px; letter-spacing:0.1px;
        }

        /* ── CAPABILITIES ── */
        .lp-cap-grid { display:flex; flex-direction:column; gap:0; border-top:1px solid var(--lp-border); }
        .lp-cap-row {
          display:grid; grid-template-columns:60px 1fr 2fr 100px;
          align-items:start; padding:32px 0; border-bottom:1px solid var(--lp-border);
          cursor:default; transition:background 0.3s, padding-left 0.3s;
          position:relative;
        }
        .lp-cap-row::before {
          content:''; position:absolute; left:0; top:0; width:0; height:100%;
          background:linear-gradient(90deg, var(--lp-gold-dim), transparent);
          transition:width 0.5s ease; pointer-events:none;
        }
        .lp-cap-row:hover { background:var(--lp-card); padding-left:12px; }
        .lp-cap-row:hover::before { width:200px; }
        .lp-cap-num {
          font-family:var(--lp-mono); font-size:11px; color:var(--lp-t3); padding-top:4px;
        }
        .lp-cap-area {
          font-size:17px; font-weight:500; letter-spacing:-0.2px; padding-right:24px;
        }
        .lp-cap-detail {
          font-size:14px; font-weight:300; color:var(--lp-t2); line-height:1.7; padding-right:24px;
        }
        .lp-cap-count {
          font-family:var(--lp-mono); font-size:22px; font-weight:400; color:var(--lp-gold);
          text-align:right;
        }
        .lp-cap-count-label {
          font-family:var(--lp-sans); font-size:10px; color:var(--lp-t3); text-align:right;
          margin-top:2px; letter-spacing:0.3px;
        }

        /* ── NUMBERS ── */
        .lp-numbers-row {
          display:grid; grid-template-columns:repeat(4, 1fr); gap:1px;
          background:var(--lp-border); border:1px solid var(--lp-border); border-radius:2px;
          overflow:hidden; margin-top:56px;
        }
        .lp-number-cell {
          background:var(--lp-surface); padding:44px 32px; text-align:center;
          transition:background 0.3s;
        }
        .lp-number-cell:hover { background:var(--lp-card); }
        .lp-number-val {
          font-family:var(--lp-serif); font-size:clamp(40px,5vw,60px); font-weight:300;
          letter-spacing:-1.5px; line-height:1;
          background:linear-gradient(180deg, var(--lp-t1), var(--lp-t2));
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          background-clip:text;
        }
        .lp-number-label {
          font-size:12px; font-weight:400; color:var(--lp-t3); margin-top:14px;
          letter-spacing:0.5px;
        }

        /* ── PRINCIPLES ── */
        .lp-principles-grid {
          display:grid; grid-template-columns:repeat(3, 1fr); gap:1px;
          background:var(--lp-border); border:1px solid var(--lp-border); border-radius:2px;
          overflow:hidden;
        }
        .lp-principle-card {
          background:var(--lp-surface); padding:40px 32px;
          transition:background 0.3s, transform 0.3s;
          position:relative; overflow:hidden;
        }
        .lp-principle-card::before {
          content:''; position:absolute; top:0; left:0; right:0; height:2px;
          background:var(--lp-gold); transform:scaleX(0); transform-origin:left;
          transition:transform 0.4s ease;
        }
        .lp-principle-card:hover { background:var(--lp-card-hover); }
        .lp-principle-card:hover::before { transform:scaleX(1); }
        .lp-principle-code {
          font-family:var(--lp-mono); font-size:10px; color:var(--lp-gold); letter-spacing:1.5px;
          margin-bottom:18px; opacity:0.7;
        }
        .lp-principle-title {
          font-family:var(--lp-serif); font-size:21px; font-weight:400; letter-spacing:-0.2px;
          margin-bottom:12px; line-height:1.25;
        }
        .lp-principle-body {
          font-size:13px; font-weight:300; color:var(--lp-t2); line-height:1.75;
        }

        /* ── APPROACH ── */
        .lp-approach-split {
          display:grid; grid-template-columns:1fr 1fr; gap:80px; align-items:start;
        }
        .lp-approach-list { display:flex; flex-direction:column; gap:0; }
        .lp-approach-item {
          display:flex; gap:20px; align-items:flex-start;
          padding:24px 0; border-bottom:1px solid var(--lp-border);
          transition:padding-left 0.3s;
        }
        .lp-approach-item:first-child { border-top:1px solid var(--lp-border); }
        .lp-approach-item:hover { padding-left:8px; }
        .lp-approach-num {
          font-family:var(--lp-mono); font-size:10px; color:var(--lp-gold); opacity:0.6;
          margin-top:5px; flex-shrink:0; width:20px;
        }
        .lp-approach-item-title { font-size:15px; font-weight:500; margin-bottom:6px; }
        .lp-approach-item-body { font-size:13px; font-weight:300; color:var(--lp-t2); line-height:1.7; }

        /* ── CTA SECTION ── */
        .lp-cta-section {
          padding:clamp(80px,10vh,120px) clamp(32px,8vw,120px);
          border-top:1px solid var(--lp-border);
          text-align:center; position:relative; z-index:1;
          background:linear-gradient(180deg, var(--lp-deep) 0%, rgba(124,58,237,0.04) 50%, var(--lp-deep) 100%);
        }
        .lp-cta-title {
          font-family:var(--lp-serif); font-weight:300; font-size:clamp(32px,5vw,56px);
          line-height:1.1; letter-spacing:-1px; margin-bottom:24px;
        }
        .lp-cta-title em {
          font-style:italic;
          background:linear-gradient(135deg, var(--lp-gold), #E8C87A);
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          background-clip:text;
        }
        .lp-cta-body {
          font-size:16px; color:var(--lp-t2); max-width:480px; margin:0 auto 40px;
          line-height:1.7; font-weight:300;
        }
        .lp-cta-actions { display:flex; gap:16px; justify-content:center; flex-wrap:wrap; }

        /* ── FOOTER ── */
        .lp-footer {
          border-top:1px solid var(--lp-border);
          padding:48px clamp(32px,8vw,120px); display:flex;
          align-items:center; justify-content:space-between;
          position:relative; z-index:1;
        }
        .lp-footer-left { display:flex; align-items:center; gap:16px; }
        .lp-footer-mark {
          width:6px; height:6px; border-radius:50%; background:var(--lp-gold); opacity:0.5;
        }
        .lp-footer-text { font-size:12px; color:var(--lp-t3); letter-spacing:0.3px; }
        .lp-footer-text a { color:var(--lp-t2); text-decoration:none; transition:color 0.3s; }
        .lp-footer-text a:hover { color:var(--lp-t1); }
        .lp-footer-right { display:flex; align-items:center; gap:20px; }
        .lp-footer-right a {
          font-size:12px; color:var(--lp-t3); text-decoration:none;
          transition:color 0.3s; letter-spacing:0.3px;
        }
        .lp-footer-right a:hover { color:var(--lp-t1); }
        .lp-footer-disclaimer {
          font-size:11px; color:var(--lp-t3); opacity:0.5; text-align:center;
          padding:0 clamp(32px,8vw,120px) 32px;
          position:relative; z-index:1;
        }

        .lp-thin-rule { width:48px; height:1px; background:var(--lp-border-l); margin:32px 0; }

        /* ── RESPONSIVE ── */
        @media(max-width:900px) {
          .lp-cap-row { grid-template-columns:40px 1fr; gap:8px; }
          .lp-cap-detail, .lp-cap-row > div:last-child { grid-column:2; }
          .lp-cap-count { text-align:left; }
          .lp-numbers-row { grid-template-columns:1fr 1fr; }
          .lp-principles-grid { grid-template-columns:1fr; }
          .lp-approach-split { grid-template-columns:1fr; gap:48px; }
          .lp-hero { grid-template-columns:1fr; }
          .lp-hero-visual { order:-1; max-width:320px; margin:0 auto; }
          .lp-nav-links { display:none; }
          .lp-footer { flex-direction:column; gap:16px; text-align:center; }
          .lp-hero-actions { flex-direction:column; }
          .lp-btn-primary, .lp-btn-secondary { justify-content:center; }
        }
        @media(max-width:600px) {
          .lp-numbers-row { grid-template-columns:1fr; }
          .lp-cap-row { grid-template-columns:1fr; }
          .lp-cap-num { display:none; }
          .lp-cta-actions { flex-direction:column; align-items:center; }
        }
      `}</style>

      <div className="lp-page">
        {/* ── Animated mesh gradient background ── */}
        <div aria-hidden="true" className="lp-mesh" />

        {/* ════ NAV ════ */}
        <nav
          className={`lp-nav ${navScrolled ? "lp-nav--scrolled" : "lp-nav--top"}`}
        >
          <Link className="lp-nav-brand" href="/">
            <span className="lp-nav-mark" />
            <span className="lp-nav-name">
              Assist<em>Jur</em>.IA
            </span>
          </Link>
          <div className="lp-nav-links">
            <a href="#produto">Produto</a>
            <a href="#principios">Princípios</a>
            <a href="#metodo">Método</a>
            <span className="lp-nav-time">{time} BRT</span>
            <Link className="lp-nav-cta" href="/login">
              Acessar
            </Link>
          </div>
        </nav>

        {/* ════ HERO ════ */}
        <section className="lp-hero">
          <div className="lp-hero-content">
            <FadeIn>
              <div className="lp-hero-tag">
                BR Consultoria &middot; Contencioso Trabalhista
              </div>
            </FadeIn>
            <FadeIn delay={0.12}>
              <h1 className="lp-hero-title">
                Inteligência documental
                <br />
                para quem <em>defende</em>
              </h1>
            </FadeIn>
            <FadeIn delay={0.28}>
              <p className="lp-hero-body">
                Trinta e quatro assistentes especializados que leem processos
                inteiros, extraem os dados que importam e produzem documentos
                prontos para revisão. Sem atalhos. Sem invenção. Cada campo
                rastreado até a página do PDF.
              </p>
            </FadeIn>
            <FadeIn delay={0.4}>
              <div className="lp-hero-actions">
                <Link className="lp-btn-primary" href="/chat">
                  Acessar o Revisor
                  <svg
                    aria-hidden
                    fill="none"
                    height="16"
                    viewBox="0 0 16 16"
                    width="16"
                  >
                    <title>Seta</title>
                    <path
                      d="M3 8h10M9 4l4 4-4 4"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                    />
                  </svg>
                </Link>
                <Link className="lp-btn-secondary" href="/register">
                  Criar conta gratuita
                </Link>
              </div>
            </FadeIn>
          </div>
          <FadeIn className="lp-hero-visual" delay={0.2}>
            <AnimatedLogo />
          </FadeIn>
          <div className="lp-hero-scroll">
            <span>Rolar</span>
            <span className="lp-hero-scroll-line" />
          </div>
        </section>

        {/* ════ PRODUCT / CAPABILITIES ════ */}
        <section className="lp-section" id="produto">
          <FadeIn>
            <div className="lp-section-label">01 &mdash; O que fazemos</div>
            <h2 className="lp-section-heading">
              Cada área do contencioso tem um
              <br />
              assistente <em>dedicado</em>
            </h2>
          </FadeIn>

          <div className="lp-cap-grid">
            {CAPABILITIES.map((c, i) => (
              <FadeIn delay={0.06 * i} key={c.area}>
                <div className="lp-cap-row">
                  <div className="lp-cap-num">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="lp-cap-area">{c.area}</div>
                  <div className="lp-cap-detail">{c.detail}</div>
                  <div>
                    <div className="lp-cap-count">{c.count}</div>
                    <div className="lp-cap-count-label">assistentes</div>
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>

          <FadeIn delay={0.15}>
            <div className="lp-numbers-row" ref={statsRef}>
              {STATS.map((n) => (
                <div className="lp-number-cell" key={n.label}>
                  <AnimatedCounter stat={n} visible={statsVisible} />
                  <div className="lp-number-label">{n.label}</div>
                </div>
              ))}
            </div>
          </FadeIn>
        </section>

        {/* ════ PRINCIPLES ════ */}
        <section className="lp-section" id="principios">
          <FadeIn>
            <div className="lp-section-label">02 &mdash; Princípios</div>
            <h2 className="lp-section-heading">
              Regras que nenhuma instrução
              <br />
              pode <em>sobrepor</em>
            </h2>
            <p className="lp-section-prose" style={{ marginBottom: 48 }}>
              A plataforma opera sob um conjunto de princípios invioláveis. Eles
              existem para garantir que o trabalho da IA nunca comprometa a
              defesa técnica do advogado — mesmo quando o processo é incompleto
              ou ambíguo.
            </p>
          </FadeIn>

          <div className="lp-principles-grid">
            {PRINCIPLES.map((p, i) => (
              <FadeIn delay={0.06 * i} key={p.code}>
                <div className="lp-principle-card">
                  <div className="lp-principle-code">P{p.code}</div>
                  <div className="lp-principle-title">{p.title}</div>
                  <div className="lp-principle-body">{p.body}</div>
                </div>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ════ METHOD ════ */}
        <section className="lp-section" id="metodo">
          <FadeIn>
            <div className="lp-section-label">03 &mdash; Método</div>
            <h2 className="lp-section-heading">
              Como um processo vira
              <br />
              um <em>documento</em>
            </h2>
          </FadeIn>

          <div className="lp-approach-split">
            <FadeIn direction="left">
              <div className="lp-section-prose">
                O fluxo é o mesmo para todos os assistentes: receber o processo,
                ler cada página, mapear os dados relevantes, validar o que foi
                encontrado e produzir o documento no formato exigido.
                <br />
                <br />
                Não existe atalho. O assistente não pula páginas, não resume por
                amostragem e não infere dados que não estejam no processo. Se o
                PDF tem 800 páginas, as 800 são lidas.
              </div>
            </FadeIn>

            <FadeIn delay={0.1} direction="right">
              <div className="lp-approach-list">
                {METHOD_STEPS.map((item, i) => (
                  <div className="lp-approach-item" key={item.title}>
                    <span className="lp-approach-num">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <div className="lp-approach-item-title">{item.title}</div>
                      <div className="lp-approach-item-body">{item.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ════ IDENTITY ════ */}
        <section className="lp-section">
          <FadeIn>
            <div className="lp-section-label">04 &mdash; Quem somos</div>
            <h2 className="lp-section-heading">
              Construído por quem conhece
              <br />o <em>contencioso</em> por dentro
            </h2>
            <p className="lp-section-prose">
              A AssistJur.IA nasceu dentro da BR Consultoria — uma operação que
              há anos atende escritórios de médio e grande porte no contencioso
              trabalhista brasileiro. A plataforma não foi desenhada em
              abstrato. Cada assistente resolve um problema real, testado em
              volume, com processos reais.
            </p>
            <div className="lp-thin-rule" />
            <p className="lp-section-prose" style={{ marginTop: 0 }}>
              Não vendemos promessas de IA generativa. Vendemos horas devolvidas
              ao advogado — para que ele faça o que só ele pode fazer: pensar a
              estratégia, proteger o cliente, sustentar a tese na audiência.
            </p>
          </FadeIn>
        </section>

        {/* ════ CTA ════ */}
        <section className="lp-cta-section">
          <FadeIn>
            <h2 className="lp-cta-title">
              Comece a usar <em>agora</em>
            </h2>
            <p className="lp-cta-body">
              Acesse o Revisor de Defesas gratuitamente. Envie um processo e
              veja a análise em minutos — sem compromisso, sem cartão de
              crédito.
            </p>
            <div className="lp-cta-actions">
              <Link className="lp-btn-primary" href="/chat">
                Acessar o Revisor
                <svg
                  aria-hidden
                  fill="none"
                  height="16"
                  viewBox="0 0 16 16"
                  width="16"
                >
                  <title>Seta</title>
                  <path
                    d="M3 8h10M9 4l4 4-4 4"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                  />
                </svg>
              </Link>
              <Link className="lp-btn-secondary" href="/register">
                Criar conta gratuita
              </Link>
            </div>
          </FadeIn>
        </section>

        {/* ════ FOOTER ════ */}
        <footer className="lp-footer">
          <div className="lp-footer-left">
            <span className="lp-footer-mark" />
            <span className="lp-footer-text">
              <Link href="/">AssistJur.IA</Link> &nbsp;&middot;&nbsp; BR
              Consultoria &nbsp;&middot;&nbsp; Porto Alegre
            </span>
          </div>
          <div className="lp-footer-right">
            <Link href="/privacy">Privacidade</Link>
            <Link href="/terms">Termos</Link>
            <Link href="/login">Entrar</Link>
            <Link href="/register">Cadastrar</Link>
          </div>
        </footer>
        <div className="lp-footer-disclaimer">
          Documentos gerados por inteligência artificial. Revisão humana
          obrigatória.
        </div>
      </div>
    </>
  );
}
