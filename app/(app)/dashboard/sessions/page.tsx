import { Suspense } from "react";
import SessionsExplorer from "./SessionsExplorer";
import { SessionsProvider } from "@/components/sessions/SessionsContext";

export const dynamic = "force-dynamic";

export default function SessionsPage() {
    return (
        <SessionsProvider>
            <Suspense fallback={null}>
                <SessionsExplorer />
            </Suspense>
        </SessionsProvider>
    );
}
