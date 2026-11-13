"use client";

import { useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { buscarCnpjAction } from "@/app/(app)/cadastros/actions";
import { formatarDocumento } from "@/lib/utils/busca-cliente";
import {
  dadosContratoSchema,
  errosPorCampo,
  formatarValorEmReais,
  lerValorEmReais,
  nomeProprio,
  type CampoContrato,
  type DadosContrato,
  type ErrosContrato,
} from "@/lib/utils/contrato";

// Formulário do contrato (pedido de 2026-11-12): pede cliente, produto,
// pagamento e prazos antes de gerar o rascunho. O mesmo no Ganho do negócio,
// no "Gerar contrato" do Financeiro e na tela do contrato.

export type RespostaFormularioContrato = { error?: string; campos?: ErrosContrato } | void;

const PAGAMENTOS_RAPIDOS = [
  "à vista, via PIX, na assinatura do contrato",
  "50% de entrada na assinatura do contrato e 50% na entrega",
  "entrada de R$ ... na assinatura do contrato e o saldo na entrega",
];

const ERRO_GERAL = "Faltam dados ou tem dado errado — confira os campos marcados.";

function Campo({ id, rotulo, erro, dica, className, children }: { id: string; rotulo: string; erro?: string; dica?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro ? <p className="text-xs text-destructive">{erro}</p> : dica ? <p className="text-xs text-muted-foreground">{dica}</p> : null}
    </div>
  );
}

function Escolha<T extends string>({ rotulo, valor, opcoes, onChange }: { rotulo: string; valor: T; opcoes: { valor: T; rotulo: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="inline-flex flex-wrap rounded-lg border bg-muted/40 p-0.5">
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => onChange(o.valor)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            valor === o.valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 space-y-3 rounded-xl border p-4">
      <legend className="px-1 text-sm font-semibold text-foreground">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function FormularioContrato({
  inicial,
  origemProduto,
  textoBotao,
  onEnviar,
  extras,
}: {
  inicial: DadosContrato;
  origemProduto?: string | null;
  textoBotao: string;
  onEnviar: (dados: DadosContrato) => Promise<RespostaFormularioContrato>;
  extras?: ReactNode;
}) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [d, setD] = useState<DadosContrato>(inicial);
  const [valorTexto, setValorTexto] = useState(formatarValorEmReais(inicial.valorCentavos));
  const [erros, setErros] = useState<ErrosContrato>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, startEnvio] = useTransition();
  const [buscandoCnpj, startBusca] = useTransition();
  const pj = d.clienteTipo === "PJ";

  function mudar<K extends CampoContrato>(campo: K, valor: DadosContrato[K]) {
    setD((atual) => ({ ...atual, [campo]: valor }));
    setErros((atuais) => (atuais[campo] ? { ...atuais, [campo]: undefined } : atuais));
  }

  const ids = (campo: CampoContrato) => `${id}-${campo}`;
  const props = (campo: CampoContrato) => ({ id: ids(campo), "aria-invalid": erros[campo] ? true : undefined });

  function mostrarErros(novos: ErrosContrato, geral: string) {
    setErros(novos);
    setErroGeral(geral);
    // Primeiro campo marcado na ordem da tela (depois de redesenhar).
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const r = dadosContratoSchema.safeParse({ ...d, valorCentavos: lerValorEmReais(valorTexto) ?? 0 });
    if (!r.success) return mostrarErros(errosPorCampo(r.error.issues), ERRO_GERAL);
    setErros({});
    setErroGeral(null);
    startEnvio(async () => {
      const resposta = await onEnviar(r.data).catch((): RespostaFormularioContrato => ({ error: "Não deu certo — tente de novo." }));
      if (resposta?.error) mostrarErros(resposta.campos ?? {}, resposta.error);
    });
  }

  function buscarCnpj() {
    startBusca(async () => {
      const r = await buscarCnpjAction(d.clienteDocumento);
      if (!r.dados) return void setErros((e) => ({ ...e, clienteDocumento: r.error ?? "Não achei esse CNPJ." }));
      const dados = r.dados;
      setD((a) => ({
        ...a,
        clienteDocumento: formatarDocumento(a.clienteDocumento) ?? a.clienteDocumento,
        clienteNome: nomeProprio(dados.razaoSocial),
        clienteEndereco: nomeProprio(dados.endereco),
        clienteCidade: nomeProprio(dados.cidade),
        clienteUf: dados.uf,
        clienteCep: dados.cep,
      }));
      setErros((e) => ({ ...e, clienteDocumento: undefined, clienteNome: undefined, clienteEndereco: undefined, clienteCidade: undefined, clienteUf: undefined }));
    });
  }

  return (
    <form ref={formRef} onSubmit={enviar} noValidate className="space-y-4">
      <Secao titulo="Quem vende">
        <Escolha
          rotulo="Quem vende"
          valor={d.empresaEmissora}
          onChange={(v) => mudar("empresaEmissora", v)}
          opcoes={[
            { valor: "LEGAUS", rotulo: "Legaus Kids" },
            { valor: "IDEZZA", rotulo: "Idezza" },
          ]}
        />
      </Secao>

      <Secao titulo="Cliente (comprador)">
        <Escolha
          rotulo="Tipo de cliente"
          valor={d.clienteTipo}
          onChange={(v) => mudar("clienteTipo", v)}
          opcoes={[
            { valor: "PF", rotulo: "Pessoa física (CPF)" },
            { valor: "PJ", rotulo: "Empresa ou instituição (CNPJ)" },
          ]}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          {pj ? (
            <>
              <Campo id={ids("clienteDocumento")} rotulo="CNPJ" erro={erros.clienteDocumento} className="sm:col-span-3">
                <div className="flex gap-2">
                  <Input
                    {...props("clienteDocumento")}
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                    value={d.clienteDocumento}
                    onChange={(e) => mudar("clienteDocumento", e.target.value)}
                    onBlur={() => mudar("clienteDocumento", formatarDocumento(d.clienteDocumento) ?? "")}
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8 shrink-0" disabled={buscandoCnpj || !d.clienteDocumento} onClick={buscarCnpj}>
                    {buscandoCnpj ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                    Buscar
                  </Button>
                </div>
              </Campo>
              <Campo id={ids("clienteNome")} rotulo="Razão social" erro={erros.clienteNome} className="sm:col-span-6">
                <Input {...props("clienteNome")} value={d.clienteNome} onChange={(e) => mudar("clienteNome", e.target.value)} />
              </Campo>
              <Campo id={ids("representanteNome")} rotulo="Quem assina pela empresa" erro={erros.representanteNome} className="sm:col-span-4">
                <Input {...props("representanteNome")} placeholder="Nome completo" value={d.representanteNome} onChange={(e) => mudar("representanteNome", e.target.value)} />
              </Campo>
              <Campo id={ids("representanteCpf")} rotulo="CPF de quem assina" erro={erros.representanteCpf} className="sm:col-span-2">
                <Input
                  {...props("representanteCpf")}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={d.representanteCpf}
                  onChange={(e) => mudar("representanteCpf", e.target.value)}
                  onBlur={() => mudar("representanteCpf", formatarDocumento(d.representanteCpf) ?? "")}
                />
              </Campo>
            </>
          ) : (
            <>
              <Campo id={ids("clienteNome")} rotulo="Nome completo" erro={erros.clienteNome} className="sm:col-span-4">
                <Input {...props("clienteNome")} value={d.clienteNome} onChange={(e) => mudar("clienteNome", e.target.value)} />
              </Campo>
              <Campo id={ids("clienteDocumento")} rotulo="CPF" erro={erros.clienteDocumento} className="sm:col-span-2">
                <Input
                  {...props("clienteDocumento")}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  value={d.clienteDocumento}
                  onChange={(e) => mudar("clienteDocumento", e.target.value)}
                  onBlur={() => mudar("clienteDocumento", formatarDocumento(d.clienteDocumento) ?? "")}
                />
              </Campo>
            </>
          )}
          <Campo id={ids("clienteEndereco")} rotulo="Endereço (rua, número e bairro)" erro={erros.clienteEndereco} className="sm:col-span-6">
            <Input {...props("clienteEndereco")} value={d.clienteEndereco} onChange={(e) => mudar("clienteEndereco", e.target.value)} />
          </Campo>
          <Campo id={ids("clienteCidade")} rotulo="Cidade" erro={erros.clienteCidade} className="sm:col-span-3">
            <Input {...props("clienteCidade")} value={d.clienteCidade} onChange={(e) => mudar("clienteCidade", e.target.value)} />
          </Campo>
          <Campo id={ids("clienteUf")} rotulo="UF" erro={erros.clienteUf} className="sm:col-span-1">
            <Input {...props("clienteUf")} maxLength={2} className="uppercase" value={d.clienteUf} onChange={(e) => mudar("clienteUf", e.target.value.toUpperCase())} />
          </Campo>
          <Campo id={ids("clienteCep")} rotulo="CEP" erro={erros.clienteCep} className="sm:col-span-2">
            <Input {...props("clienteCep")} inputMode="numeric" placeholder="00000-000" value={d.clienteCep} onChange={(e) => mudar("clienteCep", e.target.value)} />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Produto">
        <Campo
          id={ids("produto")}
          rotulo="O que está sendo vendido"
          erro={erros.produto}
          dica={origemProduto ? `Veio do ${origemProduto} do cliente — confira. Um item por linha.` : "Um item por linha."}
        >
          <Textarea {...props("produto")} rows={3} placeholder="ex: Playground Torre Dupla em madeira plástica" value={d.produto} onChange={(e) => mudar("produto", e.target.value)} />
        </Campo>
        <Campo id={ids("especificacoes")} rotulo="Especificações (opcional)" erro={erros.especificacoes} dica="Cores, medidas, materiais — sai no contrato logo depois do produto.">
          <Textarea {...props("especificacoes")} rows={2} value={d.especificacoes} onChange={(e) => mudar("especificacoes", e.target.value)} />
        </Campo>
      </Secao>

      <Secao titulo="Valor e pagamento">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <Campo id={ids("valorCentavos")} rotulo="Valor total (R$)" erro={erros.valorCentavos} className="sm:col-span-2">
            <Input
              {...props("valorCentavos")}
              inputMode="decimal"
              placeholder="0,00"
              value={valorTexto}
              onChange={(e) => {
                setValorTexto(e.target.value);
                setErros((a) => ({ ...a, valorCentavos: undefined }));
              }}
              onBlur={() => {
                const centavos = lerValorEmReais(valorTexto);
                if (centavos != null) setValorTexto(formatarValorEmReais(centavos));
              }}
            />
          </Campo>
          <Campo
            id={ids("formaPagamento")}
            rotulo="Condições de pagamento"
            erro={erros.formaPagamento}
            className="sm:col-span-6"
            dica="Sai no contrato depois do valor: “…a soma de R$ 15.800,00 (quinze mil e oitocentos reais), [condições].”"
          >
            <Textarea
              {...props("formaPagamento")}
              rows={2}
              placeholder="ex: entrada de R$ 5.000,00 via PIX na assinatura do contrato e o saldo em 3 parcelas mensais"
              value={d.formaPagamento}
              onChange={(e) => mudar("formaPagamento", e.target.value)}
            />
            <div className="flex flex-wrap gap-1.5">
              {PAGAMENTOS_RAPIDOS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => mudar("formaPagamento", p)}
                  className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {p}
                </button>
              ))}
            </div>
          </Campo>
        </div>
      </Secao>

      <Secao titulo="Prazos e instalação">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Campo id={ids("prazoEntregaDias")} rotulo="Prazo de entrega (dias)" erro={erros.prazoEntregaDias} className="col-span-1 sm:col-span-2">
            <Input
              {...props("prazoEntregaDias")}
              type="number"
              min={1}
              max={730}
              value={Number.isFinite(d.prazoEntregaDias) ? d.prazoEntregaDias : ""}
              onChange={(e) => mudar("prazoEntregaDias", e.target.valueAsNumber)}
            />
          </Campo>
          <Campo id={ids("garantiaMeses")} rotulo="Garantia (meses)" erro={erros.garantiaMeses} className="col-span-1 sm:col-span-2">
            <Input
              {...props("garantiaMeses")}
              type="number"
              min={1}
              max={120}
              value={Number.isFinite(d.garantiaMeses) ? d.garantiaMeses : ""}
              onChange={(e) => mudar("garantiaMeses", e.target.valueAsNumber)}
            />
          </Campo>
          <Campo
            id={ids("localInstalacao")}
            rotulo="Local da instalação (opcional)"
            erro={erros.localInstalacao}
            className="col-span-2 sm:col-span-6"
            dica="Em branco, o contrato diz “no local indicado pelo Comprador”."
          >
            <Input {...props("localInstalacao")} placeholder="ex: EMEI Pequeno Príncipe, Rua B, 45, Santa Rosa/RS" value={d.localInstalacao} onChange={(e) => mudar("localInstalacao", e.target.value)} />
          </Campo>
        </div>
      </Secao>

      {erroGeral && <p className="text-sm text-destructive">{erroGeral}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={enviando}>
          {enviando && <Loader2 className="size-4 animate-spin" />}
          {textoBotao}
        </Button>
        {extras}
      </div>
    </form>
  );
}
