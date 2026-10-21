# Оптимізація запитів

Дані: `db/seed.sql` (20 000 користувачів, 150 000 товарів, 200 000 замовлень, 377 029 позицій), PostgreSQL 16 у Docker, `VACUUM (ANALYZE)` перед кожним виміром. Кожен план знято другим запуском поспіль (прогрітий кеш). Запити лежать у `db/queries/`, індекси — в `db/indexes.sql`. Колонка `products.search_vector` є в `db/schema.sql`, тож «до» її бачить, але GIN-індексу ще немає.

## q1: Пошук користувача за іменем без урахування регістру

```sql
SELECT id, email, display_name FROM users WHERE lower(display_name) = lower('Користувач 12345')
```

До (без індексу):

```
                                             QUERY PLAN                                             
----------------------------------------------------------------------------------------------------
 Seq Scan on users  (cost=0.00..557.00 rows=100 width=63) (actual time=5.211..8.426 rows=1 loops=1)
   Filter: (lower(display_name) = 'користувач 12345'::text)
   Rows Removed by Filter: 19999
   Buffers: shared hit=257
 Planning:
   Buffers: shared hit=84
 Planning Time: 0.913 ms
 Execution Time: 8.478 ms
(8 rows)
```

Після (`idx_users_display_name_lower`):

```
                                                             QUERY PLAN                                                              
-------------------------------------------------------------------------------------------------------------------------------------
 Index Scan using idx_users_display_name_lower on users  (cost=0.29..8.30 rows=1 width=63) (actual time=0.024..0.025 rows=1 loops=1)
   Index Cond: (lower(display_name) = 'користувач 12345'::text)
   Buffers: shared hit=3
 Planning:
   Buffers: shared hit=104
 Planning Time: 0.800 ms
 Execution Time: 0.070 ms
(7 rows)
```

Seq Scan, що читав усі 257 сторінок `users` і відкидав 19 999 рядків, замінив Index Scan using idx_users_display_name_lower: індекс побудований по виразу `lower(display_name)`, запит повторює той самий вираз, тож B-tree знаходить один рядок за 3 сторінки (257 → 3), а час падає з ~8,5 мс до ~0,07 мс (≈120×).

## q2: Давні замовлення, що досі в статусі pending

```sql
SELECT id, buyer_id, created_at FROM orders WHERE status = 'pending' AND created_at < now() - interval '30 days'
```

До (без індексу):

```
                                                 QUERY PLAN                                                 
------------------------------------------------------------------------------------------------------------
 Seq Scan on orders  (cost=0.00..6365.00 rows=13180 width=40) (actual time=0.016..28.515 rows=7982 loops=1)
   Filter: ((status = 'pending'::text) AND (created_at < (now() - '30 days'::interval)))
   Rows Removed by Filter: 192018
   Buffers: shared hit=2365
 Planning:
   Buffers: shared hit=146
 Planning Time: 1.119 ms
 Execution Time: 28.951 ms
(8 rows)
```

Після (`idx_orders_pending_created_at`):

```
                                                                     QUERY PLAN                                                                      
-----------------------------------------------------------------------------------------------------------------------------------------------------
 Index Only Scan using idx_orders_pending_created_at on orders  (cost=0.29..594.42 rows=12693 width=40) (actual time=0.043..1.130 rows=7982 loops=1)
   Index Cond: (created_at < (now() - '30 days'::interval))
   Heap Fetches: 0
   Buffers: shared hit=60
 Planning:
   Buffers: shared hit=165
 Planning Time: 1.501 ms
 Execution Time: 1.580 ms
(8 rows)
```

Seq Scan, що перечитував усі 2365 сторінок `orders` заради 8 тис. рядків, замінив Index Only Scan using idx_orders_pending_created_at: індекс часткового типу (`WHERE status = 'pending'`) містить лише pending-замовлення, а `INCLUDE (id, buyer_id)` закриває всі колонки запиту, тож до таблиці не звертаються взагалі (Heap Fetches: 0): buffers 2365 → 60, час ~29 мс → ~1,6 мс (≈18×).

## q3: Каталог: товари у валюті в діапазоні цін

```sql
SELECT id, title, price FROM products WHERE currency = 'EUR' AND price BETWEEN 400 AND 450 ORDER BY price, id LIMIT 20
```

До (без індексу):

```
                                                              QUERY PLAN                                                              
--------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=8824.77..8827.10 rows=20 width=55) (actual time=23.447..27.727 rows=20 loops=1)
   Buffers: shared hit=6813
   ->  Gather Merge  (cost=8824.77..8859.77 rows=300 width=55) (actual time=23.444..27.721 rows=20 loops=1)
         Workers Planned: 2
         Workers Launched: 2
         Buffers: shared hit=6813
         ->  Sort  (cost=7824.74..7825.12 rows=150 width=55) (actual time=18.040..18.043 rows=17 loops=3)
               Sort Key: price, id
               Sort Method: top-N heapsort  Memory: 29kB
               Buffers: shared hit=6813
               Worker 0:  Sort Method: top-N heapsort  Memory: 28kB
               Worker 1:  Sort Method: top-N heapsort  Memory: 29kB
               ->  Parallel Seq Scan on products  (cost=0.00..7820.75 rows=150 width=55) (actual time=0.434..17.571 rows=115 loops=3)
                     Filter: ((price >= '400'::numeric) AND (price <= '450'::numeric) AND (currency = 'EUR'::text))
                     Rows Removed by Filter: 49885
                     Buffers: shared hit=6727
 Planning:
   Buffers: shared hit=135
 Planning Time: 1.296 ms
 Execution Time: 27.871 ms
(20 rows)
```

Після (`idx_products_currency_price_id`):

```
                                                                      QUERY PLAN                                                                      
------------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=0.42..68.51 rows=20 width=55) (actual time=0.028..0.078 rows=20 loops=1)
   Buffers: shared hit=23
   ->  Index Scan using idx_products_currency_price_id on products  (cost=0.42..1219.16 rows=358 width=55) (actual time=0.027..0.075 rows=20 loops=1)
         Index Cond: ((currency = 'EUR'::text) AND (price >= '400'::numeric) AND (price <= '450'::numeric))
         Buffers: shared hit=23
 Planning:
   Buffers: shared hit=187
 Planning Time: 1.398 ms
 Execution Time: 0.110 ms
(9 rows)
```

Parallel Seq Scan з Gather Merge і Sort зник: Index Scan using idx_products_currency_price_id віддає рядки вже в порядку `ORDER BY price, id` (рівність по `currency`, діапазон по `price`), тому Limit зупиняється після 20 рядків і читає 23 сторінки замість ~6800, а час падає з ~28 мс до ~0,11 мс (≈250×).

## q4: Повнотекстовий пошук по каталогу («вінтажний рюкзак»)

```sql
SELECT id, title AS name, ts_rank(search_vector, plainto_tsquery('simple', 'вінтажний рюкзак')) AS rank FROM products WHERE search_vector @@ plainto_tsquery('simple', 'вінтажний рюкзак') ORDER BY rank DESC, id LIMIT 20
```

До (без індексу):

```
                                                              QUERY PLAN                                                              
--------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=8514.24..8516.57 rows=20 width=53) (actual time=23.302..27.527 rows=20 loops=1)
   Buffers: shared hit=6815
   ->  Gather Merge  (cost=8514.24..8562.08 rows=410 width=53) (actual time=23.299..27.521 rows=20 loops=1)
         Workers Planned: 2
         Workers Launched: 2
         Buffers: shared hit=6815
         ->  Sort  (cost=7514.22..7514.73 rows=205 width=53) (actual time=17.992..17.994 rows=17 loops=3)
               Sort Key: (ts_rank(search_vector, '''вінтажний'' & ''рюкзак'''::tsquery)) DESC, id
               Sort Method: top-N heapsort  Memory: 29kB
               Buffers: shared hit=6815
               Worker 0:  Sort Method: top-N heapsort  Memory: 29kB
               Worker 1:  Sort Method: top-N heapsort  Memory: 29kB
               ->  Parallel Seq Scan on products  (cost=0.00..7508.76 rows=205 width=53) (actual time=0.072..17.462 rows=500 loops=3)
                     Filter: (search_vector @@ '''вінтажний'' & ''рюкзак'''::tsquery)
                     Rows Removed by Filter: 49500
                     Buffers: shared hit=6727
 Planning:
   Buffers: shared hit=135
 Planning Time: 1.284 ms
 Execution Time: 27.730 ms
(20 rows)
```

Після (`idx_products_search_vector`):

```
                                                                     QUERY PLAN                                                                      
-----------------------------------------------------------------------------------------------------------------------------------------------------
 Limit  (cost=1624.20..1624.25 rows=20 width=53) (actual time=4.175..4.179 rows=20 loops=1)
   Buffers: shared hit=1368
   ->  Sort  (cost=1624.20..1625.36 rows=462 width=53) (actual time=4.173..4.175 rows=20 loops=1)
         Sort Key: (ts_rank(search_vector, '''вінтажний'' & ''рюкзак'''::tsquery)) DESC, id
         Sort Method: top-N heapsort  Memory: 29kB
         Buffers: shared hit=1368
         ->  Bitmap Heap Scan on products  (cost=36.00..1611.91 rows=462 width=53) (actual time=1.276..3.854 rows=1500 loops=1)
               Recheck Cond: (search_vector @@ '''вінтажний'' & ''рюкзак'''::tsquery)
               Heap Blocks: exact=1348
               Buffers: shared hit=1362
               ->  Bitmap Index Scan on idx_products_search_vector  (cost=0.00..35.89 rows=462 width=0) (actual time=1.065..1.065 rows=1500 loops=1)
                     Index Cond: (search_vector @@ '''вінтажний'' & ''рюкзак'''::tsquery)
                     Buffers: shared hit=14
 Planning:
   Buffers: shared hit=199
 Planning Time: 1.543 ms
 Execution Time: 4.271 ms
(17 rows)
```

Parallel Seq Scan із фільтром `@@` по всій таблиці (~6900 сторінок) замінили Bitmap Index Scan on idx_products_search_vector (14 сторінок індексу) і Bitmap Heap Scan лише по 1500 збігах (1% каталогу): buffers ~6800 → 1368, час ~28 мс → ~4,3 мс (≈6,5×). Виграш менший, ніж в інших запитів, бо `ORDER BY rank` змушує дочитати й порахувати ранг усіх 1500 збігів, перш ніж Limit візьме 20.

## Морфологія

Пошук по `search_vector` слова «камера» знаходить 9 877 товарів, а те саме слово в родовому відмінку множини, «камер», — лише 1 397 (форма «камери» дає ще 2 652):

```sql
SELECT count(*) FROM products WHERE search_vector @@ plainto_tsquery('simple', 'камера');  -- 9877
SELECT count(*) FROM products WHERE search_vector @@ plainto_tsquery('simple', 'камер');   -- 1397
```

Причина: конфігурація `simple` лише переводить слова в нижній регістр і не зводить відмінки до основи, а `SELECT count(*) FROM pg_ts_config` показує 29 конфігурацій, серед яких є `russian`, але немає `ukrainian` (`\dF` те саме), тож для української у PostgreSQL з коробки лематизації немає, і покупець, що ввів «камер», не побачить половини каталогу.

Підміна `simple` на `russian` не лікує: вона стемить лише запит, а у збереженому векторі лежать нестемлені токени, тому `plainto_tsquery('russian', 'камера')` шукає основу «камер» і знаходить ті самі 1 397 рядків замість 9 877 (а повна заміна в `to_tsvector` дала б стеми за російськими правилами, які для українських закінчень не працюють). Це самообман, а не фікс; справжній розв'язок — словник hunspell/ispell для української або зовнішній пошуковий рушій.

## Ціна збереженої колонки `search_vector`

Колонка `GENERATED ALWAYS AS (...) STORED` дає швидкий пошук, але має ціну. Заміри на 150 000 товарів, порівняння з копією таблиці без колонки (обидві без індексів):

| | без колонки | з колонкою | різниця |
| --- | --- | --- | --- |
| `pg_table_size` (heap + TOAST) | 29 МБ | 53 МБ | ×1,85 |
| INSERT 150 000 рядків | 223 мс | 1307 мс | ≈6× повільніше |

Окремо GIN-індекс `idx_products_search_vector` займає місце й сповільнює кожну вставку ще більше; це ціна пошуку в мілісекундах замість повного скану.

## Індекси, яких немає навмисно

Зі схеми прибрано `products_seller_id_idx`, `products_created_at_id_idx`, `orders_created_at_id_idx` і `order_items_product_id_idx`: після всіх чотирьох запитів у `pg_stat_user_indexes` вони мали `idx_scan = 0`, а `GET /products` і `GET /orders` ще не читають базу. Індекс «про запас» коштує диск і швидкість вставки. Повернути їх варто разом із запитом, якому вони потрібні. Унікальність email тримає звичайний `UNIQUE` (адреса зберігається в нижньому регістрі, це гарантує CHECK), а не окремий індекс по `lower(email)`: індекс під констрейнт має нуль сканів, і це нормально.
