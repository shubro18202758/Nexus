"use client";

import { ProfileForm } from "@/components/profile/profile-form";
import { LearningDNACard } from "@/components/profile/learning-dna-card";
import { InteractiveRoadmap } from "@/components/knowledge/interactive-roadmap";
import { UserCheck } from "lucide-react";

export default function ProfilePage() {
    return (
        <div className="flex flex-col min-h-screen p-6 md:p-8 space-y-8">
            <header className="flex items-center gap-4 border-b border-white/10 pb-6">
                <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center border border-purple-500/20 shadow-[0_0_15px_rgba(168,85,247,0.15)]">
                    <UserCheck className="h-6 w-6 text-purple-400 drop-shadow-[0_0_6px_rgba(168,85,247,0.5)]" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold font-[family-name:var(--font-space)] bg-gradient-to-r from-purple-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(168,85,247,0.3)]">
                        Profile Editor
                    </h1>
                    <p className="text-muted-foreground">
                        Update your identity, education, and portfolio for the Student OS Core.
                    </p>
                </div>
            </header>

            <div className="max-w-5xl mx-auto w-full space-y-8">
                <LearningDNACard />
                <InteractiveRoadmap />
                <ProfileForm />
            </div>
        </div>
    );
}
