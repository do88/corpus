"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mealTimeInput } from "@/lib/time";

export function MealTimeField({ value, onChange, disabled }: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>When did you eat?</Label>
      <Input id={id} type="datetime-local" value={value} max={mealTimeInput()}
        disabled={disabled} onChange={(event) => onChange(event.target.value)}
        onInput={(event) => onChange(event.currentTarget.value)}
        aria-describedby={`${id}-help`} className="min-w-0 max-w-full" />
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        London time. Before 04:00 counts towards the previous day.
      </p>
    </div>
  );
}
