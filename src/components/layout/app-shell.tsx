"use client";

import {
  BookOpen,
  Calendar,
  ChevronDown,
  FileText,
  Home,
  Laptop,
  Layout,
  Layout as LayoutIcon,
  Moon,
  Network,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Target,
  Users,
  Zap,
  LayoutDashboard,
  Cpu,
  Trophy,
  Newspaper
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { CommandMenu } from "./command-menu";
import { useFocusStore } from "@/hooks/use-focus-store";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { QuickCapture } from "@/components/dashboard/quick-capture";
import { GravityField } from "@/components/ui/gravity-field";
import { CyberGrid } from "@/components/ui/cyber-grid";
import { NexusCursor } from "@/components/ui/nexus-cursor";

// Navigation items for the sidebar
const mainNav = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Calendar", href: "/calendar", icon: Calendar },
  { name: "Profile", href: "/profile", icon: Users },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Knowledge", href: "/knowledge", icon: BookOpen },
  { name: "Research", href: "/research", icon: Search },
  { name: "Events", href: "/events", icon: Zap },
  { name: "Clubs", href: "/clubs", icon: Network },
  { name: "Daily Digest", href: "/daily-digest", icon: Newspaper },
  { name: "Opportunities", href: "/dashboard/opportunities", icon: Target },
  { name: "Tasks", href: "/tasks", icon: Layout },
  { name: "Command Center", href: "/command-center", icon: LayoutDashboard },
  { name: "Team", href: "/team", icon: Users },
  { name: "Settings", href: "/settings", icon: Settings },
];

function SyncStatusIndicator() {
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [uptime, setUptime] = React.useState(0);
  React.useEffect(() => {
    const interval = setInterval(() => {
      setIsSyncing((prev) => !prev);
    }, 5000);
    const uptimer = setInterval(() => setUptime((u) => u + 1), 1000);
    return () => { clearInterval(interval); clearInterval(uptimer); };
  }, []);

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <div className="flex items-center gap-3 text-sm font-mono">
      <div className="flex items-center gap-2">
        <div className="relative">
          <RefreshCw
            className={cn(
              "h-3.5 w-3.5 transition-all duration-500",
              isSyncing ? "animate-spin text-cyan-400" : "text-emerald-400"
            )}
          />
          <div className={cn(
            "absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full",
            isSyncing ? "bg-cyan-400 animate-ping" : "bg-emerald-400"
          )} />
        </div>
        <span className="text-muted-foreground hidden sm:inline text-[10px] uppercase tracking-wider">
          {isSyncing ? "SYNCING..." : "LINKED"}
        </span>
      </div>
      <div className="hidden md:flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
        <span className="text-violet-400/60">UPTIME</span>
        <span className="text-white/40 font-bold">{formatUptime(uptime)}</span>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-white/5 hover:text-cyan-400 transition-colors">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-black/90 backdrop-blur-xl border-white/10 text-white">
        <DropdownMenuItem onClick={() => setTheme("light")}><Sun className="mr-2 h-4 w-4" /> Light</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}><Moon className="mr-2 h-4 w-4" /> Dark</DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}><Laptop className="mr-2 h-4 w-4" /> System</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" className="border-r border-transparent bg-black/70 backdrop-blur-2xl supports-[backdrop-filter]:bg-black/50 m-2 rounded-2xl h-[calc(100vh-1rem)] shadow-2xl shadow-violet-900/30 border border-white/[0.10] overflow-hidden">
      <SidebarHeader className="pb-4 pt-4 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-violet-600/20 via-cyan-600/10 to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-4 right-4 h-px bg-gradient-to-r from-transparent via-violet-500/20 to-transparent" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild className="hover:bg-transparent group/logo">
              <Link href="/">
                <div className="relative flex aspect-square size-10 items-center justify-center rounded-xl bg-black border border-white/10 shadow-[0_0_25px_-5px_rgba(139,92,246,0.5)] group-hover/logo:shadow-[0_0_35px_rgba(139,92,246,0.6)] transition-all duration-500 neon-border-pulse">
                  <div className="absolute inset-0 bg-gradient-to-br from-violet-600 via-fuchsia-600 to-cyan-500 opacity-25 group-hover/logo:opacity-60 transition-opacity rounded-xl" />
                  <Zap className="size-5 text-cyan-400 relative z-10 group-hover/logo:text-white transition-colors drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
                </div>
                <div className="flex flex-col gap-0.5 leading-none ml-2">
                  <span className="font-black tracking-[0.3em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-violet-400 to-pink-400 text-lg group-hover/logo:animate-pulse glitch-text">NEXUS</span>
                  <span className="text-[8px] text-muted-foreground/60 font-mono tracking-[0.25em] uppercase">LIFE OPS // v2.0</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[9px] uppercase tracking-[0.3em] text-violet-400/70 font-mono font-bold pl-4 mb-1 drop-shadow-[0_0_6px_rgba(139,92,246,0.3)]">⚡ Connectors</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item, index) => {
                const isActive = pathname === item.href;
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.name}
                      className={cn(
                        "transition-all duration-300 relative overflow-hidden group/menu mx-2 rounded-lg mb-0.5",
                        isActive
                          ? "bg-gradient-to-r from-violet-500/25 to-cyan-500/15 text-white shadow-[inset_0_0_25px_rgba(139,92,246,0.15),0_0_15px_rgba(139,92,246,0.1)] border border-violet-500/35"
                          : "text-white/60 hover:text-white hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08]"
                      )}
                    >
                      <Link href={item.href} className="flex items-center w-full py-2">
                        <div className={cn(
                          "flex items-center justify-center w-8 h-8 rounded-md mr-2.5 transition-all duration-300",
                          isActive
                            ? "bg-violet-500/25 shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                            : "bg-white/[0.03] group-hover/menu:bg-white/[0.08]"
                        )}>
                          <item.icon className={cn(
                            "size-4 transition-all duration-300",
                            isActive
                              ? "text-cyan-400 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]"
                              : "text-white/50 group-hover/menu:scale-110 group-hover/menu:text-violet-300 group-hover/menu:drop-shadow-[0_0_6px_rgba(139,92,246,0.4)]"
                          )} />
                        </div>
                        <span className={cn(
                          "relative z-10 font-mono text-[11.5px] tracking-wider",
                          isActive ? "font-extrabold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]" : "font-medium"
                        )}>{item.name.toUpperCase()}</span>
                        {isActive && (
                          <>
                            <motion.div
                              layoutId="activeNav"
                              className="absolute right-2 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_10px_#06b6d4] glow-pulse"
                            />
                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-7 rounded-r-full bg-gradient-to-b from-violet-400 to-cyan-400 shadow-[0_0_15px_rgba(139,92,246,0.7)]" />
                          </>
                        )}
                        {/* Hover shimmer */}
                        <div className="absolute inset-0 holo-shimmer opacity-0 group-hover/menu:opacity-100 transition-opacity duration-500 rounded-lg" />
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-white/[0.08] bg-gradient-to-t from-violet-950/30 to-transparent p-2">
        <div className="mb-2 mx-2">
          <div className="h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="hover:bg-white/5 rounded-lg border border-transparent hover:border-white/10 transition-all group/footer">
                  <div className="relative bg-gradient-to-br from-violet-800 to-black flex aspect-square size-7 items-center justify-center rounded-lg border border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.3)]">
                    <Trophy className="size-3.5 text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
                    <div className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 border border-black animate-pulse" />
                  </div>
                  <div className="flex flex-col items-start gap-0.5 ml-1.5">
                    <span className="text-xs font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-violet-200 to-cyan-200 drop-shadow-[0_0_6px_rgba(255,255,255,0.15)]">Cyber Adept</span>
                    <span className="text-[9px] text-cyan-400 font-mono font-bold tracking-wider drop-shadow-[0_0_4px_rgba(6,182,212,0.4)]">LVL 4 // 2,450 XP</span>
                  </div>
                  <ChevronDown className="ml-auto size-3 opacity-30 group-hover/footer:opacity-70 transition-opacity" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" className="w-[--radix-dropdown-menu-trigger-width] bg-black/95 backdrop-blur-2xl border-white/10 text-white">
                <DropdownMenuItem className="hover:bg-violet-500/20 cursor-pointer">View Profile</DropdownMenuItem>
                <DropdownMenuItem className="hover:bg-violet-500/20 cursor-pointer">System Settings</DropdownMenuItem>
                <Separator className="bg-white/10 my-1" />
                <DropdownMenuItem className="text-red-400 hover:bg-red-900/20 cursor-pointer">Log Out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function AppHeader() {
  const pathname = usePathname();
  const pageName = mainNav.find(n => n.href === pathname)?.name || "Dashboard";
  const pageIcon = mainNav.find(n => n.href === pathname)?.icon;
  const IconComponent = pageIcon || Zap;

  return (
    <header className="sticky top-0 z-50 flex h-16 shrink-0 items-center gap-3 px-6 transition-all mt-4 ml-4 mr-4 rounded-xl border border-white/[0.06] bg-black/50 backdrop-blur-2xl shadow-[0_4px_30px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.03)]">
      <SidebarTrigger className="-ml-2 text-white/40 hover:text-cyan-400 transition-all hover:bg-white/5 hover:shadow-[0_0_12px_rgba(6,182,212,0.15)]" />
      <div className="h-6 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
      <div className="flex flex-1 items-center gap-3">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/15 to-cyan-500/10 border border-violet-500/20">
          <IconComponent className="size-4 text-violet-400 drop-shadow-[0_0_8px_rgba(139,92,246,0.4)]" />
        </div>
        <div className="flex flex-col">
          <h1 className="text-sm font-bold tracking-[0.15em] text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-violet-300 uppercase font-mono">
            {pageName}
          </h1>
          <span className="text-[9px] font-mono text-white/25 tracking-widest">SYSTEM.ACTIVE // NEXUS</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <SyncStatusIndicator />
        <div className="h-5 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
        <ThemeToggle />
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isFocusMode, toggleFocusMode } = useFocusStore();

  return (
    <SidebarProvider>
      <div className="fixed inset-0 z-0 pointer-events-none">
        <GravityField />
        <CyberGrid />
      </div>
      <NexusCursor />

      {!isFocusMode && <AppSidebar />}

      <SidebarInset className="bg-transparent z-10">
        {!isFocusMode && <AppHeader />}

        <motion.main
          layout
          className={cn(
            "flex-1 overflow-auto transition-all duration-500 ease-in-out p-4",
            isFocusMode ? "container mx-auto max-w-4xl py-12 px-4 bg-black/80 backdrop-blur-3xl rounded-3xl border border-white/10 shadow-2xl my-8" : ""
          )}
        >
          {children}
        </motion.main>
      </SidebarInset>

      <AnimatePresence>
        {isFocusMode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <Button
              variant="outline"
              size="sm"
              className="shadow-[0_0_30px_purple] border-violet-500/40 bg-black/80 backdrop-blur-xl hover:bg-violet-900/20 text-violet-200"
              onClick={toggleFocusMode}
            >
              <LayoutIcon className="mr-2 h-4 w-4" />
              EXIT ZEN MODE
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <QuickCapture />
      <CommandMenu />

      {/* Ambient scanline overlay */}
      <div className="fixed inset-0 z-[100] pointer-events-none scanline opacity-20" />
    </SidebarProvider>
  );
}
