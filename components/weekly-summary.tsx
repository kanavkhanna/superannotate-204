"use client"

import { format, parseISO } from "date-fns"
import { memo, useMemo } from "react"

interface SolarEntry {
  date: string
  production: number
}

interface WeeklySummaryProps {
  entries: SolarEntry[]
  weeklyTotal?: number
  dailyAverage?: number
  maxProduction?: number
  maxProductionDay?: SolarEntry
}

function WeeklySummary({
  entries,
  weeklyTotal = 0,
  dailyAverage = 0,
  maxProduction = 0,
  maxProductionDay,
}: WeeklySummaryProps) {
  // Memoize formatted values to prevent recalculation on re-renders
  const formattedValues = useMemo(() => {
    // Format numbers only once
    const formattedTotal = weeklyTotal.toFixed(1)
    const formattedAverage = dailyAverage.toFixed(1)
    const formattedMax = maxProduction > 0 ? maxProduction.toFixed(1) : "-"

    // Format date only if needed
    const bestDay = maxProduction > 0 && maxProductionDay ? format(parseISO(maxProductionDay.date), "EEE") : "kWh"

    return { formattedTotal, formattedAverage, formattedMax, bestDay }
  }, [weeklyTotal, dailyAverage, maxProduction, maxProductionDay])

  const { formattedTotal, formattedAverage, formattedMax, bestDay } = formattedValues

  // Use a simpler rendering approach for better performance
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 sm:gap-4">
        {/* Total Card - Pre-styled for better performance */}
        <div className="bg-green-50 dark:bg-green-900/30 rounded-lg p-1 sm:p-3 text-center border border-green-200 dark:border-green-800">
          <p className="text-[10px] sm:text-xs text-green-700 dark:text-green-300 font-medium">TOTAL</p>
          <p className="text-lg sm:text-2xl font-bold text-green-600 dark:text-green-300">{formattedTotal}</p>
          <p className="text-[10px] sm:text-xs text-green-600 dark:text-green-400">kWh</p>
        </div>

        {/* Average Card */}
        <div className="bg-blue-50 dark:bg-blue-900/30 rounded-lg p-1 sm:p-3 text-center border border-blue-200 dark:border-blue-800">
          <p className="text-[10px] sm:text-xs text-blue-700 dark:text-blue-300 font-medium">AVERAGE</p>
          <p className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-300">{formattedAverage}</p>
          <p className="text-[10px] sm:text-xs text-blue-600 dark:text-blue-400">kWh/day</p>
        </div>

        {/* Best Day Card */}
        <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-1 sm:p-3 text-center border border-amber-200 dark:border-amber-800">
          <p className="text-[10px] sm:text-xs text-amber-700 dark:text-amber-300 font-medium">BEST DAY</p>
          <p className="text-lg sm:text-2xl font-bold text-amber-600 dark:text-amber-300">{formattedMax}</p>
          <p className="text-[10px] sm:text-xs text-amber-600 dark:text-amber-400">{bestDay}</p>
        </div>
      </div>
    </div>
  )
}

// Use React.memo with a custom comparison function for better performance
export default memo(WeeklySummary, (prevProps, nextProps) => {
  // Only re-render if these values have changed
  return (
    prevProps.weeklyTotal === nextProps.weeklyTotal &&
    prevProps.dailyAverage === nextProps.dailyAverage &&
    prevProps.maxProduction === nextProps.maxProduction &&
    prevProps.maxProductionDay?.date === nextProps.maxProductionDay?.date
  )
})

