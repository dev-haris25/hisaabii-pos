-- HR + predefined RBAC migration
-- Migrates ADMIN/CASHIER StaffRole model to Role/EmployeeRole + HR tables.

-- ---------------------------------------------------------------------------
-- 1. New enums
-- ---------------------------------------------------------------------------
CREATE TYPE "PayslipCategoryType" AS ENUM ('earning', 'deduction');
CREATE TYPE "EmployeeStatus" AS ENUM ('active', 'inactive');
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'unspecified');
CREATE TYPE "MaritalStatus" AS ENUM ('single', 'married', 'other', 'unspecified');
CREATE TYPE "EmployeePaymentType" AS ENUM ('salary', 'advance', 'bonus');
CREATE TYPE "EmployeePaymentMethod" AS ENUM ('cash', 'bank_transfer', 'cheque', 'other');

-- ---------------------------------------------------------------------------
-- 2. RBAC tables
-- ---------------------------------------------------------------------------
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_roles" (
    "id" TEXT NOT NULL,
    "businessMembershipId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_invitations" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "roleIdsJson" TEXT NOT NULL DEFAULT '[]',
    "employeeId" TEXT,
    "invitedByUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 3. HR tables
-- ---------------------------------------------------------------------------
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "designations" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "id_types" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "id_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payslip_categories" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PayslipCategoryType" NOT NULL,
    "defaultAmount" TEXT NOT NULL DEFAULT '0',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "payslip_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employees" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "businessMembershipId" TEXT,
    "name" TEXT NOT NULL,
    "mobileOfficial" TEXT,
    "emailOfficial" TEXT,
    "departmentId" TEXT,
    "designationId" TEXT,
    "joiningDate" TIMESTAMP(3) NOT NULL,
    "salary" TEXT NOT NULL,
    "higherEducation" TEXT,
    "experience" TEXT,
    "resumeStoragePath" TEXT,
    "appointmentLetterStoragePath" TEXT,
    "reportingToId" TEXT,
    "nationality" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "mobilePersonal" TEXT,
    "emailPersonal" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactNumber" TEXT,
    "address" TEXT,
    "shortAddress" TEXT NOT NULL DEFAULT '',
    "bloodGroup" TEXT,
    "gender" "Gender" NOT NULL DEFAULT 'unspecified',
    "maritalStatus" "MaritalStatus" NOT NULL DEFAULT 'unspecified',
    "idTypeId" TEXT,
    "idNumber" TEXT,
    "idExpiry" TIMESTAMP(3),
    "idDocumentStoragePath" TEXT,
    "photoStoragePath" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankName" TEXT,
    "bankIban" TEXT,
    "bankBranch" TEXT,
    "passportNumber" TEXT,
    "passportExpiry" TIMESTAMP(3),
    "passportStoragePath" TEXT,
    "visaNumber" TEXT,
    "visaIssueDate" TIMESTAMP(3),
    "visaEntryDate" TIMESTAMP(3),
    "visaExpiry" TIMESTAMP(3),
    "visaStoragePath" TEXT,
    "remark" TEXT,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'active',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "salary_slip_counters" (
    "businessProfileId" TEXT NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "salary_slip_counters_pkey" PRIMARY KEY ("businessProfileId")
);

CREATE TABLE "salary_slips" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "voucherNumber" TEXT NOT NULL DEFAULT '',
    "employeeId" TEXT NOT NULL,
    "slipDate" TIMESTAMP(3) NOT NULL,
    "referenceNumber" TEXT,
    "description" TEXT,
    "basicPay" TEXT NOT NULL DEFAULT '0',
    "totalEarnings" TEXT NOT NULL DEFAULT '0',
    "totalDeductions" TEXT NOT NULL DEFAULT '0',
    "netTotal" TEXT NOT NULL DEFAULT '0',
    "preparedBySignatureStoragePath" TEXT,
    "preparedBySignatureMimeType" TEXT,
    "createdByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "salary_slips_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "salary_slip_lines" (
    "id" TEXT NOT NULL,
    "salarySlipId" TEXT NOT NULL,
    "payslipCategoryId" TEXT,
    "categoryType" "PayslipCategoryType" NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "unit" TEXT NOT NULL DEFAULT '1',
    "unitRate" TEXT NOT NULL DEFAULT '0',
    "total" TEXT NOT NULL DEFAULT '0',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "salary_slip_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_payments" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "paymentDate" TIMESTAMP(3) NOT NULL,
    "paymentType" "EmployeePaymentType" NOT NULL DEFAULT 'salary',
    "payPeriod" TEXT,
    "amount" TEXT NOT NULL DEFAULT '0',
    "paymentMethod" "EmployeePaymentMethod" NOT NULL DEFAULT 'cash',
    "remarks" TEXT,
    "splitGroupId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "employee_payments_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- 4. Prepare users BEFORE dropping StaffRole columns
-- ---------------------------------------------------------------------------
UPDATE "users"
SET "email" = 'migrated-cashier-' || "id" || '@pos.local'
WHERE "email" IS NULL;

UPDATE "users"
SET "passwordHash" = 'migrated:disabled'
WHERE "passwordHash" IS NULL;

-- Seed Owner + Cashier role shells per restaurant (permission rows filled by app seed)
INSERT INTO "roles" ("id", "businessProfileId", "name", "isSystem", "createdAt", "updatedAt")
SELECT 'owner_' || bp."id", bp."id", 'Owner', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "business_profiles" bp;

INSERT INTO "roles" ("id", "businessProfileId", "name", "isSystem", "createdAt", "updatedAt")
SELECT 'cashier_' || bp."id", bp."id", 'Cashier', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "business_profiles" bp;

-- Assign Owner role to ADMIN memberships (using old StaffRole column)
INSERT INTO "employee_roles" ("id", "businessMembershipId", "roleId", "createdAt")
SELECT 'er_' || bm."id", bm."id", 'owner_' || bm."businessProfileId", CURRENT_TIMESTAMP
FROM "business_memberships" bm
WHERE bm."role" = 'ADMIN';

-- Assign Cashier role to CASHIER memberships
INSERT INTO "employee_roles" ("id", "businessMembershipId", "roleId", "createdAt")
SELECT 'er_' || bm."id", bm."id", 'cashier_' || bm."businessProfileId", CURRENT_TIMESTAMP
FROM "business_memberships" bm
WHERE bm."role" = 'CASHIER';

-- Create minimal Employee rows for migrated cashiers (linked to membership)
INSERT INTO "employees" (
  "id", "businessProfileId", "businessMembershipId", "name",
  "joiningDate", "salary", "emailOfficial", "status",
  "createdAt", "updatedAt"
)
SELECT
  'emp_' || u."id",
  bm."businessProfileId",
  bm."id",
  u."name",
  COALESCE(u."createdAt", CURRENT_TIMESTAMP),
  '0',
  u."email",
  CASE WHEN u."active" THEN 'active'::"EmployeeStatus" ELSE 'inactive'::"EmployeeStatus" END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
JOIN "business_memberships" bm ON bm."userId" = u."id"
WHERE bm."role" = 'CASHIER';

-- Also create Employee rows for ADMIN memberships (owner becomes an employee too)
INSERT INTO "employees" (
  "id", "businessProfileId", "businessMembershipId", "name",
  "joiningDate", "salary", "emailOfficial", "status",
  "createdAt", "updatedAt"
)
SELECT
  'emp_' || u."id" || '_' || bm."businessProfileId",
  bm."businessProfileId",
  bm."id",
  u."name",
  COALESCE(u."createdAt", CURRENT_TIMESTAMP),
  '0',
  u."email",
  CASE WHEN u."active" THEN 'active'::"EmployeeStatus" ELSE 'inactive'::"EmployeeStatus" END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "users" u
JOIN "business_memberships" bm ON bm."userId" = u."id"
WHERE bm."role" = 'ADMIN';

-- ---------------------------------------------------------------------------
-- 5. Drop StaffRole / login-code / home profile columns
-- ---------------------------------------------------------------------------
ALTER TABLE "business_memberships" DROP COLUMN "role";

DROP INDEX IF EXISTS "users_businessProfileId_role_active_idx";
DROP INDEX IF EXISTS "users_loginCodeLookupHash_key";

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_businessProfileId_fkey";
ALTER TABLE "users" DROP COLUMN IF EXISTS "businessProfileId";
ALTER TABLE "users" DROP COLUMN IF EXISTS "role";
ALTER TABLE "users" DROP COLUMN IF EXISTS "loginCodeEnc";
ALTER TABLE "users" DROP COLUMN IF EXISTS "loginCodeLookupHash";

ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL;
ALTER TABLE "users" ALTER COLUMN "passwordHash" SET NOT NULL;

DROP TYPE IF EXISTS "StaffRole";

-- ---------------------------------------------------------------------------
-- 6. Indexes + FKs
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "roles_businessProfileId_name_key" ON "roles"("businessProfileId", "name");
CREATE INDEX "roles_businessProfileId_idx" ON "roles"("businessProfileId");
CREATE UNIQUE INDEX "role_permissions_roleId_action_subject_key" ON "role_permissions"("roleId", "action", "subject");
CREATE INDEX "role_permissions_roleId_idx" ON "role_permissions"("roleId");
CREATE UNIQUE INDEX "employee_roles_businessMembershipId_roleId_key" ON "employee_roles"("businessMembershipId", "roleId");
CREATE INDEX "employee_roles_roleId_idx" ON "employee_roles"("roleId");
CREATE UNIQUE INDEX "user_invitations_businessProfileId_email_status_key" ON "user_invitations"("businessProfileId", "email", "status");
CREATE INDEX "user_invitations_businessProfileId_status_idx" ON "user_invitations"("businessProfileId", "status");
CREATE INDEX "user_invitations_tokenHash_idx" ON "user_invitations"("tokenHash");

CREATE INDEX "departments_businessProfileId_idx" ON "departments"("businessProfileId");
CREATE INDEX "designations_businessProfileId_idx" ON "designations"("businessProfileId");
CREATE INDEX "id_types_businessProfileId_idx" ON "id_types"("businessProfileId");
CREATE INDEX "payslip_categories_businessProfileId_idx" ON "payslip_categories"("businessProfileId");
CREATE UNIQUE INDEX "employees_businessMembershipId_key" ON "employees"("businessMembershipId");
CREATE INDEX "employees_businessProfileId_idx" ON "employees"("businessProfileId");
CREATE INDEX "employees_businessProfileId_deletedAt_idx" ON "employees"("businessProfileId", "deletedAt");
CREATE INDEX "employees_departmentId_idx" ON "employees"("departmentId");
CREATE INDEX "employees_designationId_idx" ON "employees"("designationId");
CREATE UNIQUE INDEX "salary_slips_businessProfileId_voucherNumber_key" ON "salary_slips"("businessProfileId", "voucherNumber");
CREATE INDEX "salary_slips_businessProfileId_deletedAt_idx" ON "salary_slips"("businessProfileId", "deletedAt");
CREATE INDEX "salary_slips_employeeId_idx" ON "salary_slips"("employeeId");
CREATE INDEX "salary_slips_createdByUserId_idx" ON "salary_slips"("createdByUserId");
CREATE INDEX "salary_slip_lines_salarySlipId_idx" ON "salary_slip_lines"("salarySlipId");
CREATE INDEX "employee_payments_businessProfileId_deletedAt_idx" ON "employee_payments"("businessProfileId", "deletedAt");
CREATE INDEX "employee_payments_employeeId_idx" ON "employee_payments"("employeeId");
CREATE INDEX "employee_payments_employeeId_payPeriod_idx" ON "employee_payments"("employeeId", "payPeriod");

ALTER TABLE "roles" ADD CONSTRAINT "roles_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_businessMembershipId_fkey" FOREIGN KEY ("businessMembershipId") REFERENCES "business_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_roles" ADD CONSTRAINT "employee_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "departments" ADD CONSTRAINT "departments_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "designations" ADD CONSTRAINT "designations_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "id_types" ADD CONSTRAINT "id_types_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payslip_categories" ADD CONSTRAINT "payslip_categories_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_businessMembershipId_fkey" FOREIGN KEY ("businessMembershipId") REFERENCES "business_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "designations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_reportingToId_fkey" FOREIGN KEY ("reportingToId") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employees" ADD CONSTRAINT "employees_idTypeId_fkey" FOREIGN KEY ("idTypeId") REFERENCES "id_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "salary_slip_counters" ADD CONSTRAINT "salary_slip_counters_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_slips" ADD CONSTRAINT "salary_slips_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_slips" ADD CONSTRAINT "salary_slips_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_slips" ADD CONSTRAINT "salary_slips_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "salary_slip_lines" ADD CONSTRAINT "salary_slip_lines_salarySlipId_fkey" FOREIGN KEY ("salarySlipId") REFERENCES "salary_slips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "salary_slip_lines" ADD CONSTRAINT "salary_slip_lines_payslipCategoryId_fkey" FOREIGN KEY ("payslipCategoryId") REFERENCES "payslip_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee_payments" ADD CONSTRAINT "employee_payments_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_payments" ADD CONSTRAINT "employee_payments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
