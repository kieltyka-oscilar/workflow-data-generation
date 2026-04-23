import { faker } from '@faker-js/faker';
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

export function extractConstraints(condition: string, externalLists: ExternalLists = {}): Constraint[] {
  const constraints: Constraint[] = [];

  /**
   * Splits a string on a keyword (AND / OR) but only at the top-level —
   * occurrences inside parentheses are left intact.
   */
  function splitTopLevel(text: string, keyword: RegExp): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    // Walk character by character, tracking paren depth
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '(') { depth++; current += ch; continue; }
      if (ch === ')') { depth--; current += ch; continue; }

      if (depth === 0) {
        // Check for keyword match at this position
        const remaining = text.slice(i);
        const m = remaining.match(keyword);
        if (m && m.index === 0) {
          parts.push(current);
          current = '';
          i += m[0].length - 1; // skip past the keyword
          continue;
        }
      }
      current += ch;
    }
    if (current) parts.push(current);
    return parts;
  }

  // Split on OR (top-level only) and pick a random branch
  const orBranches = splitTopLevel(condition, /\bOR\b/i);
  const selectedBranch = orBranches[Math.floor(Math.random() * orBranches.length)];

  // Split on AND / && (top-level only)
  const parts = splitTopLevel(selectedBranch, /&&|\bAND\b/i);

  parts.forEach(part => {
    let trimmed = part.trim();

    // Detect and strip NOT prefix (negates the resulting constraint)
    let negated = false;
    const notPrefix = trimmed.match(/^NOT\s+/i);
    if (notPrefix) {
      negated = true;
      trimmed = trimmed.slice(notPrefix[0].length).trim();
    }

    // Remove outer parentheses (balanced)
    while (trimmed.startsWith('(') && trimmed.endsWith(')')) {
      // Verify the parens are actually balanced (not just coincidental)
      let depth = 0;
      let balanced = true;
      for (let i = 0; i < trimmed.length - 1; i++) {
        if (trimmed[i] === '(') depth++;
        else if (trimmed[i] === ')') depth--;
        if (depth === 0) { balanced = false; break; }
      }
      if (!balanced) break;
      trimmed = trimmed.slice(1, -1).trim();
    }

    // If trimmed still contains top-level AND (e.g. from NOT(a AND b)),
    // recurse into the inner parts
    const innerParts = splitTopLevel(trimmed, /&&|\bAND\b/i);
    if (innerParts.length > 1) {
      // Process each inner part as its own constraint
      innerParts.forEach(inner => {
        let innerTrimmed = inner.trim();
        while (innerTrimmed.startsWith('(') && innerTrimmed.endsWith(')')) {
          innerTrimmed = innerTrimmed.slice(1, -1).trim();
        }
        const parsed = parseSingleConstraint(innerTrimmed, negated, externalLists);
        if (parsed) constraints.push(parsed);
      });
      return;
    }
    
    const parsed = parseSingleConstraint(trimmed, negated, externalLists);
    if (parsed) constraints.push(parsed);
  });

  return constraints;
}

/** Parse a single comparison / IN / IS NULL expression into a Constraint */
function parseSingleConstraint(
  trimmed: string,
  negated: boolean,
  externalLists: ExternalLists
): Constraint | null {
  // Numeric/String comparison: field op value
  const match = trimmed.match(/^(.+?)\s*(>=|<=|>|<|===|==|!=|=)\s*(.+)$/i);
  if (match) {
    let fieldExpr = match[1].trim();

    // Unwrap simple function wrappers: lower(field), upper(field), trim(field)
    const funcMatch = fieldExpr.match(/^(?:lower|upper|trim)\s*\(\s*([a-zA-Z0-9_.]+)\s*\)$/i);
    if (funcMatch) {
      fieldExpr = funcMatch[1];
    } else if (fieldExpr.includes('(')) {
      return null; // Complex expression we can't satisfy — skip
    }

    // Reject compound expressions (e.g. "deviceRiskScore + behaviorRiskScore")
    if (/[+\-*/]/.test(fieldExpr)) {
      return null;
    }

    // Validate: field must be a simple identifier (letters, digits, dots, underscores)
    if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(fieldExpr)) {
      return null;
    }

    const valStr = match[3].trim();
    let value: JsonScalar = valStr;
    
    if (valStr.toUpperCase() === 'TRUE') value = true;
    else if (valStr.toUpperCase() === 'FALSE') value = false;
    else if (valStr.startsWith("'") && valStr.endsWith("'")) value = valStr.slice(1, -1);
    else if (valStr.startsWith('"') && valStr.endsWith('"')) value = valStr.slice(1, -1);
    else if (!isNaN(Number(valStr))) value = Number(valStr);

    let operator = match[2].trim().replace(/^=$/, '==').replace(/^===$/, '==');

    // If the expression was NOT(...), invert the operator
    if (negated) {
      const invertOp: Record<string, string> = {
        '==': '!=', '!=': '==', '>': '<=', '>=': '<', '<': '>=', '<=': '>',
      };
      operator = invertOp[operator] || operator;
    }

    return { field: fieldExpr, operator, value };
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
        if (valStr.startsWith('[') && valStr.endsWith(']')) {
          value = JSON.parse(valStr) as JsonScalar[];
        } else {
          value = valStr.split(',').map(s => s.trim().replace(/^['"](.*)['"$]$/, '$1'));
        }
      } catch {
        value = [valStr];
      }
    }
    
    return {
      field: inMatch[1].trim(),
      operator: negated ? 'NOT IN' : 'IN',
      value
    };
  }

  // IS NULL / IS NOT NULL
  if (trimmed.includes('IS NOT NULL')) {
    const field = trimmed.replace('IS NOT NULL', '').trim();
    const op = negated ? '==' : '!=';
    return { field, operator: op, value: null };
  } else if (trimmed.includes('IS NULL')) {
    const field = trimmed.replace('IS NULL', '').trim();
    const op = negated ? '!=' : '==';
    return { field, operator: op, value: null };
  }

  return null;
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

// ─── buildAntiConstraints ─────────────────────────────────────────────────────

/**
 * When multiple anti-constraints target the same field, keeps only the most
 * restrictive numeric bound so they don't overwrite each other.
 */
function deduplicateConstraints(constraints: Constraint[]): Constraint[] {
  const byField = new Map<string, Constraint[]>();
  for (const c of constraints) {
    const arr = byField.get(c.field) || [];
    arr.push(c);
    byField.set(c.field, arr);
  }

  const result: Constraint[] = [];
  for (const [, group] of byField) {
    if (group.length === 1) { result.push(group[0]); continue; }

    const upper = group.filter(c => (c.operator === '<' || c.operator === '<=') && typeof c.value === 'number');
    const lower = group.filter(c => (c.operator === '>' || c.operator === '>=') && typeof c.value === 'number');
    const others = group.filter(c => !['<', '<=', '>', '>='].includes(c.operator) || typeof c.value !== 'number');

    if (upper.length > 0) {
      upper.sort((a, b) => (a.value as number) - (b.value as number));
      result.push(upper[0]); // tightest upper bound
    }
    if (lower.length > 0) {
      lower.sort((a, b) => (b.value as number) - (a.value as number));
      result.push(lower[0]); // tightest lower bound
    }
    result.push(...others);
  }
  return result;
}

/**
 * Builds constraints that prevent triggering rules for OTHER outcomes.
 * For each conflicting rule (AND-based), inverting its first parseable
 * constraint is sufficient to prevent that rule from matching.
 * 
 * For rules with additive expressions (e.g. "a + b > 60"), we constrain
 * each individual field to stay below threshold/N so their sum can't exceed it.
 */
export function buildAntiConstraints(
  targetOutcome: string,
  allRules: Rule[],
  externalLists: ExternalLists = {}
): Constraint[] {
  const conflicting = allRules.filter(r => r.isTerminal && r.description !== targetOutcome);
  const anti: Constraint[] = [];

  for (const rule of conflicting) {
    const rc = extractConstraints(rule.condition, externalLists);
    if (rc.length > 0) {
      // Inverting just the first constraint breaks the AND chain
      anti.push(...invertConstraints([rc[0]]));
    } else {
      // Fallback: try to handle additive expressions like "a + b > 60"
      // Pattern: field1 + field2 [+ fieldN...] > threshold
      const additiveMatch = rule.condition.match(
        /^([\w.]+(?:\s*\+\s*[\w.]+)+)\s*(>|>=)\s*([\d.]+)$/
      );
      if (additiveMatch) {
        const fields = additiveMatch[1].split(/\s*\+\s*/).map(f => f.trim());
        const threshold = Number(additiveMatch[3]);
        // Constrain each field to threshold / N so their sum stays under
        const perField = Math.floor(threshold / fields.length);
        for (const field of fields) {
          anti.push({ field, operator: '<=', value: perField });
        }
      }
    }
  }

  return deduplicateConstraints(anti);
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
          curr[lastKey] = typeof c.value === 'number' ? c.value + 1 : (typeof c.value === 'string' ? 'safe_fallback_value' : !c.value);
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
            curr[lastKey] = 'safe_fallback_value';
          }
        } else if (typeof c.value === 'string') {
          const list = c.value.replace(/[()[\]]/g, '').split(',').map(s => s.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, ''));
          // If current value is in the list, change it
          if (list.includes(String(curr[lastKey]))) {
            curr[lastKey] = 'safe_fallback_value';
          }
        }
        break;
    }
  });
}

// ─── simulateWorkflow ─────────────────────────────────────────────────────────

/**
 * Walk the execution graph with a record and return the terminal action name
 * that the record would reach. This simulates the real workflow evaluation,
 * handling loops, intermediate decisions, and multi-step routing.
 */
export function simulateWorkflow(
  record: JsonRecord,
  workflow: Workflow
): string | null {
  if (!workflow.workflows) return null;

  // Clone the record so we don't pollute the actual generated data with local variable assignments
  const simRecord = { ...record };

  // Use the first workflow that has steps (skip trivial ones)
  const wfGraph = workflow.workflows.find(
    wf => (wf.execution_graph?.steps?.length ?? 0) > 2
  );
  if (!wfGraph?.execution_graph?.steps) return null;

  const steps = wfGraph.execution_graph.steps;
  const actionsRegistry = new Map<string, string>();
  workflow.actions?.forEach(a => actionsRegistry.set(a.id, a.name));

  // Find the first decision step as entry point (skip assign/integration steps)
  let currentStepIdx = 0;
  const visited = new Set<string>(); // Track visits to prevent infinite loops
  const MAX_ITERATIONS = 50;
  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    if (currentStepIdx < 0 || currentStepIdx >= steps.length) return null;
    const step = steps[currentStepIdx];

    // Visit tracking: stepIdx + iteration to allow controlled revisits
    const visitKey = `${currentStepIdx}:${iterations}`;
    if (visited.has(`${currentStepIdx}`) && visited.size > steps.length) {
      return null; // Prevent truly infinite loops
    }
    visited.add(`${currentStepIdx}`);

    if (step.type === 'action') {
      // Terminal: resolve the action name
      const actionId = step.actions?.[0]?.action_id;
      if (actionId) {
        return actionsRegistry.get(actionId) ?? step.label ?? step.name ?? 'Unknown';
      }
      return step.label ?? step.name ?? 'Unknown';
    }

    const processAssignments = (assignments?: any[]) => {
      for (const a of assignments || []) {
        if (!a || !a.name || !a.value) continue;
        if (a.value.type === 'constant') {
          let val: any = a.value.constant_value;
          if (val === 'true') val = true;
          else if (val === 'false') val = false;
          else if (typeof val === 'string' && !isNaN(Number(val)) && val.trim() !== '') {
            val = Number(val);
          }
          simRecord[a.name] = val;
        } else if (a.value.type === 'math_function' && a.value.plaintext) {
          const match = a.value.plaintext.match(/^([a-zA-Z0-9_.]+)\s*([+\-*/])\s*([0-9.]+)$/);
          if (match) {
            const field = match[1];
            const op = match[2];
            const num = Number(match[3]);
            const current = Number(simRecord[field] || 0);
            if (op === '+') simRecord[a.name] = current + num;
            else if (op === '-') simRecord[a.name] = current - num;
            else if (op === '*') simRecord[a.name] = current * num;
            else if (op === '/') simRecord[a.name] = current / num;
          } else {
            simRecord[a.name] = 'MOCKED_VALUE';
          }
        } else {
          // Mock non-constant assignments to ensure IS NULL checks fail properly for populated local vars
          simRecord[a.name] = 'MOCKED_VALUE';
        }
      }
    };

    // Process step-level entry assignments
    processAssignments(step.assignments);

    if (step.type === 'decision') {
      let matched = false;

      for (const edge of (step.edges ?? [])) {
        if (!edge.condition?.plaintext) continue;
        if (evaluateSimulatedCondition(simRecord, edge.condition.plaintext)) {
          matched = true;
          processAssignments(edge.assignments);
          if (edge.next_step_id !== undefined) {
            currentStepIdx = edge.next_step_id;
          } else if (step.default_step_id !== undefined) {
            currentStepIdx = step.default_step_id;
          } else {
            return null; // Dead end branch with no default fallback
          }
          break;
        }

        // Check else_if_edges
        if (edge.else_if_edges) {
          let elseIfMatched = false;
          for (const elseIf of edge.else_if_edges) {
            if (!elseIf.condition?.plaintext) continue;
            if (evaluateSimulatedCondition(simRecord, elseIf.condition.plaintext)) {
              matched = true;
              elseIfMatched = true;
              processAssignments(elseIf.assignments);
              if (elseIf.next_step_id !== undefined) {
                currentStepIdx = elseIf.next_step_id;
              } else if (step.default_step_id !== undefined) {
                currentStepIdx = step.default_step_id;
              } else {
                return null; // Dead end branch with no default fallback
              }
              break;
            }
          }
          if (elseIfMatched) break;
        }
      }

      if (!matched) {
        // Default path
        processAssignments(step.default_assignments);
        if (step.default_step_id !== undefined) {
          currentStepIdx = step.default_step_id;
        } else {
          // No default, move to next step
          currentStepIdx++;
        }
      }
      continue;
    }

    // For all other step types (assign, call_integration, call_workflow)
    if (step.default_step_id !== undefined) {
      currentStepIdx = step.default_step_id;
    } else {
      currentStepIdx++;
    }
  }

  return null; // Max iterations reached
}

/**
 * Evaluate a plaintext condition against a record.
 * Returns true if the condition is satisfied.
 */
function evaluateSimulatedCondition(record: JsonRecord, condition: string): boolean {
  // Handle OR at top level
  const orParts = splitConditionTopLevel(condition, /\bOR\b/i);
  if (orParts.length > 1) {
    return orParts.some(part => evaluateSimulatedCondition(record, part.trim()));
  }

  // Handle AND at top level
  const andParts = splitConditionTopLevel(condition, /&&|\bAND\b/i);
  if (andParts.length > 1) {
    return andParts.every(part => evaluateSimulatedCondition(record, part.trim()));
  }

  let expr = condition.trim();

  // Handle NOT prefix
  let negated = false;
  const notMatch = expr.match(/^NOT\s+/i);
  if (notMatch) {
    negated = true;
    expr = expr.slice(notMatch[0].length).trim();
  }

  // Strip balanced outer parens
  while (expr.startsWith('(') && expr.endsWith(')')) {
    let depth = 0;
    let balanced = true;
    for (let i = 0; i < expr.length - 1; i++) {
      if (expr[i] === '(') depth++;
      else if (expr[i] === ')') depth--;
      if (depth === 0) { balanced = false; break; }
    }
    if (!balanced) break;
    expr = expr.slice(1, -1).trim();
  }

  // If after stripping we have compound logic again, recurse
  const innerOr = splitConditionTopLevel(expr, /\bOR\b/i);
  if (innerOr.length > 1) {
    const result = innerOr.some(p => evaluateSimulatedCondition(record, p.trim()));
    return negated ? !result : result;
  }
  const innerAnd = splitConditionTopLevel(expr, /&&|\bAND\b/i);
  if (innerAnd.length > 1) {
    const result = innerAnd.every(p => evaluateSimulatedCondition(record, p.trim()));
    return negated ? !result : result;
  }

  const result = evaluateSingle(record, expr);
  return negated ? !result : result;
}

/** Paren-aware split (same logic as extractConstraints' splitTopLevel) */
function splitConditionTopLevel(text: string, keyword: RegExp): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') { depth++; current += ch; continue; }
    if (ch === ')') { depth--; current += ch; continue; }
    if (depth === 0) {
      const remaining = text.slice(i);
      const m = remaining.match(keyword);
      if (m && m.index === 0) {
        parts.push(current);
        current = '';
        i += m[0].length - 1;
        continue;
      }
    }
    current += ch;
  }
  if (current) parts.push(current);
  return parts;
}

/** Resolve a dot-path like "emailage.risk_rating" from a nested record */
function resolveFieldValue(record: JsonRecord, fieldPath: string): unknown {
  const parts = fieldPath.split('.');
  let current: unknown = record;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as JsonRecord)[part];
  }
  return current;
}

/** Evaluate a single atomic expression (no AND/OR) */
function evaluateSingle(record: JsonRecord, expr: string): boolean {
  // IS NOT NULL
  if (/IS NOT NULL$/i.test(expr)) {
    const field = expr.replace(/IS NOT NULL$/i, '').trim();
    const val = resolveFieldValue(record, field);
    return val !== null && val !== undefined;
  }
  // IS NULL
  if (/IS NULL$/i.test(expr)) {
    const field = expr.replace(/IS NULL$/i, '').trim();
    const val = resolveFieldValue(record, field);
    return val === null || val === undefined;
  }

  // Comparison: field op value
  const cmpMatch = expr.match(/^(.+?)\s*(>=|<=|>|<|===|==|!=|=)\s*(.+)$/);
  if (cmpMatch) {
    let fieldExpr = cmpMatch[1].trim();
    const op = cmpMatch[2].trim();
    let rhsStr = cmpMatch[3].trim();

    // Unwrap lower/upper/trim
    const funcM = fieldExpr.match(/^(lower|upper|trim)\s*\(\s*(.+?)\s*\)$/i);
    let transform: ((s: string) => string) | null = null;
    if (funcM) {
      const fn = funcM[1].toLowerCase();
      if (fn === 'lower') transform = s => s.toLowerCase();
      else if (fn === 'upper') transform = s => s.toUpperCase();
      else if (fn === 'trim') transform = s => s.trim();
      fieldExpr = funcM[2];
    }

    // Handle additive expressions: field1 + field2
    let lhsValue: unknown;
    if (fieldExpr.includes('+')) {
      const fields = fieldExpr.split(/\s*\+\s*/);
      let sum = 0;
      for (const f of fields) {
        const v = resolveFieldValue(record, f.trim());
        sum += typeof v === 'number' ? v : 0;
      }
      lhsValue = sum;
    } else {
      lhsValue = resolveFieldValue(record, fieldExpr);
    }

    if (transform && typeof lhsValue === 'string') {
      lhsValue = transform(lhsValue);
    }

    // Parse RHS value
    let rhsValue: unknown = rhsStr;
    if (rhsStr.toUpperCase() === 'TRUE') rhsValue = true;
    else if (rhsStr.toUpperCase() === 'FALSE') rhsValue = false;
    else if (rhsStr.startsWith("'") && rhsStr.endsWith("'")) rhsValue = rhsStr.slice(1, -1);
    else if (rhsStr.startsWith('"') && rhsStr.endsWith('"')) rhsValue = rhsStr.slice(1, -1);
    else if (!isNaN(Number(rhsStr))) rhsValue = Number(rhsStr);

    return compareValues(lhsValue, op, rhsValue);
  }

  // If we can't parse, assume false (safe default)
  return false;
}

function compareValues(lhs: unknown, op: string, rhs: unknown): boolean {
  // Coerce: if one side is number and the other is a numeric string, convert
  if (typeof lhs === 'number' && typeof rhs === 'string' && !isNaN(Number(rhs))) rhs = Number(rhs);
  if (typeof rhs === 'number' && typeof lhs === 'string' && !isNaN(Number(lhs))) lhs = Number(lhs);

  switch (op) {
    case '=':
    case '==':
    case '===':
      return lhs === rhs;
    case '!=':
      return lhs !== rhs;
    case '>':
      return typeof lhs === 'number' && typeof rhs === 'number' ? lhs > rhs : false;
    case '>=':
      return typeof lhs === 'number' && typeof rhs === 'number' ? lhs >= rhs : false;
    case '<':
      return typeof lhs === 'number' && typeof rhs === 'number' ? lhs < rhs : false;
    case '<=':
      return typeof lhs === 'number' && typeof rhs === 'number' ? lhs <= rhs : false;
    default:
      return false;
  }
}

// ─── extractRules ─────────────────────────────────────────────────────────────

export function extractRules(workflow: Workflow): Rule[] {
  const rules: Rule[] = [];
  if (!workflow.workflows) return rules;

  // Build a lookup map of global action names
  const actionsRegistry = new Map<string, string>();
  workflow.actions?.forEach(a => {
    actionsRegistry.set(a.id, a.name);
  });

  workflow.workflows.forEach((wf, wfIdx) => {
    if (!wf.execution_graph?.steps) return;
    const steps = wf.execution_graph.steps;

    /** Resolve a step index to an action name + terminal flag */
    const resolveAction = (targetIndex?: number): { actionName: string; isTerminal: boolean } | null => {
      if (targetIndex === undefined || !steps[targetIndex]) return null;
      const targetStep = steps[targetIndex];
      if (targetStep.type === 'action' && targetStep.actions?.[0]) {
        const actionId = targetStep.actions[0].action_id;
        const name = actionsRegistry.get(actionId)
          ?? targetStep.label
          ?? targetStep.name
          ?? 'Workflow Decision';
        return { actionName: name, isTerminal: true };
      }
      return null;
    };

    steps.forEach((step, stepIdx) => {
      if (step.type !== 'decision' || !step.edges) return;

      // Collect all plaintext conditions from this decision step
      // so we can build a negated "default" rule later.
      const allConditions: string[] = [];

      step.edges.forEach((edge, edgeIdx) => {
        if (!edge.condition?.plaintext) return;

        const conditionText = edge.condition.plaintext;
        allConditions.push(conditionText);

        // --- Primary edge ---
        const primary = resolveAction(edge.next_step_id) ?? resolveAction(edge.true_edge_id);
        const actionName = primary?.actionName ?? step.label ?? step.name ?? 'Workflow Decision';
        const isTerminal = primary?.isTerminal ?? false;

        rules.push({
          id: `rule-${wfIdx}-${stepIdx}-${edgeIdx}`,
          description: actionName,
          name: edge.name || conditionText,
          condition: conditionText,
          mappedAction: actionName,
          isTerminal
        });

        // --- Else-if edges (nested branches) ---
        if (edge.else_if_edges) {
          edge.else_if_edges.forEach((elseIf, elseIfIdx) => {
            if (!elseIf.condition?.plaintext) return;

            const elseIfCondition = elseIf.condition.plaintext;
            allConditions.push(elseIfCondition);

            const elseIfAction = resolveAction(elseIf.next_step_id);
            const elseIfActionName = elseIfAction?.actionName ?? step.label ?? step.name ?? 'Workflow Decision';
            const elseIfTerminal = elseIfAction?.isTerminal ?? false;

            rules.push({
              id: `rule-${wfIdx}-${stepIdx}-${edgeIdx}-elif-${elseIfIdx}`,
              description: elseIfActionName,
              name: elseIfCondition,
              condition: elseIfCondition,
              mappedAction: elseIfActionName,
              isTerminal: elseIfTerminal
            });
          });
        }
      });

      // --- Default / else path ---
      // If the decision step has a default_step_id that points to a terminal
      // action, create a rule whose condition is the negation of ALL the
      // explicit edge conditions (i.e., "none of the above matched").
      if (step.default_step_id !== undefined && allConditions.length > 0) {
        const defaultAction = resolveAction(step.default_step_id);
        if (defaultAction?.isTerminal) {
          const negatedParts = allConditions.map(c => `NOT (${c})`);
          const defaultCondition = negatedParts.join(' AND ');

          rules.push({
            id: `rule-${wfIdx}-${stepIdx}-default`,
            description: defaultAction.actionName,
            name: `Default: ${defaultAction.actionName}`,
            condition: defaultCondition,
            mappedAction: defaultAction.actionName,
            isTerminal: true
          });
        }
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

// ─── getFakerValue ────────────────────────────────────────────────────────────

/** Generates context-aware string values using faker.js */
function getFakerValue(key: string, baseValue?: string, example?: string): string {
  const norm = key.toLowerCase();
  
  // Check if baseValue or example matches MM/DD/YYYY format
  const isMMDDYYYY = (val?: string) => val && /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(val);
  if (isMMDDYYYY(baseValue) || isMMDDYYYY(example)) {
    const d = faker.date.past();
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
  }
  
  if (norm.includes('first_name')) return faker.person.firstName();
  if (norm.includes('last_name')) return faker.person.lastName();
  if (norm.includes('email')) return faker.internet.email();
  if (norm.includes('phone')) return faker.phone.number({ style: 'national' });
  if (norm.includes('address_street1') || norm.includes('street')) return faker.location.streetAddress();
  if (norm.includes('city')) return faker.location.city();
  if (norm.includes('state')) return faker.location.state({ abbreviated: true });
  if (norm.includes('zip')) return faker.location.zipCode();
  if (norm.includes('country_code')) return faker.location.countryCode('alpha-2');
  if (norm.includes('ssn') || norm.includes('social')) return faker.helpers.fromRegExp(/[0-9]{3}-[0-9]{2}-[0-9]{4}/);
  if (norm.includes('dob') || norm.includes('birth')) return faker.date.birthdate().toISOString().split('T')[0];
  if (norm.includes('ip_address')) return faker.internet.ipv4();
  if (norm.includes('deviceid')) return faker.string.uuid().replace(/-/g, '');
  if (norm.includes('timestamp')) return faker.date.recent().toISOString();
  if (norm.includes('company')) return faker.company.name();
  
  // If we couldn't infer context, return baseValue if it exists
  if (baseValue !== undefined) return baseValue;
  if (example !== undefined) return example;
  return faker.word.sample();
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
        } else if (typeof baseSample[key] === 'string') {
          fuzzed[key] = getFakerValue(key, baseSample[key] as string);
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
        fuzzed[key] = getFakerValue(key, typeof baseValue === 'string' ? baseValue : undefined, field.example as string | undefined);
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
      .replace(/\bNOT\s*\(/g, '!(')
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
