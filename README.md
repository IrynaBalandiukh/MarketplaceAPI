# Marketplace API

A marketplace REST API built with Node.js and NestJS.
The API is designed contract-first: the OpenAPI spec comes before the code.

This README documents how the API is built, step by step.

## Step 1: The OpenAPI spec

The contract lives in [`openapi/openapi.yaml`](openapi/openapi.yaml) (OpenAPI 3.0.3).

### Operations

| Resource | operationId     | Method and path              | Notes                      |
| -------- | --------------- | ---------------------------- | -------------------------- |
| Products | `listProducts`  | `GET /products`              | cursor pagination          |
| Products | `createProduct` | `POST /products`             |                            |
| Products | `getProduct`    | `GET /products/{product_id}` |                            |
| Orders   | `listOrders`    | `GET /orders`                | cursor pagination          |
| Orders   | `createOrder`   | `POST /orders`               | requires `Idempotency-Key` |
| Orders   | `getOrder`      | `GET /orders/{order_id}`     |                            |

### Design rules

- **Versioning.** The major version is part of the URL: `servers` points to `/v1`.
  `info.version` is the version of the contract document and is independent of it.
- **Naming.** All JSON fields and path parameters use `snake_case` (`next_cursor`, `price_cents`).
- **Cursor pagination.** Lists take `limit` and an optional `cursor` and return
  `{ items, next_cursor }`. `next_cursor` is `null` when there are no more pages.
  The cursor is an opaque token: clients must not parse or build it.
- **Idempotency.** `POST /orders` requires an `Idempotency-Key` header. The same key with
  the same body returns the same response (`201`, with an `Idempotency-Replay: true`
  header on replays). The same key with a different body returns `422`.
- **Errors.** Every 4xx response is `application/problem+json` (RFC 9457) with the shared
  `Problem` schema: `type`, `title`, `status`, `detail`, `instance`.
- **Reuse.** Parameters, schemas and error responses are defined once under `components`
  and referenced with `$ref`.

| Status | Meaning                                                                                   |
| ------ | ----------------------------------------------------------------------------------------- |
| `400`  | Malformed request (bad JSON, bad query parameter, missing required header)                |
| `404`  | The resource addressed by the URL does not exist                                          |
| `409`  | A request with the same `Idempotency-Key` is still being processed                        |
| `422`  | Well-formed request that breaks a rule (for example, an unknown `product_id` in an order) |

### Checking the spec itself

```
npm run lint:spec
```

The script is [`scripts/lint-spec.mjs`](scripts/lint-spec.mjs). It runs `redocly lint` on
`openapi/openapi.yaml` (the CLI is a devDependency) and passes its exit code through: warnings
are allowed, errors fail with a non-zero code.

## Step 2: The server

A NestJS server (in-memory data) that enforces the spec at runtime. The spec is the single
source of truth: the code has no separate validation rules (no DTO validation).

```
npm install
cp .env.example .env   # Windows cmd/PowerShell: copy .env.example .env
npm start              # builds with tsc and listens on http://localhost:3000/v1
```

The server will not start without a valid `.env`; see Step 3.

`npm start` builds once and exits with the server's exit code. For development use
`npm run start:dev`: it rebuilds on every change and restarts the server (`tsc-watch`).

### Key parts

- **Validation at the border.** `express-openapi-validator` runs as middleware in
  `src/main.ts`. It checks every request and every response against
  `openapi/openapi.yaml` (`validateRequests` and `validateResponses`). A request that breaks
  the spec never reaches a controller; a response that breaks it becomes a `500`, and the
  real cause is logged.
- **Errors as `problem+json`.** `ProblemFilter` (`src/problem.filter.ts`) turns every error,
  from the validator and from Nest alike, into the `Problem` schema from the spec.
  Unexpected errors return no details to the client.
- **URI versioning.** `enableVersioning` serves all routes under `/v1`, matching `servers`.
- **Swagger UI.** Interactive docs are served at `http://localhost:3000/docs`. They are built
  straight from `openapi/openapi.yaml` (`swagger-ui-express`), so the page can never drift
  from the contract. "Try it out" sends real requests to the running server.
- **Cursor pagination.** `paginate()` (`src/common/pagination.ts`) is shared by products and
  orders. The cursor is an opaque base64url token.
- **Idempotency.** `POST /orders` stores the `Idempotency-Key` with a fingerprint of the body.
  A repeat returns the same order with `Idempotency-Replay: true`; the same key with a
  different body returns `422`.

### Structure

```
src/
  main.ts            validator middleware, versioning, error filter
  problem.filter.ts  errors -> application/problem+json
  common/            shared cursor pagination
  products/          controller, service, module (GET, POST /products, GET /products/{id})
  orders/            controller, service, module (GET, POST /orders, GET /orders/{id})
  config/            env schema (zod) and its validation
```

## Step 3: Configuration

Every environment variable is described once, by a zod schema in
[`src/config/env.schema.ts`](src/config/env.schema.ts). The schema runs at start-up through
`ConfigModule.forRoot({ validate })`, so a broken variable stops the process before the server
listens: the output names the variable and the reason, and the exit code is not 0.

```
Error: Invalid environment variables:
  - PORT: Invalid input: expected number, received NaN
```

| Variable | Type | Default | Meaning |
| --- | --- | --- | --- |
| `PORT` | integer 1-65535 | `3000` | HTTP port |
| `DB_PASSWORD_FILE` | string | required | Path to the file with the database password |

- **Typed config only.** Code reads settings through `ConfigService<Env, true>`; nothing reads
  `process.env` outside the schema. Numbers are coerced with `z.coerce`; an empty `PORT=` is
  still rejected, because `z.coerce.number()` alone would turn it into `0`.
- **Only a path for the password.** `DB_PASSWORD_FILE` points to a secret file; the password
  itself never lives in env.
- **`.env.example` is the contract.** It lists every variable of the schema with a comment.
  The real `.env` is git-ignored.
- **`npm run check:env`** compares `.env.example` with the schema and exits with 1 when a
  variable is missing, unknown or has no comment above it.

## Known gaps

Things that are missing, simplified or only half done. Nothing here is forgotten: each item is a deliberate deferral.

### Contract

- **`409` is not implemented.** The spec describes it for `createOrder` (same `Idempotency-Key` still being processed), but the code never returns it.
- **Order statuses.** `paid`, `shipped` and `cancelled` are in the model, but nothing sets them; every order stays `pending`.
- **Sort order is not part of the contract.** The code returns lists newest first (`created_at` descending, `id` as tie-breaker), but the spec does not promise it. A `sort` parameter needs cursors tied to the sort field.
- **No authentication or authorization.** The spec declares this explicitly with a root-level `security: []`. The Redocly linter still warns about the missing `license` and the `localhost` server.
- **Problem `type` values.** Only `validation-error` and `about:blank` exist, and the documentation URL behind `validation-error` does not exist. Business errors (unknown product, reused key, ...) should get their own types.
- **Idempotency only on `POST /orders`.** `POST /products` does not take an `Idempotency-Key`.

### Implementation

- **`DB_PASSWORD_FILE` is not used yet.** The variable is required and validated as a non-empty string, but there is no database in the app and nothing reads the file; the existence of the file is not checked either.
- **Response validation cannot be switched off.** `validateResponses` is hard-coded to `true`. A `VALIDATE_RESPONSES` variable (`true` or `false`, default `true`) is planned, so that it can be disabled in production, where checking every response costs time and a harmless drift would turn into a `500`.
- **In-memory data.** Products, orders and idempotency keys live in process memory and disappear on restart.
- **Idempotency keys are simplified.** They are kept forever (no TTL), are shared by all clients (not scoped per user) and concurrent duplicates are not handled.
- **Error responses are not checked against the spec.** The exception filter sends `problem+json` as a raw string, so the response validator never sees it. The `Problem` shape is duplicated in the code and in the spec.
- **Response headers are not verified.** `Location` and `Idempotency-Replay` are set by hand and described in the spec, but nothing checks them.
- **No automated tests.** Behaviour was verified by hand with `curl`; there are no contract tests (for example Pact) yet.

### Tooling

- **Node.js 20.12.1 is too old** for the Nest 12 CLI and the latest Redocly CLI, so the project is built with plain `tsc` and started with `node`. Upgrading to Node 22 LTS would allow `nest start`.
- **Express 5 instead of Express 4.** NestJS 12 ships with Express 5; `express-openapi-validator` works with it in all checks so far.
