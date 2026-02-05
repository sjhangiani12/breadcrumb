import type { Sink, Trace, TraceEvent, TraceContext } from "../core/types.js";

/**
 * PostgreSQL client interface - compatible with pg, postgres.js, knex, etc.
 */
export interface PostgresClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
}

export interface PostgresSinkConfig {
  /** Database client instance */
  client: PostgresClient;
  /** Table name for traces (default: "breadcrumb_traces") */
  tracesTable?: string;
  /** Table name for events (default: "breadcrumb_events") */
  eventsTable?: string;
  /** Schema name (default: "public") */
  schema?: string;
}

export class PostgresSink implements Sink {
  public readonly name = "postgres";
  private readonly client: PostgresClient;
  private readonly tracesTable: string;
  private readonly eventsTable: string;
  private readonly schema: string;

  constructor(config: PostgresSinkConfig) {
    this.client = config.client;
    this.schema = config.schema ?? "public";
    this.tracesTable = config.tracesTable ?? "breadcrumb_traces";
    this.eventsTable = config.eventsTable ?? "breadcrumb_events";
  }

  private get fullTracesTable(): string {
    return `"${this.schema}"."${this.tracesTable}"`;
  }

  private get fullEventsTable(): string {
    return `"${this.schema}"."${this.eventsTable}"`;
  }

  async onTraceStart(trace: Trace, context: TraceContext): Promise<void> {
    await this.client.query(
      `INSERT INTO ${this.fullTracesTable}
       (id, status, started_at, user_id, session_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        trace.id,
        trace.status,
        trace.startedAt.toISOString(),
        context.userId ?? null,
        context.sessionId ?? null,
        JSON.stringify(trace.metadata),
      ]
    );
  }

  async onEvent(trace: Trace, event: TraceEvent): Promise<void> {
    await this.client.query(
      `INSERT INTO ${this.fullEventsTable}
       (id, trace_id, type, timestamp, data)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        event.id,
        event.traceId,
        event.type,
        event.timestamp.toISOString(),
        JSON.stringify(event.data),
      ]
    );
  }

  async onTraceEnd(trace: Trace): Promise<void> {
    await this.client.query(
      `UPDATE ${this.fullTracesTable}
       SET status = $1, ended_at = $2, metadata = $3
       WHERE id = $4`,
      [
        trace.status,
        trace.endedAt?.toISOString() ?? null,
        JSON.stringify(trace.metadata),
        trace.id,
      ]
    );
  }
}

export function postgresSink(config: PostgresSinkConfig): PostgresSink {
  return new PostgresSink(config);
}

/**
 * SQL to create the required tables
 * Run this in your migration or setup script
 */
export const createTablesSql = (schema = "public", tracesTable = "breadcrumb_traces", eventsTable = "breadcrumb_events") => `
-- Traces table
CREATE TABLE IF NOT EXISTS "${schema}"."${tracesTable}" (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  user_id TEXT,
  session_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Events table
CREATE TABLE IF NOT EXISTS "${schema}"."${eventsTable}" (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL REFERENCES "${schema}"."${tracesTable}"(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_${tracesTable}_user_id ON "${schema}"."${tracesTable}"(user_id);
CREATE INDEX IF NOT EXISTS idx_${tracesTable}_session_id ON "${schema}"."${tracesTable}"(session_id);
CREATE INDEX IF NOT EXISTS idx_${tracesTable}_started_at ON "${schema}"."${tracesTable}"(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_${eventsTable}_trace_id ON "${schema}"."${eventsTable}"(trace_id);
CREATE INDEX IF NOT EXISTS idx_${eventsTable}_type ON "${schema}"."${eventsTable}"(type);
`;
