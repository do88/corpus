import { ImageResponse } from "next/og";

/**
 * The app icon, rendered on demand at whatever size is asked for.
 *
 * Generated rather than checked in because the alternative is a build step with
 * an image library for what is three rectangles. Next renders it, the manifest
 * points at `/icons/192` and `/icons/512`, and there is no binary in the repo
 * that can drift from the design.
 *
 * The mark is the open ring around a dot — see `components/brand.tsx` for what
 * it means — on an ink ground so it reads against any launcher wallpaper.
 */
// No `force-static` any more: under Cache Components a GET handler prerenders
// by itself when it touches no runtime data, and this one only reads `params`.
// `generateStaticParams` below names both sizes, so both are built once.

const ALLOWED = new Set(["192", "512"]);

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (!ALLOWED.has(size)) return new Response("Not found", { status: 404 });

  const px = Number(size);

  // The same geometry as `components/brand.tsx` and `app/icon.svg`. Satori
  // renders inline SVG, so the mark is drawn rather than approximated with
  // divs and borders. 0.62 leaves the padding a launcher icon needs before
  // Android's maskable crop takes a bite out of it.
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          // Ink rather than the app's grey: a launcher icon has to hold its own
          // against an arbitrary wallpaper, and the maskable variant gets
          // cropped to a circle by Android — a pale ground would lose its edge.
          background: "#17181c",
        }}
      >
        <svg width={px * 0.62} height={px * 0.62} viewBox="0 0 32 32" fill="none">
          <circle
            cx="16"
            cy="16"
            r="11"
            stroke="#f2f3f7"
            strokeWidth="3.6"
            strokeLinecap="round"
            strokeDasharray="56.06 69.12"
            transform="rotate(-90 16 16)"
          />
          <circle cx="5.80" cy="11.88" r="3.4" fill="#4d8dfa" />
        </svg>
      </div>
    ),
    { width: px, height: px },
  );
}

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}
