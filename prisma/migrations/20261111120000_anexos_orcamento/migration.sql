-- Imagens anexas ao orçamento (pedido de 2026-11-11): saem em página(s) depois
-- do orçamento, no PDF, na impressão e no link público. Só acrescenta tabela.

-- CreateTable
CREATE TABLE "OrcamentoAnexo" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "nome" TEXT,
    "legenda" TEXT,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "largura" INTEGER NOT NULL,
    "altura" INTEGER NOT NULL,
    "tamanho" INTEGER NOT NULL DEFAULT 100,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrcamentoAnexo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrcamentoAnexo_orcamentoId_idx" ON "OrcamentoAnexo"("orcamentoId");

-- AddForeignKey
ALTER TABLE "OrcamentoAnexo" ADD CONSTRAINT "OrcamentoAnexo_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

