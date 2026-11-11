/* eslint-disable @next/next/no-img-element -- imagens anexas e logo, do jeito que saem no PDF */

import { cn } from "@/lib/utils";
import {
  AREA_UTIL,
  FOLHA,
  paginarAnexos,
  urlAnexo,
  type AnexoOrcamentoVM,
  type CaixaAnexo,
} from "@/lib/utils/anexos-orcamento";

// Folha de imagens anexas em HTML, nas mesmas medidas do PDF
// (lib/server/pdf/orcamento-pdf.tsx): tudo em pontos convertidos pra cqw da
// área útil, então a prévia pequena do editor e a folha grande da impressão
// são a mesma folha em escalas diferentes. Sem hooks: serve na tela do
// editor (client) e nas páginas de impressão e do link público (server).

const pt = (valor: number) => `${(valor * 100) / AREA_UTIL.largura}cqw`;
const MARGEM_X = `${(FOLHA.margem * 100) / FOLHA.largura}%`;
const MARGEM_Y = `${(FOLHA.margem * 100) / FOLHA.altura}%`;

export function FolhaAnexos({
  folha,
  numero,
  src,
  selecionado,
  onEscolher,
  className,
}: {
  folha: CaixaAnexo[];
  numero: number;
  src: (id: string) => string;
  selecionado?: string | null;
  onEscolher?: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative aspect-[595.28/841.89] w-full bg-white text-neutral-900 shadow-sm ring-1 ring-black/5 print:aspect-auto print:shadow-none print:ring-0", className)}>
      <div
        className="@container absolute print:relative print:inset-auto! print:mx-auto print:aspect-[531.28/777.89] print:w-[175mm]"
        style={{ left: MARGEM_X, right: MARGEM_X, top: MARGEM_Y, bottom: MARGEM_Y }}
      >
        <div
          className="flex items-center justify-between border-[#00A99D]"
          style={{ height: pt(FOLHA.cabecalho - 10), borderBottomWidth: pt(2), paddingBottom: pt(6) }}
        >
          <img src="/legaus-logo.png" alt="Legaus Kids" className="object-contain object-left" style={{ width: pt(70), height: pt(30) }} />
          <div className="text-right leading-tight">
            <p className="font-bold" style={{ fontSize: pt(11) }}>Imagens anexas</p>
            <p className="text-neutral-500" style={{ fontSize: pt(8), marginTop: pt(2) }}>
              Orçamento nº {String(numero).padStart(4, "0")}
            </p>
          </div>
        </div>
        {folha.map((c) => {
          const Caixa = onEscolher ? "button" : "div";
          return (
            <Caixa
              key={c.id}
              {...(onEscolher ? { type: "button" as const, onClick: () => onEscolher(c.id), title: c.legenda ?? "Imagem anexa" } : {})}
              className="absolute block p-0 text-left"
              style={{ left: pt(c.x), top: pt(FOLHA.cabecalho + c.y), width: pt(c.largura) }}
            >
              <img
                src={src(c.id)}
                alt={c.legenda ?? ""}
                className={cn("block w-full object-cover", selecionado === c.id && "outline-2 outline-offset-1 outline-primary")}
                style={{ height: pt(c.altura), borderRadius: pt(3) }}
              />
              {c.legenda && (
                <span className="block truncate text-center leading-none text-neutral-500" style={{ height: pt(FOLHA.legenda), paddingTop: pt(4), fontSize: pt(8) }}>
                  {c.legenda}
                </span>
              )}
            </Caixa>
          );
        })}
      </div>
    </div>
  );
}

/** As folhas de anexos depois do documento do orçamento (impressão e link público). */
export function AnexosDoOrcamento({ anexos, numero, tokenPublico }: { anexos: AnexoOrcamentoVM[]; numero: number; tokenPublico?: string | null }) {
  const folhas = paginarAnexos(anexos);
  if (folhas.length === 0) return null;
  return (
    <div className="mx-auto mt-6 max-w-3xl space-y-6 print:mt-0 print:max-w-none print:space-y-0">
      {folhas.map((folha, i) => (
        <FolhaAnexos key={i} folha={folha} numero={numero} src={(id) => urlAnexo(id, tokenPublico)} className="break-before-page" />
      ))}
    </div>
  );
}
