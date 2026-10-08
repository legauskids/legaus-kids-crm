-- Agente independente de canal (pedido de 2026-10-07, etapa 3). Só
-- acrescenta: duas colunas e um valor de enum. Nenhum dado existente muda.

-- AlterEnum: despesa vinda da notificação do Sicredi (MacroDroid)
ALTER TYPE "OrigemDespesa" ADD VALUE 'PUSH';

-- AlterTable: agente ligado/desligado por canal, por usuário
ALTER TABLE "User" ADD COLUMN     "canaisAgente" JSONB NOT NULL DEFAULT '{}';

-- AlterTable: auditoria do que o agente executou
ALTER TABLE "ComandoAgente" ADD COLUMN     "acoes" JSONB;
