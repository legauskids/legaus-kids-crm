-- Postagem passa a ter 1..N imagens (carrossel) em vez de uma imagem só,
-- cada imagem com 2-3 variantes de layout de marca. Não existe dado real de
-- produção nessa tabela ainda (só testes já apagados), então é seguro
-- remover as colunas antigas de bytes direto.

-- CreateEnum
CREATE TYPE "LayoutVariante" AS ENUM ('FAIXA', 'CANTO', 'LATERAL');

-- AlterTable
ALTER TABLE "Postagem"
  DROP COLUMN "imagemOriginal",
  DROP COLUMN "imagemOriginalMime",
  DROP COLUMN "imagemEditada",
  DROP COLUMN "imagemEditadaMime",
  ADD COLUMN "headline" TEXT;

-- CreateTable
CREATE TABLE "PostagemImagem" (
    "id" TEXT NOT NULL,
    "postagemId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "imagemOriginal" BYTEA NOT NULL,
    "imagemOriginalMime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostagemImagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PostagemImagemVariante" (
    "id" TEXT NOT NULL,
    "postagemImagemId" TEXT NOT NULL,
    "layout" "LayoutVariante" NOT NULL,
    "escolhida" BOOLEAN NOT NULL DEFAULT false,
    "imagem" BYTEA NOT NULL,
    "imagemMime" TEXT NOT NULL DEFAULT 'image/jpeg',
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostagemImagemVariante_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PostagemImagem" ADD CONSTRAINT "PostagemImagem_postagemId_fkey" FOREIGN KEY ("postagemId") REFERENCES "Postagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostagemImagemVariante" ADD CONSTRAINT "PostagemImagemVariante_postagemImagemId_fkey" FOREIGN KEY ("postagemImagemId") REFERENCES "PostagemImagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
