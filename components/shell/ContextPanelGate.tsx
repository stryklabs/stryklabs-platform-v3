"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * ContextPanelGate
 *
 * Purpose:
 * - Mounts the right-hand context panel only when session context exists.
 *
 * Rules (M6):
 * - Never mount on /progression (strategic surface).
 * - Only mount when ?session=<uuid> exists.
 *
 * Notes:
 * - This component intentionally takes NO props so layout can render:
 *     <ContextPanelGate />
 */
export default function ContextPanelGate() {
    const pathname = usePathname();
    const sp = useSearchParams();

    // Prevent hydration mismatch by gating after mount
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);
    if (!mounted) return null;

    // Hard disable on strategic route
    if (pathname === "/progression") return null;

    // Only show when session context exists
    const sessionId = sp.get("session");
    if (!sessionId) return null;

    // Lazy import / render your actual context panel (current behaviour)
    // If you already render the context content elsewhere, keep this empty.
    // For now we render nothing, but we successfully prevent panel API calls
    // on /progression and routes without ?session=.
    return null;
}
