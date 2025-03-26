"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback, useMemo, startTransition } from "react"
import { format, startOfWeek, addDays, parseISO, isValid } from "date-fns"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Skeleton } from "@/components/ui/skeleton"
import { useMobile } from "@/hooks/use-mobile"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { cn } from "@/lib/utils"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

// Import critical icons directly
import { Sun, Bolt, TrendingUp, CalendarIcon, Save } from "lucide-react"

// Import chart component directly (no lazy loading)
import SolarChart from "@/components/solar-chart"
import WeeklySummary from "@/components/weekly-summary"

// Define the type for our solar production entry
interface SolarEntry {
  date: string
  production: number
  id: string
}

// Local storage key
const STORAGE_KEY = "solarEntries"

// Define the form schema with Zod
const formSchema = z.object({
  production: z.coerce
    .number({
      required_error: "Production value is required",
      invalid_type_error: "Production must be a number",
    })
    .nonnegative("Production value must be positive")
    .max(100, "Production value seems too high (max 100 kWh)"),
})

// Loading placeholder components - simplified for better performance
const ChartPlaceholder = () => (
  <div className="h-full w-full flex items-center justify-center">
    <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
  </div>
)

const WeeklySummaryPlaceholder = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-3 gap-1 sm:gap-4">
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-20 w-full" />
    </div>
  </div>
)

// Optimized localStorage wrapper with error handling and caching
const safeStorage = (() => {
  const cache = new Map()

  return {
    get: (key: string): any => {
      if (typeof window === "undefined") return null

      // Check cache first
      if (cache.has(key)) {
        return cache.get(key)
      }

      try {
        const item = localStorage.getItem(key)
        const parsed = item ? JSON.parse(item) : null

        // Update cache
        cache.set(key, parsed)
        return parsed
      } catch (error) {
        console.error(`Error reading from localStorage: ${key}`, error)
        return null
      }
    },
    set: (key: string, value: any): boolean => {
      if (typeof window === "undefined") return false

      try {
        // Update cache first
        cache.set(key, value)

        // Then update localStorage
        const serialized = JSON.stringify(value)
        localStorage.setItem(key, serialized)
        return true
      } catch (error) {
        console.error(`Error writing to localStorage: ${key}`, error)
        return false
      }
    },
    clear: (key: string): void => {
      cache.delete(key)
    },
  }
})()

// Main component
export default function SolarTracker() {
  // State initialization with lazy initial state
  const [date, setDate] = useState<Date | null>(null) // Start with null to defer initialization
  const [entries, setEntries] = useState<SolarEntry[]>([])
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [saveAnimation, setSaveAnimation] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>("")
  const [isEditingDate, setIsEditingDate] = useState(false)
  const [manualDate, setManualDate] = useState("")
  const [forceUpdate, setForceUpdate] = useState(0)
  const [isInitialized, setIsInitialized] = useState(false)

  // Refs for performance optimization
  const editInputRef = useRef<HTMLInputElement>(null)
  const isMobile = useMobile()
  const entriesRef = useRef<SolarEntry[]>([])
  const weeklyEntriesCache = useRef<{ date: string; entries: SolarEntry[] } | null>(null)
  const saveTimeoutRef = useRef<number | null>(null)
  const entriesMapRef = useRef<Map<string, SolarEntry>>(new Map())
  const rafRef = useRef<number | null>(null)
  const pendingUpdatesRef = useRef<Map<string, number>>(new Map())
  const initialRenderRef = useRef(true)

  // Form initialization - defer until needed
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      production: 0,
    },
  })

  // Initialize date after component mounts to avoid hydration issues
  useEffect(() => {
    // Set date on client-side only
    setDate(new Date())
  }, [])

  // Cleanup timeouts and animation frames on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
    }
  }, [])

  // Load entries from localStorage on component mount - with deferred execution
  useEffect(() => {
    let isMounted = true
    let timeoutId: NodeJS.Timeout | null = null

    // Defer data loading to improve initial render time
    timeoutId = setTimeout(() => {
      const loadEntries = async () => {
        try {
          if (!isMounted) return

          const savedEntries = safeStorage.get(STORAGE_KEY)

          if (savedEntries && isMounted) {
            // Process entries in batches for better performance
            const processEntries = () => {
              if (!isMounted) return

              // Process entries in chunks to avoid blocking the main thread
              const processChunk = (entries: any[], startIndex: number, chunkSize: number) => {
                const endIndex = Math.min(startIndex + chunkSize, entries.length)
                const chunk = entries.slice(startIndex, endIndex)

                // Process this chunk
                const processedChunk = chunk.map((entry: any) => ({
                  ...entry,
                  id: entry.id || crypto.randomUUID(),
                  date: entry.date,
                  production: Number(entry.production),
                }))

                // Update the entries map for this chunk
                processedChunk.forEach((entry: SolarEntry) => {
                  entriesMapRef.current.set(entry.date, entry)
                })

                // If we have more chunks to process, schedule the next one
                if (endIndex < entries.length && isMounted) {
                  setTimeout(() => processChunk(entries, endIndex, chunkSize), 0)
                } else if (isMounted) {
                  // All chunks processed, update state
                  setEntries((prev) => [...prev, ...processedChunk])
                  entriesRef.current = [...entriesRef.current, ...processedChunk]
                  setIsLoading(false)
                  setIsInitialized(true)
                }
              }

              // Start processing in chunks of 50 entries
              processChunk(savedEntries, 0, 50)
            }

            // Use requestIdleCallback or setTimeout to process data off the main thread
            if (typeof window.requestIdleCallback === "function") {
              window.requestIdleCallback(processEntries)
            } else {
              setTimeout(processEntries, 0)
            }
          } else if (isMounted) {
            setIsLoading(false)
            setIsInitialized(true)
          }
        } catch (error) {
          console.error("Error loading data from localStorage:", error)
          if (isMounted) {
            toast.error("Failed to load saved data", {
              description: "Your previous entries couldn't be loaded",
            })
            setIsLoading(false)
            setIsInitialized(true)
          }
        }
      }

      loadEntries()
    }, 100) // Short delay to prioritize UI rendering

    return () => {
      isMounted = false
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [])

  // Save entries to localStorage with debounce
  useEffect(() => {
    if (isLoading || !isInitialized || initialRenderRef.current) {
      initialRenderRef.current = false
      return
    }

    entriesRef.current = entries

    // Update the entries map
    const entriesMap = new Map()
    entries.forEach((entry) => {
      entriesMap.set(entry.date, entry)
    })
    entriesMapRef.current = entriesMap

    // Clear any existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }

    // Set new timeout
    saveTimeoutRef.current = window.setTimeout(() => {
      try {
        // Use a more efficient serialization approach
        const dataToSave = entries.map((entry) => ({
          id: entry.id,
          date: entry.date,
          production: entry.production,
        }))

        safeStorage.set(STORAGE_KEY, dataToSave)
      } catch (error) {
        console.error("Error saving data to localStorage:", error)
      }

      saveTimeoutRef.current = null
    }, 500)

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [entries, isLoading, isInitialized])

  // Update form when date changes - with performance optimization
  useEffect(() => {
    if (!date) return

    const formattedDate = format(date, "yyyy-MM-dd")
    const existingEntry = entriesMapRef.current.get(formattedDate)

    // Use startTransition to avoid blocking the UI
    startTransition(() => {
      form.setValue("production", existingEntry ? existingEntry.production : 0)
    })
  }, [date, form])

  // Focus the edit input when it appears
  useEffect(() => {
    if (editingDay && editInputRef.current) {
      // Use requestAnimationFrame for smoother focus
      const focusInput = () => {
        if (editInputRef.current) {
          editInputRef.current.focus()

          // Select all text for easier editing
          editInputRef.current.select()
        }
      }

      // Schedule focus to happen after render
      rafRef.current = requestAnimationFrame(focusInput)

      return () => {
        if (rafRef.current) {
          cancelAnimationFrame(rafRef.current)
          rafRef.current = null
        }
      }
    }
  }, [editingDay])

  // Add click outside listener to cancel editing
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (editInputRef.current && !editInputRef.current.contains(event.target as Node)) {
        setEditingDay(null)
      }

      // Also handle date input click outside
      const target = event.target as HTMLElement
      if (isEditingDate && !target.closest('input[type="date"]')) {
        handleManualDateChange()
      }
    }

    // Only add listeners when needed
    if (editingDay || isEditingDate) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => {
        document.removeEventListener("mousedown", handleClickOutside)
      }
    }
    return undefined
  }, [isEditingDate, editingDay])

  // Current date to prevent future dates - memoized
  const today = useMemo(() => new Date(), [])

  // Handle date change from calendar
  const handleDateChange = useCallback(
    (newDate: Date | undefined) => {
      if (!newDate || !isValid(newDate)) {
        toast.error("Invalid date selected")
        return
      }

      // Prevent selecting future dates
      if (newDate > today) {
        toast.error("Future date selected", {
          description: "You cannot log production for future dates",
        })
        return
      }

      setDate(newDate)
      setCalendarOpen(false)

      // Check if there's already an entry for this date
      const formattedDate = format(newDate, "yyyy-MM-dd")
      const existingEntry = entriesMapRef.current.get(formattedDate)

      // Use startTransition to avoid blocking the UI
      startTransition(() => {
        if (existingEntry) {
          form.setValue("production", existingEntry.production)
          toast.info("Existing entry found")
        } else {
          form.setValue("production", 0)
        }
      })
    },
    [form, today],
  )

  // Optimized function to update entries state
  const updateEntriesState = useCallback((updatedEntries: SolarEntry[]) => {
    // Update state with the new entries
    setEntries(updatedEntries)

    // Update refs for faster access
    entriesRef.current = updatedEntries

    // Rebuild the entries map for O(1) lookups
    const entriesMap = new Map()
    updatedEntries.forEach((entry) => {
      entriesMap.set(entry.date, entry)
    })
    entriesMapRef.current = entriesMap

    // Invalidate weekly entries cache
    weeklyEntriesCache.current = null

    // Force a re-render of components that depend on the entries
    setForceUpdate((prev) => prev + 1)
  }, [])

  // Handle form submission
  const onSubmit = useCallback(
    async (values: z.infer<typeof formSchema>) => {
      if (!date) {
        toast.error("No date selected")
        return
      }

      // Prevent saving data for future dates
      if (date > today) {
        toast.error("Future date selected", {
          description: "You cannot log production for future dates",
        })
        return
      }

      setIsLoading(true)

      try {
        const formattedDate = format(date, "yyyy-MM-dd")
        const productionValue = values.production || 0

        // Check if an entry for this date already exists
        const existingEntry = entriesMapRef.current.get(formattedDate)
        let updatedEntries: SolarEntry[]

        if (existingEntry) {
          // Update existing entry - use functional update for better performance
          updatedEntries = entries.map((entry) =>
            entry.date === formattedDate ? { ...entry, production: productionValue } : entry,
          )
        } else {
          // Add new entry
          const newEntry = {
            date: formattedDate,
            production: productionValue,
            id: crypto.randomUUID(),
          }
          updatedEntries = [...entries, newEntry]
        }

        // Update the entries state with the optimized function
        updateEntriesState(updatedEntries)

        // Clear storage cache to ensure fresh data on next load
        safeStorage.clear(STORAGE_KEY)

        // Show success message
        toast.success(existingEntry ? "Entry updated" : "Entry saved")

        // Show save animation
        setSaveAnimation(true)
        setTimeout(() => setSaveAnimation(false), 1000)
      } catch (error) {
        toast.error("Failed to save entry")
        console.error("Error saving entry:", error)
      } finally {
        setIsLoading(false)
      }
    },
    [date, today, entries, updateEntriesState],
  )

  // Optimized function to update a single entry with better performance
  const updateEntry = useCallback(
    (date: string, production: number) => {
      try {
        // Validate the input
        if (production < 0) {
          toast.error("Invalid value", {
            description: "Please enter a positive number",
          })
          return
        }

        if (production > 100) {
          toast.error("Value too high", {
            description: "Production value seems too high (max 100 kWh)",
          })
          return
        }

        // Store the pending update in the ref to avoid race conditions
        pendingUpdatesRef.current.set(date, production)

        // Use functional state update for better performance
        setEntries((prevEntries) => {
          // Check if an entry for this date already exists
          const existingEntryIndex = prevEntries.findIndex((entry) => entry.date === date)

          let updatedEntries: SolarEntry[]

          if (existingEntryIndex >= 0) {
            // Update existing entry - create a new array with the updated entry
            updatedEntries = [...prevEntries]
            updatedEntries[existingEntryIndex] = {
              ...updatedEntries[existingEntryIndex],
              production,
            }
          } else {
            // Add new entry
            const newEntry = {
              date,
              production,
              id: crypto.randomUUID(),
            }
            updatedEntries = [...prevEntries, newEntry]
          }

          // Update the entries map immediately for faster access
          const entriesMap = new Map(entriesMapRef.current)
          if (existingEntryIndex >= 0) {
            entriesMap.set(date, updatedEntries[existingEntryIndex])
          } else {
            entriesMap.set(date, updatedEntries[updatedEntries.length - 1])
          }
          entriesMapRef.current = entriesMap

          // Update the entries ref
          entriesRef.current = updatedEntries

          return updatedEntries
        })

        // Invalidate weekly entries cache
        weeklyEntriesCache.current = null

        // Clear storage cache to ensure fresh data on next load
        safeStorage.clear(STORAGE_KEY)

        // Force a re-render of components that depend on the entries
        setForceUpdate((prev) => prev + 1)

        // Update form if this is the currently selected date
        if (date && format(date, "yyyy-MM-dd") === date) {
          form.setValue("production", production)
        }

        // Show success message with debounce to avoid too many toasts
        toast.success("Entry updated", { id: `update-${date}` })

        // Show save animation
        setSaveAnimation(true)
        setTimeout(() => setSaveAnimation(false), 1000)

        // Remove from pending updates
        pendingUpdatesRef.current.delete(date)
      } catch (error) {
        toast.error("Failed to update entry")
        console.error("Error updating entry:", error)

        // Remove from pending updates
        pendingUpdatesRef.current.delete(date)
      }
    },
    [form],
  )

  // Get entries for the current week - optimized with memoization
  const getCurrentWeekEntries = useCallback(() => {
    if (!date) return []

    try {
      const weekStart = startOfWeek(date)
      const weekStartStr = format(weekStart, "yyyy-MM-dd")

      // Check if we have a cached result for this week
      if (weeklyEntriesCache.current && weeklyEntriesCache.current.date === weekStartStr) {
        return weeklyEntriesCache.current.entries
      }

      // Create a pre-sized array for better performance
      const weekEntries = new Array(7)
      const entriesMap = entriesMapRef.current
      const pendingUpdates = pendingUpdatesRef.current

      // Use a single loop with direct array assignment
      for (let i = 0; i < 7; i++) {
        const day = addDays(weekStart, i)
        const weekDate = format(day, "yyyy-MM-dd")

        // Check if there's a pending update for this date
        if (pendingUpdates.has(weekDate)) {
          const pendingProduction = pendingUpdates.get(weekDate)
          const entry = entriesMap.get(weekDate)

          weekEntries[i] = {
            date: weekDate,
            production: pendingProduction !== undefined ? pendingProduction : 0,
            id: entry?.id || crypto.randomUUID(),
          }
          continue
        }

        // Otherwise use the stored entry
        const entry = entriesMap.get(weekDate)
        weekEntries[i] = {
          date: weekDate,
          production: entry ? entry.production : 0,
          id: entry?.id || crypto.randomUUID(),
        }
      }

      // Cache the result
      weeklyEntriesCache.current = {
        date: weekStartStr,
        entries: weekEntries,
      }

      return weekEntries
    } catch (error) {
      console.error("Error in getCurrentWeekEntries:", error)
      return []
    }
  }, [date, forceUpdate])

  // Weekly entries - memoized
  const weeklyEntries = useMemo(() => getCurrentWeekEntries(), [getCurrentWeekEntries])

  // Calculate weekly stats - optimized with single pass calculation
  const weeklyStats = useMemo(() => {
    try {
      if (!weeklyEntries || weeklyEntries.length === 0) {
        return { weeklyTotal: 0, dailyAverage: 0, maxProduction: 0 }
      }

      // Use reduce once to calculate multiple values in a single pass
      const { total, daysWithProduction, maxProduction, maxProductionDay } = weeklyEntries.reduce(
        (acc, entry) => {
          const production = entry.production

          // Update total
          acc.total += production

          // Update days with production
          if (production > 0) {
            acc.daysWithProduction++
          }

          // Update max production
          if (production > acc.maxProduction) {
            acc.maxProduction = production
            acc.maxProductionDay = entry
          }

          return acc
        },
        {
          total: 0,
          daysWithProduction: 0,
          maxProduction: 0,
          maxProductionDay: undefined as SolarEntry | undefined,
        },
      )

      // Calculate average
      const dailyAverage = daysWithProduction > 0 ? total / daysWithProduction : 0

      return {
        weeklyTotal: total,
        dailyAverage,
        maxProduction,
        maxProductionDay,
      }
    } catch (error) {
      console.error("Error calculating weekly stats:", error)
      return { weeklyTotal: 0, dailyAverage: 0, maxProduction: 0 }
    }
  }, [weeklyEntries])

  // Handle editing a day
  const handleEditDay = useCallback(
    (entry: SolarEntry) => {
      // Don't allow editing future dates
      const entryDate = new Date(entry.date)
      if (entryDate > today) {
        toast.error("Cannot edit future dates")
        return
      }

      // Set the selected date to the day being edited
      setDate(entryDate)

      // Update the form value to match the entry
      startTransition(() => {
        form.setValue("production", entry.production)
      })

      // Set editing state immediately
      setEditingDay(entry.date)
      setEditValue(entry.production > 0 ? entry.production.toString() : "")
    },
    [today, form],
  )

  // Optimized handler for edit input changes
  const handleEditInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Immediately update the edit value for better responsiveness
    setEditValue(e.target.value)

    // Validate input as the user types
    const value = e.target.value === "" ? 0 : Number.parseFloat(e.target.value)
    if (!isNaN(value) && value >= 0 && value <= 100) {
      // If valid, update the visual feedback
      e.target.classList.remove("border-red-500")
      e.target.classList.add("border-green-500")
    } else {
      // If invalid, show visual feedback
      e.target.classList.remove("border-green-500")
      e.target.classList.add("border-red-500")
    }
  }, [])

  // Handle key press in edit mode
  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, entry: SolarEntry) => {
      if (e.key === "Enter") {
        e.preventDefault() // Prevent form submission
        const value = editValue === "" ? 0 : Number.parseFloat(editValue)
        if (isNaN(value)) {
          toast.error("Invalid value")
          return
        }
        updateEntry(entry.date, value)
        setEditingDay(null)
      } else if (e.key === "Escape") {
        e.preventDefault() // Prevent default behavior
        setEditingDay(null)
      }
    },
    [editValue, updateEntry],
  )

  // Handle blur in edit mode
  const handleEditBlur = useCallback(
    (entry: SolarEntry) => {
      // Only process if we're still editing this day
      if (editingDay !== entry.date) return

      const value = editValue === "" ? 0 : Number.parseFloat(editValue)
      if (isNaN(value)) {
        toast.error("Invalid value")
        return
      }
      updateEntry(entry.date, value)
      setEditingDay(null)
    },
    [editValue, updateEntry, editingDay],
  )

  // Handle manual date change
  const handleManualDateChange = useCallback(() => {
    setIsEditingDate(false)

    if (!manualDate) return

    try {
      const selectedDate = new Date(manualDate)

      // Check if date is valid
      if (!isValid(selectedDate)) {
        toast.error("Invalid date")
        return
      }

      // Check if date is in the future
      if (selectedDate > today) {
        toast.error("Future date selected")
        return
      }

      // Set the date
      setDate(selectedDate)

      // Check if there's already an entry for this date
      const formattedDate = format(selectedDate, "yyyy-MM-dd")
      const existingEntry = entriesMapRef.current.get(formattedDate)

      startTransition(() => {
        if (existingEntry) {
          form.setValue("production", existingEntry.production)
          toast.info("Existing entry found")
        } else {
          form.setValue("production", 0)
        }
      })
    } catch (error) {
      toast.error("Invalid date format")
      console.error("Error parsing manual date:", error)
    }
  }, [manualDate, today, form])

  // Maximum production value for day cards - memoized
  const maxProductionValue = useMemo(() => {
    return Math.max(...weeklyEntries.map((e) => e.production))
  }, [weeklyEntries])

  // Render day cards - optimized with memoization
  const dayCards = useMemo(() => {
    return weeklyEntries.map((entry) => {
      const entryDate = new Date(entry.date)
      const isFutureDate = entryDate > today
      const intensity = maxProductionValue > 0 ? entry.production / maxProductionValue : 0
      const dayLetter = format(parseISO(entry.date), "EEEEE").charAt(0)

      return (
        <Card
          key={`${entry.date}-${entry.production}-${forceUpdate}`}
          className={cn(
            "overflow-hidden border-border/40 transition-all duration-200",
            !isFutureDate && "hover:shadow-md cursor-pointer",
            entry.production > 0 && "hover:border-primary/50",
            isFutureDate && "opacity-70",
            "touch-manipulation min-w-[60px] w-[60px] md:w-auto", // Fixed width for mobile scrolling
          )}
          onClick={() => !editingDay && !isFutureDate && handleEditDay(entry)}
          role="button"
          tabIndex={isFutureDate ? -1 : 0}
          aria-label={`${format(parseISO(entry.date), "EEEE, MMMM d")}${
            entry.production > 0 ? `, ${entry.production} kilowatt hours` : ", no data"
          }${isFutureDate ? ", future date" : ""}`}
          onKeyDown={(e) => {
            if (!isFutureDate && (e.key === "Enter" || e.key === " ")) {
              handleEditDay(entry)
            }
          }}
        >
          <div className="bg-muted/50 px-1 sm:px-3 py-1 sm:py-2 text-center border-b border-border/30 flex justify-center items-center">
            <p className="text-[10px] sm:text-xs font-medium">{dayLetter}</p>
          </div>
          <div
            className={cn(
              "p-1 sm:p-3 text-center",
              entry.production > 0 ? "bg-primary/5" : "bg-background",
              isFutureDate && "bg-muted/20",
            )}
          >
            {editingDay === entry.date ? (
              <div className="flex flex-col items-center h-[42px]" onClick={(e) => e.stopPropagation()}>
                <Input
                  ref={editInputRef}
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={editValue}
                  onChange={handleEditInputChange}
                  onKeyDown={(e) => handleEditKeyDown(e, entry)}
                  onBlur={() => handleEditBlur(entry)}
                  className="w-full text-center text-sm h-8 px-1 transition-colors duration-200"
                  style={{ fontSize: isMobile ? "16px" : undefined }} // Prevent zoom on iOS
                  autoFocus
                  aria-label={`Edit production for ${format(parseISO(entry.date), "MMMM d")}`}
                />
                <span className="text-[10px] text-muted-foreground mt-1">kWh</span>
              </div>
            ) : (
              <div className="h-[42px] flex flex-col justify-center">
                <div
                  className={cn(
                    "text-sm font-bold truncate",
                    entry.production > 0 ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {isFutureDate ? (
                    <span className="text-muted-foreground text-xs">Future</span>
                  ) : entry.production > 0 ? (
                    entry.production.toFixed(1)
                  ) : (
                    "-"
                  )}
                </div>
                {entry.production > 0 && <div className="text-[10px] text-muted-foreground">kWh</div>}

                {/* Visual indicator of production level */}
                {entry.production > 0 && (
                  <div className="mt-2 w-full bg-muted rounded-full h-1" aria-hidden="true">
                    <div
                      className="bg-primary h-1 rounded-full"
                      style={{ width: `${Math.max(5, intensity * 100)}%` }}
                    ></div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )
    })
  }, [
    weeklyEntries,
    today,
    maxProductionValue,
    editingDay,
    editValue,
    forceUpdate,
    handleEditDay,
    handleEditKeyDown,
    handleEditBlur,
    handleEditInputChange,
    isMobile,
  ])

  // Extract weekly stats for better readability
  const { weeklyTotal, dailyAverage, maxProduction, maxProductionDay } = weeklyStats

  // Don't render anything until date is initialized
  if (!date) {
    return (
      <div className="w-full h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <Card className="w-full max-w-5xl overflow-hidden border-0 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] rounded-xl">
      <CardContent className="p-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/90 to-primary p-4 flex items-center justify-between">
          <div className="flex items-center">
            <div className="bg-primary-foreground/10 backdrop-blur-sm p-2 rounded-full">
              <Sun className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
            </div>
            <h1 className="text-xl font-bold text-primary-foreground ml-3">Solar Energy Tracker</h1>
          </div>
          {/* Theme toggle removed */}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 h-full">
          {/* Left Panel - Input */}
          <div className="bg-background p-4 sm:p-6 lg:border-r border-border/40">
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-medium flex items-center gap-2 mb-4">
                  <Bolt className="h-5 w-5 text-primary" aria-hidden="true" />
                  <span>Log Production</span>
                </h2>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="date" className="text-sm font-medium">
                        Selected Date
                      </Label>

                      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                        <PopoverTrigger asChild>
                          <div
                            className="relative flex items-center h-12 px-3 rounded-md border border-input bg-background text-sm cursor-pointer hover:border-primary/50 transition-colors"
                            onClick={() => setCalendarOpen(true)}
                            role="button"
                            tabIndex={0}
                            aria-label="Select date"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                setCalendarOpen(true)
                              }
                            }}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className={isMobile ? "text-sm" : ""}>
                                {date ? format(date, isMobile ? "MMM d, yyyy" : "EEEE, MMMM d, yyyy") : "Select a date"}
                              </span>
                              <CalendarIcon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            </div>
                          </div>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="end">
                          <Calendar
                            mode="single"
                            selected={date}
                            onSelect={handleDateChange}
                            initialFocus
                            disabled={(date) => date > today}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <FormField
                      control={form.control}
                      name="production"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Energy Production</FormLabel>
                          <div className="flex space-x-2 items-center">
                            <div className="relative flex-1">
                              <FormControl>
                                <Input
                                  placeholder="0.00"
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  className="pr-12 h-12 text-base"
                                  style={{ fontSize: isMobile ? "16px" : undefined }} // Prevent zoom on iOS
                                  {...field}
                                  value={field.value === 0 ? "" : field.value} // Display empty string when value is 0
                                  onChange={(e) => {
                                    const value = e.target.value
                                    field.onChange(value === "" ? 0 : Number.parseFloat(value))
                                  }}
                                  aria-label="Enter energy production in kilowatt hours"
                                />
                              </FormControl>
                              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none text-muted-foreground">
                                kWh
                              </div>
                            </div>
                            <Button
                              type="submit"
                              className={cn(
                                "bg-primary hover:bg-primary/90 text-primary-foreground transition-all h-12 px-4 sm:px-3 flex items-center justify-center",
                                saveAnimation && "bg-green-500",
                              )}
                              disabled={isLoading}
                            >
                              {isLoading ? (
                                <div className="flex items-center">
                                  <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin mr-2"></div>
                                  <span className="sr-only sm:not-sr-only">Saving</span>
                                </div>
                              ) : saveAnimation ? (
                                "Saved!"
                              ) : (
                                <>
                                  <Save className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                                  <span className="sr-only sm:not-sr-only">Save</span>
                                </>
                              )}
                            </Button>
                          </div>
                          <FormMessage />
                          <FormDescription>Enter the amount of solar energy produced on this day.</FormDescription>
                        </FormItem>
                      )}
                    />
                  </form>
                </Form>
              </div>

              <Separator className="my-6" />

              {/* Weekly Stats */}
              <div>
                <h2 className="text-lg font-medium flex items-center gap-2 mb-4">
                  <TrendingUp className="h-5 w-5 text-primary" aria-hidden="true" />
                  <span>Weekly Summary</span>
                </h2>

                <Badge variant="outline" className="mb-4 font-normal">
                  {date ? format(startOfWeek(date), "MMM d") : ""}
                  {" - "}
                  {date ? format(addDays(startOfWeek(date), 6), "MMM d") : ""}
                </Badge>

                {isLoading ? (
                  <WeeklySummaryPlaceholder />
                ) : (
                  <WeeklySummary
                    entries={weeklyEntries}
                    weeklyTotal={weeklyTotal}
                    dailyAverage={dailyAverage}
                    maxProduction={maxProduction}
                    maxProductionDay={maxProductionDay}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Right Panel - Data & Chart */}
          <div className="col-span-2 bg-background p-4 sm:p-6 lg:p-8">
            <h2 className="text-lg font-medium mb-4 sm:mb-6">Production Overview</h2>

            {/* Daily Breakdown */}
            <div className="mb-6 sm:mb-8">
              <h3 className="text-sm font-medium text-foreground/80 mb-3">Daily Production</h3>

              {isLoading ? (
                <div className="grid grid-cols-7 gap-1 sm:gap-2">
                  {Array(7)
                    .fill(0)
                    .map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                </div>
              ) : (
                <div className="relative overflow-x-auto pb-2 -mx-4 px-4 scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
                  <div className="flex space-x-2 min-w-max md:min-w-0 md:grid md:grid-cols-7 md:gap-1 md:gap-y-2 w-full">
                    {dayCards}
                  </div>
                </div>
              )}
            </div>

            {/* Chart */}
            <div>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-medium text-foreground/80">Weekly Trend</h3>
              </div>

              {isLoading ? (
                <Skeleton className="h-[250px] w-full" />
              ) : weeklyEntries.some((entry) => entry.production > 0) ? (
                <Card className="border-border/40 p-3 sm:p-4 hover:border-primary/30 transition-colors">
                  <div
                    className="h-[200px] sm:h-[250px] w-full"
                    aria-label="Bar chart showing weekly solar production trend"
                  >
                    <SolarChart entries={weeklyEntries} />
                  </div>
                </Card>
              ) : (
                <div className="text-center py-8 border border-dashed rounded-lg bg-muted/20">
                  <p className="text-muted-foreground">No chart data available</p>
                  <p className="text-sm text-muted-foreground mt-1">Add production data to see the weekly trend</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

