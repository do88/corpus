import { ImageResponse } from "next/og";

/**
 * The app icon, rendered on demand at whatever size is asked for.
 *
 * Generated rather than checked in because the alternative is a build step with
 * an image library for what is three rectangles. Next renders it, the manifest
 * points at `/icons/192` and `/icons/512`, and there is no binary in the repo
 * that can drift from the design.
 *
 * The mark is the wordmark itself, with the dot of "do.fit" picked out in the
 * app's blue, on an ink ground so it reads against any launcher wallpaper.
 */
export const dynamic = "force-static";

const ALLOWED = new Set(["192", "512"]);

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (!ALLOWED.has(size)) return new Response("Not found", { status: 404 });

  const px = Number(size);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // The app's own blue on near-black, so the icon reads at 48px on a
          // launcher without depending on the wallpaper behind it.
          background: "#17181c",
        }}
      >
        {/* The wordmark reduced to its one distinctive mark: the dot in
            "do.fit". A glyph survives being 48px across; three shapes did not. */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            fontSize: px * 0.34,
            fontWeight: 700,
            letterSpacing: `${-px * 0.012}px`,
            color: "#f2f3f7",
          }}
        >
          do
          <div
            style={{
              width: px * 0.07,
              height: px * 0.07,
              borderRadius: "50%",
              background: "#4d8dfa",
              margin: `0 ${px * 0.018}px`,
            }}
          />
          fit
        </div>
      </div>
    ),
    { width: px, height: px },
  );
}

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}
