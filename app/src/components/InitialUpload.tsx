import { useState, useRef } from 'react';
import { CircleAlert, FolderOpen, FileJson, Table, CheckCircle2 } from 'lucide-react';
import type { Workflow, Rule, SchemaField, ProjectState } from '../types';
import { extractRules, extractSchema, extractRequiredLists, markOptionalFromRules, type JsonRecord } from '../utils/engine';

interface InitialUploadProps {
  onUpload: (data: {
    workflow: Workflow;
    rules: Rule[];
    sampleData: JsonRecord[];
    schema: SchemaField[];
    externalLists: Record<string, unknown[]>;
  }) => void;
  onLoadProject: (state: ProjectState) => void;
}

export default function InitialUpload({ onUpload, onLoadProject }: InitialUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [workflowFile, setWorkflowFile] = useState<{ name: string; content: JsonRecord } | null>(null);
  const [sampleFile, setSampleFile] = useState<{ name: string; data: JsonRecord[]; schema: SchemaField[] } | null>(null);
  const [workflowDragOver, setWorkflowDragOver] = useState(false);
  const [sampleDragOver, setSampleDragOver] = useState(false);
  
  const workflowRef = useRef<HTMLInputElement>(null);
  const sampleRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);

  const handleWorkflowUpload = (file: File) => {
    setError(null);
    const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const json = JSON.parse(e.target?.result as string) as JsonRecord;
          if (json.workflow && json.rules && json.schema) {
            onLoadProject(json as unknown as ProjectState);
            return;
          }
          if (json.workflows || json.actions) {
            setWorkflowFile({ name: file.name, content: json });
          } else {
            throw new Error('Invalid format: File is not a valid Oscilar workflow.');
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      };
    reader.readAsText(file);
  };

  const handleSampleUpload = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim().length > 0);
        if (lines.length === 0) throw new Error('File is empty');
        const data = lines.map(line => JSON.parse(line) as JsonRecord);
        
        const fullSchema = extractSchema(data[0] || {});
        const filteredSchema = fullSchema.filter(field => {
          const key = field.key.toLowerCase();
          return !key.startsWith('osc_') && !key.startsWith('onboarding_events_');
        });

        setSampleFile({ name: file.name, data, schema: filteredSchema });
      } catch (err) {
        setError(`Failed to parse JSONL: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
  };

  const handleProceed = () => {
    if (!workflowFile || !sampleFile) return;

    const rules = extractRules(workflowFile.content);
    const schemaWithRules = markOptionalFromRules(sampleFile.schema, rules);
    
    // Auto-populate lists from sample data
    const requiredLists = extractRequiredLists(rules);
    const externalLists: Record<string, unknown[]> = {};

    requiredLists.forEach(({ listName, fieldName }) => {
      // Find the field in the sample data
      const uniqueValues = new Set<unknown>();
      sampleFile.data.forEach(record => {
        // Resolve nested field name if needed (dot notation)
        const val = fieldName.split('.').reduce((obj: unknown, key: string) => {
          if (obj && typeof obj === 'object') {
            return (obj as JsonRecord)[key];
          }
          return undefined;
        }, record as unknown);
        if (val !== undefined && val !== null) {
          uniqueValues.add(val);
        }
      });
      
      if (uniqueValues.size > 0) {
        externalLists[listName] = Array.from(uniqueValues);
      }
    });

    onUpload({
      workflow: workflowFile.content as unknown as Workflow,
      rules,
      sampleData: sampleFile.data,
      schema: schemaWithRules,
      externalLists
    });
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, type: 'workflow' | 'sample') => {
    e.preventDefault();
    if (type === 'workflow') setWorkflowDragOver(false);
    else setSampleDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (type === 'workflow') handleWorkflowUpload(file);
    else handleSampleUpload(file);
  };

  return (
    <div className="flex-col items-center animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ marginBottom: '2.5rem', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>Project Setup</h2>
        <p style={{ color: 'var(--text-secondary)' }}>Upload your workflow and a sample test set to begin generating synthetic data.</p>
      </div>

      <div className="grid-2" style={{ width: '100%', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* Workflow Box */}
        <div 
          onClick={() => workflowRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setWorkflowDragOver(true); }}
          onDragLeave={() => setWorkflowDragOver(false)}
          onDrop={(e) => handleDrop(e, 'workflow')}
          role="button"
          aria-label="Upload workflow JSON file"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && workflowRef.current?.click()}
          style={{ 
            background: workflowFile ? 'rgba(16, 185, 129, 0.05)' : workflowDragOver ? 'rgba(255, 92, 53, 0.06)' : 'rgba(15, 23, 42, 0.3)',
            border: `2px dashed ${workflowFile ? 'var(--success)' : workflowDragOver ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: '16px',
            padding: '2rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          {workflowFile ? (
            <>
              <CheckCircle2 size={40} color="var(--success)" />
              <div style={{ fontWeight: 600 }}>Workflow Loaded</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{workflowFile.name}</div>
            </>
          ) : (
            <>
              <FileJson size={40} color="var(--primary)" />
              <div style={{ fontWeight: 600 }}>1. Workflow Definition</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Click or drag &amp; drop workflow.json</div>
            </>
          )}
          <input type="file" accept=".json" ref={workflowRef} style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleWorkflowUpload(e.target.files[0])} />
        </div>

        {/* Sample Box */}
        <div 
          onClick={() => sampleRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setSampleDragOver(true); }}
          onDragLeave={() => setSampleDragOver(false)}
          onDrop={(e) => handleDrop(e, 'sample')}
          role="button"
          aria-label="Upload sample JSONL file"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && sampleRef.current?.click()}
          style={{ 
            background: sampleFile ? 'rgba(16, 185, 129, 0.05)' : sampleDragOver ? 'rgba(255, 92, 53, 0.06)' : 'rgba(15, 23, 42, 0.3)',
            border: `2px dashed ${sampleFile ? 'var(--success)' : sampleDragOver ? 'var(--primary)' : 'var(--border)'}`,
            borderRadius: '16px',
            padding: '2rem',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          {sampleFile ? (
            <>
              <CheckCircle2 size={40} color="var(--success)" />
              <div style={{ fontWeight: 600 }}>Sample Data Loaded</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{sampleFile.name}</div>
            </>
          ) : (
            <>
              <Table size={40} color="var(--primary)" />
              <div style={{ fontWeight: 600 }}>2. Sample Test Set</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Click or drag &amp; drop test-set.jsonl</div>
            </>
          )}
          <input type="file" accept=".jsonl,.json" ref={sampleRef} style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleSampleUpload(e.target.files[0])} />
        </div>
      </div>

      <button 
        className={`btn ${workflowFile && sampleFile ? 'btn-primary' : 'btn-secondary'}`}
        style={{ width: '100%', padding: '1rem', fontSize: '1.1rem', marginBottom: '2rem' }}
        disabled={!workflowFile || !sampleFile}
        onClick={handleProceed}
      >
        Analyze and Proceed
      </button>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        <div style={{ height: '1px', width: '60px', background: 'var(--border)' }} />
        <span>OR</span>
        <div style={{ height: '1px', width: '60px', background: 'var(--border)' }} />
      </div>

      <button className="btn btn-secondary" style={{ width: '250px' }} onClick={() => projectRef.current?.click()}>
        <FolderOpen size={18} /> Import Previous Project
      </button>
      <input type="file" accept=".json" ref={projectRef} style={{ display: 'none' }} onChange={(e) => e.target.files?.[0] && handleWorkflowUpload(e.target.files[0])} />

      {error && (
        <div className="error-card animate-slide-in" style={{ marginTop: '2rem' }}>
          <CircleAlert color="var(--error)" size={20} />
          <div className="error-text">
            <strong>Upload Error</strong>
            <p>{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
