-- Per-till LAN / USB receipt printers. Copy existing restaurant printers onto each till.
ALTER TABLE "pos_tills"
ADD COLUMN IF NOT EXISTS "printVia" TEXT NOT NULL DEFAULT 'lan';

ALTER TABLE "pos_tills"
ADD COLUMN IF NOT EXISTS "lanPrinters" JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "pos_tills"
ADD COLUMN IF NOT EXISTS "usbPrinters" JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE "pos_tills" AS t
SET "lanPrinters" = COALESCE((
  SELECT jsonb_agg(jsonb_build_object('ip', r.ip, 'port', r.port) ORDER BY r."sortOrder", r."createdAt")
  FROM "receipt_printers" AS r
  WHERE r."businessProfileId" = t."businessProfileId"
    AND btrim(r.ip) <> ''
), (
  SELECT CASE
    WHEN p."printerIp" IS NOT NULL AND btrim(p."printerIp") <> ''
      THEN jsonb_build_array(jsonb_build_object('ip', p."printerIp", 'port', COALESCE(p."printerPort", 9100)))
    ELSE '[]'::jsonb
  END
  FROM "business_profiles" AS p
  WHERE p.id = t."businessProfileId"
));
