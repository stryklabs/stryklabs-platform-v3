import type { ReactNode } from "react";
import { Suspense } from "react";

import TopBar from "@/components/shell/TopBar";
import LeftMenu from "@/components/shell/LeftMenu";
import LeftContextNav from "@/components/shell/LeftContextNav";
import ContextPanelGate from "@/components/shell/ContextPanelGate";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-neutral-950 text-neutral-100">
      {/* Global Top Bar */}
      <header className="shrink-0">
        <TopBar />
      </header>

      {/* Below Top Bar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Menu */}
        <aside className="w-16 shrink-0 border-r border-neutral-800">
          <LeftMenu />
        </aside>

        {/* Left sessions list (sessions route only) */}
        <Suspense fallback={null}>
          <LeftContextNav />
        </Suspense>

        {/* Right context panel (sessions route only) */}
        <Suspense fallback={null}>
          <ContextPanelGate />
        </Suspense>

        {/* Main Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
