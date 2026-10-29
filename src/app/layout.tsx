import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Entrepreneurship Club — ALTA School of Technology, ADYPU",
  description:
    "The official platform of the Entrepreneurship Club at ALTA School of Technology, Ajeenkya DY Patil University, Pune. Discover events, meet the team, read announcements and apply for membership.",
  icons: { icon: "/brand/favicon.png" },
};

// Runs before first paint: applies the stored theme (or the OS preference when unset)
// so night mode never flashes. Mirrors the logic in src/lib/theme.ts (which takes over
// after hydration); kept dependency-free and exception-safe on purpose.
const themeBootScript = `(function(){try{var t=localStorage.getItem('ec-theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light'}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
