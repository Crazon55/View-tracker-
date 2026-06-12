-- user_roles is managed by the backend service role only.
-- Disable RLS so deletes/updates are not blocked (matches idea engine fix).
ALTER TABLE user_roles DISABLE ROW LEVEL SECURITY;
