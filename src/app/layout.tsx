import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/components/auth-provider";
import { StudyProvider } from "@/components/study-provider";
import { MusicProvider } from "@/components/music-provider";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/navbar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <MusicProvider>
          <StudyProvider>
            <Navbar />
            <main className="flex-1">{children}</main>
            <Toaster richColors />
          </StudyProvider>
          </MusicProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
