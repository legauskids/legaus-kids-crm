-- CreateEnum
CREATE TYPE "OrigemCotacaoFornecedor" AS ENUM ('ARQUIVO', 'TEXTO', 'AUDIO', 'MANUAL');

-- CreateTable
CREATE TABLE "CotacaoFornecedor" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "titulo" TEXT NOT NULL,
    "fornecedorNome" TEXT NOT NULL,
    "fornecedorId" TEXT,
    "data" TIMESTAMP(3) NOT NULL,
    "validade" TIMESTAMP(3),
    "frete" TEXT,
    "prazoEntrega" TEXT,
    "pagamento" TEXT,
    "impostos" TEXT,
    "observacoes" TEXT,
    "totalCentavos" INTEGER,
    "negocioId" TEXT,
    "origem" "OrigemCotacaoFornecedor" NOT NULL DEFAULT 'MANUAL',
    "textoOriginal" TEXT,
    "extracao" JSONB,
    "telefoneOrigem" TEXT,
    "registradaPorId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CotacaoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoFornecedorItem" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT,
    "quantidade" DOUBLE PRECISION,
    "precoUnitarioCentavos" INTEGER,
    "totalCentavos" INTEGER,
    "observacao" TEXT,

    CONSTRAINT "CotacaoFornecedorItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoFornecedorArquivo" (
    "id" TEXT NOT NULL,
    "cotacaoId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "partesTotal" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CotacaoFornecedorArquivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CotacaoFornecedorArquivoParte" (
    "arquivoId" TEXT NOT NULL,
    "indice" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,

    CONSTRAINT "CotacaoFornecedorArquivoParte_pkey" PRIMARY KEY ("arquivoId","indice")
);

-- CreateIndex
CREATE UNIQUE INDEX "CotacaoFornecedor_numero_key" ON "CotacaoFornecedor"("numero");

-- CreateIndex
CREATE INDEX "CotacaoFornecedor_data_idx" ON "CotacaoFornecedor"("data");

-- CreateIndex
CREATE INDEX "CotacaoFornecedor_fornecedorId_idx" ON "CotacaoFornecedor"("fornecedorId");

-- CreateIndex
CREATE INDEX "CotacaoFornecedor_telefoneOrigem_criadoEm_idx" ON "CotacaoFornecedor"("telefoneOrigem", "criadoEm");

-- CreateIndex
CREATE INDEX "CotacaoFornecedorItem_cotacaoId_idx" ON "CotacaoFornecedorItem"("cotacaoId");

-- CreateIndex
CREATE INDEX "CotacaoFornecedorArquivo_cotacaoId_idx" ON "CotacaoFornecedorArquivo"("cotacaoId");

-- AddForeignKey
ALTER TABLE "CotacaoFornecedor" ADD CONSTRAINT "CotacaoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Contato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedor" ADD CONSTRAINT "CotacaoFornecedor_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedor" ADD CONSTRAINT "CotacaoFornecedor_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedorItem" ADD CONSTRAINT "CotacaoFornecedorItem_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "CotacaoFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedorArquivo" ADD CONSTRAINT "CotacaoFornecedorArquivo_cotacaoId_fkey" FOREIGN KEY ("cotacaoId") REFERENCES "CotacaoFornecedor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CotacaoFornecedorArquivoParte" ADD CONSTRAINT "CotacaoFornecedorArquivoParte_arquivoId_fkey" FOREIGN KEY ("arquivoId") REFERENCES "CotacaoFornecedorArquivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

