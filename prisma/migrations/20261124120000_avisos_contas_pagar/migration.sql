-- CreateEnum
CREATE TYPE "TurnoAvisoConta" AS ENUM ('MANHA', 'TARDE');

-- CreateTable
CREATE TABLE "AvisoContasPagar" (
    "id" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "turno" "TurnoAvisoConta" NOT NULL,
    "canal" TEXT NOT NULL,
    "contas" INTEGER NOT NULL DEFAULT 0,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvisoContasPagar_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvisoContasPagar_dia_turno_canal_key" ON "AvisoContasPagar"("dia", "turno", "canal");

