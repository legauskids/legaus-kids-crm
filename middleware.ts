import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

// Checagem barata (só presença do cookie); a verificação completa do JWT
// acontece em requireUser() dentro de cada Server Component/action.
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!login|api/auth|api/integracoes|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|manifest.webmanifest|logo-mark.*\\.svg|icon-.*\\.png).*)",
  ],
};
