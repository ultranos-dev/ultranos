import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { AppToaster } from '../components/ui/app-toaster'

describe('AppToaster', () => {
  it('renders without crashing', () => {
    const { container } = render(<AppToaster />)
    expect(container).toBeTruthy()
  })
})
