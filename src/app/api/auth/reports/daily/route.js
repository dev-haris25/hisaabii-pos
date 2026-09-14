import { jsonOk, jsonError } from '@/lib/api/json-response'
import { withReportAuth } from '@/lib/reports/with-report-auth'
import { parseSingleDateParam } from '@/lib/reports/parse-report-params'
import { queryDailyReport } from '@/lib/reports/queries/pos-reports'

export async function GET(request) {
  const auth = await withReportAuth(request)
  if (!auth.ok) return auth.response
  const { searchParams } = new URL(request.url)
  const parsed = parseSingleDateParam(searchParams)
  if (parsed.error) return jsonError(400, 'VALIDATION_ERROR', parsed.error)
  const result = await queryDailyReport(auth.analyticsProfileIds, parsed)
  return jsonOk(result)
}
