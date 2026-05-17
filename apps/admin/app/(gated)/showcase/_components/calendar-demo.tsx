"use client"

import { useState, useEffect } from "react"
import { Calendar } from "@workspace/ui/components/calendar"

export function CalendarDemo() {
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    setDate(new Date())
  }, [])

  if (!mounted) return <div className="h-[300px] w-[252px] rounded-lg border" />

  return (
    <Calendar
      mode="single"
      selected={date}
      onSelect={setDate}
      className="rounded-lg border"
    />
  )
}
