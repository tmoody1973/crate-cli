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
    "82 tools across 15 sources. Influence tracing powered by Harvard research. The deepest music discovery CLI ever built.",
  openGraph: {
    title: "Crate — AI-Powered Music Research Agent",
    description:
      "82 tools across 15 sources. Influence tracing powered by Harvard research.",
    type: "website",
    url: "https://crate-cli.vercel.app",
  },
  twitter: {
    card: "summary_large_image",
    title: "Crate — AI-Powered Music Research Agent",
    description:
      "82 tools across 15 sources. Influence tracing powered by Harvard research.",
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
