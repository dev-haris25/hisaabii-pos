import { listPageFilterSelectClass } from '@/lib/list-views/list-page-toolbar-styles'
import { cn } from '@/lib/utils'

/**
 * Page-header filter dropdown — matches invoice list styling.
 *
 * @param {import('react').SelectHTMLAttributes<HTMLSelectElement> & { className?: string }} props
 */
export function ListPageFilterSelect({ className, ...props }) {
  return <select className={cn(listPageFilterSelectClass(), className)} {...props} />
}
