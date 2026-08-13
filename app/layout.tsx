import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const previewImage = `${protocol}://${host}/og.png`;

  return {
    title: "ASCN.AI Agent — Telegram & WhatsApp CRM",
    description: "Лиды, диалоги, мультиязычные рассылки и автоцепочки в одном кабинете.",
    icons: {
      icon: "/emblem.svg",
      shortcut: "/emblem.svg",
    },
    openGraph: {
      title: "ASCN.AI Agent — Telegram & WhatsApp CRM",
      description: "Лиды, диалоги, мультиязычные рассылки и автоцепочки в одном кабинете.",
      images: [previewImage],
    },
    twitter: {
      card: "summary_large_image",
      title: "ASCN.AI Agent — Telegram & WhatsApp CRM",
      description: "Лиды, диалоги, мультиязычные рассылки и автоцепочки в одном кабинете.",
      images: [previewImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
