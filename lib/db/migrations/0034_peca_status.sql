-- Adiciona campo status ao ciclo de vida das peças processuais.
-- Valores: rascunho (default) | aprovado | protocolado
-- Sprint 8 (ASSISTJUR-PRD-ALINHAMENTO.md §3.2 AgentDrafter integrado)

ALTER TABLE "Peca"
  ADD COLUMN "status" varchar(32) NOT NULL DEFAULT 'rascunho';
