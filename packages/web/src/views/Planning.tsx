/**
 * Planning Mode view for PokéRalph
 *
 * Interface for the planning phase with Claude. Users describe their idea,
 * Claude refines it through conversation, and a PRD is generated.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, Send, X } from "lucide-react";
import {
  usePlanningState,
  usePendingQuestion,
  usePlanningOutput,
  useAppStore,
} from "@/stores/app-store";
import {
  startPlanning,
  answerPlanningQuestion,
  finishPlanning,
  resetPlanning,
  updatePRD,
  getPlanningStatus,
  breakdownTasks,
} from "@/api/client";
import type { PRD, Task } from "@pokeralph/core/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * View stages for the planning workflow
 */
type PlanningStage = "input" | "conversation" | "review" | "confirm";

/**
 * Chat message type
 */
interface ChatMessage {
  type: "claude" | "user";
  content: string;
  timestamp: Date;
}

/**
 * Idea input stage component
 */
interface IdeaInputProps {
  onSubmit: (idea: string) => void;
  isLoading: boolean;
}

function IdeaInput({ onSubmit, isLoading }: IdeaInputProps) {
  const [idea, setIdea] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (idea.trim() && !isLoading) {
      onSubmit(idea.trim());
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4 sm:space-y-6">
      <div className="text-center">
        <h2 className="text-lg font-bold sm:text-2xl text-[hsl(var(--screen-fg))]">Describe Your Idea</h2>
        <p className="mt-2 text-sm text-[hsl(var(--screen-muted-fg))] sm:text-base">
          Tell Claude about your project idea. Be as detailed as you like -
          Claude will help refine it into a structured plan with actionable
          tasks.
        </p>
      </div>

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="I want to build an app that..."
              rows={8}
              disabled={isLoading}
              className="resize-none bg-[hsl(var(--screen-card))] border-[hsl(var(--screen-border))]"
            />

            <div className="flex justify-end">
              <Button type="submit" disabled={!idea.trim() || isLoading} size="lg">
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  "Start Planning"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Conversation stage component
 */
interface ConversationProps {
  messages: ChatMessage[];
  pendingQuestion: string | null;
  isWaitingInput: boolean;
  isProcessing: boolean;
  onAnswer: (answer: string) => void;
  onFinish: () => void;
  onCancel: () => void;
}

function Conversation({
  messages,
  pendingQuestion,
  isWaitingInput,
  isProcessing,
  onAnswer,
  onFinish,
  onCancel,
}: ConversationProps) {
  const [answer, setAnswer] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change or questions arrive
  // biome-ignore lint/correctness/useExhaustiveDependencies: Intentionally trigger scroll on message/question changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, pendingQuestion]);

  const handleSendAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (answer.trim() && !isProcessing) {
      onAnswer(answer.trim());
      setAnswer("");
    }
  };

  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold">Planning with Claude</h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
            Cancel
          </Button>
          <Button
            onClick={onFinish}
            disabled={isProcessing || messages.length === 0}
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Finish Planning"
            )}
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)] p-4">
        <div className="space-y-4">
          {messages.map((msg, idx) => (
            <div
              key={`${msg.type}-${idx}`}
              className={cn(
                "flex",
                msg.type === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-lg px-4 py-2",
                  msg.type === "user"
                    ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]"
                    : "bg-[hsl(var(--card))] border border-[hsl(var(--border))]"
                )}
              >
                <div className="mb-1 flex items-center gap-2 text-xs opacity-70">
                  <span>{msg.type === "claude" ? "Claude" : "You"}</span>
                  <span>{msg.timestamp.toLocaleTimeString()}</span>
                </div>
                <div className="whitespace-pre-wrap">{msg.content}</div>
              </div>
            </div>
          ))}

          {isProcessing && !isWaitingInput && (
            <div className="flex justify-start">
              <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-4 py-2">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-[hsl(var(--muted-foreground))]">
                    Claude is thinking...
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {isWaitingInput && pendingQuestion && (
        <Card className="mt-4">
          <CardContent className="p-4">
            <p className="mb-3 font-medium">{pendingQuestion}</p>
            <form onSubmit={handleSendAnswer} className="flex gap-2">
              <Input
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer..."
                disabled={isProcessing}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={!answer.trim() || isProcessing}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * PRD Review stage component
 */
interface ReviewProps {
  prd: PRD;
  onEdit: (prd: PRD) => void;
  onConfirm: () => void;
  onBack: () => void;
  isLoading: boolean;
  onError: (error: string) => void;
}

function Review({ prd, onEdit, onConfirm, onBack, isLoading, onError }: ReviewProps) {
  const [editedPRD, setEditedPRD] = useState(prd);
  const [isRefining, setIsRefining] = useState(false);

  const handleRefineTasks = async () => {
    setIsRefining(true);
    try {
      const result = await breakdownTasks();
      setEditedPRD(result.prd);
      onEdit(result.prd);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to refine tasks");
    } finally {
      setIsRefining(false);
    }
  };

  const handleNameChange = (name: string) => {
    const updated = { ...editedPRD, name };
    setEditedPRD(updated);
    onEdit(updated);
  };

  const handleDescriptionChange = (description: string) => {
    const updated = { ...editedPRD, description };
    setEditedPRD(updated);
    onEdit(updated);
  };

  const handleTaskEdit = (
    taskId: string,
    field: keyof Task,
    value: string | number
  ) => {
    const updated = {
      ...editedPRD,
      tasks: editedPRD.tasks.map((task) =>
        task.id === taskId ? { ...task, [field]: value } : task
      ),
    };
    setEditedPRD(updated);
    onEdit(updated);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold">Review Your PRD</h2>
        <p className="mt-2 text-[hsl(var(--muted-foreground))]">
          Review and edit the generated PRD before confirming. You can modify
          the project name, description, and individual tasks.
        </p>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks ({editedPRD.tasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prd-name">Project Name</Label>
            <Input
              id="prd-name"
              value={editedPRD.name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="prd-description">Description</Label>
            <Textarea
              id="prd-description"
              value={editedPRD.description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              rows={4}
            />
          </div>

          <Card>
            <CardContent className="flex items-center justify-center p-8">
              <div className="text-center">
                <span className="text-4xl font-bold">
                  {editedPRD.tasks.length}
                </span>
                <p className="text-[hsl(var(--muted-foreground))]">Tasks</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-sm text-[hsl(var(--muted-foreground))]">
              {editedPRD.tasks.length} task{editedPRD.tasks.length !== 1 ? "s" : ""} generated
            </span>
            <Button
              variant="outline"
              onClick={handleRefineTasks}
              disabled={isRefining || isLoading}
              size="sm"
            >
              {isRefining ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Refining...
                </>
              ) : (
                "Refine Tasks with Claude"
              )}
            </Button>
          </div>
          {editedPRD.tasks.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-[hsl(var(--muted-foreground))]">
                No tasks were generated. Go back and provide more details.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {editedPRD.tasks.map((task, idx) => (
                <Card key={task.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">#{idx + 1}</Badge>
                      <Input
                        value={task.title}
                        onChange={(e) =>
                          handleTaskEdit(task.id, "title", e.target.value)
                        }
                        className="flex-1 font-medium"
                      />
                      <Input
                        type="number"
                        value={task.priority}
                        onChange={(e) =>
                          handleTaskEdit(
                            task.id,
                            "priority",
                            Number.parseInt(e.target.value, 10)
                          )
                        }
                        min={1}
                        className="w-20"
                        title="Priority"
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      value={task.description}
                      onChange={(e) =>
                        handleTaskEdit(task.id, "description", e.target.value)
                      }
                      rows={2}
                    />
                    {task.acceptanceCriteria.length > 0 && (
                      <div>
                        <span className="text-sm font-medium text-[hsl(var(--muted-foreground))]">
                          Acceptance Criteria:
                        </span>
                        <ul className="mt-1 list-inside list-disc text-sm">
                          {task.acceptanceCriteria.map((criterion, criterionIdx) => (
                            <li key={`${task.id}-criterion-${criterionIdx}`}>
                              {criterion}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Separator />

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          Back
        </Button>
        <Button
          onClick={onConfirm}
          disabled={isLoading || editedPRD.tasks.length === 0}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Check className="mr-2 h-4 w-4" />
              Confirm & Start
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

/**
 * Progress steps component
 */
interface ProgressStepsProps {
  stage: PlanningStage;
}

function ProgressSteps({ stage }: ProgressStepsProps) {
  const steps = [
    { id: "input", label: "Describe Idea", shortLabel: "Idea" },
    { id: "conversation", label: "Plan with Claude", shortLabel: "Plan" },
    { id: "review", label: "Review & Confirm", shortLabel: "Review" },
  ];

  const getStepStatus = (stepId: string) => {
    const stageOrder = ["input", "conversation", "review", "confirm"];
    const currentIndex = stageOrder.indexOf(stage);
    const stepIndex = stageOrder.indexOf(stepId);

    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex || (stage === "confirm" && stepId === "review"))
      return "active";
    return "pending";
  };

  return (
    <div className="mb-8 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-center sm:gap-4">
      {steps.map((step, idx) => {
        const status = getStepStatus(step.id);
        return (
          <div key={step.id} className="flex items-center gap-2">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center text-xs font-medium sm:h-8 sm:w-8 sm:text-sm",
                status === "completed" &&
                  "bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]",
                status === "active" &&
                  "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]",
                status === "pending" &&
                  "bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
              )}
            >
              {status === "completed" ? (
                <Check className="h-3 w-3 sm:h-4 sm:w-4" />
              ) : (
                idx + 1
              )}
            </div>
            <span
              className={cn(
                "text-xs font-medium sm:text-sm",
                status === "active"
                  ? "text-[hsl(var(--foreground))]"
                  : "text-[hsl(var(--muted-foreground))]"
              )}
            >
              <span className="hidden sm:inline">{step.label}</span>
              <span className="sm:hidden">{step.shortLabel}</span>
            </span>
            {idx < steps.length - 1 && (
              <div className="mx-2 hidden h-px w-8 bg-[hsl(var(--border))] sm:block sm:w-12" />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Planning view component
 */
export function Planning() {
  const navigate = useNavigate();
  const planningState = usePlanningState();
  const pendingQuestion = usePendingQuestion();
  const planningOutput = usePlanningOutput();

  const setPlanningState = useAppStore((state) => state.setPlanningState);
  const clearPlanningSession = useAppStore((state) => state.clearPlanningSession);
  const setPRD = useAppStore((state) => state.setPRD);

  const [stage, setStage] = useState<PlanningStage>("input");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [generatedPRD, setGeneratedPRD] = useState<PRD | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track which outputs we've already added as messages
  const processedOutputsRef = useRef<Set<string>>(new Set());

  // Sync planning output with messages
  useEffect(() => {
    if (planningOutput.length === 0) return;

    const newMessages: ChatMessage[] = [];
    for (const output of planningOutput) {
      if (!output) continue;
      const outputKey = output.substring(0, 200);
      if (!processedOutputsRef.current.has(outputKey)) {
        processedOutputsRef.current.add(outputKey);
        newMessages.push({
          type: "claude" as const,
          content: output,
          timestamp: new Date(),
        });
      }
    }

    if (newMessages.length > 0) {
      setMessages((prev) => [...prev, ...newMessages]);
    }
  }, [planningOutput]);

  // Check for existing planning session on mount
  useEffect(() => {
    const setPendingQuestion = useAppStore.getState().setPendingQuestion;

    async function checkPlanningStatus() {
      try {
        const status = await getPlanningStatus();
        if (status.isPlanning) {
          setStage("conversation");
          if (status.state === "waiting_input" || status.pendingQuestion) {
            setPlanningState("waiting_input");
            // Restore the pending question from server state
            if (status.pendingQuestion) {
              setPendingQuestion(status.pendingQuestion);
            }
          } else {
            setPlanningState("planning");
          }
        } else {
          // Server has no active planning session - reset local state
          setStage("input");
          setMessages([]);
          processedOutputsRef.current.clear();
          setPlanningState("idle");
        }
      } catch {
        // Server not available or no session
      }
    }
    checkPlanningStatus();
  }, [setPlanningState]);

  // Handle starting planning
  const handleStartPlanning = async (idea: string) => {
    setIsLoading(true);
    setError(null);

    setMessages([{ type: "user", content: idea, timestamp: new Date() }]);
    processedOutputsRef.current.clear();

    setStage("conversation");
    setPlanningState("planning");

    try {
      await startPlanning(idea);
    } catch (err) {
      // Check if WebSocket events have already progressed the planning state
      // If so, don't reset - the planning is actually working
      const currentPlanningState = useAppStore.getState().planningSession;
      const hasReceivedOutput = currentPlanningState.conversationOutput.length > 0;
      const hasQuestion = currentPlanningState.pendingQuestion !== null;

      if (hasReceivedOutput || hasQuestion) {
        // Planning is working via WebSocket, ignore the HTTP timeout
        console.log("[Planning] HTTP request timed out but WebSocket shows planning is progressing");
      } else {
        // No WebSocket progress, this is a real failure
        const message =
          err instanceof Error ? err.message : "Failed to start planning";
        setError(message);
        setStage("input");
        setMessages([]);
        setPlanningState("idle");
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Handle answering a question
  const handleAnswer = async (answer: string) => {
    setIsLoading(true);
    setError(null);

    try {
      setMessages((prev) => [
        ...prev,
        { type: "user", content: answer, timestamp: new Date() },
      ]);

      await answerPlanningQuestion(answer);
      setPlanningState("planning");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send answer";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle finishing planning
  const handleFinishPlanning = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await finishPlanning();
      setGeneratedPRD(result.prd);
      setStage("review");
      setPlanningState("completed");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to finish planning";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle canceling planning
  const handleCancel = async () => {
    try {
      await resetPlanning();
    } catch {
      // Ignore errors during reset
    }
    clearPlanningSession();
    setMessages([]);
    processedOutputsRef.current.clear();
    setStage("input");
    setError(null);
  };

  // Handle PRD edit
  const handlePRDEdit = (prd: PRD) => {
    setGeneratedPRD(prd);
  };

  // Handle confirming PRD
  const handleConfirm = async () => {
    if (!generatedPRD) return;

    setIsLoading(true);
    setError(null);

    try {
      const savedPRD = await updatePRD(generatedPRD);
      setPRD(savedPRD);
      clearPlanningSession();
      navigate("/");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save PRD";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle going back from review
  const handleBackFromReview = () => {
    setStage("conversation");
    setPlanningState("planning");
  };

  return (
    <div>
      <ProgressSteps stage={stage} />

      {error && (
        <div className="mb-4 flex items-center justify-between rounded-md bg-[hsl(var(--destructive)/0.1)] p-3 text-[hsl(var(--destructive))]">
          <span>{error}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setError(null)}
            className="h-6 w-6"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {stage === "input" && (
        <IdeaInput onSubmit={handleStartPlanning} isLoading={isLoading} />
      )}

      {stage === "conversation" && (
        <Conversation
          messages={messages}
          pendingQuestion={pendingQuestion}
          isWaitingInput={planningState === "waiting_input"}
          isProcessing={isLoading || planningState === "planning"}
          onAnswer={handleAnswer}
          onFinish={handleFinishPlanning}
          onCancel={handleCancel}
        />
      )}

      {(stage === "review" || stage === "confirm") && generatedPRD && (
        <Review
          prd={generatedPRD}
          onEdit={handlePRDEdit}
          onConfirm={handleConfirm}
          onBack={handleBackFromReview}
          isLoading={isLoading}
          onError={setError}
        />
      )}
    </div>
  );
}
