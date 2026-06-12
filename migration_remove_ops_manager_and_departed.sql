-- Remove Ops Manager role and departed team members (Pranesh, Samiksha).
-- Run in Supabase SQL editor if backend startup cleanup has not run yet.

-- 1. Remove departed members by name/email
DELETE FROM user_roles
WHERE lower(email) LIKE '%pranesh%'
   OR lower(name)  LIKE '%pranesh%'
   OR lower(email) LIKE '%samiksha%'
   OR lower(name)  LIKE '%samiksha%';

DELETE FROM content_strategists
WHERE lower(name) LIKE '%pranesh%'
   OR lower(name) LIKE '%samiksha%';

-- 2. Remove users whose only role is ops_manager (e.g. former Ops Managers)
DELETE FROM user_roles
WHERE trim(role) = 'ops_manager';

-- 3. Strip ops_manager from multi-role strings (cs,ops_manager -> cs)
UPDATE user_roles
SET role = trim(both ',' from regexp_replace(',' || role || ',', ',ops_manager,', ',', 'gi'))
WHERE role ILIKE '%ops_manager%'
  AND trim(role) <> 'ops_manager';

-- 4. Delete anyone left with empty role after strip
DELETE FROM user_roles WHERE trim(role) = '' OR role IS NULL;

-- 5. Clear ops_manager from content entry assignments
UPDATE content_entries
SET assigned_role = NULL
WHERE assigned_role = 'ops_manager';
