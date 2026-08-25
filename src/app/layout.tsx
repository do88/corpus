import type { Metadata, Viewport } from "next";
import { Offline } from "@/components/offline";
import { TabBar } from "@/components/tab-bar";
import { Theme } from "@/components/theme";
import "./globals.css";

/**
 * No webfont, deliberately.
 *
 * `-apple-system` resolves to SF Pro on iOS and macOS, which is the single
 * biggest thing that stops a web app feeling like a web page — the type is
 * literally the system's. It also removes a font download and the swap flash
 * that comes with it, which matters more on a phone than a chosen typeface
 * does. Roboto and Segoe carry the same intent on Android and Windows.
 */
const SYSTEM_SANS = [
  "-apple-system",
  "BlinkMacSystemFont",
  '"SF Pro Text"',
  '"Segoe UI"',
  "Roboto",
  '"Helvetica Neue"',
  "Arial",
  "sans-serif",
].join(", ");

export const metadata: Metadata = {
  title: "do.fit",
  description: "Food logging by photo and a sentence.",
  appleWebApp: {
    // Runs full-screen from the home screen with no Safari chrome, and the
    // translucent status bar lets the app's own background sit behind it.
    capable: true,
    statusBarStyle: "black-translucent",
    title: "do.fit",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f1f2f6" },
    { media: "(prefers-color-scheme: dark)", color: "#131417" },
  ],
  // `viewportFit: cover` is what puts the layout under the notch and home
  // indicator, which is what makes `env(safe-area-inset-*)` mean anything.
  viewportFit: "cover",
  // A tracker is a lot of small numbers; pinch-zooming it just breaks the
  // layout, and double-tap-to-zoom adds 300ms to every tap.
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes stamps the class on <html> before
    // React hydrates, so the server markup and the client's never match here.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col" style={{ fontFamily: SYSTEM_SANS }}>
        <Offline>
          <Theme>
            {children}
            <TabBar />
          </Theme>
        </Offline>
      </body>
    </html>
  );
}
