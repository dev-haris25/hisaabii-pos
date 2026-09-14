import { listTableToolbarSelectClass } from '@/lib/list-views/list-page-toolbar-styles'
import { cn } from '@/lib/utils'

/**
 * Filter dropdown inside the table toolbar row.
 *
 * @param {import('react').SelectHTMLAttributes<HTMLSelectElement> & { className?: string }} props
 */
export function ListTableToolbarSelect({ className, ...props }) {
  return <select className={cn(listTableToolbarSelectClass(), className)} {...props} />
}
