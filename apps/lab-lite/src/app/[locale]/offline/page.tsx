'use client'

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="rounded-lg border border-neutral-200 bg-white p-8 shadow-sm">
        <p className="mb-6 text-neutral-700">
          You are offline. Lab Lite requires a network connection for uploads. Previously cached
          pages are still available.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-primary-700 px-6 py-2 text-sm font-medium text-white hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          Try Again
        </button>
      </div>
    </div>
  )
}
