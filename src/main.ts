import { join } from "node:path";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { VersioningType } from "@nestjs/common";
import * as OpenApiValidator from "express-openapi-validator";

import { AppModule } from "./app.module.js";
import { ProblemFilter } from "./problem.filter.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.useBodyParser("json");

  app.enableVersioning({ type: VersioningType.URI, defaultVersion: "1" });

  app.use(
    OpenApiValidator.middleware({
      apiSpec: join(import.meta.dirname, "..", "openapi", "openapi.yaml"),
      validateRequests: true,
      validateResponses: true,
    }),
  );

  app.useGlobalFilters(new ProblemFilter());

  await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
