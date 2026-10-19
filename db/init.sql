-- Runs once, when the Postgres data volume is first created.
-- The password below is the INITIAL one and must match secrets/db_password.example.
-- After `docker compose down -v` the database returns to this password, so the secret file
-- has to be reset too: cp secrets/db_password.example secrets/db_password
CREATE ROLE app LOGIN PASSWORD 'app-initial-password';
ALTER DATABASE marketplace OWNER TO app;
