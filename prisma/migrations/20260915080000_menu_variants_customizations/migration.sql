-- CreateTable
CREATE TABLE "menu_item_variant_groups" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_variant_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_variant_options" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "priceChange" TEXT NOT NULL DEFAULT '0',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_variant_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_customizations" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "priceChange" TEXT NOT NULL DEFAULT '0',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_customizations_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "invoice_lines" ADD COLUMN "lineNote" TEXT;
ALTER TABLE "invoice_lines" ADD COLUMN "modifiersSnapshot" JSONB;

-- CreateIndex
CREATE INDEX "menu_item_variant_groups_menuItemId_sortOrder_idx" ON "menu_item_variant_groups"("menuItemId", "sortOrder");

-- CreateIndex
CREATE INDEX "menu_item_variant_options_groupId_sortOrder_idx" ON "menu_item_variant_options"("groupId", "sortOrder");

-- CreateIndex
CREATE INDEX "menu_item_customizations_menuItemId_sortOrder_idx" ON "menu_item_customizations"("menuItemId", "sortOrder");

-- AddForeignKey
ALTER TABLE "menu_item_variant_groups" ADD CONSTRAINT "menu_item_variant_groups_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_variant_options" ADD CONSTRAINT "menu_item_variant_options_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "menu_item_variant_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_customizations" ADD CONSTRAINT "menu_item_customizations_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
