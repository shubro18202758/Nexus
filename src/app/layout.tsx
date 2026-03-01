import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NEXUS — Multi-Agent Life Ops",
  description: "AI-powered student life operations system with multi-agent intelligence",
};

import { AppShell } from "@/components/layout/app-shell";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { RagProvider } from "@/components/providers/rag-provider";
import { DatabaseProvider } from "@/components/providers/db-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased aura-bg font-sans selection:bg-primary/30 selection:text-primary-foreground`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <DatabaseProvider>
            <RagProvider>
              <AppShell>{children}</AppShell>
            </RagProvider>
          </DatabaseProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
