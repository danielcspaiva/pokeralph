/**
 * RepoSelector component for PokéRalph
 *
 * Allows users to view and change the current working directory/repository.
 * Displays the current path and provides a modal to change it.
 */

import { useState, useEffect } from "react";
import { FolderOpen, Folder, Pencil } from "lucide-react";
import {
  useWorkingDir,
  useHasPokeralphFolder,
  useAppStore,
} from "../stores/app-store";
import { getWorkingDir, setWorkingDir } from "../api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Repository selector component
 */
export function RepoSelector() {
  const currentWorkingDir = useWorkingDir();
  const hasPokeralphFolder = useHasPokeralphFolder();
  const setWorkingDirState = useAppStore((state) => state.setWorkingDir);

  const [isOpen, setIsOpen] = useState(false);
  const [inputPath, setInputPath] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current working directory on mount
  useEffect(() => {
    const fetchWorkingDir = async () => {
      try {
        const response = await getWorkingDir();
        setWorkingDirState(response.workingDir, response.hasPokeralphFolder);
      } catch {
        // Ignore errors on initial fetch
      }
    };
    fetchWorkingDir();
  }, [setWorkingDirState]);

  // Reset input when modal opens
  useEffect(() => {
    if (isOpen) {
      setInputPath(currentWorkingDir ?? "");
      setError(null);
    }
  }, [isOpen, currentWorkingDir]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputPath.trim()) {
      setError("Path is required");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await setWorkingDir(inputPath.trim());
      setWorkingDirState(response.workingDir, true);
      setIsOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change repository"
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Display a shortened path for the button
  const displayPath = currentWorkingDir
    ? currentWorkingDir.split("/").slice(-2).join("/")
    : "No repository";

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="max-w-[200px] gap-2"
            >
              {hasPokeralphFolder ? (
                <FolderOpen className="h-4 w-4 shrink-0" />
              ) : (
                <Folder className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{displayPath}</span>
              <Pencil className="h-3 w-3 shrink-0 opacity-50" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{currentWorkingDir ?? "Select repository"}</TooltipContent>
      </Tooltip>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Select Repository</DialogTitle>
          <DialogDescription>
            Enter the absolute path to your project directory. A .pokeralph
            folder will be created if it doesn't exist.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-[hsl(var(--destructive)/0.1)] p-3 text-sm text-[hsl(var(--destructive))]">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="repoPath">Repository Path</Label>
            <Input
              type="text"
              id="repoPath"
              value={inputPath}
              onChange={(e) => setInputPath(e.target.value)}
              placeholder="/path/to/your/repository"
              disabled={isLoading}
            />
          </div>

          {currentWorkingDir && (
            <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
              <span>Current:</span>
              <code className="rounded bg-[hsl(var(--muted))] px-2 py-1 text-xs">
                {currentWorkingDir}
              </code>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Switching..." : "Switch Repository"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
