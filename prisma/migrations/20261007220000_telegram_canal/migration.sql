-- Canal do Telegram exclusivo do Marcos (pedido de 2026-10-07, etapa 2).
-- Só acrescenta: um valor no enum, duas colunas opcionais e seus índices
-- únicos. Nenhum dado existente muda.

-- AlterEnum
ALTER TYPE "OrigemComando" ADD VALUE 'TELEGRAM';

-- AlterTable: ID do Telegram ligado ao usuário do CRM
ALTER TABLE "User" ADD COLUMN     "telegramId" TEXT;
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");

-- AlterTable: ID da mensagem no canal, pra não processar duas vezes
ALTER TABLE "ComandoAgente" ADD COLUMN     "externalId" TEXT;
CREATE UNIQUE INDEX "ComandoAgente_externalId_key" ON "ComandoAgente"("externalId");
