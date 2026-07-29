import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegistration from "./sw-registration";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Office Reception | オフィス受付",
  description: "無人受付システム - ビデオ通話で来訪者確認・電気錠遠隔解錠",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#1a365d",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`${inter.variable} h-full`}>
      <head>
        {/* Noto Sans JPはCDNから読み込む（日本語フォント） */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full" style={{ fontFamily: "'Inter', 'Noto Sans JP', sans-serif" }}>
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
