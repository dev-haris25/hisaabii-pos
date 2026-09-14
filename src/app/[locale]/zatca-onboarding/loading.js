import { AppLoader } from '@/components/app-loader'

export default function ZatcaOnboardingLoading() {
  return (
    <div className="type-body-md text-hisabi-on-surface flex min-h-dvh flex-col items-center justify-center bg-hisabi-background">
      <AppLoader />
    </div>
  )
}
