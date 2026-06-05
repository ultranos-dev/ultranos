/**
 * Tests for the ShadCN SidebarMenuButton component — active state classes.
 */
import { render, screen } from '@testing-library/react'
import {
  SidebarMenuButton,
  SidebarProvider,
  SidebarMenu,
  SidebarMenuItem,
} from '../components/ui/sidebar.js'
import { TooltipProvider } from '../components/ui/tooltip.js'

function renderButton(isActive: boolean) {
  return render(
    <SidebarProvider>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton isActive={isActive}>Dashboard</SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarProvider>
  )
}

describe('SidebarMenuButton active state', () => {
  it('applies data-active attribute when isActive is true', () => {
    renderButton(true)
    const btn = screen.getByRole('button', { name: /dashboard/i })
    expect(btn).toHaveAttribute('data-active', 'true')
  })

  it('does not apply data-active when isActive is false', () => {
    renderButton(false)
    const btn = screen.getByRole('button', { name: /dashboard/i })
    expect(btn).toHaveAttribute('data-active', 'false')
  })

  it('active button has bg-primary/10 class', () => {
    renderButton(true)
    const btn = screen.getByRole('button', { name: /dashboard/i })
    expect(btn.className).toContain('data-active:bg-primary/10')
  })

  it('active button has text-primary class', () => {
    renderButton(true)
    const btn = screen.getByRole('button', { name: /dashboard/i })
    expect(btn.className).toContain('data-active:text-primary')
  })

  it('active button does NOT have old sidebar-accent active class', () => {
    renderButton(true)
    const btn = screen.getByRole('button', { name: /dashboard/i })
    expect(btn.className).not.toContain('data-active:bg-sidebar-accent')
  })
})

// Helper — renders SidebarMenuButton inside a controllable SidebarProvider.
// `defaultOpen` controls sidebar expanded/collapsed state.
function renderButtonWithTooltip(collapsed: boolean) {
  return render(
    <TooltipProvider>
      <SidebarProvider defaultOpen={!collapsed}>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Dashboard label">Dashboard</SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarProvider>
    </TooltipProvider>
  )
}

describe('SidebarMenuButton tooltip visibility', () => {
  it('does NOT render TooltipTrigger when sidebar is expanded', () => {
    const { baseElement } = renderButtonWithTooltip(false)
    // When expanded the button is rendered directly (no Tooltip wrapper).
    // Radix Tooltip.Trigger (via asChild) adds data-state to the button; its
    // absence confirms no Tooltip is mounted.
    const btn = baseElement.querySelector('[data-slot="sidebar-menu-button"]')
    expect(btn).not.toBeNull()
    expect(btn?.hasAttribute('data-state')).toBe(false)
  })

  it('renders TooltipTrigger when sidebar is collapsed', () => {
    const { baseElement } = renderButtonWithTooltip(true)
    // When collapsed the button is rendered inside <Tooltip><TooltipTrigger asChild>.
    // Radix Tooltip.Trigger (asChild) merges data-state onto the button element.
    const btn = baseElement.querySelector('[data-slot="sidebar-menu-button"]')
    expect(btn).not.toBeNull()
    expect(btn?.hasAttribute('data-state')).toBe(true)
  })

  it('tooltip content is NOT mounted when expanded', () => {
    const { baseElement } = renderButtonWithTooltip(false)
    expect(baseElement.querySelector('[data-slot="tooltip-content"]')).toBeNull()
  })
})
