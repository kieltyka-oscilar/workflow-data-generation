import type { Workflow, Rule, WorkflowStep, SchemaField } from '../types';

// ─── Shared type aliases for dynamic JSON data ──────────────────────────────

/** A scalar value that can appear in a JSON document or rule condition. */
type JsonScalar = string | number | boolean | null;

/** A JSON object record used throughout the engine for data in/out. */
export type JsonRecord = Record<string, unknown>;

/** An external list of values (e.g. blocklists). */
type ExternalLists = Record<string, unknown[]>;

// ─── Constraint ──────────────────────────────────────────────────────────────

export interface Constraint {
  field: string;
  operator: string;
  /** Can be a scalar, array of scalars, or null for IS NULL checks */
  value: JsonScalar | JsonScalar[];
}

// ─── extractConstraints ───────────────────────────────────────────────────────

/** 
 * Simple parser to extract constraints from Boolean logic strings.
 * e.g. "(amount >= 500) && (score < 20)" -> [{field: 'amount', op: '>=', value: 500}, ...]
 */
export function extractConstraints(condition: string, externalLists: ExternalLists = {}): Constraint[] {
  const constraints: Constraint[] = [];
  
  // If the condition has OR, pick a random branch to satisfy
  const orBranches = condition.split(/\bOR\b/i);
  const selectedBranch = orBranches[Math.floor(Math.random() * orBranches.length)];
  
  const parts = selectedBranch.split(/&&|\bAND\b/i);

  parts.forEach(part => {
    let trimmed = part.trim();
    // Remove outer parentheses
    while (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      trimmed = trimmed.slice(1, -1).trim();
    }
    
    // Numeric/String comparison: field op value
    // Matches: amount >= 500, status == 'active', score < 0.5, least(a,b) > 10
    const match = trimmed.match(/^(.+?)\s*(>=|<=|>|<|===|==|!=|=)\s*(.+)$/i);
    if (match) {
      if (match[1].includes('(')) {
        // This is a function call or complex expression, we can't easily satisfy it yet
        return;
      }
      const valStr = match[3].trim();
      let value: JsonScalar = valStr;
      
      if (valStr.toUpperCase() === 'TRUE') value = true;
      else if (valStr.toUpperCase() === 'FALSE') value = false;
      else if (valStr.startsWith("'") && valStr.endsWith("'")) value = valStr.slice(1, -1);
      else if (valStr.startsWith('"') && valStr.endsWith('"')) value = valStr.slice(1, -1);
      else if (!isNaN(Number(valStr))) value = Number(valStr);

      constraints.push({
        field: match[1].trim(),
        operator: match[2].trim().replace(/^=$/, '==').replace(/^===$/, '=='),
        value
      });
      return;
    }

    // IN operator: field IN list
    const inMatch = trimmed.match(/^([a-zA-Z0-9_.]+)\s+IN\s+(.+)$/i);
    if (inMatch) {
      const valStr = inMatch[2].trim();
      let value: JsonScalar[];
      
      if (externalLists[valStr]) {
        value = externalLists[valStr] as JsonScalar[];
      } else {
        try {
          // Try parse as JSON array
          if (valStr.startsWith('[') && valStr.endsWith(']')) {
            value = JSON.parse(valStr) as JsonScalar[];
          } else {
            // Clean quotes and split by comma
            value = valStr.split(',').map(s => s.trim().replace(/^['"](.*)['"]$/, '$1'));
          }
        } catch {
          value = [valStr]; // Fallback to treating it as a single item list
        }
      }
      
      constraints.push({
        field: inMatch[1].trim(),
        operator: 'IN',
        value
      });
      return;
    }

    // IS NULL / IS NOT NULL
    if (trimmed.includes('IS NOT NULL')) {
      const field = trimmed.replace('IS NOT NULL', '').trim();
      constraints.push({ field, operator: '!=', value: null });
    } else if (trimmed.includes('IS NULL')) {
      const field = trimmed.replace('IS NULL', '').trim();
      constraints.push({ field, operator: '==', value: null });
    }
  });

  return constraints;
}

// ─── invertConstraints ────────────────────────────────────────────────────────

/** Inverts a set of constraints to satisfy the "False" outcome of a rule */
export function invertConstraints(constraints: Constraint[]): Constraint[] {
  const opMap: Record<string, string> = {
    '==': '!=',
    '!=': '==',
    '>': '<=',
    '>=': '<',
    '<': '>=',
    '<=': '>',
    'IN': 'NOT IN',
    'NOT IN': 'IN'
  };

  return constraints.map(c => ({
    ...c,
    operator: opMap[c.operator] || c.operator
  }));
}

// ─── applyConstraints ─────────────────────────────────────────────────────────

/** Mutates obj to satisfy constraints where possible */
export function applyConstraints(obj: JsonRecord, constraints: Constraint[]): void {
  constraints.forEach(c => {
    const parts = c.field.split('.');
    let curr = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!curr[parts[i]] || typeof curr[parts[i]] !== 'object') {
            curr[parts[i]] = {};
        }
        curr = curr[parts[i]] as JsonRecord;
    }
    const lastKey = parts[parts.length - 1];

    // Small delta for boundary-hugging values (1–5 units away from the threshold)
    const smallDelta = () => Math.floor(Math.random() * 5) + 1;

    switch (c.operator) {
      case '==':
        curr[lastKey] = c.value;
        break;
      case '>':
        // Satisfy: value > threshold  →  pick threshold + small positive
        curr[lastKey] = (typeof c.value === 'number') ? c.value + smallDelta() : c.value;
        break;
      case '>=':
        // Satisfy: value >= threshold  →  pick exactly threshold or just above
        curr[lastKey] = (typeof c.value === 'number') ? c.value + Math.floor(Math.random() * smallDelta()) : c.value;
        break;
      case '<':
        // Satisfy: value < threshold  →  pick threshold - small positive (just below)
        curr[lastKey] = (typeof c.value === 'number') ? c.value - smallDelta() : c.value;
        break;
      case '<=':
        // Satisfy: value <= threshold  →  pick exactly threshold or just below
        curr[lastKey] = (typeof c.value === 'number') ? c.value - Math.floor(Math.random() * smallDelta()) : c.value;
        break;
      case '!=':
        if (curr[lastKey] === c.value) {
          curr[lastKey] = typeof c.value === 'number' ? c.value + 1 : (typeof c.value === 'string' ? c.value + '_diff' : !c.value);
        }
        break;
      case 'IN':
        if (Array.isArray(c.value) && c.value.length > 0) {
          // Common path: extractConstraints already resolves the list to an array
          curr[lastKey] = c.value[Math.floor(Math.random() * c.value.length)];
        } else if (typeof c.value === 'string') {
          const list = c.value.replace(/[()[\]]/g, '').split(',').map(s => s.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, ''));
          curr[lastKey] = list[Math.floor(Math.random() * list.length)];
        }
        break;
      case 'NOT IN':
        if (Array.isArray(c.value)) {
          // If current value is in the list, change it to something outside
          if (c.value.some(v => v === curr[lastKey])) {
            curr[lastKey] = String(curr[lastKey]) + '_not_in';
          }
        } else if (typeof c.value === 'string') {
          const list = c.value.replace(/[()[\]]/g, '').split(',').map(s => s.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, ''));
          // If current value is in the list, change it
          if (list.includes(String(curr[lastKey]))) {
            curr[lastKey] = String(curr[lastKey]) + '_not_in';
          }
        }
        break;
    }
  });
}

// ─── extractRules ─────────────────────────────────────────────────────────────

export function extractRules(workflow: Workflow): Rule[] {
  const rules: Rule[] = [];
  if (!workflow.workflows) return rules;

  workflow.workflows.forEach((wf, wfIdx) => {
    if (!wf.execution_graph?.steps) return;
    
    wf.execution_graph.steps.forEach((step, stepIdx) => {
      // Only extract rules from decision steps for now
      if (step.type === 'decision' && step.edges) {
        step.edges.forEach((edge, edgeIdx) => {
          if (edge.condition?.plaintext) {
            rules.push({
              id: `rule-${wfIdx}-${stepIdx}-${edgeIdx}`,
              description: step.name || step.label || 'Workflow Decision',
              name: edge.name || edge.condition.plaintext,
              condition: edge.condition.plaintext,
              mappedAction: edge.name || 'Decision'
            });
          }
        });
      }
    });
  });

  return rules;
}

// ─── extractActions ───────────────────────────────────────────────────────────

export function extractActions(workflow: Workflow): string[] {
  const actions = new Set<string>();
  
  if (!workflow.workflows) return [];

  workflow.workflows.forEach((wf) => {
    if (!wf.execution_graph || !wf.execution_graph.steps) return;
    
    wf.execution_graph.steps.forEach((step: WorkflowStep) => {
      if (step.type === 'action' && step.label) {
        actions.add(step.label);
      }
    });
  });

  return Array.from(actions);
}

// ─── extractRequiredLists ─────────────────────────────────────────────────────

/**
 * Identifies variables used with the IN operator that appear to be external lists/variables
 * rather than hardcoded literals.
 */
export function extractRequiredLists(rules: Rule[]): { listName: string; fieldName: string }[] {
  const lists: { listName: string; fieldName: string }[] = [];
  const seen = new Set<string>();
  rules.forEach(rule => {
    // Match 'fieldName IN someVariable' but avoid things starting with [ or ( or quotes for the variable
    const matches = rule.condition.matchAll(/([a-zA-Z0-9_.]+)\s+IN\s+([a-zA-Z_0-9.]+)/gi);
    for (const match of matches) {
      const fieldName = match[1];
      const listVar = match[2];
      if (!/['"[(]/.test(listVar) && !seen.has(listVar)) {
        lists.push({ fieldName, listName: listVar });
        seen.add(listVar);
      }
    }
  });
  return lists;
}

// ─── extractSchema ────────────────────────────────────────────────────────────

export function extractSchema(obj: JsonRecord, prefix = ''): SchemaField[] {
  if (!obj || typeof obj !== 'object') return [];
  const schema: SchemaField[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fieldType = value === null ? 'string' : (Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : typeof value);
    const field: SchemaField = {
      key: prefix ? `${prefix}.${key}` : key,
      type: fieldType as SchemaField['type'],
      example: value,
      optional: value === null
    };
    if (fieldType === 'object' && value !== null && !Array.isArray(value)) {
      field.nested = extractSchema(value as JsonRecord, field.key).reduce((acc, curr) => {
        const lastPart = curr.key.split('.').pop();
        if (lastPart) acc[lastPart] = curr;
        return acc;
      }, {} as Record<string, SchemaField>);
    }
    schema.push(field);
  }
  return schema;
}

// ─── markOptionalFromRules ────────────────────────────────────────────────────

/**
 * Analyzes rules for IS NULL / IS NOT NULL checks and marks those fields as optional in the schema.
 */
export function markOptionalFromRules(schema: SchemaField[], rules: Rule[]): SchemaField[] {
  const optionalFields = new Set<string>();
  
  rules.forEach(rule => {
    const constraints = extractConstraints(rule.condition);
    constraints.forEach(c => {
      if (c.value === null) {
        optionalFields.add(c.field);
      }
    });
  });

  const nextSchema = structuredClone(schema) as SchemaField[];
  const applyOptional = (fields: SchemaField[]) => {
    fields.forEach(f => {
      if (optionalFields.has(f.key)) {
        f.optional = true;
      }
      if (f.nested) {
        applyOptional(Object.values(f.nested));
      }
    });
  };
  
  applyOptional(nextSchema);
  return nextSchema;
}

// ─── fuzzData ─────────────────────────────────────────────────────────────────

export function fuzzData(baseSample: JsonRecord, schema?: SchemaField[], constraints?: Constraint[]): JsonRecord {
  if (baseSample === null || baseSample === undefined) {
    baseSample = {}; 
  }
  
  // 1. Initial generic fuzzing
  const fuzzed: JsonRecord = {};
  if (!schema) {
    if (typeof baseSample === 'object' && !Array.isArray(baseSample)) {
      for (const key in baseSample) {
        if (typeof baseSample[key] === 'number') {
          const modifier = 0.2 + (Math.random() * 1.6);
          fuzzed[key] = Math.round((baseSample[key] as number) * modifier);
        } else if (typeof baseSample[key] === 'boolean') {
          fuzzed[key] = Math.random() > 0.5;
        } else if (typeof baseSample[key] === 'object' && baseSample[key] !== null) {
          fuzzed[key] = fuzzData(baseSample[key] as JsonRecord);
        } else {
          fuzzed[key] = baseSample[key];
        }
      }
    }
  } else {
    // Schema-aware generation
    for (const field of schema) {
      const keyParts = field.key.split('.');
      const key = keyParts[keyParts.length - 1];
      const baseValue = baseSample ? baseSample[key] : undefined;

      // Handle optional fields with a 10% chance of being null
      if (field.optional && Math.random() < 0.1) {
        fuzzed[key] = null;
        continue;
      }

      if (field.config?.values?.length) {
        fuzzed[key] = field.config.values[Math.floor(Math.random() * field.config.values.length)] as JsonScalar;
        continue;
      }

      if (field.type === 'object' && field.nested) {
        fuzzed[key] = fuzzData((baseValue || {}) as JsonRecord, Object.values(field.nested));
        continue;
      }

      if (field.type === 'number') {
        const min = field.config?.min ?? 0;
        const max = field.config?.max ?? 1000000;
        fuzzed[key] = Math.floor(Math.random() * (max - min + 1)) + min;
      } else if (field.type === 'boolean') {
        fuzzed[key] = Math.random() > 0.5;
      } else if (field.type === 'string') {
        fuzzed[key] = typeof baseValue === 'string' ? baseValue : ((field.example as string) || 'sample_string');
      } else {
        fuzzed[key] = baseValue ?? null;
      }
    }
  }

  // 2. Apply constraints to specifically hit rule targets
  if (constraints && constraints.length > 0) {
    applyConstraints(fuzzed, constraints);
  }

  return fuzzed;
}

// ─── evaluateCondition ────────────────────────────────────────────────────────

export function evaluateCondition(condition: string, obj: JsonRecord, externalLists: ExternalLists = {}): boolean {
  try {
    const jsCondition = condition
      .replace(/\bAND\b/g, '&&')
      .replace(/\bOR\b/g, '||')
      .replace(/\bIS NOT NULL\b/g, '!== null')
      .replace(/\bIS NULL\b/g, '=== null')
      .replace(/\bTRUE\b/gi, 'true')
      .replace(/\bFALSE\b/gi, 'false')
      .replace(/=(?!=)/g, '===')
      .replace(/([^a-zA-Z0-9.])(\d+)/g, '$1Number($2)') // Ensure numbers compared correctly
      .replace(/([a-zA-Z_0-9.]+)\s+IN\s+([a-zA-Z_0-9.]+)/g, '($2 || []).includes($1)')
      .replace(/split\(([^,]+),\s*'([^']+)'\)\[(\d+)\]/g, '($1 || "").split("$2")[$3]');
      
    // Create an executable context
    const keys = ['least', 'greatest', 'abs', 'round', 'floor', 'ceil', ...Object.keys(obj), ...Object.keys(externalLists)];
    const values = [
      Math.min, Math.max, Math.abs, Math.round, Math.floor, Math.ceil, ...Object.values(obj), ...Object.values(externalLists)
    ];
    const fn = new Function(...keys, `return ${jsCondition};`) as (...args: unknown[]) => boolean;
    return fn(...values);
  } catch {
    return false;
  }
}

// ─── determineOutcomes ────────────────────────────────────────────────────────

export function determineOutcomes(obj: JsonRecord, rules: Rule[], externalLists: ExternalLists = {}): string[] {
  const matches: string[] = [];
  for (const rule of rules) {
    if (evaluateCondition(rule.condition, obj, externalLists)) {
      matches.push(rule.description || 'Manual Review');
    }
  }
  if (matches.length === 0) return ['Default (No Match)'];
  // Return unique matches
  return Array.from(new Set(matches));
}

// ─── pruneToSchema ────────────────────────────────────────────────────────────

export function pruneToSchema(obj: JsonRecord, schema: SchemaField[]): JsonRecord {
  const pruned: JsonRecord = {};
  
  schema.forEach(field => {
    const parts = field.key.split('.');
    let source: JsonRecord = obj;
    let target: JsonRecord = pruned;
    
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (source === null || typeof source !== 'object' || source[part] === undefined) {
            return;
        }
        if (target[part] === undefined) target[part] = {};
        source = source[part] as JsonRecord;
        target = target[part] as JsonRecord;
    }
    
    const lastKey = parts[parts.length - 1];
    if (source !== null && typeof source === 'object' && source[lastKey] !== undefined) {
        target[lastKey] = source[lastKey];
    }
  });
  
  return pruned;
}
