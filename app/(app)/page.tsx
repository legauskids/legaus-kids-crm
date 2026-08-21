import { requireUser } from "@/lib/auth/guards";

export default async function DashboardPage() {
  const user = await requireUser();

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold">Olá, {user.nome}</h1>
      <p className="mt-1 text-muted-foreground">
        Dashboard em construção — chega na Milestone 7.
      </p>
    </div>
  );
}
