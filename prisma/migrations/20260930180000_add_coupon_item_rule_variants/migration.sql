-- CreateTable
CREATE TABLE "coupon_item_rule_variant_options" (
    "id" TEXT NOT NULL,
    "couponItemRuleId" TEXT NOT NULL,
    "variantOptionId" TEXT NOT NULL,

    CONSTRAINT "coupon_item_rule_variant_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "coupon_item_rule_variant_options_couponItemRuleId_idx" ON "coupon_item_rule_variant_options"("couponItemRuleId");

-- CreateIndex
CREATE INDEX "coupon_item_rule_variant_options_variantOptionId_idx" ON "coupon_item_rule_variant_options"("variantOptionId");

-- CreateIndex
CREATE UNIQUE INDEX "coupon_item_rule_variant_options_couponItemRuleId_variantOptionId_key" ON "coupon_item_rule_variant_options"("couponItemRuleId", "variantOptionId");

-- AddForeignKey
ALTER TABLE "coupon_item_rule_variant_options" ADD CONSTRAINT "coupon_item_rule_variant_options_couponItemRuleId_fkey" FOREIGN KEY ("couponItemRuleId") REFERENCES "coupon_item_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_item_rule_variant_options" ADD CONSTRAINT "coupon_item_rule_variant_options_variantOptionId_fkey" FOREIGN KEY ("variantOptionId") REFERENCES "menu_item_variant_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;