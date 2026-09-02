/**
 * The slice of `node:sqlite` the port scripts use.
 *
 * Node has shipped the module since 22.5; the installed @types/node predates
 * it. The Hevy port never noticed because it is plain JavaScript. This is
 * deliberately only what is called, so a wrong guess about the rest of the
 * API cannot be relied on by accident.
 */
declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean });
    prepare(sql: string): { all(): unknown[] };
    exec(sql: string): void;
    close(): void;
  }
}
