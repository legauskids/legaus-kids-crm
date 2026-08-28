"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ListaContatos, type ContatoVM } from "@/app/(app)/cadastros/lista-contatos";
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
  return (
    <div className="flex h-full flex-col">
      <div className="border-b bg-card px-6 py-3.5 shadow-xs">
        <h1 className="text-xl font-bold tracking-tight text-foreground">Cadastros</h1>
      </div>

      <Tabs defaultValue="contatos" className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b bg-card px-6 py-2">
          <TabsList>
            <TabsTrigger value="contatos">Contatos ({contatos.length})</TabsTrigger>
            <TabsTrigger value="clientes">Clientes ({clientes.length})</TabsTrigger>
            <TabsTrigger value="fornecedores">Fornecedores ({fornecedores.length})</TabsTrigger>
            <TabsTrigger value="produtos">Produtos ({produtos.length})</TabsTrigger>
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
          <ProdutosShell produtos={produtos} categoriasFixas={categoriasFixas} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
