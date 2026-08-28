"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListaContatos, type ContatoVM } from "@/app/(app)/cadastros/lista-contatos";
import { ListaPrecos } from "@/app/(app)/cadastros/lista-precos";
import { ProdutosShell, type ProdutoVM } from "@/app/(app)/produtos/produtos-shell";

export function CadastrosShell({
  contatos,
  clientes,
  fornecedores,
  produtos,
  categoriasFixas,
}: {
  contatos: ContatoVM[];
  clientes: ContatoVM[];
  fornecedores: ContatoVM[];
  produtos: ProdutoVM[];
  categoriasFixas: string[];
}) {
  // Patches locais por produto (id -> campos alterados), aplicados por cima
  // do que veio do servidor. Assim a guia Produtos reflete na hora uma
  // edição feita na Lista de preços (e vice-versa), sem precisar de reload
  // — as duas guias leem o mesmo estado compartilhado aqui.
  const [ajustes, setAjustes] = useState<Record<string, Partial<ProdutoVM>>>({});

  const produtosAtuais = useMemo(
    () => produtos.map((p) => (ajustes[p.id] ? { ...p, ...ajustes[p.id] } : p)),
    [produtos, ajustes],
  );

  function aplicarAjusteProduto(id: string, patch: Partial<ProdutoVM>) {
    setAjustes((atual) => ({ ...atual, [id]: { ...atual[id], ...patch } }));
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Cadastros</h1>
      </div>

      <Tabs defaultValue="contatos" className="flex flex-1 flex-col overflow-hidden">
        <div className="overflow-x-auto border-b bg-card px-4 py-2 sm:px-6">
          <TabsList>
            <TabsTrigger value="contatos">Contatos ({contatos.length})</TabsTrigger>
            <TabsTrigger value="clientes">Clientes ({clientes.length})</TabsTrigger>
            <TabsTrigger value="fornecedores">Fornecedores ({fornecedores.length})</TabsTrigger>
            <TabsTrigger value="produtos">Produtos ({produtos.length})</TabsTrigger>
            <TabsTrigger value="lista-precos">Lista de preços</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="contatos" className="flex-1 overflow-hidden">
          <ListaContatos tipo="CONTATO" contatos={contatos} />
        </TabsContent>
        <TabsContent value="clientes" className="flex-1 overflow-hidden">
          <ListaContatos tipo="CLIENTE" contatos={clientes} />
        </TabsContent>
        <TabsContent value="fornecedores" className="flex-1 overflow-hidden">
          <ListaContatos tipo="FORNECEDOR" contatos={fornecedores} />
        </TabsContent>
        <TabsContent value="produtos" className="flex-1 overflow-hidden">
          <ProdutosShell produtos={produtosAtuais} categoriasFixas={categoriasFixas} />
        </TabsContent>
        <TabsContent value="lista-precos" className="flex-1 overflow-hidden">
          <ListaPrecos produtos={produtosAtuais} categoriasFixas={categoriasFixas} onAtualizarProduto={aplicarAjusteProduto} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
