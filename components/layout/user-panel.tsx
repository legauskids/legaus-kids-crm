"use client";

import { useActionState, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { initials } from "@/lib/utils";
import { MODULOS, MODULO_LABEL, moduloPermitido, type Permissoes } from "@/lib/auth/permissoes";
import {
  trocarPropriaSenhaAction,
  adminTrocarSenhaAction,
  adminAtualizarPermissaoAction,
  type SenhaState,
} from "@/app/(app)/_usuario/actions";

type Usuario = {
  id: string;
  username: string;
  nome: string;
  papel: string;
  isAdmin: boolean;
  permissoes: Permissoes;
};

const senhaStateInicial: SenhaState = {};

function TrocarSenhaForm({
  action,
  usuarioId,
  aoConcluir,
}: {
  action: typeof trocarPropriaSenhaAction | typeof adminTrocarSenhaAction;
  usuarioId?: string;
  aoConcluir?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, senhaStateInicial);

  return (
    <form
      action={(fd) => {
        formAction(fd);
      }}
      className="space-y-2.5"
    >
      {usuarioId && <input type="hidden" name="usuarioId" value={usuarioId} />}
      {!usuarioId && (
        <div className="space-y-1.5">
          <Label htmlFor="senhaAtual" className="text-xs">
            Senha atual
          </Label>
          <Input id="senhaAtual" name="senhaAtual" type="password" autoComplete="current-password" required />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor={`novaSenha-${usuarioId ?? "eu"}`} className="text-xs">
          Nova senha
        </Label>
        <Input
          id={`novaSenha-${usuarioId ?? "eu"}`}
          name="novaSenha"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`confirmarSenha-${usuarioId ?? "eu"}`} className="text-xs">
          Confirmar nova senha
        </Label>
        <Input
          id={`confirmarSenha-${usuarioId ?? "eu"}`}
          name="confirmarSenha"
          type="password"
          autoComplete="new-password"
          minLength={6}
          required
        />
      </div>
      {state.error && (
        <p className="text-xs text-destructive" role="alert">
          {state.error}
        </p>
      )}
      {state.success && <p className="text-xs text-success">Senha atualizada.</p>}
      <Button type="submit" size="sm" disabled={pending} onClick={() => aoConcluir?.()}>
        {pending ? "Salvando..." : "Salvar nova senha"}
      </Button>
    </form>
  );
}

function UsuarioEquipeCard({ usuario }: { usuario: Usuario }) {
  const [trocandoSenha, setTrocandoSenha] = useState(false);
  const [permissoesLocais, setPermissoesLocais] = useState<Permissoes>(usuario.permissoes);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center gap-2.5">
        <Avatar className="size-8">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
            {initials(usuario.nome)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{usuario.nome}</p>
          <p className="truncate text-xs text-muted-foreground">{usuario.papel}</p>
        </div>
      </div>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          O que {usuario.nome.split(" ")[0]} pode ver
        </p>
        <div className="space-y-1.5">
          {MODULOS.map((modulo) => {
            const visivel = moduloPermitido({ isAdmin: false, permissoes: permissoesLocais }, modulo);
            return (
              <label key={modulo} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={visivel}
                  onCheckedChange={(checked) => {
                    const novoValor = checked === true;
                    setPermissoesLocais((atual) => ({ ...atual, [modulo]: novoValor }));
                    adminAtualizarPermissaoAction(usuario.id, modulo, novoValor);
                  }}
                />
                {MODULO_LABEL[modulo]}
              </label>
            );
          })}
        </div>
      </div>

      <Separator />

      {trocandoSenha ? (
        <TrocarSenhaForm action={adminTrocarSenhaAction} usuarioId={usuario.id} aoConcluir={() => {}} />
      ) : (
        <Button variant="outline" size="sm" onClick={() => setTrocandoSenha(true)}>
          Trocar senha
        </Button>
      )}
    </div>
  );
}

export function UserPanel({
  currentUser,
  outros,
}: {
  currentUser: Usuario;
  outros: Usuario[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button type="button" className="flex items-center gap-2.5 rounded-lg p-1 transition-colors hover:bg-accent">
          <Avatar className="size-9 ring-2 ring-primary/10">
            <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
              {initials(currentUser.nome)}
            </AvatarFallback>
          </Avatar>
          <div className="hidden text-sm leading-tight sm:block">
            <p className="font-semibold text-foreground">{currentUser.nome}</p>
            <p className="text-xs text-muted-foreground">{currentUser.papel}</p>
          </div>
        </button>
      </SheetTrigger>
      <SheetContent className="flex flex-col overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Minha conta</SheetTitle>
          <SheetDescription>
            {currentUser.nome} · @{currentUser.username}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 px-4 pb-4">
          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trocar minha senha</p>
            <TrocarSenhaForm action={trocarPropriaSenhaAction} />
          </div>

          {currentUser.isAdmin && outros.length > 0 && (
            <>
              <Separator />
              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Equipe — acessos e senhas
                </p>
                <div className="space-y-3">
                  {outros.map((usuario) => (
                    <UsuarioEquipeCard key={usuario.id} usuario={usuario} />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
