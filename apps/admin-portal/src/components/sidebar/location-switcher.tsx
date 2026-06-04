'use client'

import { useEffect } from 'react'
import { ChevronsUpDown, Building2 } from '@ultranos/ui-kit/icons'
import { FlaskConical, Pill, Stethoscope } from '@ultranos/ui-kit/icons'
import { trpc } from '@/lib/trpc'
import {
  useLocationStore,
  ALL_LOCATIONS,
  type Location,
  type LocationType,
} from '@/stores/location-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

const TYPE_ICONS: Record<LocationType | 'all', typeof Building2> = {
  all: Building2,
  lab: FlaskConical,
  pharmacy: Pill,
  opd: Stethoscope,
}

const TYPE_LABELS: Record<LocationType, string> = {
  lab: 'Lab',
  pharmacy: 'Pharmacy',
  opd: 'OPD Clinic',
}

export function LocationSwitcher() {
  const { isMobile } = useSidebar()
  const { selected, locations, loading, setSelected, setLocations, setLoading } =
    useLocationStore()

  useEffect(() => {
    let cancelled = false

    async function fetchLocations() {
      try {
        const [labsResult] = await Promise.all([
          trpc.admin.listLabs.query({ page: 1, pageSize: 200 }),
        ])

        if (cancelled) return

        const locs: Location[] = labsResult.labs.map((lab: { id: string; name: string }) => ({
          id: lab.id,
          name: lab.name,
          type: 'lab' as LocationType,
        }))

        setLocations(locs)
      } catch {
        // Silently handle — locations list is non-critical
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchLocations()
    return () => { cancelled = true }
  }, [setLocations, setLoading])

  const ActiveIcon = selected.id === ALL_LOCATIONS.id
    ? TYPE_ICONS.all
    : TYPE_ICONS[selected.type]

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <ActiveIcon className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {selected.id === ALL_LOCATIONS.id ? 'Ultranos Admin' : selected.name}
                </span>
                <span className="truncate text-xs">
                  {selected.id === ALL_LOCATIONS.id
                    ? 'All locations'
                    : TYPE_LABELS[selected.type]}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56"
            align="start"
            side={isMobile ? 'bottom' : 'right'}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Locations
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => setSelected(ALL_LOCATIONS)}>
              <Building2 className="mr-2 size-4" />
              All Locations
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {loading ? (
              <DropdownMenuItem disabled>Loading locations...</DropdownMenuItem>
            ) : locations.length === 0 ? (
              <DropdownMenuItem disabled>No locations registered</DropdownMenuItem>
            ) : (
              locations.map((loc) => {
                const Icon = TYPE_ICONS[loc.type]
                return (
                  <DropdownMenuItem key={loc.id} onClick={() => setSelected(loc)}>
                    <Icon className="mr-2 size-4" />
                    <span className="truncate">{loc.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {TYPE_LABELS[loc.type]}
                    </span>
                  </DropdownMenuItem>
                )
              })
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
