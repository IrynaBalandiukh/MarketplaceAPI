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
npx @redocly/cli lint openapi/openapi.yaml
```
