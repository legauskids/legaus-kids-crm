-- AlterTable
ALTER TABLE "Negocio" ADD COLUMN     "excluidoEm" TIMESTAMP(3),
ADD COLUMN     "excluidoPorId" TEXT,
ADD COLUMN     "motivoExclusao" TEXT;

-- AddForeignKey
ALTER TABLE "Negocio" ADD CONSTRAINT "Negocio_excluidoPorId_fkey" FOREIGN KEY ("excluidoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
