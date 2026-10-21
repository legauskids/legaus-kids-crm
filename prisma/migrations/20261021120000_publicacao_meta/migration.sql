-- Publicação pela API da Meta (etapa 3 dos posts, aprovada pelo Marcos em
-- 2026-10-21): estados de agendamento/publicação, campos de publicação no
-- post e a conexão com a Página e o Instagram. Só acrescenta.

-- AlterEnum
ALTER TYPE "StatusPostagem" ADD VALUE 'AGENDADO';
ALTER TYPE "StatusPostagem" ADD VALUE 'PUBLICANDO';
ALTER TYPE "StatusPostagem" ADD VALUE 'ERRO';

-- AlterTable
ALTER TABLE "Postagem" ADD COLUMN     "agendadaPara" TIMESTAMP(3),
ADD COLUMN     "erroPublicacao" TEXT,
ADD COLUMN     "publicacao" JSONB,
ADD COLUMN     "publicadaEm" TIMESTAMP(3),
ADD COLUMN     "publicarNoFacebook" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "publicarNoInstagram" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "ConexaoMeta" (
    "id" TEXT NOT NULL DEFAULT 'principal',
    "paginaId" TEXT NOT NULL,
    "paginaNome" TEXT NOT NULL,
    "paginaToken" TEXT NOT NULL,
    "instagramId" TEXT,
    "instagramUsuario" TEXT,
    "permissoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conectadoPorId" TEXT,
    "conectadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verificadoEm" TIMESTAMP(3),
    "erro" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConexaoMeta_pkey" PRIMARY KEY ("id")
);
