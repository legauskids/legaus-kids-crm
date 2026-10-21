import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireModulo } from "@/lib/auth/guards";
import { buscarPostagem, SO_STORY, textosDaPostagem } from "@/lib/server/marketing";
import { historicoDoAssistente } from "@/lib/server/marketing-agente";
import { resumoDaConexao } from "@/lib/server/meta";
import { PERMISSAO_FACEBOOK, type PublicacaoMeta } from "@/lib/utils/meta-publicacao";
import { Badge } from "@/components/ui/badge";
import { ROTULO_CONTEUDO } from "@/lib/utils/postagem-arte";
import { ROTULO_STATUS_POSTAGEM, VARIANTE_STATUS_POSTAGEM } from "@/app/(app)/marketing/rotulos";
import { PostDetalhe } from "@/app/(app)/marketing/[id]/post-detalhe";

// Refazer as artes, pedir outra legenda à IA e conversar com o assistente
// (que olha as artes e ajusta) levam alguns segundos; "Publicar agora"
// publica em segundo plano (after) e pode levar até uns minutos na Meta.
export const maxDuration = 300;

/** Muda quando a legenda, o status, os textos ou alguma arte mudam. */
function versaoDoPost(p: { legenda: string | null; status: string; textos: unknown; agendadaPara: Date | null; artes: { atualizadoEm: Date }[] }): string {
  const texto = `${p.legenda ?? ""}|${p.status}|${p.agendadaPara?.getTime() ?? ""}|${JSON.stringify(p.textos)}|${p.artes.map((a) => a.atualizadoEm.getTime()).join(".")}`;
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = (hash * 31 + texto.charCodeAt(i)) | 0;
  return String(hash);
}

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  await requireModulo("marketing");
  const { id } = await params;
  const [p, historico, conexao] = await Promise.all([buscarPostagem(id), historicoDoAssistente(id), resumoDaConexao()]);
  if (!p) notFound();

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="border-b bg-card px-4 py-3.5 shadow-xs sm:px-6">
        <Link href="/marketing" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" />
          Marketing
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            Post #{p.numero} · {ROTULO_CONTEUDO[p.conteudo]}
          </h1>
          <Badge variant={VARIANTE_STATUS_POSTAGEM[p.status]}>{ROTULO_STATUS_POSTAGEM[p.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {[p.produto, p.cliente, p.cidade, p.negocio?.titulo].filter(Boolean).join(" · ") || "Sem cliente informado"} · criado por {p.criadoPor.nome} em{" "}
          {p.criadoEm.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}
        </p>
      </div>
      <PostDetalhe
        // O assistente pode trocar a legenda, os textos e as artes: quando muda algo, a tela recomeça com o que está no banco.
        key={versaoDoPost(p)}
        historico={historico.flatMap((h) => [
          { id: `${h.id}-p`, de: "voce" as const, texto: h.textoComando },
          ...(h.resposta ? [{ id: `${h.id}-r`, de: "claude" as const, texto: h.resposta }] : []),
        ])}
        post={{
          id: p.id,
          numero: p.numero,
          conteudo: p.conteudo,
          status: p.status,
          legenda: p.legenda ?? "",
          temLegenda: !SO_STORY.includes(p.conteudo),
          textos: textosDaPostagem(p),
          artes: p.artes.map((a) => ({ id: a.id, ordem: a.ordem, formato: a.formato, versao: a.atualizadoEm.getTime() })),
          publicacao: {
            status: p.status,
            agendadaPara: p.agendadaPara?.toISOString() ?? null,
            publicadaEm: p.publicadaEm?.toISOString() ?? null,
            publicarNoInstagram: p.publicarNoInstagram,
            publicarNoFacebook: p.publicarNoFacebook,
            publicacao: (p.publicacao as PublicacaoMeta | null) ?? null,
            erroPublicacao: p.erroPublicacao,
          },
        }}
        conexao={
          conexao
            ? {
                paginaNome: conexao.paginaNome,
                instagramUsuario: conexao.instagramUsuario,
                temInstagram: Boolean(conexao.instagramId),
                podeFacebook: conexao.permissoes.includes(PERMISSAO_FACEBOOK),
                erro: conexao.erro,
              }
            : null
        }
      />
    </div>
  );
}
