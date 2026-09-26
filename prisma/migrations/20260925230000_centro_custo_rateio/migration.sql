-- Centros de custo + rateio de lançamentos do extrato entre projetos
-- (Negocio) e centros de custo. Pedido de 2026-09-25. Só adiciona.

-- CreateEnum
CREATE TYPE "TipoCentroCusto" AS ENUM ('DESPESA', 'RECEITA');

-- CreateTable
CREATE TABLE "CentroCusto" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipo" "TipoCentroCusto" NOT NULL DEFAULT 'DESPESA',
    "palavrasChave" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CentroCusto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateioTransacao" (
    "id" TEXT NOT NULL,
    "transacaoId" TEXT NOT NULL,
    "valorCentavos" INTEGER NOT NULL,
    "negocioId" TEXT,
    "centroCustoId" TEXT,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RateioTransacao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CentroCusto_nome_key" ON "CentroCusto"("nome");

-- CreateIndex
CREATE INDEX "RateioTransacao_transacaoId_idx" ON "RateioTransacao"("transacaoId");

-- CreateIndex
CREATE INDEX "RateioTransacao_negocioId_idx" ON "RateioTransacao"("negocioId");

-- CreateIndex
CREATE INDEX "RateioTransacao_centroCustoId_idx" ON "RateioTransacao"("centroCustoId");

-- AddForeignKey
ALTER TABLE "RateioTransacao" ADD CONSTRAINT "RateioTransacao_transacaoId_fkey" FOREIGN KEY ("transacaoId") REFERENCES "TransacaoBancaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateioTransacao" ADD CONSTRAINT "RateioTransacao_negocioId_fkey" FOREIGN KEY ("negocioId") REFERENCES "Negocio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateioTransacao" ADD CONSTRAINT "RateioTransacao_centroCustoId_fkey" FOREIGN KEY ("centroCustoId") REFERENCES "CentroCusto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Centros de custo padrão (editáveis em Cadastros → Centros de custo).
-- Palavras-chave em MAIÚSCULAS e sem acento: casam com a descrição do
-- extrato como palavra inteira e só geram SUGESTÃO na conciliação.
INSERT INTO "CentroCusto" ("id", "nome", "tipo", "palavrasChave", "ordem") VALUES
  (gen_random_uuid()::text, 'Matéria-prima e insumos', 'DESPESA', ARRAY[]::TEXT[], 1),
  (gen_random_uuid()::text, 'Folha de pagamento e encargos', 'DESPESA', ARRAY['SALARIO','FOLHA','FGTS','INSS','FERIAS','RESCISAO']::TEXT[], 2),
  (gen_random_uuid()::text, 'Pró-labore e retiradas', 'DESPESA', ARRAY['PRO LABORE','PROLABORE','RETIRADA']::TEXT[], 3),
  (gen_random_uuid()::text, 'Impostos e tributos', 'DESPESA', ARRAY['DAS','SIMPLES NACIONAL','DARF','ICMS','ISS','IPTU','IPVA','IMPOSTO','TRIBUTO']::TEXT[], 4),
  (gen_random_uuid()::text, 'Aluguel e estrutura', 'DESPESA', ARRAY['ALUGUEL','ENERGIA','RGE','CEEE','CORSAN','CONDOMINIO']::TEXT[], 5),
  (gen_random_uuid()::text, 'Marketing e vendas', 'DESPESA', ARRAY['GOOGLE','FACEBK','FACEBOOK','META','INSTAGRAM','ANUNCIO']::TEXT[], 6),
  (gen_random_uuid()::text, 'Frete e logística', 'DESPESA', ARRAY['FRETE','TRANSPORTE','TRANSPORTADORA','CORREIOS']::TEXT[], 7),
  (gen_random_uuid()::text, 'Veículos e combustível', 'DESPESA', ARRAY['POSTO','COMBUSTIVEL','GASOLINA','DIESEL','PEDAGIO']::TEXT[], 8),
  (gen_random_uuid()::text, 'Tarifas bancárias e juros', 'DESPESA', ARRAY['TARIFA','IOF','JUROS','CESTA','ANUIDADE']::TEXT[], 9),
  (gen_random_uuid()::text, 'Serviços e sistemas', 'DESPESA', ARRAY['CONTABILIDADE','INTERNET','TELEFONE','SOFTWARE','ASSINATURA','ANTHROPIC','OPENAI','VERCEL','NEON']::TEXT[], 10),
  (gen_random_uuid()::text, 'Manutenção e equipamentos', 'DESPESA', ARRAY['MANUTENCAO','FERRAMENTA','FERRAMENTAS']::TEXT[], 11),
  (gen_random_uuid()::text, 'Outras despesas', 'DESPESA', ARRAY[]::TEXT[], 12),
  (gen_random_uuid()::text, 'Outras receitas', 'RECEITA', ARRAY['RENDIMENTO','RENDIMENTOS','ESTORNO']::TEXT[], 13);

-- Lançamentos já conciliados com um negócio viram rateio de 100% pra ele
-- (projeto), pra o dashboard financeiro contar tudo pelo mesmo caminho.
INSERT INTO "RateioTransacao" ("id", "transacaoId", "valorCentavos", "negocioId")
SELECT gen_random_uuid()::text, t."id", t."valorCentavos", t."negocioId"
FROM "TransacaoBancaria" t
WHERE t."status" = 'CONCILIADA' AND t."negocioId" IS NOT NULL;
