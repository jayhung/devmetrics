"use client";

import { useRef, useEffect } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";

interface SyncLog {
  type: "start" | "repo_start" | "progress" | "repo_done" | "complete" | "error";
  message: string;
  timestamp: Date;
}

interface SyncConsoleProps {
  logs: SyncLog[];
  isOpen: boolean;
  onClose: () => void;
}

export function SyncConsole({ logs, isOpen, onClose }: SyncConsoleProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold">Sync Progress</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div
          ref={scrollRef}
          className="flex-1 overflow-auto p-4 bg-zinc-950 font-mono text-sm"
        >
          {logs.length === 0 ? (
            <p className="text-zinc-500">Waiting for sync to start...</p>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={`py-0.5 ${
                  log.type === "error"
                    ? "text-red-400"
                    : log.type === "complete"
                    ? "text-green-400"
                    : log.type === "repo_start"
                    ? "text-blue-400"
                    : log.type === "repo_done"
                    ? "text-cyan-400"
                    : "text-zinc-300"
                }`}
              >
                <span className="text-zinc-600 mr-2">
                  {log.timestamp.toLocaleTimeString()}
                </span>
                {log.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
