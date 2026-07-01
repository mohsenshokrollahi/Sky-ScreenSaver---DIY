import { appendFileSync, existsSync, mkdirSync, renameSync, statSync, unlinkSync } from "fs";
import { dirname, join } from "path";

export interface LogEntry {
  ts: string;
  level: "info" | "warn" | "error";
  msg: string;
}

export type LogLevel = "info" | "warn" | "error";

export interface LoggerOptions {
  /** Test injection hook — when provided, log lines are written here instead of disk. */
  sink?: (line: string) => void;
}

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_MAX_FILES = 5;

export class Logger {
  private readonly logPath: string;
  private readonly maxSizeBytes: number;
  private readonly maxFiles: number;
  private readonly sink: ((line: string) => void) | undefined;

  constructor(
    logDir: string,
    maxSizeBytes: number = DEFAULT_MAX_SIZE_BYTES,
    maxFiles: number = DEFAULT_MAX_FILES,
    options?: LoggerOptions,
  ) {
    this.logPath = join(logDir, "server.log");
    this.maxSizeBytes = maxSizeBytes;
    this.maxFiles = maxFiles;
    this.sink = options?.sink;

    if (!this.sink) {
      this.ensureDir();
    }
  }

  info(msg: string): void {
    this.write("info", msg);
  }

  warn(msg: string): void {
    this.write("warn", msg);
  }

  error(msg: string): void {
    this.write("error", msg);
  }

  private write(level: LogLevel, msg: string): void {
    const entry: LogEntry = {
      ts: new Date().toISOString(),
      level,
      msg,
    };
    const line = JSON.stringify(entry) + "\n";

    if (this.sink) {
      this.sink(line);
      return;
    }

    try {
      this.rotate();
      appendFileSync(this.logPath, line, "utf8");
    } catch {
      process.stderr.write(line);
    }
  }

  private rotate(): void {
    try {
      if (!existsSync(this.logPath)) return;

      const stat = statSync(this.logPath);
      if (stat.size < this.maxSizeBytes) return;

      // Delete the oldest rotated file if it exists (server.log.{maxFiles})
      const oldest = `${this.logPath}.${this.maxFiles}`;
      if (existsSync(oldest)) {
        unlinkSync(oldest);
      }

      // Shift existing rotated files up: server.log.(N-1) → server.log.N
      for (let i = this.maxFiles - 1; i >= 1; i--) {
        const from = `${this.logPath}.${i}`;
        const to = `${this.logPath}.${i + 1}`;
        if (existsSync(from)) {
          renameSync(from, to);
        }
      }

      // Rename current log: server.log → server.log.1
      renameSync(this.logPath, `${this.logPath}.1`);
    } catch {
      // Rotation failure is non-fatal — continue writing to existing log
    }
  }

  private ensureDir(): void {
    try {
      mkdirSync(dirname(this.logPath), { recursive: true });
    } catch {
      // If dir creation fails, writes will fall back to stderr via the write() catch
    }
  }
}
