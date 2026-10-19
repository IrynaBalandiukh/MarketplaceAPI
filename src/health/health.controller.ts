import { Controller, Get, Logger, Res, VERSION_NEUTRAL } from "@nestjs/common";
import type { Response } from "express";
import { DatabaseService } from "../database/database.service.js";

@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly database: DatabaseService) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response) {
    const base = {
      pid: process.pid,
      uptime_seconds: Math.round(process.uptime()),
    };
    try {
      await this.database.query("SELECT 1");
      return { status: "ok", database: "up", ...base };
    } catch (error) {
      this.logger.error(`Database check failed: ${(error as Error).message}`);
      res.status(503);
      return { status: "degraded", database: "down", ...base };
    }
  }
}
