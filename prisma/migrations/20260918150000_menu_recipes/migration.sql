-- Recipes + recipe_deduct movements + kitchen stockDeductedAt (Step 3 / MVP A)

ALTER TYPE "StockMovementType" ADD VALUE 'recipe_deduct';

ALTER TABLE "kitchen_orders" ADD COLUMN "stockDeductedAt" TIMESTAMP(3);

CREATE TABLE "menu_item_recipes" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "steps" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_recipes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "menu_item_recipes_menuItemId_key" ON "menu_item_recipes"("menuItemId");

ALTER TABLE "menu_item_recipes"
  ADD CONSTRAINT "menu_item_recipes_menuItemId_fkey"
  FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "menu_item_recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "stockItemId" TEXT NOT NULL,
    "quantity" TEXT NOT NULL,
    "unit" "StockUnit" NOT NULL,
    "sortOrder" INT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_item_recipe_ingredients_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "menu_item_recipe_ingredients_recipeId_sortOrder_idx"
  ON "menu_item_recipe_ingredients"("recipeId", "sortOrder");
CREATE INDEX "menu_item_recipe_ingredients_stockItemId_idx"
  ON "menu_item_recipe_ingredients"("stockItemId");

ALTER TABLE "menu_item_recipe_ingredients"
  ADD CONSTRAINT "menu_item_recipe_ingredients_recipeId_fkey"
  FOREIGN KEY ("recipeId") REFERENCES "menu_item_recipes"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_item_recipe_ingredients"
  ADD CONSTRAINT "menu_item_recipe_ingredients_stockItemId_fkey"
  FOREIGN KEY ("stockItemId") REFERENCES "stock_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
