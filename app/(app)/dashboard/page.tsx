export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Suspense } from "react";

import ViewModeToggle from "@/components/dashboard/ViewModeToggle";
import HomePerformance from "./HomePerformance";
import HomeSocial from "./HomeSocial";

export default async function DashboardHome({
    searchParams,
}: {
    searchParams: { view?: "performance" | "social" };
}) {
    const view = searchParams.view ?? "performance";

    return (
        <div className="space-y-6">
            <header className="flex items-center justify-between">
                <h1 className="text-xl font-semibold">Dashboard</h1>

                <Suspense fallback={null}>
                    <ViewModeToggle
                        value={view}
                        onChange={async (mode) => {
                            "use server";
                            redirect(`/dashboard?view=${mode}`);
                        }}
                    />
                </Suspense>
            </header>

            {view === "performance" ? <HomePerformance /> : <HomeSocial />}
        </div>
    );
}
