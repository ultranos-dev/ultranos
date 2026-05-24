'use client'

import { useState, useEffect, useRef } from 'react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export function SearchInput({ value, onChange, placeholder = 'Search by name or National ID...' }: SearchInputProps) {
  const [localValue, setLocalValue] = useState(value)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync external value changes (e.g., clearSearch resets store query to '')
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    setLocalValue(raw)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      onChange(raw)
    }, 250)
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return (
    <div className="w-full">
      <input
        type="search"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label="Patient search"
        className="w-full rounded-xl border-none bg-white/70 backdrop-blur-md px-4 py-3 text-base font-semibold
          text-neutral-900 placeholder:text-neutral-400 placeholder:font-normal
          ring-[0.65px] ring-gray-400/40
          focus:ring-2 focus:ring-primary-200 focus:outline-none
          transition-colors"
      />
    </div>
  )
}
