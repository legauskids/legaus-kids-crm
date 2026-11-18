-- Arquivos anexados ao negócio (pedido de 2026-11-18): qualquer tipo, até 50 MB,
-- guardados em partes de 3 MB; cada envio vira uma Atividade ARQUIVO no histórico.

-- AlterEnum
ALTER TYPE "TipoAtividade" ADD VALUE 'ARQUIVO';

-- CreateTable
CREATE TABLE "NegocioArquivo" (
    "id" TEXT NOT NULL,
    "negocioId" TEXT NOT NULL,
    "atividadeId" TEXT,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "partesTotal" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NegocioArquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NegocioArquivoParte" (
    "arquivoId" TEXT NOT NULL,
    "indice" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "NegocioArquivoParte_pkey" PRIMARY KEY ("arquivoId","indice")
);

-- CreateIndex
CREATE INDEX "NegocioArquivo_negocioId_idx" ON "NegocioArquivo"("negocioId");

-- CreateIndex
CREATE INDEX "NegocioArquivo_atividadeId_idx" ON "NegocioArquivo"("atividadeId");

-- AddForeignKey
ALTER TABLE "NegocioArquivo" ADD CONSTRAINT "NegocioArquivo_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegocioArquivo" ADD CONSTRAINT "NegocioArquivo_atividadeId_fkey" FOREIGN KEY ("atividadeId") REFERENCES "Atividade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NegocioArquivoParte" ADD CONSTRAINT "NegocioArquivoParte_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "NegocioArquivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

