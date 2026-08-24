import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";

/** Read back what the background function wrote. The client polls this. */
export default async (_req: Request, context: Context) => {
  const job = await getStore("jobs").get(context.params.id, { type: "json" });
  return job ? Response.json(job) : new Response("no such job", { status: 404 });
};

export const config: Config = {
  path: "/jobs/status/:id",
};
