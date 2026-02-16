import type { ReactNode } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-neutral-950 text-neutral-100">
            {children}
        </div>
    );
}
