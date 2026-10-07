-- Despesas registradas antes do extrato (áudio, comprovante, texto, manual)
-- e centros de custo gerais. CentroCusto passa a ser a CATEGORIA na tela.
-- Só acrescenta: nenhuma linha existente é alterada além de ganhar o centro
-- geral sugerido. Pedido de 2026-10-07.

-- CreateEnum
CREATE TYPE "StatusDespesa" AS ENUM ('A_CONFIRMAR', 'AGUARDANDO_CONCILIACAO', 'CONCILIADA');

-- CreateEnum
CREATE TYPE "OrigemDespesa" AS ENUM ('AUDIO', 'COMPROVANTE', 'TEXTO', 'MANUAL', 'EXTRATO');

-- AlterTable
ALTER TABLE "CentroCusto" ADD COLUMN     "centroGeralPadraoId" TEXT;

-- CreateTable
CREATE TABLE "CentroGeral" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CentroGeral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Despesa" (
    "id" TEXT NOT NULL,
    "data" TIMESTAMP(3) NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "fornecedor" TEXT NOT NULL,
    "descricao" TEXT,
    "categoriaId" TEXT,
    "centroGeralId" TEXT,
    "negocioId" TEXT,
    "status" "StatusDespesa" NOT NULL DEFAULT 'AGUARDANDO_CONCILIACAO',
    "origem" "OrigemDespesa" NOT NULL,
    "transacaoId" TEXT,
    "anexoBytes" BYTEA,
    "anexoMime" TEXT,
    "anexoNome" TEXT,
    "textoOriginal" TEXT,
    "extracao" JSONB,
    "telefoneOrigem" TEXT,
    "registradaPorId" TEXT NOT NULL,
    "confirmadaEm" TIMESTAMP(3),
    "conciliadaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Despesa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CentroGeral_nome_key" ON "CentroGeral"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Despesa_transacaoId_key" ON "Despesa"("transacaoId");

-- CreateIndex
CREATE INDEX "Despesa_status_data_idx" ON "Despesa"("status", "data");

-- CreateIndex
CREATE INDEX "Despesa_valorCentavos_idx" ON "Despesa"("valorCentavos");

-- CreateIndex
CREATE INDEX "Despesa_negocioId_idx" ON "Despesa"("negocioId");

-- AddForeignKey
ALTER TABLE "CentroCusto" ADD CONSTRAINT "CentroCusto_centroGeralPadraoId_fkey" FOREIGN KEY ("centroGeralPadraoId") REFERENCES "CentroGeral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_centroGeralId_fkey" FOREIGN KEY ("centroGeralId") REFERENCES "CentroGeral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_transacaoId_fkey" FOREIGN KEY ("transacaoId") REFERENCES "TransacaoBancaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Despesa" ADD CONSTRAINT "Despesa_registradaPorId_fkey" FOREIGN KEY ("registradaPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed: os 5 centros gerais (ids fixos pra os testes e o agente).
INSERT INTO "CentroGeral" ("id", "nome", "ordem") VALUES
  ('cg-veiculos', 'Veículos', 1),
  ('cg-producao', 'Produção', 2),
  ('cg-instalacao', 'Instalação', 3),
  ('cg-administrativo', 'Administrativo', 4),
  ('cg-marketing', 'Marketing', 5)
ON CONFLICT ("nome") DO NOTHING;

-- Seed: categorias que faltavam pras despesas do dia a dia.
INSERT INTO "CentroCusto" ("id", "nome", "tipo", "palavrasChave", "ordem")
SELECT 'cat-alimentacao', 'Alimentação', 'DESPESA',
       ARRAY['RESTAURANTE', 'LANCHONETE', 'LANCHERIA', 'PADARIA', 'CHURRASCARIA', 'PIZZARIA', 'ALMOCO', 'BAR'],
       COALESCE(MAX("ordem"), 0) + 1
FROM "CentroCusto"
ON CONFLICT ("nome") DO NOTHING;

INSERT INTO "CentroCusto" ("id", "nome", "tipo", "palavrasChave", "ordem")
SELECT 'cat-hospedagem', 'Hospedagem e viagens', 'DESPESA',
       ARRAY['HOTEL', 'POUSADA', 'HOSPEDAGEM', 'PASSAGEM', 'RODOVIARIA'],
       COALESCE(MAX("ordem"), 0) + 1
FROM "CentroCusto"
ON CONFLICT ("nome") DO NOTHING;

-- Centro geral sugerido por categoria (só onde ainda não tem).
UPDATE "CentroCusto" c SET "centroGeralPadraoId" = m.centro
FROM (VALUES
  ('Matéria-prima e insumos', 'cg-producao'),
  ('Folha de pagamento e encargos', 'cg-administrativo'),
  ('Pró-labore e retiradas', 'cg-administrativo'),
  ('Impostos e tributos', 'cg-administrativo'),
  ('Aluguel e estrutura', 'cg-administrativo'),
  ('Marketing e vendas', 'cg-marketing'),
  ('Frete e logística', 'cg-instalacao'),
  ('Veículos e combustível', 'cg-veiculos'),
  ('Tarifas bancárias e juros', 'cg-administrativo'),
  ('Serviços e sistemas', 'cg-administrativo'),
  ('Manutenção e equipamentos', 'cg-producao'),
  ('Outras despesas', 'cg-administrativo'),
  ('Alimentação', 'cg-administrativo'),
  ('Hospedagem e viagens', 'cg-instalacao')
) AS m(nome, centro)
WHERE c."nome" = m.nome AND c."centroGeralPadraoId" IS NULL;
