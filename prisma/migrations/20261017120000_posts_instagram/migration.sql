-- Posts do Instagram no padrão da marca (aprovado pelo Marcos em 2026-10-17):
-- campos novos em Postagem/PostagemImagem e a tabela das artes. Sai a tabela
-- dos 3 layouts antigos (FAIXA/CANTO/LATERAL), vazia — a remoção foi aprovada.

-- CreateEnum
CREATE TYPE "ConteudoPostagem" AS ENUM ('ENTREGA', 'INSTALACAO', 'TBT', 'PRODUTO', 'BENEFICIOS');

-- CreateEnum
CREATE TYPE "FormatoArte" AS ENUM ('FEED', 'STORY');

-- DropForeignKey
ALTER TABLE "PostagemImagemVariante" DROP CONSTRAINT "PostagemImagemVariante_postagemImagemId_fkey";

-- AlterTable
ALTER TABLE "Postagem" ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "cliente" TEXT,
ADD COLUMN     "conteudo" "ConteudoPostagem" NOT NULL DEFAULT 'ENTREGA',
ADD COLUMN     "negocioId" TEXT,
ADD COLUMN     "produto" TEXT,
ADD COLUMN     "textos" JSONB,
ALTER COLUMN "tipo" SET DEFAULT 'FEED_INSTAGRAM';

-- AlterTable
ALTER TABLE "PostagemImagem" ADD COLUMN     "altura" INTEGER,
ADD COLUMN     "imagemTratada" BYTEA,
ADD COLUMN     "largura" INTEGER;

-- DropTable
DROP TABLE "PostagemImagemVariante";

-- DropEnum
DROP TYPE "LayoutVariante";

-- CreateTable
CREATE TABLE "PostagemArte" (
    "id" TEXT NOT NULL,
    "postagemId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "formato" "FormatoArte" NOT NULL,
    "dados" JSONB NOT NULL,
    "imagem" BYTEA,
    "renderizadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostagemArte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostagemArte_postagemId_ordem_idx" ON "PostagemArte"("postagemId", "ordem");

-- CreateIndex
CREATE INDEX "Postagem_negocioId_idx" ON "Postagem"("negocioId");

-- AddForeignKey
ALTER TABLE "Postagem" ADD CONSTRAINT "Postagem_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostagemArte" ADD CONSTRAINT "PostagemArte_postagemId_fkey" FOREIGN KEY ("postagemId") REFERENCES "Postagem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

