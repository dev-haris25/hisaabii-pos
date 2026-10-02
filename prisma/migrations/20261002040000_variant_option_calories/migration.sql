-- Optional total calories on variant options (fallback to menu_items.calories when null).
ALTER TABLE "menu_item_variant_options" ADD COLUMN "calories" INTEGER;
