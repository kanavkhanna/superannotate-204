"use client"

import { format, parseISO } from "date-fns"

interface SolarEntry {
  date: string
  production: number
  id?: string
}

interface DebugEntriesProps {
  entries: SolarEntry[]
}

export function DebugEntries({ entries }: DebugEntriesProps) {
  return (
    <div className="p-4 bg-muted/20 rounded-md">
      <h3 className="text-sm font-medium mb-2">Debug: Weekly Entries</h3>
      <div className="text-xs space-y-1">
        {entries.map((entry) => (
          <div key={entry.date} className="flex justify-between">
            <span>{format(parseISO(entry.date), "EEE, MMM d")}</span>
            <span className="font-mono">{entry.production.toFixed(1)} kWh</span>
          </div>
        ))}
      </div>
    </div>
  )
}

