import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as OpenApiValidator from "express-openapi-validator";
import swaggerUi from "swagger-ui-express";
import { parse } from "yaml";

import { AppModule } from "./app.module.js";
import type { Env } from "./config/env.schema.js";
import { ProblemFilter } from "./problem.filter.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.useBodyParser("json");
  app.enableShutdownHooks();

  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  const specPath = join(import.meta.dirname, "..", "openapi", "openapi.yaml");
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(parse(readFileSync(specPath, "utf8"))),
  );

  app.use(
    OpenApiValidator.middleware({
      apiSpec: specPath,
      validateRequests: true,
      validateResponses: true,
    }),
  );

  app.useGlobalFilters(new ProblemFilter());

  await app.listen(config.get("PORT", { infer: true }));
}

await bootstrap();
