"use client";

import { DashboardHeader } from "@/components/dashboard/header";
import { DashboardStats } from "@/components/dashboard/stats-cards";
import { RecentFiles } from "@/components/dashboard/recent-files";
import { ChatInterface } from "@/components/ai/chat-interface";
import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { AiBriefing } from "@/components/dashboard/ai-briefing";
import { TaskReminders } from "@/components/tasks/task-reminders";
import { LevelUpBar } from "@/components/dashboard/level-up-bar";
import { AuraCard } from "@/components/ui/aura-card";
import { Sparkles, Terminal, Cpu, Zap, Activity } from "lucide-react";

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="relative z-10 flex flex-col p-6 md:p-8 space-y-8 max-w-[1600px] mx-auto w-full">

        {/* 1. Header Section */}
        <DashboardHeader />

        {/* 2. Gamification Bar */}
        <LevelUpBar />

        {/* 3. Key Metrics */}
        <DashboardStats />

        {/* 4. Bento Grid Command Center */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 h-full">

          {/* LEFT COLUMN: Intelligence & Briefing (Width 4) */}
          <div className="md:col-span-4 space-y-5 flex flex-col">
            <AuraCard className="flex-1 flex flex-col group" withGlow={true}>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                  <Terminal className="h-3.5 w-3.5 text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.5)]" />
                </div>
                <h3 className="font-mono text-sm tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-cyan-200">Mission Briefing</h3>
                <Zap className="ml-auto h-3 w-3 text-amber-400/50 animate-pulse" />
              </div>
              <AiBriefing />
            </AuraCard>

            <AuraCard className="flex-1 flex flex-col group">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-violet-500/10 border border-violet-500/20">
                  <Cpu className="h-3.5 w-3.5 text-violet-400 drop-shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
                </div>
                <h3 className="font-mono text-sm tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-300">Active Directives</h3>
              </div>
              <TaskReminders />
            </AuraCard>
          </div>

          {/* MIDDLE COLUMN: Activity & Files (Width 5) */}
          <div className="md:col-span-5 space-y-5 flex flex-col">
            <AuraCard className="flex-1" withGlow={false}>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                  <Activity className="h-3.5 w-3.5 text-emerald-400 drop-shadow-[0_0_6px_rgba(52,211,153,0.5)]" />
                </div>
                <h3 className="font-mono text-sm tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-300">System Logs</h3>
              </div>
              <ActivityTimeline />
            </AuraCard>

            <AuraCard className="flex-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-cyan-500/10 border border-cyan-500/20">
                  <Sparkles className="h-3.5 w-3.5 text-cyan-400 drop-shadow-[0_0_6px_rgba(6,182,212,0.5)]" />
                </div>
                <h3 className="font-mono text-sm tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-300">Recent Protocols</h3>
              </div>
              <RecentFiles />
            </AuraCard>
          </div>

          {/* RIGHT COLUMN: AI Assistant (Width 3) */}
          <div className="md:col-span-3 flex flex-col h-full">
            <AuraCard className="h-full flex flex-col p-0 overflow-hidden border-violet-500/20 neon-border-pulse" transparency="glass">
              <div className="p-3 border-b border-white/[0.06] bg-gradient-to-r from-violet-500/5 via-transparent to-cyan-500/5 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-neon-purple animate-pulse drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]" />
                <h2 className="font-mono text-xs font-bold uppercase tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-violet-300 to-purple-200">Nexus AI Link</h2>
                <div className="ml-auto flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  <span className="text-[10px] text-emerald-400 font-mono tracking-wider">ONLINE</span>
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatInterface />
              </div>
            </AuraCard>
          </div>

        </div>
      </div>
    </div>
  );
}
