import { useState, useEffect } from 'react';
import { Shuffle, ArrowLeft, ArrowRight } from 'lucide-react';
import type { Rule, GeneratedConfig } from '../types';

interface GenerateConfigProps {
  rules: Rule[];
  config: GeneratedConfig;
  setConfig: (config: GeneratedConfig) => void;
  onConfirm: () => void;
  onBack: () => void;
}

/** Generate random integers that sum exactly to `total` over `n` buckets. */
function randomPartsTo(n: number, total: number): number[] {
  if (n === 0) return [];
  if (n === 1) return [total];

  // Generate n-1 random cut-points in [0, total], sort them, derive gaps
  const cuts: number[] = Array.from({ length: n - 1 }, () =>
    Math.floor(Math.random() * (total + 1))
  ).sort((a, b) => a - b);

  const parts: number[] = [];
  let prev = 0;
  for (const cut of cuts) {
    parts.push(cut - prev);
    prev = cut;
  }
  parts.push(total - prev);
  return parts;
}

export default function GenerateConfig({ rules, config, setConfig, onConfirm, onBack }: GenerateConfigProps) {
  const [outcomes, setOutcomes] = useState<string[]>([]);
  // percentages: each outcome gets a value 0-100 (they don't have to sum to 100 — user controls freely)
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  const [totalRecords, setTotalRecords] = useState<number>(500);

  useEffect(() => {
    // Dynamic Outcomes based on Rules
    // Only include rules that terminate directly into an action
    const terminalRules = rules.filter(r => r.isTerminal);
    const dynamicOutcomes = Array.from(new Set(terminalRules.map(r => r.description || 'Manual Review'))).sort();
    
    if (dynamicOutcomes.length === 0) {
      setOutcomes(['Approve Account']);
    } else {
      setOutcomes([...dynamicOutcomes, 'Default (No Match)']);
    }
  }, [rules]);

  // Initialise percentages when outcomes are first determined
  useEffect(() => {
    if (outcomes.length === 0) return;
    const init: Record<string, number> = {};
    const base = Math.floor(100 / outcomes.length);
    let remainder = 100 - (base * outcomes.length);
    
    outcomes.forEach((o) => {
      init[o] = base + (remainder > 0 ? 1 : 0);
      remainder--;
    });
    setPercentages(init);
  }, [outcomes]);

  // Sync derived counts back into config whenever percentages or totalRecords change
  useEffect(() => {
    if (outcomes.length === 0) return;
    const derived: GeneratedConfig = {};
    outcomes.forEach(o => {
      derived[o] = Math.round(((percentages[o] ?? 0) / 100) * totalRecords);
    });
    setConfig(derived);
  }, [percentages, totalRecords, outcomes]);

  const handlePercentageChange = (outcome: string, val: number) => {
    setPercentages(prev => ({ ...prev, [outcome]: Math.max(0, Math.min(100, val)) }));
  };

  const handleRandomize = () => {
    const parts = randomPartsTo(outcomes.length, 100);
    const shuffled: Record<string, number> = {};
    outcomes.forEach((o, i) => {
      shuffled[o] = parts[i];
    });
    setPercentages(shuffled);
  };

  const totalPct = Object.values(percentages).reduce((acc, v) => acc + (v || 0), 0);
  const totalCases = Object.values(config).reduce((acc, v) => acc + (v || 0), 0);

  // Color hint for percentage total
  const pctColor =
    totalPct === 100 ? 'var(--primary)' :
    totalPct > 100  ? '#f87171' :  // red — over
    '#facc15';                      // yellow — under

  return (
    <div className="animate-fade-in flex-col">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <button className="btn btn-secondary" onClick={onBack}>
          <ArrowLeft size={18} /> Back
        </button>
        <button
          className="btn btn-primary"
          onClick={onConfirm}
          disabled={totalCases === 0 || totalPct !== 100}
        >
          Preview Generated Data <ArrowRight size={18} />
        </button>
      </div>

      <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Configure Test Distribution</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Set the percentage of each outcome type and the total number of records to generate.
        </p>
      </div>

      {/* Total records + Randomize row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(59, 130, 246, 0.06)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        padding: '1rem 1.25rem',
        marginBottom: '1.5rem',
        gap: '1rem',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <label style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>Total records</label>
          <input
            type="number"
            min="1"
            max="100000"
            value={totalRecords}
            onChange={e => setTotalRecords(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="form-input"
            style={{ width: '110px', padding: '0.5rem 0.75rem' }}
          />
        </div>

        <button
          onClick={handleRandomize}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          title="Assign random percentages that add up to 100%"
        >
          <Shuffle size={16} />
          Randomize (sum to 100%)
        </button>
      </div>

      {/* Per-outcome sliders */}
      <div style={{ display: 'grid', gap: '0.875rem', marginBottom: '1.5rem' }}>
        {outcomes.map(outcome => {
          const pct = percentages[outcome] ?? 0;
          const count = Math.round((pct / 100) * totalRecords);
          return (
            <div
              key={outcome}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              background: 'var(--field-bg)',
                padding: '0.875rem 1rem',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                flexWrap: 'wrap'
              }}
            >
              <div style={{ flex: '1 1 200px', minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '1.1rem', color: 'var(--primary)', marginBottom: '0.25rem' }}>{outcome}</div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {rules.filter(r => r.description === outcome).map(r => (
                    <span key={r.id} style={{ background: 'var(--container-bg)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                      {r.name}
                    </span>
                  ))}
                  {outcome === 'Default (No Match)' && <span style={{ fontStyle: 'italic' }}>Matches when no rules are triggered</span>}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                {/* Slider: 0-100 */}
                <input
                  type="range"
                  min="0"
                  max={Math.min(100, 100 - totalPct + pct)}
                  step="1"
                  value={pct}
                  onChange={e => handlePercentageChange(outcome, parseInt(e.target.value, 10))}
                  style={{ width: '150px' }}
                />

                {/* percentage number input */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                  <input
                    type="number"
                    min="0"
                    max={Math.min(100, 100 - totalPct + pct)}
                    value={pct}
                    onChange={e => handlePercentageChange(outcome, parseInt(e.target.value, 10) || 0)}
                    className="form-input"
                    style={{ width: '64px', padding: '0.4rem 0.5rem', textAlign: 'right' }}
                  />
                  <span style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.95rem' }}>%</span>
                </div>

                {/* derived count badge */}
                <div style={{
                  minWidth: '72px',
                  textAlign: 'right',
                  fontSize: '0.85rem',
                  color: 'var(--text-secondary)',
                  fontVariantNumeric: 'tabular-nums'
                }}>
                  {count.toLocaleString()} rows
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div style={{
        marginBottom: '1.5rem',
        padding: '0.875rem 1.25rem',
        borderRadius: '8px',
        background: 'var(--field-bg)',
        border: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem'
      }}>
        <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
          Percentage allocated:{' '}
          <span style={{ fontWeight: 700, color: pctColor }}>{totalPct}%</span>
          {totalPct !== 100 && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: pctColor }}>
              {totalPct > 100 ? `(${totalPct - 100}% over)` : `(${100 - totalPct}% unallocated)`}
            </span>
          )}
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary)' }}>
          Total cases: {totalCases.toLocaleString()}
        </div>
      </div>


    </div>
  );
}
