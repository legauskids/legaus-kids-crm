-- Apresentação do orçamento (pedido de 2026-11-06). Só acrescenta duas
-- tabelas novas (páginas editadas e imagens extras); nada existente muda.

-- CreateTable
CREATE TABLE "ApresentacaoOrcamento" (
    "orcamentoId" TEXT NOT NULL,
    "paginas" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApresentacaoOrcamento_pkey" PRIMARY KEY ("orcamentoId")
);

-- CreateTable
CREATE TABLE "ApresentacaoImagem" (
    "id" TEXT NOT NULL,
    "orcamentoId" TEXT NOT NULL,
    "nome" TEXT,
    "mime" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "largura" INTEGER NOT NULL,
    "altura" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApresentacaoImagem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApresentacaoImagem_orcamentoId_idx" ON "ApresentacaoImagem"("orcamentoId");

-- AddForeignKey
ALTER TABLE "ApresentacaoOrcamento" ADD CONSTRAINT "ApresentacaoOrcamento_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApresentacaoImagem" ADD CONSTRAINT "ApresentacaoImagem_orcamentoId_fkey" FOREIGN KEY ("orcamentoId") REFERENCES "Orcamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

