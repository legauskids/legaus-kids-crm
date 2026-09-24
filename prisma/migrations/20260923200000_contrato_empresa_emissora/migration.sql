-- CreateEnum
CREATE TYPE "EmpresaEmissora" AS ENUM ('LEGAUS', 'IDEZZA');

-- AlterTable
ALTER TABLE "Contrato" ADD COLUMN "empresaEmissora" "EmpresaEmissora" NOT NULL DEFAULT 'LEGAUS';
