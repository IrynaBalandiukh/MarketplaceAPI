SELECT id, buyer_id, created_at FROM orders WHERE status = 'pending' AND created_at < now() - interval '30 days'
