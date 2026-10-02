import { haversineDistanceMeters } from '@/lib/geo/haversine-distance'

/** App default when lat/lng are set but radius is null (settings guidance ~100–150m). */
export const DEFAULT_GEOFENCE_RADIUS_METERS = 150

/**
 * Public menu payload: whether the guest must pass a client geofence check.
 * Mirrors assertWithinRestaurantGeofence "skipped" policy (no lat/lng → not required).
 *
 * @param {{
 *   locationLat?: number | null
 *   locationLng?: number | null
 *   locationRadiusMeters?: number | null
 * }} profile
 * @returns {{
 *   required: false
 * } | {
 *   required: true
 *   lat: number
 *   lng: number
 *   radiusMeters: number
 * }}
 */
export function getPublicGeofenceConfig(profile) {
  const restLat = profile?.locationLat
  const restLng = profile?.locationLng
  if (
    restLat == null ||
    restLng == null ||
    !Number.isFinite(Number(restLat)) ||
    !Number.isFinite(Number(restLng))
  ) {
    return { required: false }
  }

  const radiusMeters =
    profile.locationRadiusMeters != null &&
    Number.isFinite(Number(profile.locationRadiusMeters)) &&
    Number(profile.locationRadiusMeters) > 0
      ? Number(profile.locationRadiusMeters)
      : DEFAULT_GEOFENCE_RADIUS_METERS

  return {
    required: true,
    lat: Number(restLat),
    lng: Number(restLng),
    radiusMeters,
  }
}

/**
 * Server-side geofence check against BusinessProfile location fields.
 *
 * Policy: if locationLat or locationLng is unset → allow (no geofence configured).
 * If both are set → require customer coords and distance ≤ radius
 * (radius falls back to DEFAULT_GEOFENCE_RADIUS_METERS when null).
 *
 * @param {{
 *   locationLat?: number | null
 *   locationLng?: number | null
 *   locationRadiusMeters?: number | null
 * }} profile
 * @param {number | null | undefined} customerLat
 * @param {number | null | undefined} customerLng
 * @returns {{
 *   ok: true, skipped: boolean, meters?: number, radius?: number
 * } | {
 *   ok: false, code: 'LOCATION_REQUIRED' | 'OUTSIDE_GEOFENCE', meters?: number, radius?: number
 * }}
 */
export function assertWithinRestaurantGeofence(profile, customerLat, customerLng) {
  const restLat = profile?.locationLat
  const restLng = profile?.locationLng
  if (
    restLat == null ||
    restLng == null ||
    !Number.isFinite(Number(restLat)) ||
    !Number.isFinite(Number(restLng))
  ) {
    return { ok: true, skipped: true }
  }

  const radius =
    profile.locationRadiusMeters != null &&
    Number.isFinite(Number(profile.locationRadiusMeters)) &&
    Number(profile.locationRadiusMeters) > 0
      ? Number(profile.locationRadiusMeters)
      : DEFAULT_GEOFENCE_RADIUS_METERS

  if (
    customerLat == null ||
    customerLng == null ||
    !Number.isFinite(Number(customerLat)) ||
    !Number.isFinite(Number(customerLng))
  ) {
    return { ok: false, code: 'LOCATION_REQUIRED', radius }
  }

  const meters = haversineDistanceMeters(
    Number(restLat),
    Number(restLng),
    Number(customerLat),
    Number(customerLng),
  )
  if (meters > radius) {
    return { ok: false, code: 'OUTSIDE_GEOFENCE', meters, radius }
  }
  return { ok: true, skipped: false, meters, radius }
}
