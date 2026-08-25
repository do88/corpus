import { ImageResponse } from "next/og";

/**
 * The app icon, rendered on demand at whatever size is asked for.
 *
 * Generated rather than checked in because the alternative is a build step with
 * an image library for what is three rectangles. Next renders it, the manifest
 * points at `/icons/192` and `/icons/512`, and there is no binary in the repo
 * that can drift from the design.
 *
 * The mark is the same circle, triangle and square the header carries, on the
 * ink ground so it reads on any launcher wallpaper.
 */
export const dynamic = "force-static";

const ALLOWED = new Set(["192", "512"]);

export async function GET(_request: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size } = await params;
  if (!ALLOWED.has(size)) return new Response("Not found", { status: 404 });

  const px = Number(size);
  const unit = px * 0.18;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: unit * 0.4,
          background: "#26262b",
        }}
      >
        <div
          style={{ width: unit, height: unit, borderRadius: "50%", background: "#d94a3d" }}
        />
        <div
          style={{
            width: 0,
            height: 0,
            borderLeft: `${unit / 2}px solid transparent`,
            borderRight: `${unit / 2}px solid transparent`,
            borderBottom: `${unit * 0.88}px solid #e8b23a`,
          }}
        />
        <div style={{ width: unit, height: unit, background: "#4a6fd4" }} />
      </div>
    ),
    { width: px, height: px },
  );
}

export function generateStaticParams() {
  return [{ size: "192" }, { size: "512" }];
}
