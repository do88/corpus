"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarClock, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { mealTimeInput } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * When a meal was eaten.
 *
 * A button that says the answer — "Now", or "Sat 6 Sep · 19:30" — and opens
 * a calendar with a time beneath it. The native datetime-local field it
 * replaces was honest and ugly: a browser control that looked like nothing
 * else on the screen, in a composer that is otherwise all the app's own.
 *
 * The value is still the `yyyy-MM-ddTHH:mm` string the time helpers parse
 * and test, so the London-time and 04:00 rules are untouched; this only
 * changes how the string gets typed. An empty string means "now", which is
 * what the composer defaults to and what the "Use now" button restores.
 */
export function MealTimeField({
  value,
  onChange,
  disabled,
  allowNow = false,
  className,
}: {
  /** `yyyy-MM-ddTHH:mm` in London time, or "" for now. */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Offer "Use now", which sets the value back to "". */
  allowNow?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? fromInput(value) : null;
  const time = value ? value.slice(11, 16) : "12:00";

  function pick(day: Date | undefined) {
    if (!day) return;
    onChange(`${format(day, "yyyy-MM-dd")}T${time}`);
  }

  function setTime(next: string) {
    if (!/^\d{2}:\d{2}$/.test(next)) return;
    const day = value ? value.slice(0, 10) : mealTimeInput().slice(0, 10);
    onChange(`${day}T${next}`);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            disabled={disabled}
            className={cn("min-h-11 gap-2 px-2 text-muted-foreground", value && "text-foreground", className)}
          />
        }
      >
        {value ? <CalendarClock className="size-4" /> : <Clock3 className="size-4" />}
        {value && selected ? describe(selected, value) : "Now"}
      </PopoverTrigger>

      {/* Taller than the room a phone leaves above or below the composer, so
          it scrolls inside the height the positioner says is available rather
          than losing its title off the top of the screen. */}
      <PopoverContent
        align="start"
        className="max-h-[calc(var(--available-height)-8px)] w-auto overflow-y-auto p-0"
      >
        {/* 40px cells: the stock 28 is a desktop size and this is tapped on a
            phone, while 44 with six weeks showing pushed the time row off the
            bottom of a phone screen. Adjacent cells make the effective target
            larger than the cell anyway. */}
        <Calendar
          mode="single"
          selected={selected ?? undefined}
          defaultMonth={selected ?? new Date()}
          onSelect={pick}
          disabled={{ after: new Date() }}
          weekStartsOn={1}
          className="[--cell-size:--spacing(10)]"
        />

        <div className="flex items-end gap-2 border-t border-[var(--rule)]/60 px-4 pt-3 pb-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="meal-time">Time</Label>
            <Input
              id="meal-time"
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="h-11 tabular-nums"
            />
          </div>
          {allowNow && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Use now
            </Button>
          )}
          <Button type="button" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
        {/* No title: the button that opened this already said what it is. The
            rule that decides which day a meal counts toward is the one thing
            worth a line, and it sits by the time it applies to. */}
        <p className="px-4 pb-3 text-xs text-muted-foreground">
          London time. Before 04:00 counts toward the day before.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** "Today · 12:30", "Yesterday · 19:30", or "Sat 6 Sep · 19:30". */
function describe(date: Date, value: string): string {
  const day = value.slice(0, 10);
  // Calendar dates, not tracking days: at 02:00 the tracking day is still
  // yesterday, but the date on the wall is today, and this label is the date.
  const today = mealTimeInput().slice(0, 10);
  const yesterday = mealTimeInput(new Date(Date.now() - 86_400_000)).slice(0, 10);
  const when = day === today ? "Today" : day === yesterday ? "Yesterday" : format(date, "EEE d MMM");
  return `${when} · ${value.slice(11, 16)}`;
}

/** The wall-clock date in the string, as a local Date for the calendar to select. */
function fromInput(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}
