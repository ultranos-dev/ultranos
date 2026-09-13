import { describe, it, expect } from 'vitest'
import { Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'
import { highlightNativeName } from '@ultranos/ui-kit/highlight-native'

describe('highlightNativeName', () => {
  it('splits the value so the matched query segment renders separately (highlighted)', () => {
    render(<Text>{highlightNativeName('Amoxicillin', 'amox')}</Text>)
    expect(screen.getByText('Amox')).toBeTruthy()
    expect(screen.getByText('icillin')).toBeTruthy()
  })

  it('applies an amber background to the highlighted segment', () => {
    render(<Text>{highlightNativeName('Amoxicillin', 'amox')}</Text>)
    const styles = ([] as unknown[]).concat(screen.getByText('Amox').props.style)
    expect(styles.some((s) => s && (s as { backgroundColor?: string }).backgroundColor)).toBe(true)
  })

  it('returns the raw string (single node) when there is no match', () => {
    render(<Text testID="line">{highlightNativeName('Paracetamol', 'zzz')}</Text>)
    // No match -> the parent Text receives the plain string, not split Text nodes.
    expect(screen.getByTestId('line').props.children).toBe('Paracetamol')
  })

  it('returns the raw string for an empty query', () => {
    render(<Text testID="line">{highlightNativeName('Paracetamol', '')}</Text>)
    expect(screen.getByTestId('line').props.children).toBe('Paracetamol')
  })
})
