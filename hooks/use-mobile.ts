"use client"

import { useState, useEffect, useMemo } from "react"

export const useMobile = () => {
  // Initialize with server-safe value
  const [windowWidth, setWindowWidth] = useState(0)

  useEffect(() => {
    // Set initial value only on client
    if (typeof window === "undefined") return

    // Set initial value immediately
    setWindowWidth(window.innerWidth)

    // Use a more efficient resize handler with RAF
    let rafId: number | null = null
    let lastWidth = window.innerWidth

    const handleResize = () => {
      // Skip if RAF is already scheduled
      if (rafId !== null) return

      // Use requestAnimationFrame for smoother updates
      rafId = requestAnimationFrame(() => {
        // Only update if width actually changed by at least 10px
        const currentWidth = window.innerWidth
        if (Math.abs(currentWidth - lastWidth) >= 10) {
          setWindowWidth(currentWidth)
          lastWidth = currentWidth
        }
        rafId = null
      })
    }

    // Add event listener with passive option for better performance
    window.addEventListener("resize", handleResize, { passive: true })

    // Remove event listener on cleanup
    return () => {
      window.removeEventListener("resize", handleResize)
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
    }
  }, [])

  // Memoize the result to prevent unnecessary re-renders
  // Use a threshold approach to reduce state changes
  return useMemo(() => windowWidth < 768, [windowWidth])
}

