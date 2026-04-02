// Auto-generated — do not edit. Provides types for the Tasklet preview bridge API.

interface WriteFileResult {
  readonly ok: true;
}

interface SqlExecResult {
  readonly rowsAffected: number;
}

interface RunCommandResult {
  readonly log: string;
  readonly exitCode: number;
}

interface TaskletApi {
  /** Send a chat message to the agent. Fire-and-forget — resolves when queued. */
  readonly sendMessageToAgent: (message: string) => Promise<{ readonly status: string } | null>;
  /** Call a host tool by name. Response is auto-parsed (see runTool normalization docs). */
  readonly runTool: (toolName: string, args: unknown) => Promise<unknown>;
  /** Read a text file from disk. Returns raw string content. For directories, returns ls listing. */
  readonly readFileFromDisk: (filePath: string) => Promise<string>;
  /** Read a binary file from disk. Returns base64-encoded string. */
  readonly readBinaryFileFromDisk: (filePath: string) => Promise<string>;
  /** Write content to a file on disk. Creates parent directories as needed. */
  readonly writeFileToDisk: (filePath: string, content: string) => Promise<WriteFileResult>;
  /** Run a SELECT query. Returns an array of row objects. */
  readonly sqlQuery: (query: string) => Promise<ReadonlyArray<Record<string, unknown>>>;
  /** Run a write query (INSERT, UPDATE, DELETE, CREATE TABLE). */
  readonly sqlExec: (query: string) => Promise<SqlExecResult>;
  /** Run a shell command in the sandbox. */
  readonly runCommand: (command: string, timeout?: number) => Promise<RunCommandResult>;
}

interface Window {
  readonly tasklet: TaskletApi;
}
