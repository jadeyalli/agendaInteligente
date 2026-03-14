import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ToastProvider } from "@/components/ui/ToastProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://agenda-inteligente.vercel.app';

export const metadata: Metadata = {
  title: {
    default: "Agenda Inteligente",
    template: "%s · Agenda Inteligente",
  },
  description: "Organiza tu tiempo con inteligencia artificial. Agenda eventos, tareas y recordatorios de forma automática respetando tus prioridades y horarios.",
  metadataBase: new URL(APP_URL),
  openGraph: {
    type: "website",
    siteName: "Agenda Inteligente",
    title: "Agenda Inteligente",
    description: "Organiza tu tiempo con inteligencia artificial. Eventos, tareas y recordatorios agendados automáticamente.",
    locale: "es_MX",
    url: APP_URL,
  },
  twitter: {
    card: "summary",
    title: "Agenda Inteligente",
    description: "Organiza tu tiempo con inteligencia artificial.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
