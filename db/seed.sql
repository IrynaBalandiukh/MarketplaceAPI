-- Test data for local development. Apply after the schema:
--   npm run db:seed
-- Safe to run again: it empties the four tables first.
--
-- Volume: 20 000 users, 150 000 products, 200 000 orders, ~380 000 order items. Big enough that
-- EXPLAIN shows real plans (on a thousand rows the planner rightly picks Seq Scan whatever the indexes).
-- Distributions are skewed on purpose, like real life:
--   * a few sellers own most products, a few buyers place most orders (power law);
--   * popular products appear in many orders;
--   * order statuses: mostly paid/shipped, few cancelled, pending mostly among recent orders;
--   * prices are log-normal (many cheap items, a long tail of expensive ones);
--   * 70% USD, then EUR, GBP, PLN; most orders have 1 item;
--   * 30% of products have no description; recent dates are more frequent than old ones.
-- Product titles and descriptions are in Ukrainian and use different word forms of the same word
-- (лампа / лампи / ламп), so full-text search has something to match by lemma.
-- setseed makes the random numbers repeat between runs; the uuids themselves still differ.
--
-- The script is NOT one transaction: VACUUM cannot run inside one, so it is applied without psql -1.

SELECT setseed(0.42);

TRUNCATE order_items, orders, products, users;

-- Users -------------------------------------------------------------------------------------
INSERT INTO users (email, display_name, created_at)
SELECT 'user' || g || '@example.com',
       'Користувач ' || g,
       now() - (800 + random() * 200) * interval '1 day'
FROM generate_series(1, 20000) AS g;

CREATE TEMP TABLE _u AS
SELECT id, row_number() OVER (ORDER BY email) AS rn FROM users;
CREATE UNIQUE INDEX ON _u (rn);

-- Ukrainian words ---------------------------------------------------------------------------
-- Nouns: nominative singular/plural, genitive singular/plural, gender (m, f, n).
CREATE TEMP TABLE _noun (i int, nom_sg text, nom_pl text, gen_sg text, gen_pl text, gender char(1));
INSERT INTO _noun VALUES
  (1,  'лампа',       'лампи',       'лампи',       'ламп',        'f'),
  (2,  'рюкзак',      'рюкзаки',     'рюкзака',     'рюкзаків',    'm'),
  (3,  'клавіатура',  'клавіатури',  'клавіатури',  'клавіатур',   'f'),
  (4,  'стілець',     'стільці',     'стільця',     'стільців',    'm'),
  (5,  'камера',      'камери',      'камери',      'камер',       'f'),
  (6,  'годинник',    'годинники',   'годинника',   'годинників',  'm'),
  (7,  'пляшка',      'пляшки',      'пляшки',      'пляшок',      'f'),
  (8,  'зошит',       'зошити',      'зошита',      'зошитів',     'm'),
  (9,  'колонка',     'колонки',     'колонки',     'колонок',     'f'),
  (10, 'куртка',      'куртки',      'куртки',      'курток',      'f'),
  (11, 'чашка',       'чашки',       'чашки',       'чашок',       'f'),
  (12, 'дзеркало',    'дзеркала',    'дзеркала',    'дзеркал',     'n'),
  (13, 'велосипед',   'велосипеди',  'велосипеда',  'велосипедів', 'm'),
  (14, 'ковдра',      'ковдри',      'ковдри',      'ковдр',       'f'),
  (15, 'крісло',      'крісла',      'крісла',      'крісел',      'n');

-- Adjectives with a capital letter (they open a title or a sentence): masculine, feminine, neuter.
CREATE TEMP TABLE _adj (i int, m text, f text, n text);
INSERT INTO _adj VALUES
  (1,  'Вінтажний',   'Вінтажна',   'Вінтажне'),
  (2,  'Сучасний',    'Сучасна',    'Сучасне'),
  (3,  'Компактний',  'Компактна',  'Компактне'),
  (4,  'Бездротовий', 'Бездротова', 'Бездротове'),
  (5,  'Класичний',   'Класична',   'Класичне'),
  (6,  'Саморобний',  'Саморобна',  'Саморобне'),
  (7,  'Преміальний', 'Преміальна', 'Преміальне'),
  (8,  'Портативний', 'Портативна', 'Портативне'),
  (9,  'Екологічний', 'Екологічна', 'Екологічне'),
  (10, 'Розумний',    'Розумна',    'Розумне');

-- Products ----------------------------------------------------------------------------------
-- Only the first 2 000 users sell, and the lower the number, the more they sell (random()^2.5).
-- Some nouns are far more common than others (random()^1.5 over the list).
INSERT INTO products (seller_id, title, description, price, currency, created_at)
SELECT u.id,
       af.adj_form || ' ' || n.nom_sg,
       CASE WHEN s.r_desc < 0.7 THEN
         CASE s.tpl
           WHEN 0 THEN af.adj_form || ' ' || n.nom_sg || ' у відмінному стані. Користувалися обережно, без подряпин.'
           WHEN 1 THEN 'Комплект із двох ' || n.gen_pl || ' у подарунковому пакованні.'
           WHEN 2 THEN 'Наявні ' || n.nom_pl || ' різних кольорів, відправка протягом доби.'
           WHEN 3 THEN 'Без ' || n.gen_sg || ' не обійтися вдома чи в дорозі. Гарантія від продавця.'
           ELSE 'Популярний вибір: ' || n.nom_sg || ' з доставкою по всій Україні.'
         END
       END,
       -- sum of three uniforms ~ a bell curve; exp() turns it into a log-normal price, median ~35
       GREATEST(0.99, LEAST(99999.99, round(exp(3.5 + 4 * (s.r1 + s.r2 + s.r3 - 1.5))::numeric, 2))),
       CASE WHEN s.r_cur < 0.70 THEN 'USD'
            WHEN s.r_cur < 0.90 THEN 'EUR'
            WHEN s.r_cur < 0.96 THEN 'GBP'
            ELSE 'PLN' END,
       now() - power(s.r_age, 2) * 730 * interval '1 day'
FROM (
  SELECT 1 + floor(2000 * power(random(), 2.5))::int AS seller_rn,
         1 + floor(15 * power(random(), 1.5))::int AS noun_i,
         1 + floor(10 * random())::int AS adj_i,
         floor(5 * random())::int AS tpl,
         random() AS r_desc, random() AS r1, random() AS r2, random() AS r3,
         random() AS r_cur, random() AS r_age
  FROM generate_series(1, 150000)
) AS s
JOIN _u AS u ON u.rn = s.seller_rn
JOIN _noun AS n ON n.i = s.noun_i
JOIN _adj AS a ON a.i = s.adj_i
CROSS JOIN LATERAL (
  SELECT CASE n.gender WHEN 'm' THEN a.m WHEN 'f' THEN a.f ELSE a.n END AS adj_form
) AS af;

-- Products numbered inside each currency: an order may contain only products of its own currency.
CREATE TEMP TABLE _p AS
SELECT id, currency, price, row_number() OVER (PARTITION BY currency ORDER BY id) AS rn FROM products;
CREATE UNIQUE INDEX ON _p (currency, rn);
CREATE TEMP TABLE _pc AS SELECT currency, count(*)::int AS n FROM products GROUP BY currency;

-- Orders ------------------------------------------------------------------------------------
-- Buyers are skewed too (random()^2 over all users): a small group places most orders.
CREATE TEMP TABLE _o AS
SELECT id, buyer_rn, age_days, r_status, n_items, r_base,
       CASE WHEN r_cur < 0.70 THEN 'USD'
            WHEN r_cur < 0.90 THEN 'EUR'
            WHEN r_cur < 0.96 THEN 'GBP'
            ELSE 'PLN' END AS currency
FROM (
  SELECT gen_random_uuid() AS id,
         1 + floor(20000 * power(random(), 2))::int AS buyer_rn,
         power(random(), 2) * 700 AS age_days,
         random() AS r_status,
         random() AS r_cur,
         random() AS r_base,
         CASE WHEN random() < 0.45 THEN 1
              WHEN random() < 0.55 THEN 2
              WHEN random() < 0.70 THEN 3
              WHEN random() < 0.85 THEN 4
              ELSE 5 END AS n_items
  FROM generate_series(1, 200000)
) AS raw;

INSERT INTO orders (id, buyer_id, status, currency, idempotency_key, created_at)
SELECT o.id,
       u.id,
       CASE WHEN o.age_days < 7 THEN            -- fresh orders: still waiting for payment or shipping
              CASE WHEN o.r_status < 0.35 THEN 'pending'
                   WHEN o.r_status < 0.90 THEN 'paid'
                   ELSE 'cancelled' END
            ELSE                                -- older orders are mostly finished
              CASE WHEN o.r_status < 0.55 THEN 'shipped'
                   WHEN o.r_status < 0.85 THEN 'paid'
                   WHEN o.r_status < 0.95 THEN 'cancelled'
                   ELSE 'pending' END
       END,
       o.currency,
       CASE WHEN o.r_base < 0.30 THEN 'key-' || o.id END,
       now() - o.age_days * interval '1 day'
FROM _o AS o
JOIN _u AS u ON u.rn = o.buyer_rn;

-- Order items -------------------------------------------------------------------------------
-- The first product of an order is picked with a skew (random()^3): bestsellers land in many orders.
-- The next ones are its neighbours in the numbering, so products in one order never repeat.
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT o.id,
       p.id,
       1 + floor(power(random(), 3) * 5)::int,
       GREATEST(0, round((p.price * (0.85 + 0.3 * random()))::numeric, 2))   -- the price drifted since then
FROM _o AS o
JOIN _pc AS c ON c.currency = o.currency
CROSS JOIN LATERAL generate_series(0, o.n_items - 1) AS k
JOIN _p AS p ON p.currency = o.currency
            AND p.rn = 1 + (floor(c.n * power(o.r_base, 3))::int + k) % c.n;

-- Summary (shown when the script runs).
SELECT 'users' AS tbl, count(*) FROM users
UNION ALL SELECT 'products', count(*) FROM products
UNION ALL SELECT 'orders', count(*) FROM orders
UNION ALL SELECT 'order_items', count(*) FROM order_items;
SELECT status, count(*), round(100.0 * count(*) / sum(count(*)) OVER (), 1) AS pct
FROM orders GROUP BY status ORDER BY count(*) DESC;

-- Fresh statistics and cleaned-up tables: without them the planner knows nothing about the new data.
-- The tables are listed because a bare VACUUM also tries the system catalogs, which `app` may not touch.
VACUUM (ANALYZE) users, products, orders, order_items;
