"use client";

import { useEffect, useRef, useState } from "react";

export default function VerticalResizeSplit({
    top,
    bottom,
    storageKey = "sessions-main-split",
    minTop = 220,
    minBottom = 200,
}: {
    top: React.ReactNode;
    bottom: React.ReactNode;
    storageKey?: string;
    minTop?: number;
    minBottom?: number;
}) {
    const containerRef = useRef<HTMLDivElement>(null);

    const [topHeight, setTopHeight] = useState<number>(() => {
        if (typeof window === "undefined") return 360;
        const v = localStorage.getItem(storageKey);
        return v ? Number(v) : 360;
    });

    useEffect(() => {
        if (typeof window !== "undefined") {
            localStorage.setItem(storageKey, String(topHeight));
        }
    }, [topHeight, storageKey]);

    function startDrag(e: React.MouseEvent) {
        e.preventDefault();

        const startY = e.clientY;
        const startHeight = topHeight;

        function onMove(ev: MouseEvent) {
            if (!containerRef.current) return;

            const total = containerRef.current.clientHeight;
            const next = startHeight + (ev.clientY - startY);

            if (next < minTop) return;
            if (total - next < minBottom) return;

            setTopHeight(next);
        }

        function onUp() {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
        }

        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
    }

    return(
        <div ref={containerRef} className="flex h-full flex-col overflow-hidden">
            <div style={{ height: topHeight }} className="overflow-hidden">
                {top}
            </div>

            <div
                onMouseDown={startDrag}
                className="group relative h-3 cursor-row-resize bg-neutral-950"
                title="Drag to resize"
            >
                <div className="absolute left-1/2 top-1/2 h-1 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-800 group-hover:bg-neutral-700" />
            </div>

            <div className="flex-1 overflow-hidden">
                {bottom}
            </div>
        </div>
    );
}
