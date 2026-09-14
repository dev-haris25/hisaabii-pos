-- Add canonical owner (nullable first for backfill)
ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "ownerUserId" TEXT;

-- Backfill from users who hold the Owner EmployeeRole
UPDATE "business_profiles" bp
SET "ownerUserId" = sub."userId"
FROM (
  SELECT DISTINCT ON (bm."businessProfileId")
    bm."businessProfileId",
    bm."userId"
  FROM "business_memberships" bm
  INNER JOIN "employee_roles" er ON er."businessMembershipId" = bm."id"
  INNER JOIN "roles" r ON r."id" = er."roleId"
  WHERE r."name" = 'Owner'
  ORDER BY bm."businessProfileId", bm."createdAt" ASC
) AS sub
WHERE bp."id" = sub."businessProfileId"
  AND bp."ownerUserId" IS NULL;

-- Fallback: first membership on the restaurant
UPDATE "business_profiles" bp
SET "ownerUserId" = sub."userId"
FROM (
  SELECT DISTINCT ON (bm."businessProfileId")
    bm."businessProfileId",
    bm."userId"
  FROM "business_memberships" bm
  ORDER BY bm."businessProfileId", bm."createdAt" ASC
) AS sub
WHERE bp."id" = sub."businessProfileId"
  AND bp."ownerUserId" IS NULL;

-- Rename Owner role → Admin (keep same role ids owner_<profileId> for FK stability)
UPDATE "roles"
SET "name" = 'Admin', "updatedAt" = CURRENT_TIMESTAMP
WHERE "name" = 'Owner';

-- Create Admin role shells where missing (profiles that somehow lacked Owner)
INSERT INTO "roles" ("id", "businessProfileId", "name", "isSystem", "createdAt", "updatedAt")
SELECT 'admin_' || bp."id", bp."id", 'Admin', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "business_profiles" bp
WHERE NOT EXISTS (
  SELECT 1 FROM "roles" r
  WHERE r."businessProfileId" = bp."id" AND r."name" = 'Admin'
)
ON CONFLICT ("id") DO NOTHING;

-- Ensure owner has Admin EmployeeRole (via renamed owner_* id or admin_* id)
INSERT INTO "employee_roles" ("id", "businessMembershipId", "roleId", "createdAt")
SELECT
  'er_admin_' || bm."id",
  bm."id",
  COALESCE(
    (SELECT r."id" FROM "roles" r WHERE r."businessProfileId" = bp."id" AND r."name" = 'Admin' LIMIT 1),
    'admin_' || bp."id"
  ),
  CURRENT_TIMESTAMP
FROM "business_profiles" bp
INNER JOIN "business_memberships" bm
  ON bm."userId" = bp."ownerUserId" AND bm."businessProfileId" = bp."id"
WHERE bp."ownerUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "employee_roles" er
    INNER JOIN "roles" r ON r."id" = er."roleId"
    WHERE er."businessMembershipId" = bm."id" AND r."name" = 'Admin'
  );

-- Delete any orphan role named Owner (should already be renamed)
DELETE FROM "roles" WHERE "name" = 'Owner';

-- Fail loudly if any profile still lacks an owner
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "business_profiles" WHERE "ownerUserId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot set ownerUserId NOT NULL: some business_profiles have no owner';
  END IF;
END $$;

ALTER TABLE "business_profiles" ALTER COLUMN "ownerUserId" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "business_profiles_ownerUserId_idx" ON "business_profiles"("ownerUserId");

ALTER TABLE "business_profiles"
  DROP CONSTRAINT IF EXISTS "business_profiles_ownerUserId_fkey";

ALTER TABLE "business_profiles"
  ADD CONSTRAINT "business_profiles_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
