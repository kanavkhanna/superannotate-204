"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { useTheme } from "next-themes"
import { toast } from "sonner"
import { Sun, Moon } from "lucide-react"

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Only show the toggle after mounting to avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  const handleThemeChange = useCallback(() => {
    try {
      const newTheme = theme === "dark" ? "light" : "dark"
      setTheme(newTheme)
    } catch (error) {
      toast.error("Failed to change theme")
      console.error("Error changing theme:", error)
    }
  }, [theme, setTheme])

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
      >
        <div className="h-[1.2rem] w-[1.2rem] opacity-0" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleThemeChange}
      className="bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground h-10 w-10"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun className="h-[1.2rem] w-[1.2rem]" /> : <Moon className="h-[1.2rem] w-[1.2rem]" />}
      <span className="sr-only">{theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}</span>
    </Button>
  )
}

