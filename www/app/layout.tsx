import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { Playfair_Display } from "next/font/google";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Crate — AI-Powered Music Research Agent",
  description:
    "92 tools across 17 sources. Influence tracing powered by Harvard research. The deepest music discovery CLI ever built.",
  openGraph: {
    title: "Crate — AI-Powered Music Research Agent",
    description:
      "92 tools across 17 sources. Influence tracing backed by Harvard research. Every claim cited, every track verified.",
    type: "website",
    url: "https://crate-cli.dev",
    images: [
      {
        url: "https://crate-cli.dev/og-image.png",
        width: 1200,
        height: 630,
        alt: "Crate — 92 AI-powered tools for deep music research in the terminal",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Crate — AI-Powered Music Research Agent",
    description:
      "92 tools across 17 sources. Influence tracing backed by Harvard research. Every claim cited, every track verified.",
    images: ["https://crate-cli.dev/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistMono.variable} ${playfair.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
