// This file will be used by our web worker
// It handles heavy computations off the main thread

export type WorkerMessage = {
  type: "PROCESS_ENTRIES" | "CALCULATE_STATS"
  payload: any
}

export type WorkerResponse = {
  type: string
  payload: any
}

// Process entries in chunks
export function processEntries(entries: any[]) {
  // Process entries in chunks to avoid blocking
  const processedEntries = entries.map((entry: any) => ({
    ...entry,
    id: entry.id || crypto.randomUUID(),
    date: entry.date,
    production: Number(entry.production),
  }))

  // Build an optimized map for faster lookups
  const entriesMap = new Map()
  processedEntries.forEach((entry: any) => {
    entriesMap.set(entry.date, entry)
  })

  return {
    entries: processedEntries,
    entriesMap: Array.from(entriesMap.entries()),
  }
}

// Calculate weekly stats
export function calculateStats(entries: any[]) {
  // Calculate total
  const total = entries.reduce((sum, entry) => sum + entry.production, 0)

  // Calculate days with production
  const daysWithProduction = entries.filter((entry) => entry.production > 0).length

  // Calculate average
  const dailyAverage = daysWithProduction > 0 ? total / daysWithProduction : 0

  // Find max production
  let maxProduction = 0
  let maxProductionDay = null

  for (const entry of entries) {
    if (entry.production > maxProduction) {
      maxProduction = entry.production
      maxProductionDay = entry
    }
  }

  return {
    weeklyTotal: total,
    dailyAverage,
    maxProduction,
    maxProductionDay,
  }
}

// Process chart data
export function processChartData(entries: any[]) {
  if (!entries || entries.length === 0) return { maxValue: 0, processedEntries: [] }

  // Find max value
  const maxValue = Math.max(...entries.map((e: any) => e.production)) || 10

  // Pre-process entries for chart rendering
  const processedEntries = entries.map((entry: any) => {
    const date = new Date(entry.date)
    return {
      ...entry,
      dayOfMonth: date.getDate(),
      dayOfWeek: date.getDay(),
      month: date.getMonth(),
      formattedDate: `${date.getMonth() + 1}/${date.getDate()}`,
    }
  })

  return {
    maxValue,
    processedEntries,
  }
}

