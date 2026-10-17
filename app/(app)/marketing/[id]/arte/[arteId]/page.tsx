import { notFound } from "next/navigation";
import { requireModulo } from "@/lib/auth/guards";
import { buscarArteParaEditor } from "@/lib/server/marketing";
import { EditorArte } from "@/app/(app)/marketing/[id]/arte/[arteId]/editor-arte";

export default async function EditorArtePage({ params }: { params: Promise<{ id: string; arteId: string }> }) {
  await requireModulo("marketing");
  const { id, arteId } = await params;
  const arte = await buscarArteParaEditor(arteId);
  if (!arte || arte.postagem.id !== id) notFound();

  const artes = arte.postagem.artes;
  const posicao = artes.findIndex((a) => a.id === arte.id);
  const feed = artes.filter((a) => a.formato === "FEED");
  const rotulo =
    arte.formato === "STORY" ? "Story" : feed[0]?.id === arte.id ? "1 · Capa" : `${feed.findIndex((a) => a.id === arte.id) + 1} · Slide`;

  return (
    <EditorArte
      key={`${arte.id}-${arte.atualizadoEm.getTime()}`}
      postId={id}
      numero={arte.postagem.numero}
      arteId={arte.id}
      rotulo={rotulo}
      formato={arte.formato}
      dadosIniciais={arte.dados}
      fotosPost={arte.postagem.imagens.map((i) => ({ id: i.id, largura: i.largura ?? 1, altura: i.altura ?? 1 }))}
      versao={arte.atualizadoEm.getTime()}
      aprovado={arte.postagem.status === "APROVADO"}
      anteriorId={artes[posicao - 1]?.id ?? null}
      proximaId={artes[posicao + 1]?.id ?? null}
    />
  );
}
