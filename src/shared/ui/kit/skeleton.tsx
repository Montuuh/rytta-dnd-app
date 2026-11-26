import { cn } from '@/shared/lib/cn'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        'tw:animate-pulse tw:rounded-md tw:motion-reduce:animate-none tw:bg-muted',
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
