-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "codigo" TEXT,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT,
    "valorCentavos" INTEGER,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Produto_categoria_idx" ON "Produto"("categoria");
