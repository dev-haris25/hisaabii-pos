-- CreateEnum
CREATE TYPE "KitchenOrderStatus" AS ENUM ('preparing', 'ready', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "kitchen_orders" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "orderNumber" INTEGER NOT NULL,
    "orderDate" DATE NOT NULL,
    "status" "KitchenOrderStatus" NOT NULL DEFAULT 'preparing',
    "linesSnapshot" JSONB NOT NULL,
    "itemsUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitchen_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kitchen_order_counters" (
    "id" TEXT NOT NULL,
    "businessProfileId" TEXT NOT NULL,
    "orderDate" DATE NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kitchen_order_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_orders_invoiceId_key" ON "kitchen_orders"("invoiceId");

-- CreateIndex
CREATE INDEX "kitchen_orders_businessProfileId_status_idx" ON "kitchen_orders"("businessProfileId", "status");

-- CreateIndex
CREATE INDEX "kitchen_orders_invoiceId_idx" ON "kitchen_orders"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_orders_businessProfileId_orderDate_orderNumber_key" ON "kitchen_orders"("businessProfileId", "orderDate", "orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "kitchen_order_counters_businessProfileId_orderDate_key" ON "kitchen_order_counters"("businessProfileId", "orderDate");

-- AddForeignKey
ALTER TABLE "kitchen_orders" ADD CONSTRAINT "kitchen_orders_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_orders" ADD CONSTRAINT "kitchen_orders_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kitchen_order_counters" ADD CONSTRAINT "kitchen_order_counters_businessProfileId_fkey" FOREIGN KEY ("businessProfileId") REFERENCES "business_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
