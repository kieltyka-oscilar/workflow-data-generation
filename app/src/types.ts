export interface Workflow {
  id: string;
  name: string;
  integrations?: unknown[];
  actions?: Action[];
  enrichments?: unknown[];
  workflows?: WorkflowExecutionGraph[];
}

export interface Action {
  id: string;
  name: string;
  intent: string;
}

export interface WorkflowExecutionGraph {
  id: string;
  name: string;
  execution_graph: {
    steps: WorkflowStep[];
    start_step_id?: string | number;
  };
}

export interface WorkflowStep {
  id?: string | number;
  type: string;
  label?: string;
  name?: string;
  edges?: Edge[];
  actions?: { action_id: string }[];
  default_step_id?: number;
}

export interface Edge {
  name?: string;
  condition?: {
    plaintext: string;
  };
  true_edge_id?: number;
  next_step_id?: number;
}

export interface Rule {
  id: string;
  description: string; // This is now the CATEGORY (Approve/Deny)
  name: string; // This is the RULE NAME (plaintext condition)
  condition: string;
  mappedAction?: string;
}

export interface SchemaField {
  key: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  optional?: boolean;
  nested?: Record<string, SchemaField>;
  example?: unknown;
  config?: {
    min?: number;
    max?: number;
    values?: unknown[];
  }
}

export interface GeneratedConfig {
  [actionName: string]: number; // Map of outcome name to count of items to generate
}

export interface ProjectState {
  workflow: Workflow | null;
  rules: Rule[];
  sampleData: Record<string, unknown>[];
  schema: SchemaField[];
  config: GeneratedConfig;
  externalLists: Record<string, unknown[]>;
  currentStep: number;
}
