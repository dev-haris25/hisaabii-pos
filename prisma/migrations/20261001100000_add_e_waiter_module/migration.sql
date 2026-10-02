-- E-Waiter foundation: tables, sessions, settlement lines; KitchenOrder invoice nullable for rounds.

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('available', 'occupied');

-- CreateEnum
CREATE TYPE "TableSessionStatus" AS ENUM ('open', 'closed', 'cancelled');

-- DropForeignKey
ALTER TABLE "kitchen_orders" DROP CONSTRAINT "kitchen_orders_invoiceId_fkey";

-- DropIndex (1:1 invoice ticket → allow many rounds per settled invoice)
DROP INDEX "kitchen_orders_invoiceId_key";

-- AlterTable
ALTER TABLE "business_profiles" ADD COLUMN "brandPrimaryColor" TEXT,
ADD COLUMN "brandSecondaryColor" TEXT;

-- AlterTable
ALTER TABLE "kitchen_orders" ADD COLUMN "roundNumber" INTEGER,
ADD COLUMN "tableSessionId" TEXT,
ALTER COLUMN "invoiceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN "calories" INTEGER;

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "status" "TableStatus" NOT NULL DEFAULT 'available',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_sessions" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "tableId" TEXT NOT NULL,
    "status" "TableSessionStatus" NOT NULL DEFAULT 'open',
    "invoiceId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "table_session_lines" (
    "id" TEXT NOT NULL,
    "tableSessionId" TEXT NOT NULL,
    "kitchenOrderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "variantOptionIds" JSONB NOT NULL DEFAULT '[]',
    "customizationIds" JSONB NOT NULL DEFAULT '[]',
    "lineNote" TEXT,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "table_session_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tables_qrToken_key" ON "tables"("qrToken");

-- CreateIndex
CREATE INDEX "tables_businessProfileId_status_idx" ON "tables"("businessProfileId", "status");

-- CreateIndex
CREATE INDEX "tables_businessProfileId_deletedAt_idx" ON "tables"("businessProfileId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "table_sessions_invoiceId_key" ON "table_sessions"("invoiceId");

-- CreateIndex
CREATE INDEX "table_sessions_businessProfileId_status_idx" ON "table_sessions"("businessProfileId", "status");

-- CreateIndex
CREATE INDEX "table_sessions_tableId_status_idx" ON "table_sessions"("tableId", "status");

-- CreateIndex
CREATE INDEX "table_sessions_invoiceId_idx" ON "table_sessions"("invoiceId");

-- CreateIndex
CREATE INDEX "table_session_lines_tableSessionId_idx" ON "table_session_lines"("tableSessionId");

-- CreateIndex
CREATE INDEX "table_session_lines_kitchenOrderId_idx" ON "table_session_lines"("kitchenOrderId");

-- CreateIndex
CREATE INDEX "table_session_lines_menuItemId_idx" ON "table_session_lines"("menuItemId");

-- CreateIndex
CREATE INDEX "kitchen_orders_tableSessionId_idx" ON "kitchen_orders"("tableSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_orders_tableSessionId_roundNumber_key" ON "kitchen_orders"("tableSessionId", "roundNumber");

-- Note: kitchen_orders_invoiceId_idx already exists from the original kitchen_orders migration.

-- AddForeignKey
ALTER TABLE "kitchen_orders" ADD CONSTRAINT "kitchen_orders_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_orders" ADD CONSTRAINT "kitchen_orders_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session_lines" ADD CONSTRAINT "table_session_lines_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "table_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session_lines" ADD CONSTRAINT "table_session_lines_kitchenOrderId_fkey" FOREIGN KEY ("kitchenOrderId") REFERENCES "kitchen_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "table_session_lines" ADD CONSTRAINT "table_session_lines_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
