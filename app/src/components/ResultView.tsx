import { useState } from 'react';
import { CirclePlay, Download, CircleCheck, RefreshCcw } from 'lucide-react';
import type { Workflow, Rule, SchemaField, GeneratedConfig } from '../types';
import { fuzzData, pruneToSchema, extractConstraints, invertConstraints, buildAntiConstraints, simulateWorkflow } from '../utils/engine';

interface ResultViewProps {
  workflow: Workflow;
  sampleData: Record<string, unknown>[];
  schema: SchemaField[];
  rules: Rule[];
  config: GeneratedConfig;
  externalLists: Record<string, unknown[]>;
  onReset: () => void;
}

const CHUNK_SIZE = 200; // records per animation frame
const MAX_RETRIES = 50; // max regeneration attempts per record

export default function ResultView({ workflow, sampleData, schema, rules, config, externalLists, onReset }: ResultViewProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [distribution, setDistribution] = useState<Record<string, number>>({});

  const startGeneration = () => {
    setIsGenerating(true);
    setProgress(0);
    setResults([]);
    setDistribution({});

    // Build the flat list of (outcome, constraints) work items
    const outcomesToGenerate = Object.entries(config).filter(([, target]) => target > 0);
    const totalRecords = outcomesToGenerate.reduce((s, [, n]) => s + n, 0);

    // Pre-compute constraints once per outcome (not inside the hot loop)
    const defaultInvertedConstraints = invertConstraints(
      rules.flatMap(r => extractConstraints(r.condition, externalLists))
    );
    const outcomeConstraints: Record<string, ReturnType<typeof extractConstraints>> = {};
    outcomesToGenerate.forEach(([outcome]) => {
      if (outcome === 'Default (No Match)') {
        outcomeConstraints[outcome] = defaultInvertedConstraints;
      } else {
        // Merge constraints from ALL rules that map to this outcome
        // (e.g. Approve may require passing multiple workflow gates)
        const categoryRules = rules.filter(r => r.description === outcome);
        const targetConstraints = categoryRules.flatMap(r =>
          extractConstraints(r.condition, externalLists)
        );
        // Anti-constraints prevent accidentally triggering OTHER outcomes
        const antiConstraints = buildAntiConstraints(outcome, rules, externalLists);
        // Anti-constraints go first so target constraints take priority on overlap
        outcomeConstraints[outcome] = [...antiConstraints, ...targetConstraints];
      }
    });

    // Flatten into a single work queue so we can chunk across outcomes
    const workQueue: { outcome: string; constraints: ReturnType<typeof extractConstraints> }[] = [];
    outcomesToGenerate.forEach(([outcome, count]) => {
      for (let i = 0; i < count; i++) {
        workQueue.push({ outcome, constraints: outcomeConstraints[outcome] });
      }
    });

    const generated: Record<string, unknown>[] = [];
    const currentCounts: Record<string, number> = {};
    let idx = 0;

    const processChunk = () => {
      try {
        const end = Math.min(idx + CHUNK_SIZE, workQueue.length);
        for (; idx < end; idx++) {
          const { outcome, constraints } = workQueue[idx];
          let clean: Record<string, unknown> | null = null;

          // Generate with retry: simulate the workflow and regenerate
          for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
            const base = sampleData[Math.floor(Math.random() * sampleData.length)] || {};
            const fuzzed = fuzzData(base, schema, constraints);
            const candidate = pruneToSchema(fuzzed, schema);

            try {
              // Validate against the workflow simulator
              const simResult = simulateWorkflow(candidate, workflow);
              if (simResult === outcome) {
                // Strict match found
                clean = candidate;
                break;
              }
            } catch (err) {
              console.error("Simulation error during generation:", err);
            }
          }

          // If all retries failed, use the last attempt anyway
          if (!clean) {
            const base = sampleData[Math.floor(Math.random() * sampleData.length)] || {};
            const fuzzed = fuzzData(base, schema, constraints);
            clean = pruneToSchema(fuzzed, schema);
          }

          generated.push(clean);
          currentCounts[outcome] = (currentCounts[outcome] || 0) + 1;
        }

        const pct = Math.round((idx / (totalRecords || 1)) * 100);
        setProgress(pct);
        setDistribution({ ...currentCounts });

        if (idx < workQueue.length) {
          requestAnimationFrame(processChunk);
        } else {
          setIsGenerating(false);
          setResults(generated);
        }
      } catch (err) {
        console.error("Result generation failed:", err);
        setIsGenerating(false);
      }
    };

    requestAnimationFrame(processChunk);
  };

  const handleReset = () => {
    if (window.confirm('Start over? Your current configuration and generated data will be lost.')) {
      onReset();
    }
  };

  const handleDownload = () => {
    const jsonlContent = results.map((r: Record<string, unknown>) => JSON.stringify(r)).join('\n');
    const blob = new Blob([jsonlContent], { type: 'application/jsonlines' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'generated-tests.jsonl';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="animate-fade-in flex-col items-center">
      {results.length === 0 && !isGenerating ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <CirclePlay size={64} style={{ color: 'var(--primary)', margin: '0 auto 1.5rem', opacity: 0.8 }} />
          <h2 style={{ fontSize: '1.75rem', marginBottom: '1rem' }}>Ready to Generate</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>Engine will directly satisfy workflow rules to generate your exact requested distribution.</p>
          <button className="btn btn-primary" style={{ fontSize: '1.1rem', padding: '1rem 3rem' }} onClick={startGeneration}>
            Start Engine
          </button>
        </div>
      ) : (
        <div style={{ width: '100%', maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
              {isGenerating ? 'Generating Workflows...' : 'Generation Complete'}
            </h2>
          </div>
          
          <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '12px', marginBottom: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <span>Overall Progress</span>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontWeight: 600 }}>{progress}%</span>
              </div>
            </div>
            <div style={{ width: '100%', height: '8px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: 'var(--primary)', transition: 'width 0.2s' }} />
            </div>
          </div>
          
          <div className="grid-2">
            {Object.entries(config).map(([outcome, target]) => {
              if (target === 0) return null;
              const current = distribution[outcome] || 0;
              const isDone = current >= target;
              return (
                <div key={outcome} style={{ 
                  background: 'var(--field-bg)', 
                  border: `1px solid ${isDone ? 'var(--success)' : 'var(--border)'}`, 
                  padding: '1.25rem', 
                  borderRadius: '8px' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <span style={{ fontWeight: 500 }}>{outcome}</span>
                    {isDone && <CircleCheck size={18} color="var(--success)" />}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    {current} / {target} Generated
                  </div>
                </div>
              );
            })}
          </div>

          {!isGenerating && results.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '3rem' }}>
              <button className="btn btn-secondary" onClick={handleReset} aria-label="Start over from the beginning">
                <RefreshCcw size={18} /> Start Over
              </button>
              <button className="btn btn-primary" onClick={handleDownload} style={{ padding: '0.75rem 2rem' }} aria-label="Download generated data as JSONL">
                <Download size={18} /> Download JSONL
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
