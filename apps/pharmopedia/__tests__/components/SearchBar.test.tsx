import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SearchBar } from '@/components/SearchBar'

describe('SearchBar', () => {
  it('calls onSearch immediately when text changes', () => {
    const onSearch = jest.fn()
    const { getByTestId } = render(
      <SearchBar value="" onSearch={onSearch} />
    )
    fireEvent.changeText(getByTestId('search-input'), 'amox')
    expect(onSearch).toHaveBeenCalledWith('amox')
  })

  it('calls onSearch with new text on each change', () => {
    const onSearch = jest.fn()
    const { getByTestId } = render(
      <SearchBar value="" onSearch={onSearch} />
    )
    fireEvent.changeText(getByTestId('search-input'), 'para')
    expect(onSearch).toHaveBeenCalledWith('para')
  })
})
