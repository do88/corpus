import { afterEach, describe, expect, it, vi } from "vitest";
import { requestEstimate } from "./enqueue";

describe("requestEstimate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses the local Next worker adapter outside production", async () => {
    const request = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", request);

    await requestEstimate("4a65142c-278f-48fe-8571-2a18a785c1bb", "token");

    expect(request).toHaveBeenCalledWith(
      "/api/meals/process",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });

  it("uses the same route in production, not a host-specific path", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const request = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", request);

    await requestEstimate("4a65142c-278f-48fe-8571-2a18a785c1bb", "token");

    expect(request).toHaveBeenCalledWith("/api/meals/process", expect.any(Object));
  });
});
