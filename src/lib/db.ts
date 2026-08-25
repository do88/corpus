import postgres from "postgres";

/**
 * The one Postgres connection. Server-side only — it holds the service-role
 * credentials and bypasses RLS, which is what the importers and the
 * verification gate need.
 */
/**
 * The local Docker stack, and only ever as a *development* convenience.
 *
 * This default used to apply everywhere, which turned a missing environment
 * variable into a connection attempt against `127.0.0.1` on a Netlify server —
 * where nothing is listening. The server component threw, and production
 * reported it as React error #441: "an error occurred in the Server Components
 * render", with the specifics omitted. A whole page down, and the log said
 * ECONNREFUSED against localhost rather than naming the variable nobody set.
 *
 * Outside development the variable is now required, and its absence says so.
 */
const LOCAL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function connectionString(): string {
  const configured = process.env.DATABASE_URL;
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "DATABASE_URL is not set. The training dashboard needs a direct Postgres " +
        "connection — PostgREST cannot express its queries — so this cannot fall " +
        "back to the local stack. Use the Supabase *session* pooler, port 5432 " +
        "on the pooler host, not the transaction pooler on 6543: see the README.",
    );
  }
  return LOCAL;
}

const CONNECTION = connectionString();

/**
 * Transaction pooling, and why this app does not use it.
 *
 * Port 6543 on the pooler host is Supavisor in transaction mode, and it is the
 * usual advice for anything serverless: it multiplexes, so a hundred short-lived
 * invocations do not become a hundred server connections. It also forbids
 * prepared statements, because a statement prepared on one connection may be
 * executed on another.
 *
 * It did not work here, and the failure was ugly. Every dashboard query is fast
 * against the hosted database on its own — 24 to 179 ms, measured — but the ten
 * of them that `getDashboardData` runs through `Promise.all` either hung past
 * seven minutes or came back as `canceling statement due to statement timeout`.
 * In production that was a hard function crash on `/training` while each of its
 * queries was individually healthy, which is about the least informative way a
 * page can fail.
 *
 * The likely mechanism is `prepare: false`. postgres.js sets `describeFirst` on
 * any parameterised query that is not already prepared, so each one needs a
 * Describe round trip before its Bind and Execute — and transaction mode is
 * free to hand those to different server connections. Whatever the exact cause,
 * the same code against the *session* pooler on 5432 returns the whole dashboard
 * immediately.
 *
 * So: port 5432, session mode. Each client gets a real connection for its
 * lifetime, prepared statements work, and the multiplexing this app does not
 * need is not worth a page that cannot render. `isPooled` therefore matches only
 * the transaction pooler — a session-mode URL is treated as the ordinary
 * connection it behaves like.
 */
const isPooled = CONNECTION.includes("pooler.supabase.com:6543");

/**
 * Modest even on a real connection. Ten was fine against a local Docker
 * Postgres and is not a sensible share of a hosted project's connection limit
 * once several serverless instances are warm at once.
 */
const isLocal = CONNECTION.includes("127.0.0.1") || CONNECTION.includes("localhost");

const sql = postgres(
  CONNECTION,
  {
    prepare: !isPooled,
    max: isPooled ? 1 : isLocal ? 10 : 4,
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
