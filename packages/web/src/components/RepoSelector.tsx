/**
 * RepoSelector component for PokéRalph
 *
 * Allows users to view and change the current working directory/repository.
 * Per spec: 08-repositories.md
 * - Shows recent repositories
 * - Validates path before selection
 * - Displays validation status
 */

import { useState, useEffect, useCallback } from "react";
import {
  FolderOpen,
  Folder,
  Pencil,
  Check,
  X,
  AlertTriangle,
  Clock,
  Loader2,
  Trash2,
} from "lucide-react";
import {
  useWorkingDir,
  useHasPokeralphFolder,
  useAppStore,
} from "../stores/app-store";
import {
  getCurrentRepo,
  selectRepo,
  validateRepo,
  getRecentRepos,
  removeRecentRepo,
  type RecentRepo,
  type ValidateRepoResponse,
} from "../api/client";
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
 * Format relative time for recent repos
 */
function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
  return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
}

/**
 * Validation indicator component
 */
function ValidationIndicator({
  validation,
  isValidating,
}: {
  validation: ValidateRepoResponse | null;
  isValidating: boolean;
}) {
  if (isValidating) {
    return (
      <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Validating...</span>
      </div>
    );
  }

  if (!validation) return null;

  return (
    <div className="rounded-md border p-3 space-y-2 text-sm">
      <div className="font-medium">Validation:</div>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {validation.exists ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <X className="h-4 w-4 text-red-500" />
          )}
          <span>Directory exists</span>
        </div>
        <div className="flex items-center gap-2">
          {validation.isGitRepo ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <X className="h-4 w-4 text-red-500" />
          )}
          <span>Is a git repository</span>
        </div>
        <div className="flex items-center gap-2">
          {validation.hasPokeralph ? (
            <Check className="h-4 w-4 text-green-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          )}
          <span>
            {validation.hasPokeralph
              ? ".pokeralph/ folder exists"
              : "No .pokeralph/ folder (will be created)"}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Recent repository item component
 */
function RecentRepoItem({
  repo,
  onSelect,
  onRemove,
  isSelecting,
}: {
  repo: RecentRepo;
  onSelect: (path: string) => void;
  onRemove: (path: string) => void;
  isSelecting: boolean;
}) {
  const [isRemoving, setIsRemoving] = useState(false);

  const handleRemove = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRemoving(true);
    try {
      await removeRecentRepo(repo.path);
      onRemove(repo.path);
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <div className="group flex items-center justify-between rounded-md border p-3 hover:bg-[hsl(var(--accent))]">
      <div className="flex items-center gap-3 overflow-hidden">
        <Folder className="h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" />
        <div className="overflow-hidden">
          <div className="font-medium truncate">{repo.name}</div>
          <div className="text-xs text-[hsl(var(--muted-foreground))] truncate">
            {repo.path}
          </div>
          <div className="flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] mt-1">
            <Clock className="h-3 w-3" />
            <span>{formatRelativeTime(repo.lastUsed)}</span>
            <span>|</span>
            <span>{repo.taskCount} task{repo.taskCount !== 1 ? "s" : ""}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="opacity-0 group-hover:opacity-100 h-8 w-8 p-0"
          onClick={handleRemove}
          disabled={isRemoving}
        >
          {isRemoving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
        <Button
          size="sm"
          onClick={() => onSelect(repo.path)}
          disabled={isSelecting}
        >
          {isSelecting ? "..." : "Select"}
        </Button>
      </div>
    </div>
  );
}

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

  // Recent repos state
  const [recentRepos, setRecentRepos] = useState<RecentRepo[]>([]);
  const [isLoadingRecent, setIsLoadingRecent] = useState(false);

  // Validation state
  const [validation, setValidation] = useState<ValidateRepoResponse | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Fetch current working directory on mount
  useEffect(() => {
    const fetchCurrentRepo = async () => {
      try {
        const response = await getCurrentRepo();
        if (response.workingDir) {
          setWorkingDirState(response.workingDir, response.initialized);
        }
      } catch {
        // Ignore errors on initial fetch
      }
    };
    fetchCurrentRepo();
  }, [setWorkingDirState]);

  // Fetch recent repos when modal opens
  useEffect(() => {
    if (isOpen) {
      const fetchRecent = async () => {
        setIsLoadingRecent(true);
        try {
          const response = await getRecentRepos();
          setRecentRepos(response.repos);
        } catch {
          // Ignore errors
        } finally {
          setIsLoadingRecent(false);
        }
      };
      fetchRecent();
      setInputPath("");
      setError(null);
      setValidation(null);
    }
  }, [isOpen]);

  // Validate path with debounce
  const validatePath = useCallback(async (path: string) => {
    if (!path.trim()) {
      setValidation(null);
      return;
    }

    setIsValidating(true);
    try {
      const result = await validateRepo(path.trim());
      setValidation(result);
    } catch {
      setValidation(null);
    } finally {
      setIsValidating(false);
    }
  }, []);

  // Debounced validation on input change
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (inputPath) {
        validatePath(inputPath);
      }
    }, 500);
    return () => clearTimeout(timeout);
  }, [inputPath, validatePath]);

  const handleSelectRepo = async (path: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await selectRepo(path);
      setWorkingDirState(response.workingDir, response.initialized);
      setIsOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change repository"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputPath.trim()) {
      setError("Path is required");
      return;
    }

    // Check validation before submitting
    if (validation && !validation.valid) {
      setError(validation.errors.join(". "));
      return;
    }

    await handleSelectRepo(inputPath.trim());
  };

  const handleRemoveRecent = (path: string) => {
    setRecentRepos((prev) => prev.filter((r) => r.path !== path));
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
              className="max-w-[200px] gap-2 sm:max-w-[200px]"
            >
              {hasPokeralphFolder ? (
                <FolderOpen className="h-4 w-4 shrink-0" />
              ) : (
                <Folder className="h-4 w-4 shrink-0" />
              )}
              <span className="hidden truncate sm:inline">{displayPath}</span>
              <Pencil className="hidden h-3 w-3 shrink-0 opacity-50 sm:block" />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>{currentWorkingDir ?? "Select repository"}</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Repository</DialogTitle>
          <DialogDescription>
            Select a recent repository or enter a path to a git repository.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {error && (
            <div className="rounded-md bg-[hsl(var(--destructive)/0.1)] p-3 text-sm text-[hsl(var(--destructive))]">
              {error}
            </div>
          )}

          {/* Recent Repositories */}
          {recentRepos.length > 0 && (
            <div className="space-y-3">
              <Label>Recent Repositories</Label>
              <div className="space-y-2">
                {isLoadingRecent ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  recentRepos.map((repo) => (
                    <RecentRepoItem
                      key={repo.path}
                      repo={repo}
                      onSelect={handleSelectRepo}
                      onRemove={handleRemoveRecent}
                      isSelecting={isLoading}
                    />
                  ))
                )}
              </div>
            </div>
          )}

          {/* Separator */}
          {recentRepos.length > 0 && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-[hsl(var(--background))] px-2 text-[hsl(var(--muted-foreground))]">
                  Or select a new repository
                </span>
              </div>
            </div>
          )}

          {/* Path Input */}
          <form onSubmit={handleSubmit} className="space-y-4">
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

            {/* Validation Indicator */}
            <ValidationIndicator
              validation={validation}
              isValidating={isValidating}
            />

            {currentWorkingDir && (
              <div className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
                <span>Current:</span>
                <code className="rounded bg-[hsl(var(--muted))] px-2 py-1 text-xs truncate max-w-[400px]">
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
              <Button
                type="submit"
                disabled={isLoading || (validation !== null && !validation.valid)}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Switching...
                  </>
                ) : (
                  "Select Repository"
                )}
              </Button>
            </DialogFooter>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
