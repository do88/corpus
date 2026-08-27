import type { Metadata, Viewport } from "next";
import { Offline } from "@/components/offline";
import { HeaderControls } from "@/components/header-controls";
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
  // Zoom stays available. This used to pin `maximumScale: 1` with
  // `userScalable: false` to feel more native, which is a WCAG 1.4.4 failure:
  // it takes pinch-zoom away from exactly the people who need it, and "a
  // tracker is a lot of small numbers" is an argument *for* letting someone
  // enlarge them, not against. The 300ms tap delay it also claimed to avoid
  // has not existed since browsers started honouring `width=device-width`.
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: next-themes stamps the class on <html> before
    // React hydrates, so the server markup and the client's never match here.
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col" style={{ fontFamily: SYSTEM_SANS }}>
        <Offline>
          <Theme>
            {/*
              Rendered here so it survives a navigation. A layout is not
              re-rendered when you move between the routes beneath it, which is
              exactly the property these two want and the page header could not
              give them.
            */}
            <HeaderControls />
            {children}
            <TabBar />
          </Theme>
        </Offline>
      </body>
    </html>
  );
}
