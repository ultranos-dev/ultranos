import React from 'react'
import { render, fireEvent, act } from '@testing-library/react-native'
import { SearchBar } from '@/components/SearchBar'

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

describe('SearchBar', () => {
  it('calls onSearch after 300ms debounce', () => {
    const onSearch = jest.fn()
    const { getByTestId } = render(
      <SearchBar value="" onSearch={onSearch} lang="en" onLangChange={() => {}} />
    )
    fireEvent.changeText(getByTestId('search-input'), 'amox')
    expect(onSearch).not.toHaveBeenCalled()
    act(() => jest.advanceTimersByTime(300))
    expect(onSearch).toHaveBeenCalledWith('amox')
  })

  it('does not call onSearch before debounce expires', () => {
    const onSearch = jest.fn()
    const { getByTestId } = render(
      <SearchBar value="" onSearch={onSearch} lang="en" onLangChange={() => {}} />
    )
    fireEvent.changeText(getByTestId('search-input'), 'para')
    act(() => jest.advanceTimersByTime(100))
    expect(onSearch).not.toHaveBeenCalled()
  })
})
