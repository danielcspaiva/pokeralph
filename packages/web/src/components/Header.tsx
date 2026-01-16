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
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 lg:px-6">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            aria-label={sidebarOpen ? "Close menu" : "Open menu"}
            className="lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-semibold">{projectName}</h1>
        </div>

        <div className="flex items-center gap-3">
          <RepoSelector />

          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2 py-1 text-xs",
                  isConnected
                    ? "bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]"
                    : "bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]"
                )}
              >
                {isConnected ? (
                  <Wifi className="h-3 w-3" />
                ) : (
                  <WifiOff className="h-3 w-3" />
                )}
                <span className="hidden sm:inline">
                  {isConnected ? "Connected" : "Offline"}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isConnected ? "Connected to server" : "Disconnected from server"}
            </TooltipContent>
          </Tooltip>

          <Badge
            variant={mode === "hitl" ? "secondary" : "warning"}
            className="text-xs"
          >
            {mode === "hitl" ? "HITL" : "YOLO"}
          </Badge>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
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
