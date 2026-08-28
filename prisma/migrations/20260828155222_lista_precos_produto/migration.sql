-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "custoCompraCentavos" INTEGER,
ADD COLUMN     "freteCustoCentavos" INTEGER,
ADD COLUMN     "ipiCustoCentavos" INTEGER,
ADD COLUMN     "outrosCustoCentavos" INTEGER,
ADD COLUMN     "quantidadeReferencia" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "markupPercentual" DOUBLE PRECISION,
ADD COLUMN     "impostoPercentual" DOUBLE PRECISION,
ADD COLUMN     "instalacaoCentavos" INTEGER;
