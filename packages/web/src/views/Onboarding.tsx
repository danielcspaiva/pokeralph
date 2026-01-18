/**
 * Onboarding wizard for PokéRalph
 *
 * Guides new users through initial setup:
 * 1. Welcome screen
 * 2. Project detection
 * 3. Configuration wizard
 * 4. First PRD guidance
 *
 * Implements 09-onboarding.md specification.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Config } from "@pokeralph/core/types";
import { useAppStore } from "@/stores/app-store";
import {
  detectProject,
  completeOnboarding,
  type ProjectDetection,
} from "@/api/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Package,
  TestTube,
  Code,
  Sparkles,
  AlertTriangle,
  Loader2,
  FileCode,
  Zap,
  GitBranch,
  CheckCircle2,
  Globe,
  Server,
  Smartphone,
  Terminal,
  Bug,
  Wrench,
  BookOpen,
} from "lucide-react";

// ==========================================================================
// Types
// ==========================================================================

type OnboardingStep = "welcome" | "detection" | "config" | "prd-guidance" | "complete";

interface PRDTemplate {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}

// ==========================================================================
// Constants
// ==========================================================================

const STEPS: OnboardingStep[] = ["welcome", "detection", "config", "prd-guidance", "complete"];

const STEP_LABELS: Record<OnboardingStep, string> = {
  welcome: "Welcome",
  detection: "Detection",
  config: "Configuration",
  "prd-guidance": "First PRD",
  complete: "Complete",
};

const AVAILABLE_FEEDBACK_LOOPS = ["test", "lint", "typecheck", "format:check"];

const PRD_TEMPLATES: PRDTemplate[] = [
  { id: "web-app", icon: <Globe className="h-6 w-6" />, title: "Web App", description: "Frontend app with React, routing, state" },
  { id: "rest-api", icon: <Server className="h-6 w-6" />, title: "REST API", description: "Backend API with CRUD, auth, database" },
  { id: "mobile-app", icon: <Smartphone className="h-6 w-6" />, title: "Mobile App", description: "React Native or Expo app" },
  { id: "cli-tool", icon: <Terminal className="h-6 w-6" />, title: "CLI Tool", description: "Command-line utility with arguments" },
  { id: "library", icon: <Package className="h-6 w-6" />, title: "Library", description: "NPM package, reusable code" },
  { id: "test-suite", icon: <TestTube className="h-6 w-6" />, title: "Test Suite", description: "Add tests to existing code" },
  { id: "refactor", icon: <Wrench className="h-6 w-6" />, title: "Refactor", description: "Clean up and improve code" },
  { id: "bug-fix", icon: <Bug className="h-6 w-6" />, title: "Bug Fix", description: "Investigate and fix bugs" },
  { id: "new-feature", icon: <Sparkles className="h-6 w-6" />, title: "New Feature", description: "Add feature to existing app" },
];

// ==========================================================================
// Helper Components
// ==========================================================================

/**
 * Progress indicator showing current step in onboarding flow
 */
function StepIndicator({ currentStep }: { currentStep: OnboardingStep }) {
  const currentIndex = STEPS.indexOf(currentStep);
  const progressPercentage = ((currentIndex + 1) / STEPS.length) * 100;

  return (
    <div className="w-full space-y-2">
      <Progress value={progressPercentage} className="h-2" />
      <div className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
        {STEPS.map((step, index) => (
          <span
            key={step}
            className={cn(
              "font-medium",
              index <= currentIndex && "text-[hsl(var(--primary))]"
            )}
          >
            {STEP_LABELS[step]}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Detection info card showing a single detected feature
 */
function DetectionItem({
  icon,
  label,
  value,
  detected,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  detected: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-md",
          detected
            ? "bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]"
            : "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
        )}
      >
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-[hsl(var(--muted-foreground))]">
          {value || "Not detected"}
        </div>
      </div>
      {detected && <Check className="h-4 w-4 text-[hsl(var(--success))]" />}
    </div>
  );
}

// ==========================================================================
// Step Components
// ==========================================================================

/**
 * Welcome screen - explains PokéRalph and provides entry points
 */
function WelcomeStep({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center space-y-8 py-8 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Welcome to PokéRalph!</h1>
        <p className="max-w-md text-[hsl(var(--muted-foreground))]">
          Transform your development into a gamified experience where each task
          is a battle!
        </p>
      </div>

      <Card className="max-w-lg">
        <CardContent className="p-6">
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            PokéRalph runs Claude Code in autonomous loops to complete your
            tasks. Each task is a "battle" where Claude iterates until tests
            pass and work is done.
          </p>
        </CardContent>
      </Card>

      <div className="grid w-full max-w-lg grid-cols-3 gap-4">
        <Card className="p-4 text-center">
          <div className="mb-2 flex justify-center">
            <BookOpen className="h-8 w-8 text-[hsl(var(--primary))]" />
          </div>
          <h3 className="font-semibold">1. Plan</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Describe your idea, Claude creates tasks
          </p>
        </Card>
        <Card className="p-4 text-center">
          <div className="mb-2 flex justify-center">
            <Zap className="h-8 w-8 text-[hsl(var(--warning))]" />
          </div>
          <h3 className="font-semibold">2. Battle</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Claude works autonomously until tests pass
          </p>
        </Card>
        <Card className="p-4 text-center">
          <div className="mb-2 flex justify-center">
            <GitBranch className="h-8 w-8 text-[hsl(var(--success))]" />
          </div>
          <h3 className="font-semibold">3. Ship</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            Review, commit, and celebrate
          </p>
        </Card>
      </div>

      <div className="flex gap-4">
        <Button onClick={onNext} size="lg">
          Get Started
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
        <Button variant="ghost" onClick={onSkip}>
          I know what I'm doing
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Project detection step - shows detected project info
 */
function DetectionStep({
  detection,
  isLoading,
  error,
  onNext,
  onBack,
  onCustomize,
}: {
  detection: ProjectDetection | null;
  isLoading: boolean;
  error: string | null;
  onNext: () => void;
  onBack: () => void;
  onCustomize: () => void;
}) {
  const isUnknown = detection?.type === "unknown";

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--primary))]" />
        <p className="text-[hsl(var(--muted-foreground))]">
          Scanning your project...
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-12">
        <AlertTriangle className="h-8 w-8 text-[hsl(var(--destructive))]" />
        <p className="text-[hsl(var(--destructive))]">{error}</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Project Detection</h2>
        <p className="text-[hsl(var(--muted-foreground))]">
          We've analyzed your project
        </p>
      </div>

      {isUnknown ? (
        <Card className="border-[hsl(var(--warning))]">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
              <CardTitle>Project Type Not Detected</CardTitle>
            </div>
            <CardDescription>
              We couldn't automatically detect your project type. For safety,
              we've applied conservative defaults.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center gap-2">
                <span className="text-[hsl(var(--muted-foreground))]">*</span>
                No feedback loops - configure manually
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[hsl(var(--muted-foreground))]">*</span>
                Auto-commit disabled - changes won't be committed
              </li>
              <li className="flex items-center gap-2">
                <span className="text-[hsl(var(--muted-foreground))]">*</span>
                HITL mode enabled - review each iteration
              </li>
            </ul>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-[hsl(var(--success))]" />
              <CardTitle>
                Detected Project Type:{" "}
                {detection?.type === "bun"
                  ? "Bun"
                  : detection?.type === "node"
                    ? "Node.js"
                    : detection?.type === "python"
                      ? "Python"
                      : detection?.type === "go"
                        ? "Go"
                        : detection?.type === "rust"
                          ? "Rust"
                          : "Unknown"}
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <DetectionItem
                icon={<Package className="h-4 w-4" />}
                label="Package Manager"
                value={detection?.packageManager?.toUpperCase() || null}
                detected={!!detection?.packageManager}
              />
              <DetectionItem
                icon={<Code className="h-4 w-4" />}
                label="Framework"
                value={detection?.framework ?? null}
                detected={!!detection?.framework}
              />
              <DetectionItem
                icon={<TestTube className="h-4 w-4" />}
                label="Test Runner"
                value={detection?.testRunner ?? null}
                detected={!!detection?.testRunner}
              />
              <DetectionItem
                icon={<FileCode className="h-4 w-4" />}
                label="Linter"
                value={detection?.linter ?? null}
                detected={!!detection?.linter}
              />
              <DetectionItem
                icon={<Sparkles className="h-4 w-4" />}
                label="TypeScript"
                value={detection?.typescript ? "Yes" : "No"}
                detected={detection?.typescript ?? false}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {detection?.existingPokeralph && (
        <Card className="border-[hsl(var(--primary))]">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-[hsl(var(--primary))]" />
            <span className="text-sm">
              Existing .pokeralph folder detected - your configuration will be
              preserved.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCustomize}>
            Customize
          </Button>
          <Button onClick={onNext}>
            Continue
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Configuration wizard step
 */
function ConfigStep({
  config,
  onChange,
  onNext,
  onBack,
}: {
  config: Partial<Config>;
  onChange: (config: Partial<Config>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const mode = config.mode ?? "hitl";
  const maxIterations = config.maxIterationsPerTask ?? 10;
  const timeoutMinutes = config.timeoutMinutes ?? 30;
  const feedbackLoops = config.feedbackLoops ?? [];
  const autoCommit = config.autoCommit ?? true;

  const handleFeedbackLoopToggle = (loop: string) => {
    const newLoops = feedbackLoops.includes(loop)
      ? feedbackLoops.filter((l) => l !== loop)
      : [...feedbackLoops, loop];
    onChange({ ...config, feedbackLoops: newLoops });
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Configuration</h2>
        <p className="text-[hsl(var(--muted-foreground))]">
          Let's set up how PokéRalph will run battles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Execution Mode</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex rounded-lg bg-[hsl(var(--muted))] p-1">
            <button
              type="button"
              className={cn(
                "flex-1 rounded-md px-4 py-3 text-sm font-medium transition-colors",
                mode === "hitl"
                  ? "bg-[hsl(var(--background))] shadow"
                  : "hover:bg-[hsl(var(--background)/0.5)]"
              )}
              onClick={() => onChange({ ...config, mode: "hitl" })}
            >
              <div className="font-semibold">HITL</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Human in the Loop - Recommended for beginners
              </div>
            </button>
            <button
              type="button"
              className={cn(
                "flex-1 rounded-md px-4 py-3 text-sm font-medium transition-colors",
                mode === "yolo"
                  ? "bg-[hsl(var(--background))] shadow"
                  : "hover:bg-[hsl(var(--background)/0.5)]"
              )}
              onClick={() => onChange({ ...config, mode: "yolo" })}
            >
              <div className="font-semibold">YOLO</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                Run until completion without pausing
              </div>
            </button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feedback Loops</CardTitle>
          <CardDescription>
            Commands to run after each iteration
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {AVAILABLE_FEEDBACK_LOOPS.map((loop) => (
              <div key={loop} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={`feedback-${loop}`}
                  checked={feedbackLoops.includes(loop)}
                  onCheckedChange={() => handleFeedbackLoopToggle(loop)}
                />
                <Label htmlFor={`feedback-${loop}`}>{loop}</Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="maxIterations">Max iterations per task</Label>
              <span className="text-sm font-medium">{maxIterations}</span>
            </div>
            <Slider
              id="maxIterations"
              min={1}
              max={50}
              step={1}
              value={[maxIterations]}
              onValueChange={(value) =>
                onChange({
                  ...config,
                  maxIterationsPerTask: value[0] ?? maxIterations,
                })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeoutMinutes">Timeout per iteration (minutes)</Label>
            <Input
              type="number"
              id="timeoutMinutes"
              min={1}
              max={60}
              value={timeoutMinutes}
              onChange={(e) =>
                onChange({ ...config, timeoutMinutes: Number(e.target.value) })
              }
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <Label htmlFor="autoCommit">Auto-commit on Success</Label>
            <Switch
              id="autoCommit"
              checked={autoCommit}
              onCheckedChange={(checked) =>
                onChange({ ...config, autoCommit: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={onNext}>
          Continue
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * First PRD guidance step
 */
function PRDGuidanceStep({
  selectedTemplate,
  onSelectTemplate,
  onNext,
  onBack,
  onSkip,
}: {
  selectedTemplate: string | null;
  onSelectTemplate: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const [prdOption, setPrdOption] = useState<"template" | "blank" | "skip">(
    "template"
  );

  const handleNext = () => {
    if (prdOption === "skip") {
      onSkip();
    } else {
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Create Your First PRD</h2>
        <p className="text-[hsl(var(--muted-foreground))]">
          A PRD describes what you want to build. Claude will turn it into tasks!
        </p>
      </div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="space-y-3">
            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:bg-[hsl(var(--muted))]">
              <input
                type="radio"
                name="prd-option"
                checked={prdOption === "template"}
                onChange={() => setPrdOption("template")}
                className="h-4 w-4"
              />
              <div>
                <div className="font-medium">Start from a template</div>
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  Choose a project type for suggested structure
                </div>
              </div>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:bg-[hsl(var(--muted))]">
              <input
                type="radio"
                name="prd-option"
                checked={prdOption === "blank"}
                onChange={() => setPrdOption("blank")}
                className="h-4 w-4"
              />
              <div>
                <div className="font-medium">Describe my own idea</div>
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  Start with a blank canvas
                </div>
              </div>
            </label>

            <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-4 hover:bg-[hsl(var(--muted))]">
              <input
                type="radio"
                name="prd-option"
                checked={prdOption === "skip"}
                onChange={() => setPrdOption("skip")}
                className="h-4 w-4"
              />
              <div>
                <div className="font-medium">Skip for now</div>
                <div className="text-sm text-[hsl(var(--muted-foreground))]">
                  Go to dashboard, create PRD later
                </div>
              </div>
            </label>
          </div>
        </CardContent>
      </Card>

      {prdOption === "template" && (
        <Card>
          <CardHeader>
            <CardTitle>Choose a Template</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {PRD_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-4 text-center transition-colors hover:bg-[hsl(var(--muted))]",
                    selectedTemplate === template.id &&
                      "border-[hsl(var(--primary))] bg-[hsl(var(--primary)/0.05)]"
                  )}
                  onClick={() => onSelectTemplate(template.id)}
                >
                  <div
                    className={cn(
                      "text-[hsl(var(--muted-foreground))]",
                      selectedTemplate === template.id &&
                        "text-[hsl(var(--primary))]"
                    )}
                  >
                    {template.icon}
                  </div>
                  <div className="text-sm font-medium">{template.title}</div>
                  <div className="text-xs text-[hsl(var(--muted-foreground))]">
                    {template.description}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tips for a good PRD</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--success))]" />
              Be specific about what you want to build
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--success))]" />
              Include acceptance criteria for success
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--success))]" />
              Break large features into smaller tasks
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 text-[hsl(var(--success))]" />
              Mention technologies/patterns you want to use
            </li>
          </ul>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={handleNext}>
          {prdOption === "skip" ? "Go to Dashboard" : "Start Planning"}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Completion step - success message
 */
function CompleteStep({
  configPath,
  onFinish,
}: {
  configPath: string;
  onFinish: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center space-y-8 py-8 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[hsl(var(--success)/0.1)]">
        <CheckCircle2 className="h-8 w-8 text-[hsl(var(--success))]" />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold">You're All Set!</h2>
        <p className="text-[hsl(var(--muted-foreground))]">
          PokéRalph is configured and ready to go!
        </p>
      </div>

      <Card className="max-w-md">
        <CardContent className="p-6">
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Configuration saved to:
          </p>
          <code className="mt-2 block rounded bg-[hsl(var(--muted))] p-2 text-sm">
            {configPath}
          </code>
        </CardContent>
      </Card>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Quick Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-left text-sm">
            <li className="flex items-center gap-2">
              <span className="text-[hsl(var(--muted-foreground))]">*</span>
              Click "New Plan" to start planning a project
            </li>
            <li className="flex items-center gap-2">
              <span className="text-[hsl(var(--muted-foreground))]">*</span>
              After planning, click "Start Battle" on any task
            </li>
            <li className="flex items-center gap-2">
              <span className="text-[hsl(var(--muted-foreground))]">*</span>
              In HITL mode, review each iteration before continuing
            </li>
            <li className="flex items-center gap-2">
              <span className="text-[hsl(var(--muted-foreground))]">*</span>
              Check Settings to adjust configuration anytime
            </li>
          </ul>
        </CardContent>
      </Card>

      <Button size="lg" onClick={onFinish}>
        Go to Dashboard
        <ArrowRight className="ml-2 h-4 w-4" />
      </Button>
    </div>
  );
}

// ==========================================================================
// Main Component
// ==========================================================================

/**
 * Onboarding wizard component
 */
export function Onboarding() {
  const navigate = useNavigate();
  const setConfig = useAppStore((state) => state.setConfig);

  // Wizard state
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [detection, setDetection] = useState<ProjectDetection | null>(null);
  const [_suggestedConfig, setSuggestedConfig] = useState<Config | null>(null);
  const [config, setLocalConfig] = useState<Partial<Config>>({});
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [configPath, setConfigPath] = useState<string>("");

  // Loading/error state
  const [isLoading, setIsLoading] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Detect project when entering detection step
   */
  const runDetection = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await detectProject();
      setDetection(result.detection);
      setSuggestedConfig(result.suggestedConfig);
      setLocalConfig(result.suggestedConfig);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to detect project"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Run detection when entering detection step
  useEffect(() => {
    if (step === "detection" && !detection && !isLoading) {
      runDetection();
    }
  }, [step, detection, isLoading, runDetection]);

  /**
   * Complete onboarding and save config
   */
  const handleComplete = async (skipPRD: boolean) => {
    if (!config.mode) return;

    setIsCompleting(true);
    setError(null);

    try {
      const fullConfig: Config = {
        mode: config.mode ?? "hitl",
        maxIterationsPerTask: config.maxIterationsPerTask ?? 10,
        feedbackLoops: config.feedbackLoops ?? [],
        timeoutMinutes: config.timeoutMinutes ?? 30,
        pollingIntervalMs: config.pollingIntervalMs ?? 2000,
        autoCommit: config.autoCommit ?? true,
      };

      const result = await completeOnboarding({
        config: fullConfig,
        skipFirstPRD: skipPRD,
      });

      setConfig(fullConfig);
      setConfigPath(result.configPath);
      setStep("complete");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to complete onboarding"
      );
    } finally {
      setIsCompleting(false);
    }
  };

  /**
   * Navigate to next step
   */
  const handleNext = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex < STEPS.length - 1) {
      const nextStep = STEPS[currentIndex + 1];
      if (nextStep) {
        setStep(nextStep);
      }
    }
  };

  /**
   * Navigate to previous step
   */
  const handleBack = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex > 0) {
      const prevStep = STEPS[currentIndex - 1];
      if (prevStep) {
        setStep(prevStep);
      }
    }
  };

  /**
   * Skip to dashboard (for experienced users)
   */
  const handleSkipAll = () => {
    navigate("/");
  };

  /**
   * Handle PRD guidance completion
   */
  const handlePRDComplete = async () => {
    await handleComplete(false);
  };

  /**
   * Handle PRD skip
   */
  const handlePRDSkip = async () => {
    await handleComplete(true);
  };

  /**
   * Finish onboarding and go to appropriate view
   */
  const handleFinish = () => {
    // If they selected a template or blank, go to planning
    // Otherwise go to dashboard
    navigate(selectedTemplate ? "/planning" : "/");
  };

  return (
    <div className="container mx-auto max-w-2xl p-6">
      {step !== "welcome" && step !== "complete" && (
        <div className="mb-8">
          <StepIndicator currentStep={step} />
        </div>
      )}

      {step === "welcome" && (
        <WelcomeStep onNext={handleNext} onSkip={handleSkipAll} />
      )}

      {step === "detection" && (
        <DetectionStep
          detection={detection}
          isLoading={isLoading}
          error={error}
          onNext={handleNext}
          onBack={handleBack}
          onCustomize={handleNext}
        />
      )}

      {step === "config" && (
        <ConfigStep
          config={config}
          onChange={setLocalConfig}
          onNext={handleNext}
          onBack={handleBack}
        />
      )}

      {step === "prd-guidance" && (
        <PRDGuidanceStep
          selectedTemplate={selectedTemplate}
          onSelectTemplate={setSelectedTemplate}
          onNext={handlePRDComplete}
          onBack={handleBack}
          onSkip={handlePRDSkip}
        />
      )}

      {step === "complete" && (
        <CompleteStep configPath={configPath} onFinish={handleFinish} />
      )}

      {isCompleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="p-6">
            <div className="flex items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span>Saving configuration...</span>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default Onboarding;
