-- AlterTable
ALTER TABLE "Contato" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
