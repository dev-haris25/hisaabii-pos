import { jsonOk, jsonError } from '@/lib/api/json-response'
import { withReportAuth } from '@/lib/reports/with-report-auth'
import { parseDateRangeParams } from '@/lib/reports/parse-report-params'
import { queryZatcaStatusReport } from '@/lib/reports/queries/pos-reports'

export async function GET(request) {
  const auth = await withReportAuth(request)
  if (!auth.ok) return auth.response
  const { searchParams } = new URL(request.url)
  const parsed = parseDateRangeParams(searchParams, { required: true })
  if (parsed.error) return jsonError(400, 'VALIDATION_ERROR', parsed.error)
  const result = await queryZatcaStatusReport(auth.analyticsProfileIds, parsed)
  return jsonOk(result)
}
