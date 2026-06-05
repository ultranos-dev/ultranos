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
