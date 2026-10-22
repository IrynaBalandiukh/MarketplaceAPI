SELECT id, title, price_cents FROM products WHERE currency = 'EUR' AND price_cents BETWEEN 40000 AND 45000 ORDER BY price_cents, id LIMIT 20
