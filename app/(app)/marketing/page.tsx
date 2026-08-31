import Link from "next/link";
import { cn } from "@/lib/utils";
import { requireModulo } from "@/lib/auth/guards";
import { listarPostagens, listarModelos } from "@/lib/server/marketing";
import { NovaPostagemForm } from "@/app/(app)/marketing/nova-postagem-form";
import { PostagensLista } from "@/app/(app)/marketing/postagens-lista";
import { ModelosTab } from "@/app/(app)/marketing/modelos-tab";

const ABAS = [
  { chave: "nova", label: "Nova postagem" },
  { chave: "postagens", label: "Postagens" },
  { chave: "modelos", label: "Modelos" },
] as const;

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; novos?: string }>;
}) {
  await requireModulo("marketing");
  const { aba, novos } = await searchParams;
  const abaAtiva = ABAS.some((a) => a.chave === aba) ? aba! : "nova";
  const idsNovos = novos ? novos.split(",").filter(Boolean) : undefined;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Marketing</h1>
        <p className="text-sm text-muted-foreground">
          Envie fotos de projetos e instalações — a IA enquadra dentro do padrão visual da Legaus Kids e sugere a legenda. Nada vai pro
          ar sem sua aprovação.
        </p>
        <div className="mt-3 flex gap-1">
          {ABAS.map((a) => (
            <Link
              key={a.chave}
              href={a.chave === "nova" ? "/marketing" : `/marketing?aba=${a.chave}`}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                abaAtiva === a.chave ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
              )}
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>

      {abaAtiva === "nova" && <NovaPostagemForm />}
      {abaAtiva === "postagens" && <PostagensDataTab idsNovos={idsNovos} />}
      {abaAtiva === "modelos" && <ModelosDataTab />}
    </div>
  );
}

async function PostagensDataTab({ idsNovos }: { idsNovos?: string[] }) {
  const postagens = await listarPostagens(undefined, idsNovos);
  return (
    <PostagensLista
      filtrandoNovos={Boolean(idsNovos && idsNovos.length > 0)}
      postagens={postagens.map((p) => ({
        id: p.id,
        numero: p.numero,
        tipo: p.tipo,
        status: p.status,
        legenda: p.legenda,
        contexto: p.contexto,
        headline: p.headline,
        criadoEm: p.criadoEm.toISOString(),
        criadoPorNome: p.criadoPor.nome,
        imagens: p.imagens.map((img) => ({
          id: img.id,
          ordem: img.ordem,
          variantes: img.variantes.map((v) => ({ id: v.id, layout: v.layout, escolhida: v.escolhida })),
        })),
      }))}
    />
  );
}

async function ModelosDataTab() {
  const modelos = await listarModelos();
  return (
    <ModelosTab
      modelos={modelos.map((m) => ({ id: m.id, titulo: m.titulo, tipo: m.tipo, legendaModelo: m.legendaModelo }))}
    />
  );
}
