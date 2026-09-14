-- DropForeignKey
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_departmentId_fkey";
ALTER TABLE "employees" DROP CONSTRAINT IF EXISTS "employees_designationId_fkey";
ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "departments_businessProfileId_fkey";
ALTER TABLE "designations" DROP CONSTRAINT IF EXISTS "designations_businessProfileId_fkey";

-- DropIndex
DROP INDEX IF EXISTS "employees_departmentId_idx";
DROP INDEX IF EXISTS "employees_designationId_idx";

-- AlterTable
ALTER TABLE "employees" DROP COLUMN IF EXISTS "departmentId";
ALTER TABLE "employees" DROP COLUMN IF EXISTS "designationId";

-- DropTable
DROP TABLE IF EXISTS "departments";
DROP TABLE IF EXISTS "designations";

-- CreateTable
CREATE TABLE "employee_promotions" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "oldSalary" TEXT,
    "newSalary" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "notes" TEXT,
    "appliedToEmployee" BOOLEAN NOT NULL DEFAULT false,
    "promotedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_promotions_businessProfileId_idx" ON "employee_promotions"("businessProfileId");

-- CreateIndex
CREATE INDEX "employee_promotions_employeeId_idx" ON "employee_promotions"("employeeId");

-- CreateIndex
CREATE INDEX "employee_promotions_employeeId_effectiveFrom_idx" ON "employee_promotions"("employeeId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "employee_promotions" ADD CONSTRAINT "employee_promotions_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_promotions" ADD CONSTRAINT "employee_promotions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
