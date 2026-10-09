-- Etiqueta da conta de origem do push (Sicredi ou InfinitePay), pedida pelo
-- Marcos em 2026-10-08. Só acrescenta; os avisos que já existem vieram todos
-- do Sicredi e ficam com o padrão.

-- CreateEnum
CREATE TYPE "ContaBancaria" AS ENUM ('SICREDI', 'INFINITEPAY');

-- AlterTable
ALTER TABLE "AvisoBancario" ADD COLUMN     "conta" "ContaBancaria" NOT NULL DEFAULT 'SICREDI';
