/**
 * Map LoyaltySettings row → API payload (money/rate fields stay strings).
 *
 * @param {import('@/generated/prisma').LoyaltySettings} settings
 */
export function mapLoyaltySettingsPayload(settings) {
  return {
    enabled: settings.enabled === true,
    earnRateAmount: settings.earnRateAmount,
    earnRatePoints: settings.earnRatePoints,
    redeemRatePoints: settings.redeemRatePoints,
    redeemRateAmount: settings.redeemRateAmount,
    minBalanceToRedeem: settings.minBalanceToRedeem ?? null,
    maxPointsPerOrder: settings.maxPointsPerOrder ?? null,
    minOrderValueToRedeem: settings.minOrderValueToRedeem ?? null,
  }
}
