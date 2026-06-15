/**
 * Tests for TooltipContent colour classes.
 */
import { render } from '@testing-library/react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip.js'

function renderTooltip() {
  return render(
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger>Hover me</TooltipTrigger>
        <TooltipContent>Tip text</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

describe('TooltipContent colours', () => {
  it('content element has bg-primary class', () => {
    const { baseElement } = renderTooltip()
    const content = baseElement.querySelector('[data-slot="tooltip-content"]')
    expect(content).not.toBeNull()
    expect(content!.className).toContain('bg-primary')
  })

  it('content element has text-primary-foreground class', () => {
    const { baseElement } = renderTooltip()
    const content = baseElement.querySelector('[data-slot="tooltip-content"]')
    expect(content!.className).toContain('text-primary-foreground')
  })

  it('content element does NOT have old bg-foreground class', () => {
    const { baseElement } = renderTooltip()
    const content = baseElement.querySelector('[data-slot="tooltip-content"]')
    expect(content!.className).not.toContain('bg-foreground')
  })

  it('content element does NOT have old text-background class', () => {
    const { baseElement } = renderTooltip()
    const content = baseElement.querySelector('[data-slot="tooltip-content"]')
    expect(content!.className).not.toContain('text-background')
  })
})
