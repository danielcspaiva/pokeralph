/**
 * Planning Mode view for PokéRalph
 *
 * Interface for the planning phase with Claude. Users describe their idea,
 * Claude refines it through conversation, and a PRD is generated.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  usePlanningState,
  usePendingQuestion,
  usePlanningOutput,
  useAppStore,
} from "@/stores/app-store.ts";
import {
  startPlanning,
  answerPlanningQuestion,
  finishPlanning,
  resetPlanning,
  updatePRD,
  getPlanningStatus,
} from "@/api/client.ts";
import type { PRD, Task } from "@pokeralph/core/types";
import styles from "./Planning.module.css";

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
    <div className={styles.inputStage}>
      <div className={styles.inputHeader}>
        <h2 className={styles.stageTitle}>Describe Your Idea</h2>
        <p className={styles.stageDescription}>
          Tell Claude about your project idea. Be as detailed as you like - Claude will
          help refine it into a structured plan with actionable tasks.
        </p>
      </div>

      <form onSubmit={handleSubmit} className={styles.ideaForm}>
        <textarea
          className={styles.ideaTextarea}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          placeholder="I want to build an app that..."
          rows={8}
          disabled={isLoading}
        />

        <div className={styles.inputActions}>
          <button
            type="submit"
            className={styles.primaryButton}
            disabled={!idea.trim() || isLoading}
          >
            {isLoading ? (
              <>
                <span className={styles.spinner} />
                Starting...
              </>
            ) : (
              "Start Planning"
            )}
          </button>
        </div>
      </form>
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
    <div className={styles.conversationStage}>
      <div className={styles.conversationHeader}>
        <h2 className={styles.stageTitle}>Planning with Claude</h2>
        <div className={styles.conversationActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onFinish}
            disabled={isProcessing || isWaitingInput}
          >
            {isProcessing ? "Processing..." : "Finish Planning"}
          </button>
        </div>
      </div>

      <div className={styles.chatArea}>
        <div className={styles.messages}>
          {messages.map((msg, idx) => (
            <div
              key={`${msg.type}-${idx}`}
              className={`${styles.message} ${styles[msg.type]}`}
            >
              <div className={styles.messageHeader}>
                <span className={styles.messageSender}>
                  {msg.type === "claude" ? "Claude" : "You"}
                </span>
                <span className={styles.messageTime}>
                  {msg.timestamp.toLocaleTimeString()}
                </span>
              </div>
              <div className={styles.messageContent}>
                {msg.content.split("\n").map((line, lineIdx) => (
                  <p key={`${msg.timestamp.getTime()}-line-${lineIdx}`}>{line || "\u00A0"}</p>
                ))}
              </div>
            </div>
          ))}

          {isProcessing && !isWaitingInput && (
            <div className={`${styles.message} ${styles.claude}`}>
              <div className={styles.messageHeader}>
                <span className={styles.messageSender}>Claude</span>
              </div>
              <div className={styles.messageContent}>
                <span className={styles.typingIndicator}>
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {isWaitingInput && pendingQuestion && (
          <div className={styles.questionBox}>
            <p className={styles.questionText}>{pendingQuestion}</p>
            <form onSubmit={handleSendAnswer} className={styles.answerForm}>
              <input
                type="text"
                className={styles.answerInput}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Type your answer..."
                disabled={isProcessing}
              />
              <button
                type="submit"
                className={styles.sendButton}
                disabled={!answer.trim() || isProcessing}
              >
                Send
              </button>
            </form>
          </div>
        )}
      </div>
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
}

function Review({ prd, onEdit, onConfirm, onBack, isLoading }: ReviewProps) {
  const [editedPRD, setEditedPRD] = useState(prd);
  const [activeTab, setActiveTab] = useState<"overview" | "tasks">("overview");

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

  const handleTaskEdit = (taskId: string, field: keyof Task, value: string | number) => {
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
    <div className={styles.reviewStage}>
      <div className={styles.reviewHeader}>
        <h2 className={styles.stageTitle}>Review Your PRD</h2>
        <p className={styles.stageDescription}>
          Review and edit the generated PRD before confirming. You can modify the project
          name, description, and individual tasks.
        </p>
      </div>

      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "overview" ? styles.active : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={`${styles.tab} ${activeTab === "tasks" ? styles.active : ""}`}
          onClick={() => setActiveTab("tasks")}
        >
          Tasks ({editedPRD.tasks.length})
        </button>
      </div>

      {activeTab === "overview" && (
        <div className={styles.overviewTab}>
          <div className={styles.formGroup}>
            <label htmlFor="prd-name" className={styles.label}>
              Project Name
            </label>
            <input
              id="prd-name"
              type="text"
              className={styles.input}
              value={editedPRD.name}
              onChange={(e) => handleNameChange(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="prd-description" className={styles.label}>
              Description
            </label>
            <textarea
              id="prd-description"
              className={styles.textarea}
              value={editedPRD.description}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              rows={4}
            />
          </div>

          <div className={styles.prdStats}>
            <div className={styles.stat}>
              <span className={styles.statValue}>{editedPRD.tasks.length}</span>
              <span className={styles.statLabel}>Tasks</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "tasks" && (
        <div className={styles.tasksTab}>
          {editedPRD.tasks.length === 0 ? (
            <div className={styles.noTasks}>
              <p>No tasks were generated. Go back and provide more details.</p>
            </div>
          ) : (
            <div className={styles.tasksList}>
              {editedPRD.tasks.map((task, idx) => (
                <div key={task.id} className={styles.taskCard}>
                  <div className={styles.taskHeader}>
                    <span className={styles.taskNumber}>#{idx + 1}</span>
                    <input
                      type="text"
                      className={styles.taskTitleInput}
                      value={task.title}
                      onChange={(e) => handleTaskEdit(task.id, "title", e.target.value)}
                    />
                    <input
                      type="number"
                      className={styles.taskPriorityInput}
                      value={task.priority}
                      onChange={(e) =>
                        handleTaskEdit(task.id, "priority", Number.parseInt(e.target.value, 10))
                      }
                      min={1}
                      title="Priority"
                    />
                  </div>
                  <textarea
                    className={styles.taskDescription}
                    value={task.description}
                    onChange={(e) => handleTaskEdit(task.id, "description", e.target.value)}
                    rows={2}
                  />
                  {task.acceptanceCriteria.length > 0 && (
                    <div className={styles.acceptanceCriteria}>
                      <span className={styles.criteriaLabel}>Acceptance Criteria:</span>
                      <ul className={styles.criteriaList}>
                        {task.acceptanceCriteria.map((criterion, criterionIdx) => (
                          <li key={`${task.id}-criterion-${criterionIdx}`}>{criterion}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.reviewActions}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={onBack}
          disabled={isLoading}
        >
          Back
        </button>
        <button
          type="button"
          className={styles.primaryButton}
          onClick={onConfirm}
          disabled={isLoading || editedPRD.tasks.length === 0}
        >
          {isLoading ? (
            <>
              <span className={styles.spinner} />
              Saving...
            </>
          ) : (
            "Confirm & Start"
          )}
        </button>
      </div>
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
    console.log("[PokéRalph][Planning] planningOutput changed", {
      length: planningOutput.length,
      outputs: planningOutput.map((o) => `${o.substring(0, 50)}...`),
    });

    if (planningOutput.length === 0) return;

    // Process any outputs we haven't seen yet
    const newMessages: ChatMessage[] = [];
    for (const output of planningOutput) {
      if (!output) continue;
      // Use a hash of the output to track uniqueness
      const outputKey = output.substring(0, 200);
      if (!processedOutputsRef.current.has(outputKey)) {
        processedOutputsRef.current.add(outputKey);
        newMessages.push({
          type: "claude" as const,
          content: output,
          timestamp: new Date(),
        });
        console.log("[PokéRalph][Planning] Adding new Claude message", {
          preview: `${output.substring(0, 100)}...`,
        });
      }
    }

    if (newMessages.length > 0) {
      setMessages((prev) => [...prev, ...newMessages]);
    }
  }, [planningOutput]);

  // Check for existing planning session on mount
  useEffect(() => {
    async function checkPlanningStatus() {
      try {
        const status = await getPlanningStatus();
        if (status.isPlanning) {
          setStage("conversation");
          if (status.state === "waiting_input") {
            setPlanningState("waiting_input");
          } else {
            setPlanningState("planning");
          }
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

    // Add user message BEFORE API call to avoid race condition with WebSocket responses
    setMessages([{ type: "user", content: idea, timestamp: new Date() }]);
    processedOutputsRef.current.clear(); // Reset for new session

    // Move to conversation stage immediately for better UX
    setStage("conversation");
    setPlanningState("planning");

    try {
      await startPlanning(idea);
      // Note: Claude's response will arrive via WebSocket and be handled by useEffect
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start planning";
      setError(message);
      // Reset to input stage on error
      setStage("input");
      setMessages([]);
      setPlanningState("idle");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle answering a question
  const handleAnswer = async (answer: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Add user message
      setMessages((prev) => [...prev, { type: "user", content: answer, timestamp: new Date() }]);

      await answerPlanningQuestion(answer);
      setPlanningState("planning");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send answer";
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
      const message = err instanceof Error ? err.message : "Failed to finish planning";
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
    processedOutputsRef.current.clear(); // Reset tracking for new session
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
    <div className={styles.planning}>
      {/* Progress indicator */}
      <div className={styles.progress}>
        <div className={`${styles.progressStep} ${stage === "input" ? styles.active : ""} ${stage !== "input" ? styles.completed : ""}`}>
          <span className={styles.progressNumber}>1</span>
          <span className={styles.progressLabel}>Describe Idea</span>
        </div>
        <div className={styles.progressLine} />
        <div className={`${styles.progressStep} ${stage === "conversation" ? styles.active : ""} ${stage === "review" || stage === "confirm" ? styles.completed : ""}`}>
          <span className={styles.progressNumber}>2</span>
          <span className={styles.progressLabel}>Plan with Claude</span>
        </div>
        <div className={styles.progressLine} />
        <div className={`${styles.progressStep} ${stage === "review" || stage === "confirm" ? styles.active : ""}`}>
          <span className={styles.progressNumber}>3</span>
          <span className={styles.progressLabel}>Review & Confirm</span>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className={styles.error}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className={styles.errorClose}>
            &times;
          </button>
        </div>
      )}

      {/* Stage content */}
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
        />
      )}
    </div>
  );
}
