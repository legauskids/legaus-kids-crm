-- DropForeignKey
ALTER TABLE "Negocio" DROP CONSTRAINT "Negocio_contatoId_fkey";

-- AlterTable
ALTER TABLE "Negocio" ALTER COLUMN "contatoId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "Contato"("id") ON DELETE SET NULL ON UPDATE CASCADE;
