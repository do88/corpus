import type { MetadataRoute } from "next";

/**
 * What makes this installable to the Android home screen rather than a tab.
 *
 * `display: standalone` is the point — no address bar, so it opens like an app
 * and the camera button is one tap from the launcher. `orientation: portrait`
 * because it is a phone-held-one-handed tool and there is no landscape layout
 * worth having.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "do.fit",
    short_name: "do.fit",
    description: "Food logging by photo and a sentence.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f1f2f6",
    theme_color: "#f1f2f6",
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
