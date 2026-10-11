-- CreateTable
CREATE TABLE "menu_item_variant_option_ingredients" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_variant_option_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_customization_ingredients" (
    "id" TEXT NOT NULL,
    "customizationId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_customization_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_item_variant_option_ingredients_optionId_sortOrder_idx" ON "menu_item_variant_option_ingredients"("optionId", "sortOrder");

-- CreateIndex
CREATE INDEX "menu_item_variant_option_ingredients_stockItemId_idx" ON "menu_item_variant_option_ingredients"("stockItemId");

-- CreateIndex
CREATE INDEX "menu_item_customization_ingredients_customizationId_sortOrd_idx" ON "menu_item_customization_ingredients"("customizationId", "sortOrder");

-- CreateIndex
CREATE INDEX "menu_item_customization_ingredients_stockItemId_idx" ON "menu_item_customization_ingredients"("stockItemId");

-- AddForeignKey
ALTER TABLE "menu_item_variant_option_ingredients" ADD CONSTRAINT "menu_item_variant_option_ingredients_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "menu_item_variant_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_variant_option_ingredients" ADD CONSTRAINT "menu_item_variant_option_ingredients_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_customization_ingredients" ADD CONSTRAINT "menu_item_customization_ingredients_customizationId_fkey" FOREIGN KEY ("customizationId") REFERENCES "menu_item_customizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_customization_ingredients" ADD CONSTRAINT "menu_item_customization_ingredients_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
