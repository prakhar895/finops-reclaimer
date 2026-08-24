import React from 'react';

export interface EmptyStateProps {
  title?: string;
  description?: string;
  onReset?: () => void;
  resetLabel?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title = 'No findings at this policy',
  description = 'Your idle threshold is set to 200 days. Lower it to surface recently-abandoned resources.',
  onReset,
  resetLabel = 'Reset to defaults',
}) => {
  return (
    <div className="h-full flex items-center justify-center p-gutter">
      <div className="max-w-md w-full border border-hairline p-8 flex flex-col items-center text-center">
        <span
          className="material-symbols-outlined text-outline mb-4 select-none"
          style={{ fontSize: '48px' }}
        >
          description
        </span>
        <h3 className="font-headline-md text-on-surface mb-2 uppercase tracking-tight">
          {title}
        </h3>
        <p className="font-body-sm text-on-surface-variant mb-6">
          {description}
        </p>
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            className="text-tertiary font-label-caps text-label-caps uppercase tracking-widest hover:text-on-surface transition-colors cursor-pointer"
          >
            {resetLabel}
          </button>
        )}
      </div>
    </div>
  );
};
