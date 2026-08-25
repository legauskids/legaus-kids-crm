import { Sparkles } from "lucide-react";
import { LoginForm } from "@/app/(auth)/login/login-form";

export default function LoginPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(circle at 15% 15%, color-mix(in oklch, var(--primary) 12%, transparent), transparent 45%), radial-gradient(circle at 85% 85%, color-mix(in oklch, var(--success) 12%, transparent), transparent 45%)",
        }}
      />
      <div className="relative w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
            <Sparkles className="size-6" />
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Legaus Kids</h1>
            <p className="text-sm text-muted-foreground">Atendimento &amp; CRM</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
