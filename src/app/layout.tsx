import type { Metadata, Viewport } from "next";
import { Source_Sans_3 } from "next/font/google";
import { Theme } from "@/components/theme";
import "./globals.css";

/**
 * Source Sans 3 — humanist rather than grotesque. Helvetica is the reflex for
 * Swiss work, but its closed apertures collapse at the 11px the labels use on
 * a phone; a humanist skeleton stays legible that small.
 */
const sans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Corpus",
  description: "Food logging by photo and a sentence.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f9f8f5" },
    { media: "(prefers-color-scheme: dark)", color: "#26262b" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes stamps the class on <html> before
    // React hydrates, so the server markup and the client's never match here.
    <html lang="en" className={`${sans.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <Theme>{children}</Theme>
      </body>
    </html>
  );
}
