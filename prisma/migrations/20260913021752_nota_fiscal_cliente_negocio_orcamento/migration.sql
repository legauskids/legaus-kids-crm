/*
  Warnings:

  - Added the required column `contatoId` to the `NotaFiscal` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "NotaFiscal" DROP CONSTRAINT "NotaFiscal_negocioId_fkey";

-- AlterTable
ALTER TABLE "NotaFiscal" ADD COLUMN     "contatoId" TEXT NOT NULL,
ADD COLUMN     "orcamentoId" TEXT,
ALTER COLUMN "negocioId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "Negocio_contatoId_idx" ON "Negocio"("contatoId");

-- CreateIndex
CREATE INDEX "Orcamento_contatoId_idx" ON "Orcamento"("contatoId");

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "Contato"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotaFiscal" ADD CONSTRAINT "NotaFiscal_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
