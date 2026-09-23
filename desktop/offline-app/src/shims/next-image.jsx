export default function NextImage({ src, alt, className, width, height, ...rest }) {
  return (
    <img
      src={typeof src === 'string' ? src : src?.src}
      alt={alt || ''}
      className={className}
      width={width}
      height={height}
      {...rest}
    />
  )
}
