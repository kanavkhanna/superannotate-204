"use client"

import { memo, useEffect, useRef, useMemo } from "react"
import { format, parseISO } from "date-fns"

interface SolarEntry {
  date: string
  production: number
}

interface SolarChartProps {
  entries: SolarEntry[]
}

// Pre-defined colors for better performance (no recalculation)
const COLORS = {
  BAR: "#3b82f6", // Blue
  BAR_EMPTY: "#dbeafe", // Light blue
  BAR_BORDER: "#2563eb", // Darker blue
  BAR_EMPTY_BORDER: "#bfdbfe", // Light blue border
  GRID: "#e5e7eb", // Light gray
  TEXT: "#6b7280", // Medium gray
  TOOLTIP_BG: "white",
  TOOLTIP_BORDER: "#e5e7eb",
}

function SolarChart({ entries }: SolarChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Memoize max value calculation - with early return for empty data
  const maxValue = useMemo(() => {
    if (!entries.length) return 10
    let max = 0
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].production > max) max = entries[i].production
    }
    return max || 10 // Fallback to 10 if all values are 0
  }, [entries])

  // Pre-process and memoize all data needed for rendering - optimized loop
  const chartData = useMemo(() => {
    const result = new Array(entries.length)
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const date = parseISO(entry.date)
      const production = entry.production
      const isEmpty = production <= 0
      const heightPercentage = isEmpty ? 4 : Math.max(5, (production / maxValue) * 100)

      result[i] = {
        key: entry.date,
        index: i,
        dayOfMonth: format(date, "d"),
        formattedDate: format(date, "EEE, MMM d"),
        production,
        heightPercentage,
        isEmpty,
      }
    }
    return result
  }, [entries, maxValue])

  // Y-axis labels - pre-calculated
  const yAxisLabels = useMemo(
    () => [
      maxValue.toFixed(1),
      (maxValue * 0.75).toFixed(1),
      (maxValue * 0.5).toFixed(1),
      (maxValue * 0.25).toFixed(1),
      "0",
    ],
    [maxValue],
  )

  // Optimize tooltip handling with a single event handler and cached tooltip template
  useEffect(() => {
    if (!containerRef.current || !tooltipRef.current) return

    const container = containerRef.current
    const tooltip = tooltipRef.current

    // Pre-create tooltip elements for better performance
    const tooltipTitle = document.createElement("div")
    tooltipTitle.style.fontWeight = "500"
    tooltipTitle.style.fontSize = "14px"

    const tooltipContent = document.createElement("div")
    tooltipContent.style.display = "flex"
    tooltipContent.style.alignItems = "center"
    tooltipContent.style.marginTop = "4px"

    const tooltipDot = document.createElement("div")
    tooltipDot.style.width = "12px"
    tooltipDot.style.height = "12px"
    tooltipDot.style.borderRadius = "50%"
    tooltipDot.style.backgroundColor = COLORS.BAR
    tooltipDot.style.marginRight = "8px"

    const tooltipValue = document.createElement("div")
    tooltipValue.style.fontWeight = "700"
    tooltipValue.style.fontSize = "16px"

    tooltipContent.appendChild(tooltipDot)
    tooltipContent.appendChild(tooltipValue)

    tooltip.appendChild(tooltipTitle)
    tooltip.appendChild(tooltipContent)

    // Use event delegation with optimized handler
    const handleMouseEvents = (e: MouseEvent) => {
      const target = e.target as HTMLElement

      if (target.classList.contains("chart-bar")) {
        if (e.type === "mouseenter") {
          const index = Number.parseInt(target.dataset.index || "0", 10)
          const entry = chartData[index]

          // Update tooltip content - more efficient than innerHTML
          tooltipTitle.textContent = entry.formattedDate
          tooltipValue.textContent = `${entry.production.toFixed(1)} kWh`

          // Position tooltip
          const barRect = target.getBoundingClientRect()
          const containerRect = container.getBoundingClientRect()

          tooltip.style.left = `${barRect.left - containerRect.left + barRect.width / 2 - tooltip.offsetWidth / 2}px`
          tooltip.style.top = `${barRect.top - containerRect.top - tooltip.offsetHeight - 10}px`
          tooltip.style.opacity = "1"
        } else if (e.type === "mouseleave") {
          tooltip.style.opacity = "0"
        }
      }
    }

    // Add event listeners using event delegation
    container.addEventListener("mouseenter", handleMouseEvents, true)
    container.addEventListener("mouseleave", handleMouseEvents, true)

    return () => {
      container.removeEventListener("mouseenter", handleMouseEvents, true)
      container.removeEventListener("mouseleave", handleMouseEvents, true)

      // Clean up DOM elements
      while (tooltip.firstChild) {
        tooltip.removeChild(tooltip.firstChild)
      }
    }
  }, [chartData])

  // Super simple chart implementation with fixed orientation and blue bars
  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Title */}
      <div
        style={{
          textAlign: "center",
          marginBottom: "16px",
          fontWeight: 500,
          fontSize: "14px",
        }}
      >
        Weekly Production (kWh)
      </div>

      {/* Chart container */}
      <div
        style={{
          display: "flex",
          flexGrow: 1,
          position: "relative",
        }}
      >
        {/* Y-axis labels */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            paddingRight: "8px",
            fontSize: "12px",
            color: COLORS.TEXT,
          }}
        >
          {yAxisLabels.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>

        {/* Chart area */}
        <div
          style={{
            flexGrow: 1,
            position: "relative",
            height: "100%",
          }}
        >
          {/* Grid lines */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              pointerEvents: "none",
            }}
          >
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  borderTop: `1px solid ${COLORS.GRID}`,
                  width: "100%",
                  height: 0,
                }}
              ></div>
            ))}
          </div>

          {/* Bars container */}
          <div
            style={{
              display: "flex",
              width: "100%",
              height: "100%",
              alignItems: "flex-end", // Align items to bottom
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
            }}
          >
            {chartData.map((bar) => (
              <div
                key={bar.key}
                style={{
                  flexGrow: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "flex-end", // Align to bottom
                  height: "100%",
                  paddingBottom: "24px", // Space for labels
                }}
              >
                {/* Bar - now blue */}
                <div
                  className="chart-bar"
                  data-index={bar.index}
                  style={{
                    width: "80%",
                    height: `${bar.heightPercentage}%`,
                    backgroundColor: bar.isEmpty ? COLORS.BAR_EMPTY : COLORS.BAR,
                    borderTopLeftRadius: "3px",
                    borderTopRightRadius: "3px",
                    cursor: "pointer",
                    border: `1px solid ${bar.isEmpty ? COLORS.BAR_EMPTY_BORDER : COLORS.BAR_BORDER}`,
                    boxSizing: "border-box",
                  }}
                ></div>

                {/* Day label - positioned at bottom */}
                <div
                  style={{
                    position: "absolute",
                    bottom: 0,
                    fontSize: "12px",
                    color: COLORS.TEXT,
                    textAlign: "center",
                    width: "100%",
                  }}
                >
                  {bar.dayOfMonth}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tooltip - now using DOM manipulation instead of innerHTML */}
      <div
        ref={tooltipRef}
        style={{
          position: "absolute",
          pointerEvents: "none",
          backgroundColor: COLORS.TOOLTIP_BG,
          padding: "8px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
          borderRadius: "4px",
          border: `1px solid ${COLORS.TOOLTIP_BORDER}`,
          fontSize: "14px",
          zIndex: 10,
          opacity: 0,
          transition: "opacity 0.15s ease",
        }}
      />
    </div>
  )
}

// Use React.memo to prevent unnecessary re-renders
export default memo(SolarChart)

