interface LogEntry {
  timestamp: string;
  level: "error" | "warn" | "info";
  source: string;
  message: string;
  details?: string;
}

const MAX_LOGS = 300;
const logs: LogEntry[] = [];

export function addLog(level: LogEntry["level"], source: string, message: string, details?: string) {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    source,
    message,
    details
  };
  
  logs.push(entry);
  
  if (logs.length > MAX_LOGS) {
    logs.shift();
  }
  
  if (level === "error") {
    console.error(`[${source}] ${message}`, details || "");
  }
}

export function logError(source: string, message: string, error?: unknown) {
  const details = error instanceof Error 
    ? `${error.message}\n${error.stack || ""}`
    : error ? String(error) : undefined;
  addLog("error", source, message, details);
}

export function logWarn(source: string, message: string, details?: string) {
  addLog("warn", source, message, details);
}

export function logInfo(source: string, message: string, details?: string) {
  addLog("info", source, message, details);
}

export function getLogs(): LogEntry[] {
  return [...logs];
}

export function getLogsFormatted(): string {
  return logs.map(log => {
    const time = log.timestamp.replace("T", " ").slice(0, 19);
    const level = log.level.toUpperCase().padEnd(5);
    const base = `[${time}] ${level} [${log.source}] ${log.message}`;
    return log.details ? `${base}\n${log.details}` : base;
  }).join("\n");
}

export function getRecentLogsFormatted(count: number = 150): string {
  const recent = logs.slice(-count);
  return recent.map(log => {
    const time = log.timestamp.replace("T", " ").slice(0, 19);
    const level = log.level.toUpperCase().padEnd(5);
    const base = `[${time}] ${level} [${log.source}] ${log.message}`;
    return log.details ? `${base}\n${log.details}` : base;
  }).join("\n");
}

export function clearLogs() {
  logs.length = 0;
}

export function getLogStats() {
  return {
    total: logs.length,
    errors: logs.filter(l => l.level === "error").length,
    warnings: logs.filter(l => l.level === "warn").length,
    info: logs.filter(l => l.level === "info").length
  };
}
