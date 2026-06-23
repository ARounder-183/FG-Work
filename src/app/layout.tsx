import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/components/auth-provider";
import { StudyProvider } from "@/components/study-provider";
import { MusicProvider } from "@/components/music-provider";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "FG自习室 - 在线自习 & 一起听歌",
  description: "一个在线自习室，支持打卡计时、发帖朋友圈和一起听歌",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="h-full flex flex-col overflow-hidden">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <AuthProvider>
            <MusicProvider>
            <StudyProvider>
              <Navbar />
              <main className="flex-1 overflow-y-auto">{children}</main>
              <Toaster richColors />
            </StudyProvider>
            </MusicProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
