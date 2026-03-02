-- Utilizador sistema para documentos "Banco de Teses Padrão" do Redator (RAG).
-- Evita que cada utilizador precise de copiar o banco; o doc. é partilhado via allowedUserIds.
INSERT INTO "User" (id, email, "password")
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'system@redator-banco.internal',
  NULL
)
ON CONFLICT (id) DO NOTHING;
