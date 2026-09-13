-- CreateTable
CREATE TABLE "SimulacaoFinanceira" (
    "id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "tipo" "TipoTransacaoBancaria" NOT NULL,
    "data" TIMESTAMP(3),
    "criadaPorId" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulacaoFinanceira_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SimulacaoFinanceira" ADD CONSTRAINT "SimulacaoFinanceira_criadaPorId_fkey" FOREIGN KEY ("criadaPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
