-- AlterTable
ALTER TABLE "Contato" ADD COLUMN     "email" TEXT;

-- AlterTable
ALTER TABLE "Orcamento" ADD COLUMN     "tokenPublico" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Orcamento_tokenPublico_key" ON "Orcamento"("tokenPublico");
