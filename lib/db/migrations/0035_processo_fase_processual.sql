-- Adiciona coluna faseProcessual ao Processo.
-- Detectada automaticamente pelo intake via detectFaseProcessual().
-- Valores: CONHECIMENTO | RECURSAL-TRT | RECURSAL-TST | EXECUCAO-PROVISORIA |
--          EXECUCAO-DEFINITIVA | ACORDO | ENCERRADO | DESCONHECIDA
ALTER TABLE "Processo" ADD COLUMN IF NOT EXISTS "faseProcessual" varchar(32);
