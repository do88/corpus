import postgres from "postgres";

/**
 * The one Postgres connection. Server-side only — it holds the service-role
 * credentials and bypasses RLS, which is what the importers and the
 * verification gate need.
 */
const CONNECTION =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * Supabase's transaction pooler (port 6543) is the right endpoint for anything
 * serverless — a direct connection per invocation exhausts the database's
 * connection limit fast. It multiplexes, which means a statement prepared on
 * one connection may be executed on another, so prepared statements have to be
 * off. Leaving them on produces "prepared statement does not exist" under load
 * and nowhere else, which is a miserable thing to debug in production.
 */
const isPooled = CONNECTION.includes("pooler.supabase.com:6543");

const sql = postgres(
  CONNECTION,
  {
    prepare: !isPooled,
    /**
     * More than one connection even when pooled, which the first version got
     * wrong for a plausible-sounding reason: "the pooler is doing the pooling".
     * Supavisor pools *across* clients. It does nothing to make one client's
     * own queue concurrent, and `max: 1` is a queue.
     *
     * It interacts badly with `prepare: false`, which transaction-mode pooling
     * requires. In postgres.js, `describeFirst` is set for any query carrying
     * bind parameters that is not already prepared (`src/connection.js`), and a
     * connection with a describe in flight is moved to the `full` queue — so it
     * dispatches nothing else until that query completes. With a single
     * connection there is nothing to fall back to, and the eleven dashboard
     * queries that `getDashboardData` deliberately runs through `Promise.all`
     * were being served strictly one at a time.
     *
     * Four is enough to keep the fan-out moving without a serverless instance
     * holding an unreasonable share of the pooler's slots.
     */
    max: isPooled ? 4 : 10,
    // postgres.js returns numerics as strings to protect precision. Every
    // numeric here is a body weight or a rep count, so a JS number is fine and
    // the alternative is string arithmetic scattered through the metrics layer.
    types: {
      // Postgres `date` has no time or zone, and Alpha 1 stored dates as
      // 'YYYY-MM-DD' text. Handing them back as strings keeps every date in the
      // app identical to Alpha 1's and makes the verification gate's diff
      // meaningful — a JS Date here would compare unequal for formatting alone.
      date: {
        to: 1082,
        from: [1082],
        serialize: (x: string) => x,
        parse: (x: string) => x,
      },
      numeric: {
        to: 1700,
        from: [1700],
        serialize: (x: number) => String(x),
        parse: (x: string) => Number(x),
      },
    },
  },
);

export default sql;
