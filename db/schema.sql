-- Marketplace schema. Apply to an empty database (as the `app` role, which owns it):
--   npm run db:schema
-- The script runs in one transaction: it either creates everything or nothing.
--
-- Money is numeric(12,2), never float. The API contract uses integer cents (price_cents),
-- so the service layer converts: price_cents = round(price * 100).
-- An order's total is not stored: it is sum(quantity * unit_price) over its items, so it cannot
-- disagree with them.

CREATE TABLE users (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Stored lower-cased (the CHECK enforces it), so a plain UNIQUE constraint makes emails unique
  -- regardless of letter case; the service lower-cases the address before the INSERT.
  email         text        NOT NULL UNIQUE CHECK (email LIKE '%_@_%' AND email = lower(email)),
  display_name  text        NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id           uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id    uuid          NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  title        text          NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description  text          CHECK (char_length(description) <= 2000),
  price        numeric(12,2) NOT NULL CHECK (price >= 0),
  currency     text          NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at   timestamptz   NOT NULL DEFAULT now(),
  -- Catalogue search (query q4). Generated, so nobody maintains it by hand on INSERT/UPDATE.
  -- 'simple' = no stemming: the words are only lower-cased, see "Морфологія" in OPTIMIZATIONS.md.
  search_vector tsvector     GENERATED ALWAYS AS
                             (to_tsvector('simple', title || ' ' || coalesce(description, ''))) STORED
);

CREATE TABLE orders (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id         uuid        NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  status           text        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
  currency         text        NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  idempotency_key  text        CHECK (char_length(idempotency_key) BETWEEN 1 AND 255),
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- The same key cannot create two orders for one buyer (NULLs are allowed many times).
  UNIQUE (buyer_id, idempotency_key)
);

CREATE TABLE order_items (
  order_id    uuid          NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
  product_id  uuid          NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  quantity    integer       NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  -- Price at the time of purchase: a later price change must not rewrite old orders.
  unit_price  numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  -- One row per product in an order; a repeat is an increase of quantity.
  PRIMARY KEY (order_id, product_id)
);

-- No indexes on products.seller_id, created_at or order_items.product_id: nothing queries them yet (GET /products and /orders
-- do not read the database). Add them together with the query that needs them.
