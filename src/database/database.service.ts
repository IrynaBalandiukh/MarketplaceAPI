import { readFile } from "node:fs/promises";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import pg from "pg";
import type { Env } from "../config/env.schema.js";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: pg.Pool;

  constructor(config: ConfigService<Env, true>) {
    // The URL carries host, port, user and database. The password is deliberately not in it: it is
    // read from the file for every new connection, so scripts/rotate.sh works without a restart.
    const url = new URL(config.get("DB_URL", { infer: true }));
    const passwordFile = config.get("DB_PASSWORD_FILE", { infer: true });

    this.pool = new pg.Pool({
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      user: decodeURIComponent(url.username),
      database: decodeURIComponent(url.pathname.slice(1)),
      max: 5,
      connectionTimeoutMillis: 3000,
      password: async () => (await readFile(passwordFile, "utf8")).trim(),
    });

    this.pool.on("error", (error) => {
      this.logger.warn(`Idle database connection lost: ${error.message}`);
    });
  }

  query(text: string) {
    return this.pool.query(text);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
