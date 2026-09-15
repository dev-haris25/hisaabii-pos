-- Max POS checkout discount (SAR). NULL = unlimited.
ALTER TABLE "business_settings"
ADD COLUMN IF NOT EXISTS "discountCap" TEXT;
