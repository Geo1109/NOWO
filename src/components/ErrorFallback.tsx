import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorFallbackProps {
  error: any;
  resetErrorBoundary: () => void;
}

export const ErrorFallback = ({ error, resetErrorBoundary }: ErrorFallbackProps) => {
  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col items-center justify-center p-10 text-center">
      <div className="w-20 h-20 bg-rose-50 text-rose-500 rounded-3xl flex items-center justify-center mb-6">
        <AlertTriangle size={40} />
      </div>
      <h1 className="text-2xl font-black text-slate-900 mb-4">Something went wrong</h1>
      <p className="text-slate-500 text-sm font-bold mb-8 max-w-xs">
        The application encountered an error. Please try refreshing the page.
      </p>
      <button 
        onClick={() => {
          resetErrorBoundary();
          window.location.reload();
        }}
        className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black"
      >
        Refresh App
      </button>
      {process.env.NODE_ENV === 'development' && (
        <pre className="mt-10 p-4 bg-slate-100 rounded-xl text-[10px] text-left overflow-auto max-w-full">
          {error?.message}
        </pre>
      )}
    </div>
  );
};
