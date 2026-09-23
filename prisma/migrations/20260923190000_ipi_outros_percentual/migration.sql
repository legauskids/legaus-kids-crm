-- IPI e Outros custos passam de valor fixo em centavos (R$) para
-- percentual sobre o custo de compra, igual Markup/Imposto já eram.
-- Dado antigo não tem conversão válida (era R$ fixo, não %), por isso
-- as colunas são dropadas e recriadas em branco -- confirmado com o
-- Marcos em 2026-09-23 que os poucos valores existentes (1 produto com
-- IPI=R$0 e 21 produtos "Linha Pet" com Outros=R$3,00, testes recentes)
-- podem ser perdidos.
ALTER TABLE "Produto" DROP COLUMN "ipiCustoCentavos";
ALTER TABLE "Produto" DROP COLUMN "outrosCustoCentavos";
ALTER TABLE "Produto" ADD COLUMN "ipiPercentual" DOUBLE PRECISION;
ALTER TABLE "Produto" ADD COLUMN "outrosPercentual" DOUBLE PRECISION;
