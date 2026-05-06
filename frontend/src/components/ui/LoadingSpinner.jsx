export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`${sizes[size]} rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin`} />
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
      <div className="w-10 h-10 rounded-full border-2 border-slate-200 border-t-blue-600 animate-spin" />
      <p className="text-sm text-slate-500">Loading...</p>
    </div>
  )
}
