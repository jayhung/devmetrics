"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange, DayPicker } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@radix-ui/react-popover";

interface DateRangePickerProps {
  dateRange: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
}

export function DateRangePicker({
  dateRange,
  onChange,
  className,
}: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal min-w-[240px]",
            !dateRange && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {dateRange?.from ? (
            dateRange.to ? (
              <>
                {format(dateRange.from, "MMM d, yyyy")} -{" "}
                {format(dateRange.to, "MMM d, yyyy")}
              </>
            ) : (
              format(dateRange.from, "MMM d, yyyy")
            )
          ) : (
            "All time"
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0 bg-popover border rounded-md shadow-md z-50"
        align="start"
      >
        <div className="flex">
          <div className="border-r p-2 flex flex-col gap-1">
            {[
              { label: "Last 7 days", days: 7 },
              { label: "Last 30 days", days: 30 },
              { label: "Last 90 days", days: 90 },
              { label: "Last 6 months", months: 6 },
              { label: "Last 12 months", months: 12 },
              { label: "All time", clear: true },
            ].map((preset) => (
              <button
                key={preset.label}
                className="text-left text-sm px-3 py-1.5 rounded hover:bg-accent whitespace-nowrap"
                onClick={() => {
                  if (preset.clear) {
                    onChange(undefined);
                    setOpen(false);
                  } else {
                    const now = new Date();
                    let from: Date;
                    if (preset.days) {
                      from = new Date(now.getTime() - preset.days * 24 * 60 * 60 * 1000);
                    } else if (preset.months) {
                      from = new Date(now);
                      from.setMonth(from.getMonth() - preset.months);
                    } else {
                      from = now;
                    }
                    onChange({ from, to: now });
                  }
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="p-3">
            <DayPicker
              mode="range"
              defaultMonth={dateRange?.from}
              selected={dateRange}
              onSelect={onChange}
              numberOfMonths={2}
              className="rdp-custom"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
