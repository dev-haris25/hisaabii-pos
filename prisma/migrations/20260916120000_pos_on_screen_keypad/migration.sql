-- In-app POS numpad for touch tills. Default off (physical keyboard).
ALTER TABLE "business_settings"
ADD COLUMN IF NOT EXISTS "posOnScreenKeypad" BOOLEAN NOT NULL DEFAULT false;
