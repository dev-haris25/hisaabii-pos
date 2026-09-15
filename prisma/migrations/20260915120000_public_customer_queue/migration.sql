-- Public customer queue: restaurant default locale + drop Queue display role.

ALTER TABLE "business_profiles"
ADD COLUMN IF NOT EXISTS "customerQueueLocale" TEXT NOT NULL DEFAULT 'ar';

DELETE FROM "employee_roles"
WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "name" = 'Queue display');

DELETE FROM "user_invitations"
WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "name" = 'Queue display');

DELETE FROM "role_permissions"
WHERE "roleId" IN (SELECT "id" FROM "roles" WHERE "name" = 'Queue display');

DELETE FROM "roles" WHERE "name" = 'Queue display';
