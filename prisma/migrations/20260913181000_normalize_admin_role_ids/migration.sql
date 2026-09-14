-- Normalize Admin role ids from legacy owner_<profileId> → admin_<profileId>
-- so seed helpers stay consistent.

-- Point employee_roles at admin_* when owner_* exists as Admin
UPDATE "employee_roles" er
SET "roleId" = 'admin_' || r."businessProfileId"
FROM "roles" r
WHERE er."roleId" = r."id"
  AND r."name" = 'Admin'
  AND r."id" = 'owner_' || r."businessProfileId"
  AND EXISTS (
    SELECT 1 FROM "roles" a
    WHERE a."id" = 'admin_' || r."businessProfileId"
  );

-- If admin_* does not exist yet, rename owner_* → admin_*
UPDATE "roles" r
SET "id" = 'admin_' || r."businessProfileId"
WHERE r."name" = 'Admin'
  AND r."id" = 'owner_' || r."businessProfileId"
  AND NOT EXISTS (
    SELECT 1 FROM "roles" a WHERE a."id" = 'admin_' || r."businessProfileId"
  );

-- Drop leftover owner_* Admin duplicates (employee_roles already moved)
DELETE FROM "role_permissions" rp
USING "roles" r
WHERE rp."roleId" = r."id"
  AND r."name" = 'Admin'
  AND r."id" LIKE 'owner_%'
  AND EXISTS (
    SELECT 1 FROM "roles" a
    WHERE a."businessProfileId" = r."businessProfileId" AND a."name" = 'Admin' AND a."id" LIKE 'admin_%'
  );

DELETE FROM "employee_roles" er
USING "roles" r
WHERE er."roleId" = r."id"
  AND r."name" = 'Admin'
  AND r."id" LIKE 'owner_%'
  AND EXISTS (
    SELECT 1 FROM "roles" a
    WHERE a."businessProfileId" = r."businessProfileId" AND a."name" = 'Admin' AND a."id" LIKE 'admin_%'
  );

DELETE FROM "user_invitations" ui
USING "roles" r
WHERE ui."roleId" = r."id"
  AND r."name" = 'Admin'
  AND r."id" LIKE 'owner_%'
  AND EXISTS (
    SELECT 1 FROM "roles" a
    WHERE a."businessProfileId" = r."businessProfileId" AND a."name" = 'Admin' AND a."id" LIKE 'admin_%'
  );

DELETE FROM "roles" r
WHERE r."name" = 'Admin'
  AND r."id" LIKE 'owner_%'
  AND EXISTS (
    SELECT 1 FROM "roles" a
    WHERE a."businessProfileId" = r."businessProfileId" AND a."name" = 'Admin' AND a."id" LIKE 'admin_%'
  );
