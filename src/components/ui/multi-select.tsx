"use client";

import * as React from "react";
import { X, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@radix-ui/react-popover";

export interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  options: Option[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Select...",
  className,
}: MultiSelectProps) {
  const [open, setOpen] = React.useState(false);

  const handleSelect = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleRemove = (value: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(selected.filter((v) => v !== value));
  };

  const selectedLabels = selected
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("justify-between min-w-[200px]", className)}
        >
          <span className="truncate">
            {selected.length === 0
              ? placeholder
              : selected.length === options.length
              ? "All repositories"
              : `${selected.length} selected`}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="min-w-[300px] p-0 bg-popover border rounded-md shadow-md z-50"
        align="start"
      >
        <div className="max-h-[300px] overflow-auto p-1">
          {options.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No repositories found
            </div>
          ) : (
            <>
              <button
                className="w-full flex items-center px-2 py-1.5 text-sm text-left rounded hover:bg-accent cursor-pointer"
                onClick={() => {
                  if (selected.length === options.length) {
                    onChange([]);
                  } else {
                    onChange(options.map((o) => o.value));
                  }
                }}
              >
                <div
                  className={cn(
                    "mr-2 h-4 w-4 shrink-0 border rounded flex items-center justify-center",
                    selected.length === options.length
                      ? "bg-primary border-primary"
                      : "border-input"
                  )}
                >
                  {selected.length === options.length && (
                    <Check className="h-3 w-3 text-primary-foreground" />
                  )}
                </div>
                Select All
              </button>
              <div className="h-px bg-border my-1" />
              {options.map((option) => (
                <button
                  key={option.value}
                  className="w-full flex items-center px-2 py-1.5 text-sm text-left rounded hover:bg-accent cursor-pointer whitespace-nowrap"
                  onClick={() => handleSelect(option.value)}
                >
                  <div
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0 border rounded flex items-center justify-center",
                      selected.includes(option.value)
                        ? "bg-primary border-primary"
                        : "border-input"
                    )}
                  >
                    {selected.includes(option.value) && (
                      <Check className="h-3 w-3 text-primary-foreground" />
                    )}
                  </div>
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SelectedChipsProps {
  options: Option[];
  selected: string[];
  onRemove: (value: string) => void;
}

export function SelectedChips({ options, selected, onRemove }: SelectedChipsProps) {
  if (selected.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1">
      {selected.map((value) => {
        const option = options.find((o) => o.value === value);
        if (!option) return null;
        return (
          <span
            key={value}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-secondary text-secondary-foreground rounded-full"
          >
            {option.label}
            <button
              onClick={() => onRemove(value)}
              className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
