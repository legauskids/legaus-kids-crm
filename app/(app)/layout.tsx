import { requireUser } from "@/lib/auth/guards";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileNav } from "@/components/layout/mobile-nav";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();

  return (
    <div className="flex h-screen w-full overflow-hidden print:h-auto print:overflow-visible">
      <Sidebar user={user} />
      <div className="flex flex-1 flex-col overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          <Topbar user={user} />
        </div>
        <main className="flex-1 overflow-auto print:overflow-visible">{children}</main>
        <div className="print:hidden">
          <MobileNav user={user} />
        </div>
      </div>
    </div>
  );
}
