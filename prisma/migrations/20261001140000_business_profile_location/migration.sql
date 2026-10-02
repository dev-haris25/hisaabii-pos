-- E-Waiter: restaurant geofence fields on BusinessProfile.

ALTER TABLE "business_profiles"
ADD COLUMN "locationLat" DOUBLE PRECISION,
ADD COLUMN "locationLng" DOUBLE PRECISION,
ADD COLUMN "locationRadiusMeters" INTEGER;
