"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { concluirPostagemAction, criarPostagemAction, enviarFotoAction } from "@/app/(app)/marketing/actions";
import { ROTULO_CONTEUDO, type ConteudoPostagem } from "@/lib/utils/postagem-arte";

type NegocioVM = { id: string; titulo: string; cliente: string | null; cidade: string | null };

const CONTEUDOS = Object.keys(ROTULO_CONTEUDO) as ConteudoPostagem[];
const SAIDA: Record<ConteudoPostagem, string> = {
  ENTREGA: "Carrossel 4:5 (capa + slides com 2 fotos) e 1 story",
  INSTALACAO: "Só story",
  TBT: "Só story",
  PRODUTO: "Feed 4:5 e story, com o preço no selo",
  BENEFICIOS: "Carrossel: capa + 1 slide por argumento",
};
/** Capa + 9 slides de 2 fotos = o máximo de um carrossel. */
const MAX_FOTOS = 19;
const LIMITE_ENVIO = 4 * 1024 * 1024;

/** Reduz no próprio aparelho pra 2160 px (JPEG) antes de mandar — foto de celular passa do limite de envio. */
async function reduzir(arquivo: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(arquivo, { imageOrientation: "from-image" });
    const escala = Math.min(1, 2160 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.9));
    if (blob) return blob;
  } catch {
    // Formato que o navegador não abre (ex.: HEIC no computador): manda como veio.
  }
  return arquivo;
}

export function NovoPostForm({ negocios }: { negocios: NegocioVM[] }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [conteudo, setConteudo] = useState<ConteudoPostagem>("ENTREGA");
  const [produto, setProduto] = useState("Playground");
  const [negocioId, setNegocioId] = useState("");
  const [cliente, setCliente] = useState("");
  const [cidade, setCidade] = useState("");
  const [preco, setPreco] = useState("");
  const [argumentos, setArgumentos] = useState("");
  const [contexto, setContexto] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const previas = useMemo(() => fotos.map((f) => URL.createObjectURL(f)), [fotos]);
  useEffect(() => () => previas.forEach((u) => URL.revokeObjectURL(u)), [previas]);

  function escolherNegocio(id: string) {
    setNegocioId(id);
    const n = negocios.find((x) => x.id === id);
    if (n?.cliente && !cliente) setCliente(n.cliente);
    if (n?.cidade && !cidade) setCidade(n.cidade);
  }

  function adicionar(lista: FileList | null) {
    if (!lista) return;
    const novas = [...fotos, ...Array.from(lista).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name))];
    setFotos(novas.slice(0, MAX_FOTOS));
    if (novas.length > MAX_FOTOS) setErro(`No máximo ${MAX_FOTOS} fotos por post — fiquei com as primeiras.`);
  }

  async function criar() {
    setErro(null);
    if (fotos.length === 0) return setErro("Escolha as fotos da obra.");
    setProgresso("Criando o post...");
    const r = await criarPostagemAction({ conteudo, produto, cliente, cidade, negocioId, preco, argumentos, contexto });
    if (!r.ok) {
      setProgresso(null);
      return setErro(r.error);
    }
    for (let i = 0; i < fotos.length; i++) {
      setProgresso(`Enviando foto ${i + 1} de ${fotos.length}...`);
      const reduzida = await reduzir(fotos[i]);
      if (reduzida.size > LIMITE_ENVIO) {
        setProgresso(null);
        return setErro(`A foto ${i + 1} é grande demais e o navegador não conseguiu reduzir. Tire um print dela ou mande em JPG.`);
      }
      const fd = new FormData();
      fd.append("foto", reduzida, `foto-${i + 1}.jpg`);
      const envio = await enviarFotoAction(r.id, fd);
      if (!envio.ok) {
        setProgresso(null);
        return setErro(`Foto ${i + 1}: ${envio.error}`);
      }
    }
    setProgresso("Montando as artes e escrevendo a legenda...");
    const fim = await concluirPostagemAction(r.id);
    if (!fim.ok) {
      setProgresso(null);
      return setErro(fim.error);
    }
    router.push(`/marketing/${r.id}`);
  }

  const ocupado = progresso !== null;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 p-4 sm:p-6">
      <div className="space-y-2">
        <Label>Tipo de post</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CONTEUDOS.map((c) => (
            <Button key={c} type="button" variant={conteudo === c ? "default" : "outline"} className="h-auto whitespace-normal py-2" onClick={() => setConteudo(c)} disabled={ocupado}>
              {ROTULO_CONTEUDO[c]}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Sai: {SAIDA[conteudo]}.</p>
      </div>

      {conteudo !== "BENEFICIOS" && conteudo !== "INSTALACAO" && (
        <div className="space-y-1.5">
          <Label htmlFor="produto">O que é (vai no título)</Label>
          <Input id="produto" value={produto} onChange={(e) => setProduto(e.target.value)} placeholder="Playground, Gangorra, Casinha..." disabled={ocupado} />
        </div>
      )}

      {conteudo === "PRODUTO" && (
        <div className="space-y-1.5">
          <Label htmlFor="preco">Preço (vai no selo laranja)</Label>
          <Input id="preco" value={preco} onChange={(e) => setPreco(e.target.value)} placeholder="R$ 18.893,04" disabled={ocupado} />
        </div>
      )}

      {conteudo === "BENEFICIOS" && (
        <div className="space-y-1.5">
          <Label htmlFor="argumentos">Argumentos — um por linha, cada um vira um slide</Label>
          <Textarea id="argumentos" value={argumentos} onChange={(e) => setArgumentos(e.target.value)} rows={4} placeholder={"Fabricação própria\nGarantia de 5 anos\nInstalação em todo o RS"} disabled={ocupado} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="negocio">Negócio (opcional)</Label>
          <select
            id="negocio"
            value={negocioId}
            onChange={(e) => escolherNegocio(e.target.value)}
            disabled={ocupado}
            className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          >
            <option value="">Sem negócio</option>
            {negocios.map((n) => (
              <option key={n.id} value={n.id}>
                {n.titulo}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cliente">Cliente (opcional)</Label>
          <Input id="cliente" value={cliente} onChange={(e) => setCliente(e.target.value)} disabled={ocupado} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cidade">Cidade (opcional)</Label>
          <Input id="cidade" value={cidade} onChange={(e) => setCidade(e.target.value)} disabled={ocupado} />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">Cliente e cidade só aparecem na legenda se você preencher — a IA não inventa.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="contexto">Observações pra legenda (opcional)</Label>
        <Textarea id="contexto" value={contexto} onChange={(e) => setContexto(e.target.value)} rows={2} placeholder="Ex.: torre com escorregador e tubo, balanço duplo" disabled={ocupado} />
      </div>

      <div className="space-y-2">
        <Label>Fotos ({fotos.length})</Label>
        <input ref={entrada} type="file" accept="image/*" multiple className="hidden" onChange={(e) => adicionar(e.target.files)} />
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {previas.map((url, i) => (
            <div key={url} className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Foto ${i + 1}`} className="size-full object-cover" />
              <span className="absolute top-1 left-1 rounded bg-black/60 px-1.5 text-xs text-white">{i + 1}</span>
              {!ocupado && (
                <button
                  type="button"
                  aria-label="Tirar foto"
                  className="absolute top-1 right-1 rounded-full bg-black/60 p-0.5 text-white"
                  onClick={() => setFotos(fotos.filter((_, j) => j !== i))}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
          {fotos.length < MAX_FOTOS && !ocupado && (
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs text-muted-foreground hover:bg-muted"
            >
              <ImagePlus className="size-5" />
              Adicionar
            </button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">A primeira foto em pé vira a capa e o story; as deitadas vão de 2 em 2 nos slides.</p>
      </div>

      {erro && <p className="text-sm text-destructive">{erro}</p>}

      <Button type="button" className="w-full" size="lg" onClick={criar} disabled={ocupado}>
        {ocupado ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            {progresso}
          </>
        ) : (
          "Criar as artes"
        )}
      </Button>
    </div>
  );
}
