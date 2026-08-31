-- CreateEnum
CREATE TYPE "TipoPostagem" AS ENUM ('FEED_INSTAGRAM', 'STORY_INSTAGRAM', 'STATUS_WHATSAPP', 'FEED_FACEBOOK');

-- CreateEnum
CREATE TYPE "StatusPostagem" AS ENUM ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'PUBLICADO', 'RECUSADO');

-- Índices trigram (pg_trgm) da busca aproximada não são declarados via
-- @@index no schema.prisma — removido de propósito (ver migração
-- 20260829211427_busca_similar_trgm).

-- CreateTable
CREATE TABLE "ModeloPostagem" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "TipoPostagem" NOT NULL,
    "legendaModelo" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModeloPostagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Postagem" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "tipo" "TipoPostagem" NOT NULL,
    "status" "StatusPostagem" NOT NULL DEFAULT 'AGUARDANDO_APROVACAO',
    "contexto" TEXT,
    "legenda" TEXT,
    "imagemOriginal" BYTEA NOT NULL,
    "imagemOriginalMime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "imagemEditada" BYTEA NOT NULL,
    "imagemEditadaMime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "criadoPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Postagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Postagem_numero_key" ON "Postagem"("numero");

-- AddForeignKey
ALTER TABLE "Postagem" ADD CONSTRAINT "Postagem_criadoPorId_fkey" FOREIGN KEY ("criadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
