"use client";

import dynamic from "next/dynamic";

export const Editor = dynamic(
    () => import("./editor").then((mod) => mod.Editor),
    {
        ssr: false,
        loading: () => <div className="h-[600px] w-full animate-pulse rounded-xl bg-muted/50" />
    }
);
