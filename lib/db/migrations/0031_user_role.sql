-- Migration: 0031_user_role.sql
-- Adiciona campo role ao utilizador para RBAC.
-- Utilizadores existentes com password (não-guest) recebem adv_pleno por omissão
-- para não perder acesso às funcionalidades existentes.

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "role" varchar(32);

-- Utilizadores com password = provavelmente advogados reais → adv_pleno
UPDATE "User"
   SET "role" = 'adv_pleno'
 WHERE "password" IS NOT NULL
   AND "email" NOT LIKE 'guest-%';

-- Utilizadores guest ficam sem role (null) — acesso muito limitado
