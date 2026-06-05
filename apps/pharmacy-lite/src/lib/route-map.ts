interface BreadcrumbSegment {
  label: string
  href: string
}

const ROUTE_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/queue': 'Queue',
  '/history': 'History',
  '/scan': 'Scan',
  '/pos': 'Point of Sale',
  '/pos/accounts': 'Accounts',
  '/pos/cash-drawer': 'Cash Drawer',
  '/register-patient': 'Register Patient',
  '/inventory': 'Inventory',
  '/inventory/catalog': 'Catalog',
  '/inventory/count': 'Stock Count',
  '/inventory/suppliers': 'Suppliers',
  '/inventory/receive': 'Receive Goods',
  '/inventory/transfers': 'Transfers',
  '/reports': 'Reports',
  '/sync': 'Sync',
  '/settings': 'Settings',
  '/settings/data-budget': 'Data Usage',
  '/paper-rx': 'Paper Rx',
  '/unverified': 'Unverified',
  '/controlled': 'Controlled',
}

export function buildBreadcrumbs(rawPathname: string): BreadcrumbSegment[] {
  // Strip locale prefix: /en/queue → /queue, /ar/ → /
  const pathname = rawPathname.replace(/^\/[a-z]{2}(\/|$)/, '/')

  // Root — single crumb
  if (pathname === '/') {
    return [{ label: 'Dashboard', href: '/' }]
  }

  const segments = pathname.split('/').filter(Boolean)
  const crumbs: BreadcrumbSegment[] = []
  let path = ''

  for (let i = 0; i < segments.length; i++) {
    path += `/${segments[i]}`
    const label = ROUTE_LABELS[path]
    if (label) {
      crumbs.push({ label, href: path })
    } else if (i === segments.length - 1) {
      // Unknown dynamic segment — capitalise as fallback
      const seg = segments[i]
      const fallback = seg
        ? seg.charAt(0).toUpperCase() + seg.slice(1)
        : 'Detail'
      crumbs.push({ label: fallback, href: pathname })
    }
  }

  return crumbs
}
