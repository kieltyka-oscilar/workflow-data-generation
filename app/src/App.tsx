import { useState } from 'react';
import { Save } from 'lucide-react';
import type { Workflow, Rule, SchemaField, GeneratedConfig, ProjectState } from './types';
import StepIndicator from './components/StepIndicator';
import InitialUpload from './components/InitialUpload';
import ConfirmRules from './components/ConfirmRules';
import ConfirmSchema from './components/ConfirmSchema';
import ConfigureData from './components/ConfigureData';
import GenerateConfig from './components/GenerateConfig';
import PreviewGeneration from './components/PreviewGeneration';
import ResultView from './components/ResultView';

const STEPS = [
  'Upload Assets',
  'Confirm Rules',
  'Confirm Schema',
  'Configure Data',
  'Distribution',
  'Preview',
  'Generate'
];

function App() {
  const [currentStep, setCurrentStep] = useState(0);

  // App State
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [sampleData, setSampleData] = useState<Record<string, unknown>[]>([]);
  const [schema, setSchema] = useState<SchemaField[]>([]);
  const [config, setConfig] = useState<GeneratedConfig>({});
  const [externalLists, setExternalLists] = useState<Record<string, unknown[]>>({});

  const nextStep = () => setCurrentStep(prev => Math.min(prev + 1, STEPS.length - 1));
  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  const saveProject = () => {
    const state: ProjectState = {
      workflow,
      rules,
      sampleData,
      schema,
      config,
      externalLists,
      currentStep
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `test-gen-project-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const loadProject = (state: ProjectState) => {
    setWorkflow(state.workflow);
    setRules(state.rules || []);
    setSampleData(state.sampleData || []);
    setSchema(state.schema || []);
    setConfig(state.config || {});
    setExternalLists(state.externalLists || {});
    setCurrentStep(state.currentStep || 0);
  };

  const renderCurrentStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <InitialUpload
            onUpload={(data) => {
              setWorkflow(data.workflow);
              setRules(data.rules);
              setSampleData(data.sampleData);
              setSchema(data.schema);
              setExternalLists(data.externalLists);
              nextStep();
            }}
            onLoadProject={loadProject}
          />
        );
      case 1:
        return (
          <ConfirmRules
            rules={rules}
            externalLists={externalLists}
            onConfirm={(updatedRules, updatedLists) => {
              setRules(updatedRules);
              setExternalLists(updatedLists);
              nextStep();
            }}
            onBack={prevStep}
          />
        );
      case 2:
        return (
          <ConfirmSchema
            schema={schema}
            onConfirm={(updatedSchema) => {
              setSchema(updatedSchema);
              nextStep();
            }}
            onBack={prevStep}
          />
        );
      case 3:
        return (
          <ConfigureData
            schema={schema}
            onConfirm={(updatedSchema) => {
              setSchema(updatedSchema);
              nextStep();
            }}
            onBack={prevStep}
          />
        );
      case 4:
        return (
          <GenerateConfig
            rules={rules}
            config={config}
            setConfig={setConfig}
            onConfirm={nextStep}
            onBack={prevStep}
          />
        );
      case 5:
        return (
          <PreviewGeneration
            rules={rules}
            sampleData={sampleData}
            schema={schema}
            config={config}
            externalLists={externalLists}
            onConfirm={nextStep}
            onBack={prevStep}
          />
        );
      case 6:
        return (
          <ResultView
            workflow={workflow!}
            sampleData={sampleData}
            schema={schema}
            rules={rules}
            config={config}
            externalLists={externalLists}
            onReset={() => {
              setCurrentStep(0);
              setWorkflow(null);
              setRules([]);
              setSampleData([]);
              setSchema([]);
              setConfig({});
              setExternalLists({});
            }}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="container animate-fade-in" style={{ padding: '3rem 1rem', maxWidth: '1000px', margin: '0 auto' }}>
      <header style={{ marginBottom: '3rem', textAlign: 'center', position: 'relative' }}>
        <h1 className="title">Synthetic data generator</h1>
        <p className="subtitle">Generate test data to pass/fail rules</p>

        {workflow && (
          <div style={{ position: 'absolute', top: 0, right: 0 }}>
            <button className="btn btn-secondary" onClick={saveProject} title="Save Project Setup" aria-label="Save project setup to file">
              <Save size={18} /> Save Setup
            </button>
          </div>
        )}
      </header>

      <StepIndicator
        currentStep={currentStep}
        steps={STEPS}
        onStepClick={(index) => {
          // Navigating back to step 0 wipes all parsed state — confirm first
          if (index === 0 && currentStep > 0) {
            if (!window.confirm('Go back to Upload? Uploaded files will need to be re-selected.')) return;
          }
          setCurrentStep(index);
        }}
      />

      <main className="glass-panel" style={{ padding: '2rem', minHeight: '400px' }}>
        {renderCurrentStep()}
      </main>
    </div>
  );
}

export default App;
