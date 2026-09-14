import { jsonOk } from '@/lib/api/json-response'
import { withReportAuth } from '@/lib/reports/with-report-auth'
import { queryAdvancesReport } from '@/lib/reports/queries/pos-reports'

export async function GET(request) {
  const auth = await withReportAuth(request)
  if (!auth.ok) return auth.response
  const result = await queryAdvancesReport(auth.analyticsProfileIds)
  return jsonOk(result)
}
