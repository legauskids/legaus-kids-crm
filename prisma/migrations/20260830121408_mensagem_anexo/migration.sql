-- Os índices trigram (pg_trgm) do busca-similar não são declarados via
-- @@index no schema.prisma (são gerenciados por migração SQL manual), então
-- o `prisma migrate dev` os detecta como "extras" e tenta apagá-los aqui.
-- Removido de propósito — eles continuam existindo e em uso pela busca
-- aproximada do agente (ver migração 20260829211427_busca_similar_trgm).

-- AlterTable
ALTER TABLE "Mensagem" ADD COLUMN     "anexoMimetype" TEXT,
ADD COLUMN     "anexoNome" TEXT,
ADD COLUMN     "anexoUrl" TEXT;
