import { cn } from "@/lib/utils";
import { separarContrato } from "@/lib/utils/contrato";

// O texto do contrato como sai no PDF (título, seções em negrito, parágrafos
// justificados) — pra conferir na tela sem abrir o arquivo.
export function PreviaContrato({ conteudo, numero, className }: { conteudo: string; numero: string; className?: string }) {
  const { titulo, blocos } = separarContrato(conteudo);
  return (
    <article className={cn("mx-auto w-full max-w-[210mm] rounded-lg border bg-white px-6 py-8 text-[15px] leading-7 text-neutral-900 shadow-sm sm:px-12", className)}>
      <h2 className="text-center text-lg font-bold">{titulo}</h2>
      <p className="mb-6 text-center text-xs text-neutral-500">Contrato nº {numero}</p>
      {blocos.map((bloco, i) =>
        bloco.tipo === "secao" ? (
          <h3 key={i} className="mt-5 mb-2 font-bold">
            {bloco.texto}
          </h3>
        ) : (
          <p key={i} className="mb-3 text-justify whitespace-pre-line">
            {bloco.texto}
          </p>
        ),
      )}
    </article>
  );
}
