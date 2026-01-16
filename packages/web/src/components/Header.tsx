/**
 * Header component for PokéRalph
 *
 * Displays project name, execution mode indicator, and config button.
 */

import { useState } from "react";
import { Menu, Settings, Wifi, WifiOff } from "lucide-react";
import { usePRD, useConfig, useIsConnected } from "@/stores/app-store";
import { ConfigModal } from "./ConfigModal";
import { RepoSelector } from "./RepoSelector";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HeaderProps {
  /** Callback when menu button is clicked */
  onMenuClick: () => void;
  /** Whether sidebar is currently open */
  sidebarOpen: boolean;
}

/**
 * Application header with title, mode indicator, and config
 */
export function Header({ onMenuClick, sidebarOpen }: HeaderProps) {
  const prd = usePRD();
  const config = useConfig();
  const isConnected = useIsConnected();
  const [configOpen, setConfigOpen] = useState(false);

  const mode = config?.mode ?? "hitl";
  const projectName = prd?.name ?? "PokéRalph";

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 shell-plastic border-b-4 border-[hsl(var(--shell-darker))] px-4 lg:px-6 shadow-[0_4px_8px_rgba(0,0,0,0.15)]">
        <div className="flex items-center gap-4">
          <Button
            variant="shell"
            size="icon"
            onClick={onMenuClick}
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold text-[hsl(var(--shell-fg))]">{projectName}</h1>
        </div>

        <div className="flex items-center gap-3">
          <RepoSelector />

          {/* LED-style connection indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-2 px-2 py-1">
                <div
                  className={cn(
                    "w-3 h-3 rounded-full shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]",
                    isConnected
                      ? "bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]"
                      : "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)]"
                  )}
                />
                <span className="hidden sm:inline text-xs text-[hsl(var(--shell-fg))]">
                  {isConnected ? "Online" : "Offline"}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isConnected ? "Connected to server" : "Disconnected from server"}
            </TooltipContent>
          </Tooltip>

          <Badge
            variant={mode === "hitl" ? "secondary" : "warning"}
            className="text-xs rounded-md"
          >
            {mode === "hitl" ? "HITL" : "YOLO"}
          </Badge>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="shell"
                size="icon"
                onClick={() => setConfigOpen(true)}
                aria-label="Settings"
              >
                <Settings className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </header>

      <ConfigModal isOpen={configOpen} onClose={() => setConfigOpen(false)} />
    </>
  );
}
