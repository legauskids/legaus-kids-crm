-- Índices trigram (pg_trgm) da busca aproximada não são declarados via
-- @@index no schema.prisma — removido de propósito (ver migração
-- 20260829211427_busca_similar_trgm).

-- AlterTable
ALTER TABLE "Contato" ADD COLUMN     "representanteLegalCpf" TEXT,
ADD COLUMN     "representanteLegalNome" TEXT;

-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "formaPagamento" TEXT;
