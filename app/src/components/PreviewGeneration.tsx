import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, ArrowLeft, ArrowRight, Dna, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import type { Workflow, Rule, SchemaField, GeneratedConfig } from '../types';
import { fuzzData, pruneToSchema, extractConstraints, invertConstraints, buildAntiConstraints, simulateWorkflow, extractKnownStringValues, type JsonRecord } from '../utils/engine';

interface PreviewGenerationProps {
  workflow: Workflow;
  rules: Rule[];
  sampleData: JsonRecord[];
  schema: SchemaField[];
  config: GeneratedConfig;
  externalLists: Record<string, unknown[]>;
  onConfirm: () => void;
  onBack: () => void;
}

// ─── Validation ────────────────────────────────────────────────────────────────

type Severity = 'ok' | 'warn' | 'error';

interface FieldIssue {
  field: string;
  severity: Severity;
  message: string;
}

interface ValidationResult {
  severity: Severity;         // worst severity across all issues
  fieldCount: { actual: number; expected: number };
  issues: FieldIssue[];
}

/** Recursively collect all dot-path keys from a SchemaField array */
function schemaKeys(fields: SchemaField[]): Map<string, SchemaField['type']> {
  const map = new Map<string, SchemaField['type']>();
  for (const f of fields) {
    map.set(f.key, f.type);
    if (f.nested) {
      const nestedFields = Object.values(f.nested);
      for (const [k, v] of schemaKeys(nestedFields)) {
        map.set(k, v);
      }
    }
  }
  return map;
}

/** Recursively collect dot-path keys from a plain object */
function objectKeys(obj: Record<string, unknown>, prefix = ''): Map<string, string> {
  const map = new Map<string, string>();
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return map;
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    const jsType = Array.isArray(v) ? 'array' : v === null ? 'null' : typeof v;
    map.set(key, jsType);
    if (jsType === 'object' && v !== null) {
      for (const [nk, nt] of objectKeys(v as Record<string, unknown>, key)) {
        map.set(nk, nt);
      }
    }
  }
  return map;
}

/** Map JS typeof result → SchemaField type */
function jsTypeToSchemaType(jsType: string): SchemaField['type'] | 'null' {
  if (jsType === 'null') return 'null';
  if (jsType === 'array') return 'array';
  if (jsType === 'number') return 'number';
  if (jsType === 'boolean') return 'boolean';
  if (jsType === 'object') return 'object';
  return 'string';
}

function validateRecord(record: Record<string, unknown>, schema: SchemaField[]): ValidationResult {
  const expected = schemaKeys(schema);
  const actual = objectKeys(record);

  const issues: FieldIssue[] = [];

  // Missing fields (in schema but not in record)
  for (const [key, schType] of expected) {
    if (!actual.has(key)) {
      issues.push({ field: key, severity: 'error', message: `Missing (expected ${schType})` });
    }
  }

  // Extra fields (in record but not in schema)
  for (const [key, jsType] of actual) {
    if (!expected.has(key)) {
      issues.push({ field: key, severity: 'warn', message: `Unexpected field (type: ${jsType})` });
    } else {
      // Type mismatch
      const schType = expected.get(key)!;
      const mappedType = jsTypeToSchemaType(jsType);
      if (mappedType !== schType && mappedType !== 'null') {
        issues.push({
          field: key,
          severity: 'warn',
          message: `Type mismatch — expected "${schType}", got "${jsType}"`,
        });
      }
    }
  }

  const hasError = issues.some(i => i.severity === 'error');
  const hasWarn  = issues.some(i => i.severity === 'warn');

  return {
    severity: hasError ? 'error' : hasWarn ? 'warn' : 'ok',
    fieldCount: { actual: actual.size, expected: expected.size },
    issues,
  };
}

// ─── Sub-components ────────────────────────────────────────────────────────────

const SEVERITY_COLOR: Record<Severity, string> = {
  ok:    'var(--success)',
  warn:  'var(--warning)',
  error: 'var(--error)',
};

const SEVERITY_BG: Record<Severity, string> = {
  ok:    'rgba(16, 185, 129, 0.1)',
  warn:  'rgba(245, 158, 11, 0.08)',
  error: 'rgba(255, 75, 43, 0.08)',
};

function SeverityIcon({ s }: { s: Severity }) {
  const color = SEVERITY_COLOR[s];
  if (s === 'ok')    return <CheckCircle   size={16} color={color} />;
  if (s === 'warn')  return <AlertTriangle size={16} color={color} />;
  return <XCircle size={16} color={color} />;
}

function ValidationBadge({ result }: { result: ValidationResult }) {
  const { actual, expected } = result.fieldCount;
  const color = SEVERITY_COLOR[result.severity];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color }}>
      <SeverityIcon s={result.severity} />
      <span style={{ fontWeight: 600 }}>
        {result.severity === 'ok' ? 'Valid' : result.severity === 'warn' ? 'Warnings' : 'Errors'}
      </span>
      <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
        · {actual}/{expected} fields
      </span>
    </div>
  );
}

function ValidationPanel({ result }: { result: ValidationResult }) {
  const [open, setOpen] = useState(result.severity !== 'ok');

  if (result.severity === 'ok' && result.issues.length === 0) {
    return (
      <div style={{
        padding: '0.6rem 1rem',
        background: SEVERITY_BG.ok,
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.82rem',
        color: SEVERITY_COLOR.ok,
      }}>
        <CheckCircle size={14} color={SEVERITY_COLOR.ok} />
        All {result.fieldCount.expected} fields matched the schema with correct types.
      </div>
    );
  }

  // Group issues for Field Inventory
  const missing = result.issues.filter(i => i.message.includes('Missing'));
  const unexpected = result.issues.filter(i => i.message.includes('Unexpected'));
  const mismatches = result.issues.filter(i => i.message.includes('Type mismatch'));

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      {/* Collapsible header */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          all: 'unset',
          cursor: 'pointer',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.6rem 1rem',
          background: SEVERITY_BG[result.severity],
          fontSize: '0.82rem',
        }}
      >
        <ValidationBadge result={result} />
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {/* Issue list */}
      {open && (
        <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Field Inventory Summary */}
          <div style={{ paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem' }}>
             <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                Field Alignment
             </h4>
             <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
               <div style={{ background: 'var(--bg-secondary)', padding: '0.4rem', borderRadius: '4px', textAlign: 'center' }}>
                 <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>EXPECTED</div>
                 <div style={{ fontWeight: 600 }}>{result.fieldCount.expected}</div>
               </div>
               <div style={{ background: 'var(--bg-secondary)', padding: '0.4rem', borderRadius: '4px', textAlign: 'center' }}>
                 <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>ACTUAL</div>
                 <div style={{ fontWeight: 600 }}>{result.fieldCount.actual}</div>
               </div>
               <div style={{ background: 'var(--bg-secondary)', padding: '0.4rem', borderRadius: '4px', textAlign: 'center' }}>
                 <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>DIFF</div>
                 <div style={{ fontWeight: 600, color: result.fieldCount.actual === result.fieldCount.expected ? 'var(--success)' : SEVERITY_COLOR.warn }}>
                   {result.fieldCount.actual - result.fieldCount.expected > 0 ? `+${result.fieldCount.actual - result.fieldCount.expected}` : result.fieldCount.actual - result.fieldCount.expected}
                 </div>
               </div>
             </div>
          </div>

          {[...missing, ...unexpected, ...mismatches].map((issue, i) => (
            <div key={i} style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              fontSize: '0.8rem',
              color: SEVERITY_COLOR[issue.severity],
            }}>
              <SeverityIcon s={issue.severity} />
              <span>
                <code style={{ fontFamily: 'monospace', marginRight: '0.4rem' }}>{issue.field}</code>
                <span style={{ color: 'var(--text-secondary)' }}>{issue.message}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Summary banner ────────────────────────────────────────────────────────────

function ValidationSummary({ results }: { results: ValidationResult[] }) {
  if (results.length === 0) return null;

  const errors  = results.filter(r => r.severity === 'error').length;
  const warns   = results.filter(r => r.severity === 'warn').length;
  const ok      = results.filter(r => r.severity === 'ok').length;

  const overallSev: Severity = errors > 0 ? 'error' : warns > 0 ? 'warn' : 'ok';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      flexWrap: 'wrap',
      padding: '0.75rem 1rem',
      marginBottom: '1rem',
      border: `1px solid ${overallSev === 'ok' ? 'rgba(16, 185, 129, 0.2)' : SEVERITY_COLOR[overallSev] + '44'}`,
      borderRadius: '8px',
      background: SEVERITY_BG[overallSev],
      fontSize: '0.85rem',
    }}>
      <SeverityIcon s={overallSev} />
      <span style={{ fontWeight: 600, color: SEVERITY_COLOR[overallSev] }}>
        Schema validation across {results.length} sample{results.length > 1 ? 's' : ''}
      </span>
      <span style={{ color: SEVERITY_COLOR.ok }}>✓ {ok} valid</span>
      {warns  > 0 && <span style={{ color: SEVERITY_COLOR.warn  }}>⚠ {warns} with warnings</span>}
      {errors > 0 && <span style={{ color: SEVERITY_COLOR.error }}>✕ {errors} with errors</span>}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function PreviewGeneration({ workflow, rules, sampleData, schema, config, externalLists, onConfirm, onBack }: PreviewGenerationProps) {
  const [previews, setPreviews] = useState<JsonRecord[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [validations, setValidations] = useState<ValidationResult[]>([]);

  const generatePreview = useCallback(async () => {
    setIsGenerating(true);
    setValidations([]);
    
    // We run in a non-blocking timeout to avoid UI freeze
    setTimeout(() => {
      try {
        const results: JsonRecord[] = [];
        const targetOutcomes = Object.keys(config).filter(k => (config[k] || 0) > 0);
        
        // Map each outcome to its constraints once
        const outcomeConstraints: Record<string, ReturnType<typeof extractConstraints>> = {};
        targetOutcomes.forEach(outcome => {
          if (outcome === 'Default (No Match)') {
              const allRuleConstraints = rules.flatMap(r => extractConstraints(r.condition, externalLists));
              outcomeConstraints[outcome] = invertConstraints(allRuleConstraints);
          } else {
            // Merge constraints from ALL rules that map to this outcome
            const categoryRules = rules.filter(r => r.description === outcome);
            const targetConstraints = categoryRules.flatMap(r =>
              extractConstraints(r.condition, externalLists)
            );
            const antiConstraints = buildAntiConstraints(outcome, rules, externalLists);
            outcomeConstraints[outcome] = [...antiConstraints, ...targetConstraints];
          }
        });

        const knownValues = extractKnownStringValues(rules);

        targetOutcomes.forEach(outcome => {
          const constraints = outcomeConstraints[outcome];
          let clean: Record<string, unknown> | null = null;

          for (let attempt = 0; attempt < 5000; attempt++) {
            const base = sampleData[Math.floor(Math.random() * sampleData.length)] || {};
            const fuzzed = fuzzData(base, schema, constraints, knownValues);
            const candidate = pruneToSchema(fuzzed, schema);

            try {
              const simResult = simulateWorkflow(candidate, workflow);
              if (simResult === outcome) {
                clean = candidate;
                break;
              }
            } catch (err) {
              console.error("Simulation error during preview:", err);
            }
          }
          
          if (!clean) {
            const base = sampleData[Math.floor(Math.random() * sampleData.length)] || {};
            const fuzzed = fuzzData(base, schema, constraints, knownValues);
            clean = pruneToSchema(fuzzed, schema);
          }

          results.push({ _outcome: outcome, ...clean });
        });

        setPreviews(results);
        const valRes = results.map(r => {
          const pure = { ...r };
          delete pure._outcome;
          return validateRecord(pure as Record<string, unknown>, schema);
        });
        setValidations(valRes);
      } catch (err) {
        console.error("Preview generation failed:", err);
      } finally {
        setIsGenerating(false);
      }
    }, 10);
  }, [workflow, sampleData, schema, config, rules, externalLists]);

  const hasGenerated = useRef(false);
  useEffect(() => {
    if (sampleData.length > 0 && previews.length === 0 && !isGenerating && !hasGenerated.current) {
      hasGenerated.current = true;
      // Delay to avoid synchronous setState warning
      setTimeout(() => generatePreview(), 0);
    }
  }, [sampleData.length, previews.length, generatePreview, isGenerating]);

  const hasAnyError = validations.some(v => v.severity === 'error');

  return (
    <div className="animate-fade-in flex-col h-full">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <button className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {hasAnyError && (
            <span style={{ fontSize: '0.85rem', color: SEVERITY_COLOR.error, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <XCircle size={14} color={SEVERITY_COLOR.error} />
              Schema errors — review suggested
            </span>
          )}
          <button className="btn btn-primary" onClick={onConfirm} disabled={isGenerating}>
            Confirm and Run Batch <ArrowRight size={18} />
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Dna color="var(--primary)" />
            Data Preview
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>Review a small sample of generated data before kicking off the full batch.</p>
        </div>
        <button onClick={generatePreview} disabled={isGenerating} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Play size={16} /> Re-roll Samples
        </button>
      </div>

      {/* ── Validation summary banner ── */}
      {!isGenerating && validations.length > 0 && <ValidationSummary results={validations} />}

      {/* ── Sample cards ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
        {previews.length === 0 && !isGenerating ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
            Could not generate matching previews within attempt limit. Your rules or schema may be too restrictive.
          </div>
        ) : (
          previews.map((preview, i) => {
            const displayOutcome = preview._outcome as string;
            const pureData = { ...preview };
            delete pureData._outcome;
            const validation = validations[i];

            return (
              <div key={i} style={{ background: 'var(--field-bg)', border: `1px solid ${validation ? SEVERITY_COLOR[validation.severity] + '55' : 'var(--border)'}`, borderRadius: '8px', overflow: 'hidden' }}>
                {/* Header row */}
                <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', fontSize: '0.9rem', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    Sample {i + 1}
                    {displayOutcome && (
                      <> · Outcome: <span style={{ color: 'var(--primary)' }}>{displayOutcome}</span></>
                    )}
                  </span>
                  {validation && <ValidationBadge result={validation} />}
                </div>

                {/* JSON body */}
                <div style={{ padding: '1rem', overflowX: 'auto' }}>
                  <pre style={{ margin: 0, color: '#e2e8f0', fontSize: '0.85rem', fontFamily: 'monospace' }}>
                    {JSON.stringify(pureData, null, 2)}
                  </pre>
                </div>

                {/* Validation panel (collapsible) */}
                {validation && <ValidationPanel result={validation} />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
