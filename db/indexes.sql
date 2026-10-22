-- Indexes that cure the slow queries in db/queries/. Apply after the schema (and the seed):
--   npm run db:indexes
-- Kept apart from schema.sql so that EXPLAIN "before" can be taken on the schema alone.
-- Safe to run again.

-- q1: case-insensitive lookup. Expression index: a plain index on display_name is ignored
-- by `lower(display_name) = ...`, the query has to repeat exactly this expression.
CREATE INDEX IF NOT EXISTS idx_users_display_name_lower ON users (lower(display_name));

-- q2: old orders that are still pending (pending is about 8% of the table). Partial index: it holds only
-- those rows, and INCLUDE makes the query an Index Only Scan.
CREATE INDEX IF NOT EXISTS idx_orders_pending_created_at ON orders (created_at) INCLUDE (id, buyer_id)
  WHERE status = 'pending';

-- q3: equality on currency, range on price_cents, sorted by price_cents. Equality column first, range second.
CREATE INDEX IF NOT EXISTS idx_products_currency_price_id ON products (currency, price_cents, id);

-- q4: full-text search over the generated products.search_vector column.
CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING GIN (search_vector);

-- Fresh statistics: the planner knows nothing about the new indexes (expression statistics for
-- lower(display_name) appear only after ANALYZE). No VACUUM here: it cannot run inside the -1 transaction.
ANALYZE users, products, orders, order_items;
