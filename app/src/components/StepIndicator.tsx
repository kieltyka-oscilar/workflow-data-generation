import { Check } from 'lucide-react';

interface StepIndicatorProps {
  currentStep: number;
  steps: string[];
  onStepClick?: (stepIndex: number) => void;
}

export default function StepIndicator({ currentStep, steps, onStepClick }: StepIndicatorProps) {
  return (
    <div className="steps" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4rem', position: 'relative' }}>
      <div style={{ position: 'absolute', top: '16px', left: '0', right: '0', height: '1.5px', background: 'rgba(255,255,255,0.05)', zIndex: 0 }}>
        <div style={{ height: '100%', background: 'var(--primary)', width: `${(currentStep / (steps.length - 1)) * 100}%`, transition: 'width 0.4s cubic-bezier(0.16, 1, 0.3, 1)' }} />
      </div>
      
      {steps.map((step, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        const isClickable = index < currentStep;
        
        return (
          <div 
            key={step} 
            onClick={() => isClickable && onStepClick?.(index)}
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              zIndex: 1, 
              position: 'relative',
              cursor: isClickable ? 'pointer' : 'default'
            }}
          >
            <div 
              className={isClickable ? 'step-bubble-clickable' : ''}
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isCompleted ? 'var(--success)' : isActive ? 'var(--primary)' : 'var(--bg-secondary)',
                border: `1.5px solid ${isCompleted ? 'var(--success)' : isActive ? 'var(--primary)' : 'var(--border)'}`,
                color: isCompleted || isActive ? 'white' : 'var(--text-secondary)',
                fontFamily: "'Roboto Mono', monospace",
                fontWeight: '600',
                fontSize: '0.8rem',
                transition: 'all 0.3s ease',
                boxShadow: isActive ? '0 0 16px var(--primary-glow)' : 'none'
              }}
            >
              {isCompleted ? <Check size={16} strokeWidth={3} /> : (index + 1)}
            </div>
            <span style={{ 
              marginTop: '1rem', 
              fontSize: '0.65rem', 
              fontWeight: isActive ? '600' : '400',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              position: 'absolute',
              top: '100%',
              whiteSpace: 'nowrap',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              fontFamily: "'Roboto Mono', monospace"
            }}>
              {step}
            </span>
          </div>
        );
      })}
    </div>
  );
}
