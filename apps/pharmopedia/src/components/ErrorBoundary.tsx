import React from 'react'
import { CrashFallback } from './CrashFallback'

interface Props {
  children: React.ReactNode
  /** If true, renders compact inline fallback */
  inline?: boolean
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return <CrashFallback inline={this.props.inline} />
    }
    return this.props.children
  }
}
