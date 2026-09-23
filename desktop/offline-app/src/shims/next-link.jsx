export default function NextLink({ href, children, className, ...rest }) {
  const to = typeof href === 'string' ? href : '#'
  return (
    <a href={to} className={className} {...rest}>
      {children}
    </a>
  )
}
