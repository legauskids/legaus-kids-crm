import { LoginForm } from "@/app/(auth)/login/login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Legaus Kids</h1>
          <p className="text-sm text-muted-foreground">Atendimento &amp; CRM</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
