import { readFile } from "node:fs/promises";
import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import pg from "pg";
import type { Env } from "../config/env.schema.js";

const DB_HOST = "localhost";
const DB_PORT = 5432;
const DB_USER = "app";
const DB_NAME = "marketplace";

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: pg.Pool;

  constructor(config: ConfigService<Env, true>) {
    const passwordFile = config.get("DB_PASSWORD_FILE", { infer: true });

    this.pool = new pg.Pool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      database: DB_NAME,
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
