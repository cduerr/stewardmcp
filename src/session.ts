import { query } from "@anthropic-ai/claude-code";
import type { StewardConfig } from "./types.js";

/**
 * Manages a single Claude Code Agent SDK session against the target repo.
 *
 * - Lazy warmup: the first request triggers codebase familiarization.
 * - Multi-turn: subsequent requests resume the same session via session ID.
 * - Idle timeout: after `idle_timeout_minutes` of inactivity (no requests), the session
 *   is destroyed and recreated on the next request, picking up any changes to
 *   the repo or config. The timer resets on each successful request.
 * - Queue: requests are serialized via a promise chain, so only one Agent SDK
 *   call runs at a time.
 */
export class SessionManager {
  private sessionId: string | null = null;
  private lastActiveAt: Date | null = null;
  private currentCaller: string | null = null;
  private turnCount = 0;
  private busy = false;
  private warmedUp = false;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private repoPath: string,
    private config: StewardConfig,
    private engineerMd: string,
  ) {}

  get state(): "idle" | "busy" | "uninitialized" {
    if (!this.warmedUp) return "uninitialized";
    return this.busy ? "busy" : "idle";
  }

  get caller(): string | null {
    return this.currentCaller;
  }

  get turns(): number {
    return this.turnCount;
  }

  /** Seconds since last activity, or null if no session exists. */
  get idleSeconds(): number | null {
    if (!this.lastActiveAt) return null;
    return Math.floor((Date.now() - this.lastActiveAt.getTime()) / 1000);
  }

  /**
   * Enqueue a question. If the session is busy, this waits for the current
   * request to finish before executing.
   */
  async ask(question: string, caller: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.queue = this.queue.then(async () => {
        try {
          const result = await this.processRequest(question, caller);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });
    });
  }

  private async processRequest(
    question: string,
    caller: string,
  ): Promise<string> {
    this.checkIdleTimeout();
    this.busy = true;

    try {
      if (!this.warmedUp) {
        await this.warmup();
      }

      // Prepend a caller-switch notice so the steward knows who it's talking to
      let prompt = question;
      if (this.currentCaller && this.currentCaller !== caller) {
        prompt = `[Caller switch: now speaking with "${caller}" instead of "${this.currentCaller}"]\n\n${question}`;
      }
      this.currentCaller = caller;

      const result = await this.runQuery(prompt);
      this.turnCount++;
      this.lastActiveAt = new Date();
      return result;
    } finally {
      this.busy = false;
    }
  }

  /** Send the warmup prompt to familiarize the session with the codebase. */
  private async warmup(): Promise<void> {
    await this.runQuery(this.config.warmup_prompt);
    this.lastActiveAt = new Date();
    this.warmedUp = true;
  }

  /**
   * Execute a single Agent SDK query. On the first call this creates a new
   * session; subsequent calls resume it via the captured session ID.
   */
  private async runQuery(prompt: string): Promise<string> {
    const response = query({
      prompt,
      options: {
        allowedTools: this.config.allowed_tools,
        cwd: this.repoPath,
        appendSystemPrompt: this.engineerMd,
        maxTurns: 25,
        ...(this.sessionId ? { resume: this.sessionId } : {}),
      },
    });

    let resultText = "";

    for await (const message of response) {
      // Capture the session ID from the first message so we can resume later
      if (!this.sessionId && "session_id" in message && message.session_id) {
        this.sessionId = message.session_id;
      }

      // The SDK emits a result message at the end with the final text
      if (message.type === "result" && message.subtype === "success") {
        resultText = message.result;
      }

      // Fallback: extract text from assistant messages if no result message
      if (message.type === "assistant") {
        const content = message.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "text" && !resultText) {
              resultText = block.text;
            }
          }
        }
      }
    }

    return resultText || "(no response)";
  }

  /** If the session has been idle longer than the configured timeout, tear it down. */
  private checkIdleTimeout(): void {
    if (!this.lastActiveAt) return;
    const idleMinutes =
      (Date.now() - this.lastActiveAt.getTime()) / (1000 * 60);
    if (idleMinutes >= this.config.idle_timeout_minutes) {
      this.destroy();
    }
  }

  /** Reset all session state. The next request will trigger a fresh warmup. */
  destroy(): void {
    this.sessionId = null;
    this.lastActiveAt = null;
    this.currentCaller = null;
    this.turnCount = 0;
    this.warmedUp = false;
    this.queue = Promise.resolve();
  }
}
