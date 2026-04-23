import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';

const ToastContext = createContext(null);

export function useToast() {
  return useContext(ToastContext);
}

let toastIdCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 3500) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 200);
    }, duration);
  }, []);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 200);
  }, []);

  const ctx = useMemo(() => ({
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error', 5000),
    info: (msg) => addToast(msg, 'info'),
  }), [addToast]);

  const icons = { success: '\u2713', error: '\u2715', info: '\u2139' };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {ReactDOM.createPortal(
        <div className="toast-container">
          {toasts.map(t => (
            <div
              key={t.id}
              className={'toast toast-' + t.type + (t.exiting ? ' exiting' : '')}
              onClick={() => dismiss(t.id)}
            >
              <span className="toast-icon">{icons[t.type]}</span>
              <span className="toast-message">{t.message}</span>
            </div>
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

export { ToastContext };
export default ToastContext;
