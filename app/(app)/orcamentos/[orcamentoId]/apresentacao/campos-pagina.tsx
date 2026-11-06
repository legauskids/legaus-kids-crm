"use client";

/* eslint-disable @next/next/no-img-element -- miniaturas das imagens da apresentação (rota com login), sem otimização do next/image */

import { useId } from "react";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  MAX_IMAGENS,
  type ImagemApresentacaoVM,
  textosAutomaticos,
  type OrcamentoParaApresentacao,
  type PaginaApresentacao,
} from "@/lib/utils/apresentacao";


export const urlImagem = (id: string) => `/api/imagem/apresentacao/${id}`;

function Campo({
  rotulo,
  valor,
  onChange,
  dica,
  max,
  linhas,
}: {
  rotulo: string;
  valor: string;
  onChange: (valor: string) => void;
  dica?: string;
  max: number;
  /** Com linhas = campo de várias linhas. */
  linhas?: number;
}) {
  const id = useId();
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo}
      </Label>
      {linhas ? (
        <Textarea id={id} value={valor} onChange={(e) => onChange(e.target.value)} placeholder={dica} maxLength={max} rows={linhas} />
      ) : (
        <Input id={id} value={valor} onChange={(e) => onChange(e.target.value)} placeholder={dica} maxLength={max} />
      )}
    </div>
  );
}

function Marcar({ rotulo, marcado, onChange }: { rotulo: string; marcado: boolean; onChange: (marcado: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={marcado} onCheckedChange={(v) => onChange(v === true)} />
      <Label htmlFor={id} className="font-normal">
        {rotulo}
      </Label>
    </div>
  );
}

/** Escolhe quais imagens enviadas entram na página (na ordem em que foram marcadas). */
function EscolherImagens({
  imagens,
  escolhidas,
  max,
  onChange,
  onEnviar,
  explicacao,
}: {
  imagens: ImagemApresentacaoVM[];
  escolhidas: string[];
  max: number;
  onChange: (ids: string[]) => void;
  onEnviar: () => void;
  explicacao: string;
}) {
  function alternar(id: string) {
    if (escolhidas.includes(id)) onChange(escolhidas.filter((e) => e !== id));
    else if (max === 1) onChange([id]);
    else if (escolhidas.length < max) onChange([...escolhidas, id]);
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{explicacao}</p>
      <div className="flex flex-wrap gap-2">
        {imagens.map((img) => {
          const ordem = escolhidas.indexOf(img.id);
          const cheio = ordem < 0 && max > 1 && escolhidas.length >= max;
          return (
            <button
              key={img.id}
              type="button"
              onClick={() => alternar(img.id)}
              disabled={cheio}
              title={img.nome ?? undefined}
              className={cn(
                "relative size-16 overflow-hidden rounded-md border-2 transition",
                ordem >= 0 ? "border-primary" : "border-transparent opacity-70 hover:opacity-100",
                cheio && "cursor-not-allowed opacity-30 hover:opacity-30",
              )}
            >
              <img src={urlImagem(img.id)} alt={img.nome ?? "Imagem enviada"} className="size-full object-cover" loading="lazy" />
              {ordem >= 0 && (
                <span className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                  {ordem + 1}
                </span>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={onEnviar}
          className="flex size-16 flex-col items-center justify-center gap-0.5 rounded-md border-2 border-dashed text-[11px] text-muted-foreground hover:bg-accent"
        >
          <Upload className="size-4" />
          Enviar
        </button>
      </div>
    </div>
  );
}

export function CamposPagina({
  pagina,
  orcamento,
  imagens,
  onChange,
  onEnviarImagens,
}: {
  pagina: PaginaApresentacao;
  orcamento: OrcamentoParaApresentacao;
  imagens: ImagemApresentacaoVM[];
  onChange: (pagina: PaginaApresentacao) => void;
  /** Abre a escolha de arquivos; as enviadas entram nesta página. */
  onEnviarImagens: () => void;
}) {
  const auto = textosAutomaticos(pagina, orcamento);
  const mudar = <P extends PaginaApresentacao>(p: P, campos: Partial<P>) => onChange({ ...p, ...campos });
  const seletorImagens = (explicacao: string) =>
    "imagens" in pagina && (
      <EscolherImagens
        imagens={imagens}
        escolhidas={pagina.imagens}
        max={MAX_IMAGENS[pagina.tipo] ?? 1}
        onChange={(ids) => onChange({ ...pagina, imagens: ids })}
        onEnviar={onEnviarImagens}
        explicacao={explicacao}
      />
    );

  switch (pagina.tipo) {
    case "capa":
      return (
        <div className="grid gap-3">
          <Campo rotulo="Título" valor={pagina.titulo} onChange={(titulo) => mudar(pagina, { titulo })} max={120} />
          <Campo rotulo="Subtítulo" valor={pagina.subtitulo} onChange={(subtitulo) => mudar(pagina, { subtitulo })} max={200} />
          <Campo rotulo="Linha da proposta (vazio = automático)" valor={pagina.proposta} onChange={(proposta) => mudar(pagina, { proposta })} dica={auto.proposta} max={160} />
        </div>
      );
    case "sobre":
      return (
        <div className="grid gap-3">
          <Campo rotulo="Quem somos" valor={pagina.quemSomos} onChange={(quemSomos) => mudar(pagina, { quemSomos })} max={500} linhas={3} />
          <Campo rotulo="O que fazemos" valor={pagina.oQueFazemos} onChange={(oQueFazemos) => mudar(pagina, { oQueFazemos })} max={500} linhas={3} />
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">Números (o que ficar sem número não aparece)</p>
            {pagina.numeros.map((n, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  aria-label={`Número ${i + 1}`}
                  value={n.valor}
                  placeholder="ex.: +300"
                  maxLength={12}
                  className="w-28"
                  onChange={(e) => mudar(pagina, { numeros: pagina.numeros.map((m, j) => (j === i ? { ...m, valor: e.target.value } : m)) })}
                />
                <Input
                  aria-label={`Descrição do número ${i + 1}`}
                  value={n.rotulo}
                  maxLength={40}
                  onChange={(e) => mudar(pagina, { numeros: pagina.numeros.map((m, j) => (j === i ? { ...m, rotulo: e.target.value } : m)) })}
                />
              </div>
            ))}
          </div>
        </div>
      );
    case "como-funciona":
      return (
        <div className="grid gap-3">
          <Campo rotulo="Título" valor={pagina.titulo} onChange={(titulo) => mudar(pagina, { titulo })} max={80} />
          <p className="text-xs text-muted-foreground">Etapas (sem título não aparece)</p>
          {pagina.etapas.map((e, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[10rem_1fr]">
              <Input
                aria-label={`Etapa ${i + 1}`}
                value={e.titulo}
                maxLength={40}
                placeholder={`Etapa ${i + 1}`}
                onChange={(ev) => mudar(pagina, { etapas: pagina.etapas.map((m, j) => (j === i ? { ...m, titulo: ev.target.value } : m)) })}
              />
              <Input
                aria-label={`Texto da etapa ${i + 1}`}
                value={e.texto}
                maxLength={200}
                onChange={(ev) => mudar(pagina, { etapas: pagina.etapas.map((m, j) => (j === i ? { ...m, texto: ev.target.value } : m)) })}
              />
            </div>
          ))}
          {pagina.etapas.length < 6 && (
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => mudar(pagina, { etapas: [...pagina.etapas, { titulo: "", texto: "" }] })}>
              <Plus className="size-3.5" />
              Acrescentar etapa
            </Button>
          )}
        </div>
      );
    case "projeto":
      return (
        <div className="grid gap-3">
          {seletorImagens("Fotos da obra (até 3 — a primeira fica grande).")}
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Cliente" valor={pagina.cliente} onChange={(cliente) => mudar(pagina, { cliente })} max={80} dica="ex.: Colégio Dom Bosco" />
            <Campo rotulo="Cidade/UF · Ano" valor={pagina.local} onChange={(local) => mudar(pagina, { local })} max={80} dica="ex.: Santa Rosa/RS · 2025" />
          </div>
          <Campo rotulo="O que entregamos" valor={pagina.entregamos} onChange={(entregamos) => mudar(pagina, { entregamos })} max={300} linhas={2} />
          <Campo rotulo="Ambiente" valor={pagina.ambiente} onChange={(ambiente) => mudar(pagina, { ambiente })} max={160} dica="ex.: Externo, 120 m²" />
          <Campo rotulo="Depoimento do cliente (se houver)" valor={pagina.depoimento} onChange={(depoimento) => mudar(pagina, { depoimento })} max={400} linhas={2} />
        </div>
      );
    case "modelo":
      return (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Título" valor={pagina.titulo} onChange={(titulo) => mudar(pagina, { titulo })} max={80} />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Item do orçamento</Label>
              <Select value={String(pagina.item)} onValueChange={(v) => mudar(pagina, { item: Number(v) })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">Nenhum (preencher à mão)</SelectItem>
                  {orcamento.itens.map((item, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {item.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {seletorImagens("Imagem (sem escolher, vai a foto do produto do item).")}
          <Campo rotulo="Modelo" valor={pagina.modelo} onChange={(modelo) => mudar(pagina, { modelo })} dica={auto.modelo} max={120} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Dimensões" valor={pagina.dimensoes} onChange={(dimensoes) => mudar(pagina, { dimensoes })} dica="ex.: 6,0 x 4,5 m" max={100} />
            <Campo rotulo="Prazo" valor={pagina.prazo} onChange={(prazo) => mudar(pagina, { prazo })} dica="ex.: 30 dias" max={80} />
          </div>
          <Campo rotulo="Itens inclusos" valor={pagina.itens} onChange={(itens) => mudar(pagina, { itens })} dica={auto.itens || "ex.: escorregador, balanço duplo, torre"} max={600} linhas={3} />
          <div className="grid items-end gap-3 sm:grid-cols-2">
            <Campo rotulo="Investimento (vazio = valor do orçamento)" valor={pagina.investimento} onChange={(investimento) => mudar(pagina, { investimento })} dica={auto.investimento} max={60} />
            <Marcar rotulo="Mostrar o investimento nesta página" marcado={pagina.mostrarInvestimento} onChange={(mostrarInvestimento) => mudar(pagina, { mostrarInvestimento })} />
          </div>
          <p className="text-xs text-muted-foreground">Campo vazio com texto cinza usa o que está no orçamento; Dimensões e Prazo vazios não aparecem.</p>
        </div>
      );
    case "investimento":
      return (
        <div className="grid gap-3">
          <p className="text-xs text-muted-foreground">Itens, valores, desconto, total e validade vêm do orçamento, junto com as observações dele.</p>
          <Campo rotulo="Título" valor={pagina.titulo} onChange={(titulo) => mudar(pagina, { titulo })} max={80} />
          <Campo rotulo="Condições a mais (opcional)" valor={pagina.texto} onChange={(texto) => mudar(pagina, { texto })} max={600} linhas={3} dica="ex.: Pagamento em 3x no boleto." />
        </div>
      );
    case "galeria":
      return (
        <div className="grid gap-3">
          {seletorImagens("Imagens (até 4).")}
          <Campo rotulo="Título" valor={pagina.titulo} onChange={(titulo) => mudar(pagina, { titulo })} max={80} />
          <Campo rotulo="Texto (opcional)" valor={pagina.texto} onChange={(texto) => mudar(pagina, { texto })} max={300} linhas={2} />
          <Marcar rotulo="Mostrar as imagens inteiras, sem cortar (bom pra planta e projeto 3D)" marcado={pagina.inteira} onChange={(inteira) => mudar(pagina, { inteira })} />
        </div>
      );
    case "informacoes":
      return (
        <div className="grid gap-3">
          <Campo rotulo="Título" valor={pagina.titulo} onChange={(titulo) => mudar(pagina, { titulo })} max={80} />
          <Campo rotulo="Texto" valor={pagina.texto} onChange={(texto) => mudar(pagina, { texto })} max={1500} linhas={6} dica="ex.: garantia, manutenção, normas, forma de pagamento…" />
          {seletorImagens("Imagem ao lado do texto (opcional).")}
        </div>
      );
    case "contato":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo rotulo="Título" valor={pagina.titulo} onChange={(titulo) => mudar(pagina, { titulo })} max={80} />
          <Campo rotulo="Telefone" valor={pagina.telefone} onChange={(telefone) => mudar(pagina, { telefone })} max={40} />
          <Campo rotulo="E-mail" valor={pagina.email} onChange={(email) => mudar(pagina, { email })} max={80} />
          <Campo rotulo="Instagram" valor={pagina.instagram} onChange={(instagram) => mudar(pagina, { instagram })} max={60} />
          <div className="sm:col-span-2">
            <Campo rotulo="Endereço" valor={pagina.endereco} onChange={(endereco) => mudar(pagina, { endereco })} max={160} linhas={2} />
          </div>
        </div>
      );
    default:
      return <p className="text-sm text-muted-foreground">Página fixa, igual à da apresentação modelo. Só dá pra escolher se vai ou não.</p>;
  }
}

