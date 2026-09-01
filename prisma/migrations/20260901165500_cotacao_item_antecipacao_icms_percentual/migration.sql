-- Antecipação ICMS passa a ser um percentual calculado sobre o "Total" do
-- item (igual o Imposto %), em vez de um valor fixo em R$. Os valores em
-- reais já digitados não convertem de forma confiável pra percentual, então
-- a coluna é recriada zerada — poucos itens reais tinham valor aqui ainda.

-- AlterTable
ALTER TABLE "CotacaoItem" DROP COLUMN "antecipacaoIcmsCentavos",
ADD COLUMN "antecipacaoIcmsPercentual" DOUBLE PRECISION NOT NULL DEFAULT 0;
