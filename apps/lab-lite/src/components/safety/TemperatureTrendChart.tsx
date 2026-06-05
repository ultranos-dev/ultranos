'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { useLocale } from 'next-intl'
import type { TemperatureLocation, TemperatureReading } from '@/types/temperature-monitoring'
import { getReadingsByLocation } from '@/lib/db'

interface TemperatureTrendChartProps {
  location: TemperatureLocation
  days?: number
}

export function TemperatureTrendChart({
  location,
  days = 7,
}: TemperatureTrendChartProps) {
  const t = useTranslations('safety.temperature')
  const locale = useLocale()
  const isRTL = locale === 'ar' || locale === 'prs' || locale === 'ps'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [readings, setReadings] = useState<TemperatureReading[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const all = await getReadingsByLocation(location.id)
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - days)
      const filtered = all
        .filter((r) => new Date(r.timestamp) >= cutoff)
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      setReadings(filtered)
      setLoading(false)
    }
    void load()
  }, [location.id, days])

  useEffect(() => {
    if (loading || !canvasRef.current) return
    drawChart(canvasRef.current, readings, location, isRTL)
  }, [readings, loading, location, isRTL])

  if (loading) {
    return (
      <div className="h-48 rounded-lg bg-muted/30 animate-pulse" aria-busy="true" />
    )
  }

  if (readings.length === 0) {
    return (
      <div className="h-48 rounded-lg bg-muted/30 flex items-center justify-center text-sm text-muted-foreground">
        {t('noReadings')}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="w-full h-auto"
        aria-label={t('chartAriaLabel', { location: location.name, days })}
        role="img"
      />
      <div className="flex gap-4 mt-2 text-xs text-muted-foreground justify-center">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-200" />
          {t('normal')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-amber-200" />
          {t('warning')}
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-200" />
          {t('excursion')}
        </span>
      </div>
    </div>
  )
}

function drawChart(
  canvas: HTMLCanvasElement,
  readings: TemperatureReading[],
  location: TemperatureLocation,
  isRTL: boolean,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const W = canvas.width
  const H = canvas.height
  const PAD_L = 40
  const PAD_R = 10
  const PAD_T = 10
  const PAD_B = 30
  const chartW = W - PAD_L - PAD_R
  const chartH = H - PAD_T - PAD_B

  ctx.clearRect(0, 0, W, H)

  // Determine Y range with padding
  const temps = readings.map((r) => r.temperatureCelsius)
  const allTemps = [...temps, location.minTemp - 2, location.maxTemp + 2]
  const minY = Math.floor(Math.min(...allTemps))
  const maxY = Math.ceil(Math.max(...allTemps))
  const rangeY = maxY - minY || 1

  const toCanvasX = (index: number): number => {
    const fraction = readings.length > 1 ? index / (readings.length - 1) : 0.5
    const x = PAD_L + fraction * chartW
    return isRTL ? W - x + PAD_L - PAD_R : x
  }

  const toCanvasY = (temp: number): number => {
    return PAD_T + chartH - ((temp - minY) / rangeY) * chartH
  }

  // Draw color-coded zones
  const warningMargin = 1

  // Red zone (below min - 1 and above max + 1)
  ctx.fillStyle = 'rgba(254, 202, 202, 0.3)' // red-200 with alpha
  ctx.fillRect(PAD_L, PAD_T, chartW, toCanvasY(location.maxTemp + warningMargin) - PAD_T)
  ctx.fillRect(PAD_L, toCanvasY(location.minTemp - warningMargin), chartW, chartH + PAD_T - toCanvasY(location.minTemp - warningMargin))

  // Amber zone (warning band)
  ctx.fillStyle = 'rgba(253, 230, 138, 0.3)' // amber-200 with alpha
  const amberTopY = toCanvasY(location.maxTemp + warningMargin)
  const amberTopH = toCanvasY(location.maxTemp) - amberTopY
  ctx.fillRect(PAD_L, amberTopY, chartW, amberTopH)
  const amberBotY = toCanvasY(location.minTemp)
  const amberBotH = toCanvasY(location.minTemp - warningMargin) - amberBotY
  ctx.fillRect(PAD_L, amberBotY, chartW, amberBotH)

  // Green zone (acceptable range)
  ctx.fillStyle = 'rgba(187, 247, 208, 0.3)' // green-200 with alpha
  const greenTop = toCanvasY(location.maxTemp)
  const greenBot = toCanvasY(location.minTemp)
  ctx.fillRect(PAD_L, greenTop, chartW, greenBot - greenTop)

  // Draw range limit lines
  ctx.setLineDash([4, 4])
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(PAD_L, toCanvasY(location.maxTemp))
  ctx.lineTo(PAD_L + chartW, toCanvasY(location.maxTemp))
  ctx.moveTo(PAD_L, toCanvasY(location.minTemp))
  ctx.lineTo(PAD_L + chartW, toCanvasY(location.minTemp))
  ctx.stroke()
  ctx.setLineDash([])

  // Draw data line
  ctx.strokeStyle = '#3b82f6'
  ctx.lineWidth = 2
  ctx.beginPath()
  readings.forEach((r, i) => {
    const x = toCanvasX(i)
    const y = toCanvasY(r.temperatureCelsius)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  // Draw data points (color-coded)
  readings.forEach((r, i) => {
    const x = toCanvasX(i)
    const y = toCanvasY(r.temperatureCelsius)
    const temp = r.temperatureCelsius

    let color: string
    if (temp < location.minTemp - 1 || temp > location.maxTemp + 1) {
      color = '#ef4444' // red
    } else if (temp < location.minTemp || temp > location.maxTemp) {
      color = '#f59e0b' // amber
    } else {
      color = '#22c55e' // green
    }

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x, y, 3, 0, Math.PI * 2)
    ctx.fill()
  })

  // Y-axis labels
  ctx.fillStyle = '#737373'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'end'
  const steps = 5
  for (let i = 0; i <= steps; i++) {
    const temp = minY + (rangeY * i) / steps
    const y = toCanvasY(temp)
    ctx.fillText(`${temp.toFixed(0)}°`, PAD_L - 4, y + 3)
  }

  // X-axis: first and last date labels
  ctx.textAlign = 'center'
  if (readings.length > 0) {
    const firstDate = new Date(readings[0].timestamp).toLocaleDateString()
    const lastDate = new Date(readings[readings.length - 1].timestamp).toLocaleDateString()
    ctx.fillText(firstDate, toCanvasX(0), H - 4)
    if (readings.length > 1) {
      ctx.fillText(lastDate, toCanvasX(readings.length - 1), H - 4)
    }
  }
}
