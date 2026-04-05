
    var { useState, useEffect, useMemo, useCallback, useRef, createContext, useContext } = React;

    // ── Display name context ──
    const DisplayNameContext = createContext(u => u.username);
    function useDisplayName() { return useContext(DisplayNameContext); }

    // ── Toast notification system ──
    const ToastContext = createContext(null);
    function useToast() { return useContext(ToastContext); }

    let toastIdCounter = 0;
    function ToastProvider({ children }) {
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

      const icons = { success: '✓', error: '✕', info: 'ℹ' };

      return React.createElement(ToastContext.Provider, { value: ctx },
        children,
        ReactDOM.createPortal(
          React.createElement('div', { className: 'toast-container' },
            toasts.map(t =>
              React.createElement('div', {
                key: t.id,
                className: 'toast toast-' + t.type + (t.exiting ? ' exiting' : ''),
                onClick: () => dismiss(t.id),
              },
                React.createElement('span', { className: 'toast-icon' }, icons[t.type]),
                React.createElement('span', { className: 'toast-message' }, t.message),
              )
            )
          ),
          document.body
        )
      );
    }

    const API_URL = (window.Capacitor && window.Capacitor.isNativePlatform()) ? 'https://futurega.me/api' : window.location.origin + '/api';

    // Detect shared schedule URL: /shared/:token
    const SHARED_MATCH = window.location.pathname.match(/^\/shared\/([a-f0-9]+)$/);
    const SHARED_TOKEN = SHARED_MATCH ? SHARED_MATCH[1] : null;

    // Detect password reset URL: /#reset?token=<hex>
    const RESET_MATCH = window.location.hash.match(/^#reset\?token=([a-f0-9]{64})$/);
    const RESET_TOKEN = RESET_MATCH ? RESET_MATCH[1] : null;

    // Debug: override "today" for testing via Settings page
    // Stored in localStorage('debugNow') — mutable at runtime

    // ── SVG Icons ─────────────────────────────────────────────

    const Icon = {
      search: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
        </svg>
      ),
      filter: () => (
        <svg viewBox="10 10 80 80" fill="currentColor" style={{width:'14px',height:'14px'}}>
          <path d="M79.93,28.82H45.04c-0.83,0-1.5-0.67-1.5-1.5s0.67-1.5,1.5-1.5h34.89c0.83,0,1.5,0.67,1.5,1.5S80.76,28.82,79.93,28.82z"/><path d="M28.77,28.82h-8.71c-0.83,0-1.5-0.67-1.5-1.5s0.67-1.5,1.5-1.5h8.71c0.83,0,1.5,0.67,1.5,1.5S29.6,28.82,28.77,28.82z"/><path d="M36.92,36.95c-5.32,0-9.64-4.32-9.64-9.63c0-5.32,4.32-9.64,9.64-9.64c5.31,0,9.63,4.32,9.63,9.64 C46.54,32.63,42.23,36.95,36.92,36.95z M36.92,20.68c-3.66,0-6.64,2.98-6.64,6.64c0,3.66,2.98,6.63,6.64,6.63 c3.66,0,6.63-2.97,6.63-6.63C43.54,23.66,40.57,20.68,36.92,20.68z"/><path d="M79.93,51.5H67.04c-0.83,0-1.5-0.67-1.5-1.5s0.67-1.5,1.5-1.5h12.89c0.83,0,1.5,0.67,1.5,1.5S80.76,51.5,79.93,51.5z"/><path d="M50.77,51.5H20.06c-0.83,0-1.5-0.67-1.5-1.5s0.67-1.5,1.5-1.5h30.71c0.83,0,1.5,0.67,1.5,1.5S51.6,51.5,50.77,51.5z"/><path d="M58.92,59.63c-5.32,0-9.64-4.32-9.64-9.63c0-5.32,4.32-9.64,9.64-9.64c5.31,0,9.63,4.32,9.63,9.64 C68.54,55.31,64.22,59.63,58.92,59.63z M58.92,43.36c-3.66,0-6.64,2.98-6.64,6.64c0,3.66,2.98,6.63,6.64,6.63 c3.66,0,6.63-2.97,6.63-6.63C65.54,46.34,62.57,43.36,58.92,43.36z"/><path d="M79.93,74.18H49.04c-0.83,0-1.5-0.67-1.5-1.5s0.67-1.5,1.5-1.5h30.89c0.83,0,1.5,0.67,1.5,1.5S80.76,74.18,79.93,74.18z"/><path d="M32.77,74.18H20.06c-0.83,0-1.5-0.67-1.5-1.5s0.67-1.5,1.5-1.5h12.71c0.83,0,1.5,0.67,1.5,1.5S33.6,74.18,32.77,74.18z"/><path d="M40.92,82.32c-5.32,0-9.64-4.33-9.64-9.64c0-5.31,4.32-9.63,9.64-9.63c5.31,0,9.63,4.32,9.63,9.63 C50.54,78,46.23,82.32,40.92,82.32z M40.92,66.05c-3.66,0-6.64,2.97-6.64,6.63c0,3.66,2.98,6.64,6.64,6.64 c3.66,0,6.63-2.98,6.63-6.64C47.54,69.02,44.57,66.05,40.92,66.05z"/>
        </svg>
      ),
      list: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="7" y1="8" x2="17" y2="8"/>
          <line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="16" x2="13" y2="16"/>
        </svg>
      ),
      calendar: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
      ),
      star: (filled) => (
        <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
      ),
      upload: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
      ),
      chevLeft: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      ),
      chevRight: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      ),
      warn: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:'14px',height:'14px'}}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      ),
      clock: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:'12px',height:'12px'}}>
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
      ),
      empty: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="8" y1="12" x2="16" y2="12"/>
        </svg>
      ),
      logout: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:'18px',height:'18px'}}>
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
          <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      ),
      sun: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:'18px',height:'18px'}}>
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
          <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ),
      moon: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:'18px',height:'18px'}}>
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
        </svg>
      ),
      sunset: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:'18px',height:'18px'}}>
          <path d="M18 14a6 6 0 00-12 0"/>
          <line x1="12" y1="2" x2="12" y2="5"/>
          <line x1="4.93" y1="5.93" x2="6.34" y2="7.34"/>
          <line x1="19.07" y1="5.93" x2="17.66" y2="7.34"/>
          <line x1="1" y1="14" x2="4" y2="14"/>
          <line x1="20" y1="14" x2="23" y2="14"/>
          <line x1="2" y1="18" x2="22" y2="18"/>
          <line x1="4" y1="22" x2="20" y2="22"/>
        </svg>
      ),
      cloud: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:'18px',height:'18px'}}>
          <path d="M18 10h-1.26A8 8 0 109 20h9a5 5 0 000-10z"/>
        </svg>
      ),
      signal: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{width:'16px',height:'16px'}}>
          <path d="M5.636 18.364a9 9 0 010-12.728"/>
          <path d="M18.364 5.636a9 9 0 010 12.728"/>
          <path d="M8.464 15.536a5 5 0 010-7.072"/>
          <path d="M15.536 8.464a5 5 0 010 7.072"/>
          <circle cx="12" cy="12" r="1.5"/>
        </svg>
      ),
      tracking: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
        </svg>
      ),
      user: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
        </svg>
      ),
      condition: () => (
        <svg viewBox="9 7 78 82" fill="currentColor">
          <path d="M81.08,15.66H71.19V12.08a4.5,4.5,0,0,0-4.5-4.5H29.31a4.5,4.5,0,0,0-4.5,4.5V22.24a4.51,4.51,0,0,0,4.5,4.5H66.69a4.51,4.51,0,0,0,4.5-4.5V18.66h9.89a2.61,2.61,0,0,1,2.61,2.61V43.89a2.61,2.61,0,0,1-2.61,2.61H78.56a1.5,1.5,0,0,0,0,3h2.52a5.61,5.61,0,0,0,5.61-5.61V21.27A5.61,5.61,0,0,0,81.08,15.66Zm-24.77,3H39.69a1.5,1.5,0,0,1,0-3H56.31a1.5,1.5,0,0,1,0,3ZM68.66,42.87,50.28,34.7a5.58,5.58,0,0,0-4.56,0L27.34,42.87a5.61,5.61,0,0,0,0,10.26L45.72,61.3a5.65,5.65,0,0,0,4.56,0l18.38-8.17a5.61,5.61,0,0,0,0-10.26ZM56.31,49.5H39.69a1.5,1.5,0,0,1,0-3H56.31a1.5,1.5,0,0,1,0,3ZM66.69,69.26H29.31a4.51,4.51,0,0,0-4.5,4.5v3.58H14.92a2.61,2.61,0,0,1-2.61-2.61V52.11a2.61,2.61,0,0,1,2.61-2.61h2.52a1.5,1.5,0,0,0,0-3H14.92a5.61,5.61,0,0,0-5.61,5.61V74.73a5.61,5.61,0,0,0,5.61,5.61h9.89v3.58a4.5,4.5,0,0,0,4.5,4.5H66.69a4.5,4.5,0,0,0,4.5-4.5V73.76A4.51,4.51,0,0,0,66.69,69.26ZM56.31,80.34H39.69a1.5,1.5,0,0,1,0-3H56.31a1.5,1.5,0,0,1,0,3Z"/>
        </svg>
      ),
      crosshairs: () => (
        <svg viewBox="0 0 334 334" fill="currentColor">
          <path d="M174.32 292.33c31.72,-1.91 60.27,-15.55 81.37,-36.64 21.09,-21.1 34.74,-49.65 36.64,-81.37l-30.53 0c-1.85,23.3 -12.07,44.25 -27.65,59.83 -15.58,15.58 -36.53,25.8 -59.83,27.65l0 30.53zm72.11 -118.01l-25.31 0c-4.23,0 -7.65,-3.43 -7.65,-7.66 0,-4.23 3.43,-7.66 7.65,-7.66l25.31 0c-1.81,-19.07 -10.3,-36.2 -23.1,-49 -12.81,-12.81 -29.93,-21.3 -49,-23.1l0 25.31c0,4.23 -3.43,7.65 -7.66,7.65 -4.23,0 -7.66,-3.43 -7.66,-7.65l0 -25.31c-19.07,1.81 -36.2,10.3 -49,23.1 -12.81,12.81 -21.3,29.93 -23.1,49l25.31 0c4.23,0 7.65,3.43 7.65,7.66 0,4.23 -3.43,7.66 -7.65,7.66l-25.31 0c1.81,19.07 10.3,36.2 23.1,49 12.81,12.81 29.93,21.3 49,23.1l0 -25.31c0,-4.23 3.43,-7.65 7.66,-7.65 4.23,0 7.66,3.43 7.66,7.65l0 25.31c19.07,-1.81 36.2,-10.3 49,-23.1 12.81,-12.81 21.3,-29.93 23.1,-49zm15.37 -15.31l30.53 0c-1.91,-31.72 -15.55,-60.27 -36.64,-81.37 -21.1,-21.09 -49.65,-34.74 -81.37,-36.64l0 30.53c23.3,1.85 44.25,12.07 59.83,27.65 15.58,15.58 25.8,36.53 27.65,59.83zm-102.8 -87.48l0 -30.53c-31.72,1.91 -60.27,15.55 -81.37,36.64 -21.09,21.1 -34.74,49.65 -36.64,81.37l30.53 0c1.85,-23.3 12.07,-44.25 27.65,-59.83 15.58,-15.58 36.53,-25.8 59.83,-27.65zm-87.48 102.8l-30.53 0c1.91,31.72 15.55,60.27 36.64,81.37 21.1,21.09 49.65,34.74 81.37,36.64l0 -30.53c-23.3,-1.85 -44.25,-12.07 -59.83,-27.65 -15.58,-15.58 -25.8,-36.53 -27.65,-59.83zm-45.86 0l-14.68 0c-4.23,0 -7.66,-3.43 -7.66,-7.66 0,-4.23 3.43,-7.66 7.66,-7.66l14.68 0c1.92,-35.94 17.28,-68.32 41.15,-92.19 23.87,-23.87 56.25,-39.23 92.19,-41.15l0 -14.68c0,-4.23 3.43,-7.66 7.66,-7.66 4.23,0 7.66,3.43 7.66,7.66l0 14.68c35.94,1.92 68.32,17.28 92.19,41.15 23.87,23.87 39.23,56.25 41.15,92.19l14.68 0c4.23,0 7.66,3.43 7.66,7.66 0,4.23 -3.43,7.66 -7.66,7.66l-14.68 0c-1.92,35.94 -17.28,68.32 -41.15,92.19 -23.87,23.87 -56.24,39.23 -92.19,41.15l0 14.68c0,4.23 -3.43,7.66 -7.66,7.66 -4.23,0 -7.66,-3.43 -7.66,-7.66l0 -14.68c-35.94,-1.92 -68.32,-17.28 -92.19,-41.15 -23.87,-23.87 -39.23,-56.25 -41.15,-92.19z"/>
        </svg>
      ),
      satellite: () => (
        <svg viewBox="-5 -10 110 110" fill="currentColor">
          <path d="M73.594 51.875c-0.742-0.73-1.75-1.133-2.789-1.117-1.043 0.016-2.035 0.445-2.758 1.195l-4.766 5-2.5-2.5 9.922-10.312c1.594-1.676 1.727-4.262 0.312-6.094l4.922-5.312c1.168-1.235 1.137-3.18-0.078-4.375l-4.062-4.141c-1.215-1.191-3.16-1.191-4.375 0l-5.078 5-0.547-0.547c-1.801-1.809-4.719-1.844-6.562-0.078l-9.141 8.828-2.734-2.734 3.984-3.906c0.754-0.746 1.172-1.77 1.156-2.828-0.016-1.063-0.461-2.07-1.234-2.797l-25.391-24.062c-1.539-1.469-3.973-1.434-5.469 0.078l-10.625 11.016c-0.719 0.754-1.106 1.766-1.078 2.805 0.031 1.043 0.473 2.031 1.234 2.742l25.547 23.438c1.531 1.418 3.902 1.383 5.391-0.078l4.219-4.141 2.734 2.734-9.453 8.984-0.937-0.234c-7.656-1.875-15.234-0.391-22.578 4.453-0.789 0.52-1.301 1.367-1.395 2.309-0.09 0.941 0.25 1.875 0.926 2.535l15 14.922-3.672 3.672c-2.023-1.066-4.52-0.516-5.906 1.301-1.391 1.816-1.266 4.367 0.293 6.043 1.555 1.672 4.094 1.977 6.004 0.723 1.91-1.258 2.637-3.707 1.719-5.801l3.75-3.672 14.766 14.766c0.578 0.59 1.363 0.926 2.188 0.938h0.312c0.926-0.106 1.758-0.621 2.266-1.406 2.266-3.438 7.266-12.578 4.297-23.281l-0.391-1.328 0.312-0.234 7.266-7.656 2.5 2.5-2.969 3.125c-0.719 0.754-1.106 1.766-1.078 2.805 0.031 1.043 0.473 2.031 1.234 2.742l25.469 23.984c0.754 0.719 1.766 1.106 2.805 1.078 1.043-0.031 2.031-0.473 2.742-1.234l9.688-10.234c0.719-0.754 1.106-1.766 1.078-2.805-0.031-1.043-0.473-2.031-1.234-2.742z"/>
          <path d="M9.609 74.219c-0.414-0.043-0.828 0.082-1.152 0.344-0.324 0.266-0.527 0.648-0.566 1.062 0 0.312-0.625 6.953 3.828 11.953 2.969 3.359 7.422 5.156 13.203 5.312h0.078c0.863 0 1.562-0.699 1.562-1.562s-0.699-1.562-1.562-1.562c-4.844-0.156-8.594-1.562-10.938-4.219-3.516-3.984-3.125-9.531-3.125-9.609 0.094-0.836-0.496-1.598-1.328-1.719z"/>
          <path d="M26.484 96.797c-7.109 0.391-12.734-1.406-16.719-5.234-6.562-6.328-6.641-16.406-6.641-16.562 0-0.414-0.164-0.812-0.457-1.105s-0.691-0.457-1.105-0.457c-0.863 0-1.562 0.699-1.562 1.562 0 0.469 0 11.484 7.578 18.828 4.297 4.141 10.078 6.172 17.188 6.172h1.875c0.863-0.043 1.527-0.777 1.484-1.641s-0.777-1.527-1.641-1.484z"/>
          <path d="M25.625 12.344c-0.609-0.594-1.578-0.594-2.188 0l-7.031 7.031c-0.363 0.273-0.59 0.688-0.621 1.141-0.031 0.449 0.133 0.895 0.453 1.215 0.32 0.32 0.766 0.484 1.215 0.453 0.453-0.031 0.867-0.258 1.141-0.621l7.031-7.031c0.594-0.609 0.594-1.578 0-2.188z"/>
          <path d="M32.891 20.781l-6.953 6.953c-0.301 0.289-0.473 0.688-0.48 1.106-0.008 0.418 0.152 0.82 0.441 1.121 0.606 0.625 1.602 0.645 2.227 0.039l6.953-6.953c0.465-0.621 0.406-1.492-0.145-2.043-0.551-0.551-1.422-0.609-2.043-0.145z"/>
          <path d="M78.75 63.125c-0.609-0.594-1.578-0.594-2.188 0l-7.031 7.031c-0.363 0.273-0.59 0.688-0.621 1.141-0.031 0.449 0.133 0.895 0.453 1.215 0.32 0.32 0.766 0.484 1.215 0.453 0.453-0.031 0.867-0.258 1.141-0.621l7.031-7.031c0.594-0.609 0.594-1.578 0-2.188z"/>
          <path d="M86.016 71.562l-6.953 6.953c-0.363 0.273-0.59 0.688-0.621 1.141-0.031 0.449 0.133 0.895 0.453 1.215 0.32 0.32 0.766 0.484 1.215 0.453 0.453-0.031 0.867-0.258 1.141-0.621l6.953-6.953c0.465-0.621 0.406-1.492-0.145-2.043-0.551-0.551-1.422-0.609-2.043-0.145z"/>
        </svg>
      ),
      ring: () => (
        <svg viewBox="-5 -10 110 110" fill="currentColor">
          <path d="m50 85.391c17.43 0 31.621-14.18 31.621-31.621 0-14.488-9.8086-26.73-23.141-30.449l2.2188-8.7109h-21.398l2.2188 8.7109c-13.328 3.7109-23.141 15.949-23.141 30.449 0 17.441 14.191 31.621 31.621 31.621zm0-59.242c15.23 0 27.621 12.391 27.621 27.621s-12.391 27.621-27.621 27.621-27.621-12.391-27.621-27.621 12.391-27.621 27.621-27.621z"/>
        </svg>
      ),
      bracelet: () => (
        <svg viewBox="4 29 93 40" fill="currentColor">
          <path d="M93.75 50.484l-1.059 0.867c-0.477 0.36-0.984 0.711-1.535 1.047-7.715 4.785-23.25 8.129-41.156 8.129s-33.441-3.344-41.156-8.129c-0.551-0.336-1.059-0.688-1.535-1.047l-1.059-0.867v5.18c0 1.215 0.684 2.352 1.82 3.445 1.387 1.336 3.426 2.57 5.969 3.684 8.113 3.555 21.207 5.836 35.961 5.836 14.758 0 27.852-2.281 35.961-5.836 2.543-1.117 4.582-2.348 5.969-3.684 1.133-1.094 1.82-2.227 1.82-3.445zm-35.648-18.887v8.098c14.82 0.852 27.203 4.039 33.625 8.262 0.07-0.063 0.137-0.125 0.203-0.191 1.133-1.094 1.82-2.227 1.82-3.441 0-1.09-0.559-2.117-1.492-3.113-1.148-1.223-2.836-2.352-4.961-3.398-6.535-3.215-17-5.504-29.191-6.219zm-16.207 0c-12.191 0.715-22.656 3.004-29.191 6.219-2.125 1.047-3.812 2.176-4.961 3.398-0.934 0.992-1.492 2.023-1.492 3.113 0 1.215 0.684 2.348 1.82 3.441 0.066 0.066 0.133 0.129 0.203 0.191 6.422-4.223 18.805-7.41 33.625-8.262v-8.098z" fillRule="evenodd"/>
        </svg>
      ),
      camera: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:'16px',height:'16px'}}>
          <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      ),
      restart: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10"/>
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
        </svg>
      ),
      gear: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
      ),
      link: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
        </svg>
      ),
      copy: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
      ),
      home: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
      handshake: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 17l-2 2-4-4 4.5-4.5"/>
          <path d="M13 7l2-2 4 4-4.5 4.5"/>
          <path d="M3 13l4 4"/>
          <path d="M17 7l4 4"/>
          <path d="M12 12l-2-2"/>
        </svg>
      ),
      people: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87"/>
          <path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
      ),
      dots: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="5" r="1.5" fill="currentColor"/>
          <circle cx="12" cy="19" r="1.5" fill="currentColor"/>
        </svg>
      ),
      play: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
      ),
      dollarSign: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23"/>
          <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/>
        </svg>
      ),
      zap: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
      ),
      // Playing cards icon for Hand Replayer
      cards: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="12" height="16" rx="1.5" transform="rotate(-8 8 12)"/>
          <rect x="10" y="4" width="12" height="16" rx="1.5" transform="rotate(8 16 12)"/>
        </svg>
      ),
      bell: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
      ),
      check: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      ),
      mapPin: () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      ),
    };

    // ── Theme constants ──
    const THEME_ORDER = ['dark', 'dusk', 'light', 'cloudy'];
    const isDarkTheme = (t) => t === 'dark' || t === 'dusk';
    const THEME_ICON = { dark: 'moon', dusk: 'sunset', light: 'sun', cloudy: 'cloud' };
    const THEME_LABEL = { dark: 'Dark', dusk: 'Dusk', light: 'Light', cloudy: 'Cloudy' };
    const THEME_META = { dark: '#111111', dusk: '#0d1525', light: '#f5f5f5', cloudy: '#cbcbcb' };

    // ── Blind Level Estimator ────────────────────────────────────
    // GUESS: Standard WSOP blind structure approximation.
    // Uses a simplified blind structure that starts at 100/200 with a standard
    // progression. Level durations are read from tournament data when available.
    // This is an approximation — real structures vary by event.
    function estimateBlindLevel(startTime, levelDurationMins) {
      const now = getNow();
      if (!startTime || isNaN(startTime) || now < startTime) return null;

      const elapsedMs = now - startTime;
      const levelMs = (levelDurationMins || 40) * 60 * 1000;
      const currentLevel = Math.floor(elapsedMs / levelMs) + 1;
      const elapsedInLevel = elapsedMs % levelMs;
      const remainingInLevel = Math.max(0, levelMs - elapsedInLevel);

      // GUESS: Approximate WSOP blind structure
      // Levels: 100/200, 200/300, 200/400, 300/600, 400/800, 500/1000,
      // 600/1200, 800/1600, 1000/2000, 1200/2400, 1500/3000, 2000/4000,
      // 2500/5000, 3000/6000, 4000/8000, 5000/10000, 6000/12000, 8000/16000...
      const blindStructure = [
        { sb: 100,   bb: 200,    ante: 200 },
        { sb: 200,   bb: 300,    ante: 300 },
        { sb: 200,   bb: 400,    ante: 400 },
        { sb: 300,   bb: 600,    ante: 600 },
        { sb: 400,   bb: 800,    ante: 800 },
        { sb: 500,   bb: 1000,   ante: 1000 },
        { sb: 600,   bb: 1200,   ante: 1200 },
        { sb: 800,   bb: 1600,   ante: 1600 },
        { sb: 1000,  bb: 2000,   ante: 2000 },
        { sb: 1200,  bb: 2400,   ante: 2400 },
        { sb: 1500,  bb: 3000,   ante: 3000 },
        { sb: 2000,  bb: 4000,   ante: 4000 },
        { sb: 2500,  bb: 5000,   ante: 5000 },
        { sb: 3000,  bb: 6000,   ante: 6000 },
        { sb: 4000,  bb: 8000,   ante: 8000 },
        { sb: 5000,  bb: 10000,  ante: 10000 },
        { sb: 6000,  bb: 12000,  ante: 12000 },
        { sb: 8000,  bb: 16000,  ante: 16000 },
        { sb: 10000, bb: 20000,  ante: 20000 },
        { sb: 15000, bb: 30000,  ante: 30000 },
        { sb: 20000, bb: 40000,  ante: 40000 },
        { sb: 25000, bb: 50000,  ante: 50000 },
        { sb: 30000, bb: 60000,  ante: 60000 },
        { sb: 40000, bb: 80000,  ante: 80000 },
        { sb: 50000, bb: 100000, ante: 100000 },
      ];

      const idx = Math.min(currentLevel - 1, blindStructure.length - 1);
      const blinds = blindStructure[idx];

      return {
        level: currentLevel,
        sb: blinds.sb,
        bb: blinds.bb,
        ante: blinds.ante,
        remainingMs: remainingInLevel,
        remainingMin: Math.floor(remainingInLevel / 60000),
        remainingSec: Math.floor((remainingInLevel % 60000) / 1000),
      };
    }

    // ── Late Reg Bar ───────────────────────────────────────────

    function LateRegBar({ lateRegEnd, date, time, venueAbbr, venue }) {
      const [now, setNow] = React.useState(getNow());

      // Tick every 30 seconds
      useEffect(() => {
        const id = setInterval(() => setNow(getNow()), 30000);
        return () => clearInterval(id);
      }, []);

      // ── Pre-start countdown ──────────────────────────────────
      if (date) {
        const startMs = venue ? parseDateTimeInTz(date, time, venue) : parseDateTime(date, time || '12:00 AM');
        if (now < startMs) {
          const totalSec = Math.floor((startMs - now) / 1000);
          const d = Math.floor(totalSec / 86400);
          const h = Math.floor((totalSec % 86400) / 3600);
          const m = Math.floor((totalSec % 3600) / 60);

          const parts = [];
          if (d > 0) parts.push(`${d} day${d !== 1 ? 's' : ''}`);
          if (h > 0) parts.push(`${h} hour${h !== 1 ? 's' : ''}`);
          parts.push(`${m} minute${m !== 1 ? 's' : ''}`);

          return (
            <div className="late-reg-wrap">
              <div className="late-reg-label-row">
                <span className="late-reg-label pending">Until Start</span>
                <span className="late-reg-sep"></span>
                <span className="late-reg-time pending">{parts.join(', ')}</span>
              </div>
            </div>
          );
        }
      }

      if (!lateRegEnd) return null;

      const endMs   = parseLateRegEnd(lateRegEnd, date);
      if (isNaN(endMs)) return null;
      const diffMs  = endMs - now;
      const diffMin = Math.floor(diffMs / 60000);

      // Format end time as clock: "5:00 PM"
      const endDate = new Date(endMs);
      const endClock = endDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      // Determine status bucket
      let status, label, timeStr;
      if (diffMs <= 0) {
        status  = 'closed';
        label   = 'Late Reg Closed';
        timeStr = null;
      } else if (diffMin < 30) {
        status  = 'urgent';
        label   = 'Late Reg — Closing Soon';
        timeStr = `${diffMin}m left | ${endClock}`;
      } else if (diffMin < 120) {
        const h = Math.floor(diffMin / 60);
        const m = diffMin % 60;
        status  = 'soon';
        label   = 'Late Reg Open';
        timeStr = (h > 0 ? `${h}h ${m}m left` : `${m}m left`) + ` | ${endClock}`;
      } else {
        const h = Math.floor(diffMin / 60);
        const m = diffMin % 60;
        status  = 'open';
        label   = 'Late Reg Open';
        timeStr = (h > 0 ? `${h}h ${m}m left` : `${m}m left`) + ` | ${endClock}`;
      }

      // Progress bar: % of a 12-hour window remaining (capped 0–100)
      const windowMs = 12 * 60 * 60 * 1000;
      const pct      = status === 'closed' ? 0 : Math.min(100, Math.max(0, (diffMs / windowMs) * 100));
      const brandColor = getVenueBrandColor(venueAbbr);
      const critical = status !== 'closed' && pct <= 15;

      return (
        <div className="late-reg-wrap">
          <div className="late-reg-label-row">
            <span className={`late-reg-label ${status}`}>{label}</span>
            {timeStr && <span className={`late-reg-time ${status}`}>{timeStr}</span>}
          </div>
          <div className="late-reg-bar-bg">
            <div
              className={`late-reg-bar-fill ${critical ? 'critical' : ''}`}
              style={{ width: `${pct}%`, background: critical ? undefined : (status === 'closed' ? 'var(--border)' : brandColor) }}
            />
          </div>
        </div>
      );
    }

    // ── Mini Late Reg Bar (collapsed calendar row) ────────────

    function MiniLateRegBar({ lateRegEnd, date, time, venueAbbr, openOnly, venue }) {
      const [now, setNow] = React.useState(getNow());
      useEffect(() => {
        const id = setInterval(() => setNow(getNow()), 30000);
        return () => clearInterval(id);
      }, []);

      // Before start — show countdown to start (hidden in openOnly mode)
      if (date) {
        const startMs = venue ? parseDateTimeInTz(date, time, venue) : parseDateTime(date, time || '12:00 AM');
        if (now < startMs) {
          if (openOnly) return null;
          const totalSec = Math.floor((startMs - now) / 1000);
          const d = Math.floor(totalSec / 86400);
          const h = Math.floor((totalSec % 86400) / 3600);
          const m = Math.floor((totalSec % 3600) / 60);
          let label;
          if (d > 0) label = `${d}d ${h}h`;
          else if (h > 0) label = `${h}h ${m}m`;
          else label = `${m}m`;
          return (
            <div className="mini-late-reg">
              <span className="mini-late-reg-time" style={{opacity:0.5}}>starts in {label}</span>
            </div>
          );
        }
      }

      if (!lateRegEnd) return null;

      const endMs  = parseLateRegEnd(lateRegEnd, date);
      if (isNaN(endMs)) return null;
      const diffMs = endMs - now;
      const diffMin = Math.floor(diffMs / 60000);
      const endClock = new Date(endMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

      if (diffMs <= 0) {
        if (openOnly) return null;
        return (
          <div className="mini-late-reg">
            <span className="mini-late-reg-time" style={{opacity:0.4}}>late reg closed</span>
            <div className="mini-late-reg-track">
              <div className="mini-late-reg-fill" style={{ width: '0%' }} />
            </div>
          </div>
        );
      }

      const h = Math.floor(diffMin / 60);
      const m = diffMin % 60;
      const timeStr = (h > 0 ? `${h}h ${m}m` : `${m}m`) + ` | ${endClock}`;
      const windowMs = 12 * 60 * 60 * 1000;
      const pct = Math.min(100, Math.max(0, (diffMs / windowMs) * 100));
      const brandColor = getVenueBrandColor(venueAbbr);

      const critical = pct <= 15;
      return (
        <div className="mini-late-reg">
          <span className="mini-late-reg-time">late reg {timeStr}</span>
          <div className="mini-late-reg-track">
            <div className={`mini-late-reg-fill ${critical ? 'critical' : ''}`} style={{ width: `${pct}%`, background: critical ? undefined : brandColor }} />
          </div>
        </div>
      );
    }

    // ── Condition Picker (inline in expanded card) ─────────────

    function ConditionPicker({ tournament, conditions, allTournaments, onSet, onRemove, onClose, scheduleIds, onToggle }) {
      // Parse existing conditions to initialize state
      const existingSat = conditions.find(c => c.type === 'IF_WIN_SEAT' || c.type === 'IF_NO_SEAT');
      const existingProfit = conditions.find(c => c.type === 'PROFIT_THRESHOLD');
      const existingBust = conditions.find(c => c.type === 'IF_BUST');

      const [satEnabled, setSatEnabled] = useState(!!existingSat);
      const [satType, setSatType] = useState(existingSat ? existingSat.type : 'IF_WIN_SEAT');
      const [selectedSatId, setSelectedSatId] = useState(existingSat ? existingSat.dependsOnId : null);
      const [satSearch, setSatSearch] = useState('');
      const [profitEnabled, setProfitEnabled] = useState(!!existingProfit);
      const [profitAmount, setProfitAmount] = useState(existingProfit ? existingProfit.profitThreshold : '');
      const [bustEnabled, setBustEnabled] = useState(!!existingBust);
      const [selectedBustId, setSelectedBustId] = useState(existingBust ? existingBust.dependsOnId : null);

      const bustEvents = useMemo(function() {
        return getIfIBustEvents(tournament, allTournaments, scheduleIds);
      }, [tournament, allTournaments, scheduleIds]);
      const [isPublic, setIsPublic] = useState(
        tournament.condition_is_public !== undefined && tournament.condition_is_public !== null
          ? !!tournament.condition_is_public
          : true
      );

      const suggestedSatellites = useMemo(() =>
        allTournaments.filter(t => t.is_satellite && t.target_event === tournament.event_number),
        [allTournaments, tournament.event_number]
      );

      const searchResults = useMemo(() => {
        if (!satSearch.trim()) return [];
        const q = satSearch.toLowerCase();
        return allTournaments.filter(t =>
          t.id !== tournament.id &&
          ((t.event_number || '').toLowerCase().includes(q) || (t.event_name || '').toLowerCase().includes(q))
        ).slice(0, 8);
      }, [allTournaments, satSearch, tournament.id]);

      const canSubmit = (satEnabled && selectedSatId) || (profitEnabled && profitAmount && parseInt(profitAmount) !== 0) || (bustEnabled && selectedBustId);

      const handleSubmit = () => {
        if (!canSubmit) return;
        const result = [];
        if (satEnabled && selectedSatId) {
          result.push({ type: satType, dependsOnId: selectedSatId });
        }
        if (profitEnabled && profitAmount && parseInt(profitAmount) !== 0) {
          result.push({ type: 'PROFIT_THRESHOLD', profitThreshold: parseInt(profitAmount) });
        }
        if (bustEnabled && selectedBustId) {
          result.push({ type: 'IF_BUST', dependsOnId: selectedBustId });
        }
        onSet(result, isPublic);
      };

      const renderItem = (t) => (
        <div
          key={t.id}
          className={`condition-sat-item ${selectedSatId === t.id ? 'selected' : ''}`}
          onClick={() => setSelectedSatId(t.id)}
        >
          <span style={{fontWeight:600,flexShrink:0}}>#{t.event_number}</span>
          <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.event_name}</span>
          <span style={{flexShrink:0,color:'var(--text-muted)',fontSize:'0.72rem'}}>${t.buyin}</span>
        </div>
      );

      const checkboxStyle = {
        width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer'
      };
      const sectionLabelStyle = {
        fontSize: '0.82rem', fontFamily: "'Univers Condensed','Univers',sans-serif", fontWeight: 600, color: 'var(--text)', cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '8px'
      };

      return (
        <div className="condition-picker">
          <div className="condition-picker-title">Set Conditions</div>

          {/* Satellites checkbox */}
          <label style={{...sectionLabelStyle, marginBottom: satEnabled ? '8px' : '12px'}}>
            <input type="checkbox" checked={satEnabled} onChange={e => setSatEnabled(e.target.checked)} style={checkboxStyle} />
            Satellites
          </label>

          {satEnabled && (
            <div style={{paddingLeft:'24px',marginBottom:'12px'}}>
              <div className="condition-type-row" style={{marginBottom:'8px'}}>
                <button className={`condition-type-btn ${satType === 'IF_WIN_SEAT' ? 'active' : ''}`} onClick={() => setSatType('IF_WIN_SEAT')}>
                  If I win a seat
                </button>
                <button className={`condition-type-btn ${satType === 'IF_NO_SEAT' ? 'active' : ''}`} onClick={() => setSatType('IF_NO_SEAT')}>
                  If I don't win a seat
                </button>
              </div>

              {suggestedSatellites.length > 0 && (
                <React.Fragment>
                  <div style={{fontSize:'0.68rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:'4px'}}>
                    Related Satellites
                  </div>
                  <div className="condition-sat-list">
                    {suggestedSatellites.map(renderItem)}
                  </div>
                </React.Fragment>
              )}

              <div style={{fontSize:'0.68rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:'4px'}}>
                {suggestedSatellites.length > 0 ? 'Or search any event' : 'Search for an event'}
              </div>
              <input
                className="condition-search"
                placeholder="Event name or number..."
                value={satSearch}
                onChange={e => setSatSearch(e.target.value)}
              />
              {searchResults.length > 0 && (
                <div className="condition-sat-list">
                  {searchResults.map(renderItem)}
                </div>
              )}
            </div>
          )}

          {/* Profit / Loss checkbox */}
          <label style={{...sectionLabelStyle, marginBottom: profitEnabled ? '8px' : '12px'}}>
            <input type="checkbox" checked={profitEnabled} onChange={e => setProfitEnabled(e.target.checked)} style={checkboxStyle} />
            Profit / Loss
          </label>

          {profitEnabled && (
            <div style={{paddingLeft:'24px',marginBottom:'12px'}}>
              <div style={{fontSize:'0.68rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:'4px'}}>
                Profit threshold ($)
              </div>
              <input
                className="condition-search"
                type="number"
                placeholder="e.g. 5000"
                value={profitAmount}
                onChange={e => setProfitAmount(e.target.value)}
              />
              <span style={{fontSize:'0.7rem',color:'var(--text-muted)',display:'block',marginTop:'2px'}}>
                I'll play this event if I'm up at least this amount
              </span>
            </div>
          )}

          {/* If I Bust checkbox */}
          {bustEvents.length > 0 && (
            <>
            <label style={{...sectionLabelStyle, marginBottom: bustEnabled ? '8px' : '12px'}}>
              <input type="checkbox" checked={bustEnabled} onChange={e => setBustEnabled(e.target.checked)} style={checkboxStyle} />
              If I Bust
            </label>

            {bustEnabled && (
              <div style={{paddingLeft:'24px',marginBottom:'12px'}}>
                <div style={{fontSize:'0.68rem',fontWeight:600,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.04em',marginBottom:'4px'}}>
                  I'll play this if I bust from:
                </div>
                <div className="condition-sat-list">
                  {bustEvents.map(t => (
                    <div
                      key={t.id}
                      className={`condition-sat-item ${selectedBustId === t.id ? 'selected' : ''}`}
                      onClick={() => setSelectedBustId(t.id === selectedBustId ? null : t.id)}
                    >
                      <span style={{fontWeight:600,flexShrink:0,fontSize:'0.72rem',color:'var(--text-muted)'}}>{t.time}</span>
                      <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{t.event_name}</span>
                      <span style={{flexShrink:0,color:'var(--text-muted)',fontSize:'0.72rem'}}>{currencySymbol(t.venue)}{Number(t.buyin).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>
          )}

          {/* Public toggle */}
          <div
            style={{display:'flex',alignItems:'center',gap:'8px',marginTop:'4px',fontSize:'0.75rem',fontFamily:"'Univers Condensed','Univers',sans-serif",color:'var(--text-muted)',cursor:'pointer',userSelect:'none'}}
            onClick={() => setIsPublic(p => !p)}
          >
            <div style={{
              width:'32px',height:'18px',borderRadius:'9px',
              background: isPublic ? 'var(--accent)' : 'var(--border)',
              position:'relative',transition:'background 0.2s'
            }}>
              <div style={{
                width:'14px',height:'14px',borderRadius:'50%',background:'#fff',
                position:'absolute',top:'2px',
                left: isPublic ? '16px' : '2px',
                transition:'left 0.2s'
              }} />
            </div>
            <span style={{color:'var(--text)'}}>Show conditions on shared schedule</span>
          </div>

          {/* Action buttons */}
          <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
            <button
              className="condition-type-btn active"
              style={{flex:1,opacity:canSubmit ? 1 : 0.4,pointerEvents:canSubmit ? 'auto' : 'none'}}
              onClick={handleSubmit}
            >
              Set Conditions
            </button>
            <button className="condition-type-btn" style={{flex:'0 0 auto'}} onClick={onClose}>
              Cancel
            </button>
          </div>

          {conditions.length > 0 && (
            <button
              style={{marginTop:'8px',background:'none',border:'none',color:'var(--accent2)',fontSize:'0.75rem',cursor:'pointer',padding:'4px 0',fontFamily:"'Univers Condensed','Univers',sans-serif",fontWeight:600}}
              onClick={onRemove}
            >
              Remove All Conditions
            </button>
          )}
        </div>
      );
    }

    // ── Avatar ─────────────────────────────────────────────────

    function Avatar({ src, username, size = 28 }) {
      if (src) {
        return React.createElement('img', {
          src,
          alt: username,
          style: {
            width: size, height: size, borderRadius: '50%',
            objectFit: 'cover', flexShrink: 0
          }
        });
      }
      const initial = (username || '?').charAt(0).toUpperCase();
      const hue = [...(username || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
      return React.createElement('div', {
        style: {
          width: size, height: size, borderRadius: '50%', flexShrink: 0,
          background: `hsl(${hue}, 50%, 40%)`, color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: size * 0.45, fontWeight: 700, lineHeight: 1
        }
      }, initial);
    }

    const VENUE_TO_SERIES = {
      'Aria Resort & Casino': 'Aria Poker Classic',
      'Golden Nugget': 'Golden Nugget Grand',
      'Horseshoe / Paris Las Vegas': 'WSOP',
      'Irish Poker Open': 'Irish Poker Open',
      'MGM Grand': 'MGM Grand Championship',
      'Orleans': 'Orleans Open',
      'Resorts World': 'Resorts World Summer Series',
      'South Point': 'South Point Summer Poker',
      'Texas Card House': 'WSOPC Austin',
      'Turning Stone Casino': 'WSOPC Turning Stone',
      'Borgata': 'Borgata Spring Poker Open',
      'Venetian': 'Venetian DeepStack Championship',
      'Wynn Las Vegas': 'Wynn Summer Classic',
      'Foxwoods': 'Foxwoods Poker Classic',
      'Thunder Valley': 'Thunder Valley Poker Series',
      'Bellagio': 'Bellagio',
      'Lodge Poker Club': 'Lodge Championship Series',
      'bestbet Jacksonville': 'bestbet Jacksonville',
      "Bally's Lake Tahoe": 'WSOPC Lake Tahoe',
      "Harrah's Cherokee": 'WSOPC Cherokee',
      'Choctaw Casino': 'WSOPC Choctaw',
      'Horseshoe Tunica': 'Horseshoe Tunica',
      'Caesars Palace': 'Caesars Palace',
      'Seminole Hard Rock': 'Seminole Hard Rock',
      'WSOP Europe': 'WSOP Europe',
      'MGM National Harbor': 'MGM National Harbor'
    };

    function formatChips(n) {
      if (n == null) return '';
      n = Number(n);
      if (n >= 1000000) return (n / 1000000).toFixed(n % 1000000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'M';
      if (n >= 1000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1).replace(/\.0$/, '') + 'k';
      return String(n);
    }

    // Parse shorthand like "275k" → 275000, "1.2M" → 1200000, "50000" → 50000
    function parseShorthand(str) {
      if (!str) return '';
      str = String(str).trim().replace(/,/g, '');
      const m = str.match(/^(\d+\.?\d*)\s*([kKmM]?)$/);
      if (!m) return str;
      let num = parseFloat(m[1]);
      const suffix = m[2].toLowerCase();
      if (suffix === 'k') num *= 1000;
      else if (suffix === 'm') num *= 1000000;
      return String(Math.round(num));
    }


    function CardRow({ text, stud, max, placeholderCount, splay, cardTheme }) {
      let cards = parseCardNotation(text);
      if (!cards.length && placeholderCount > 0) {
        return React.createElement('div', { className: 'card-row' + (splay ? ' card-row-splay' : '') },
          Array.from({ length: placeholderCount }, (_, i) => {
            var splayStyle = splay ? getSplayStyle(i, placeholderCount, splay) : undefined;
            return React.createElement('div', { key: 'ph' + i, className: 'card-placeholder', style: splayStyle });
          })
        );
      }
      if (!cards.length) return null;
      if (max && cards.length > max) cards = cards.slice(0, max);
      const downIdx = stud ? new Set([0, 1, 6]) : null;
      var SUIT_SYMBOLS = {h:'\u2665',d:'\u2666',c:'\u2663',s:'\u2660'};
      return React.createElement('div', { className: 'card-row' + (splay ? ' card-row-splay' : '') },
        cards.map((c, i) => {
          const isDown = downIdx && downIdx.has(i);
          const isStudUp = stud && !isDown && i >= 2 && i <= 5;
          var studYOffset = isStudUp ? -5 : isDown ? 5 : 0;
          var baseStyle = {};
          if (splay) {
            Object.assign(baseStyle, getSplayStyle(i, cards.length, splay, studYOffset));
          } else {
            if (studYOffset) baseStyle.marginTop = studYOffset;
          }
          const style = Object.keys(baseStyle).length ? baseStyle : undefined;
          const k = c.rank + c.suit + '_' + i;
          if (c.suit === 'x') {
            return React.createElement('div', { key: k, className: 'card-unknown', style });
          }
          if (cardTheme === 'classic') {
            var isRed = c.suit === 'h' || c.suit === 'd';
            return React.createElement('div', {
              key: k, className: 'card-classic' + (isRed ? ' card-classic-red' : ' card-classic-dark'), style
            },
              React.createElement('span', { className: 'card-classic-rank' }, c.rank.toUpperCase()),
              React.createElement('span', { className: 'card-classic-suit' }, SUIT_SYMBOLS[c.suit] || '')
            );
          }
          var cardDir = '/cards/';
          return React.createElement('img', {
              key: k, className: 'card-img', style,
              src: cardDir + 'cards_gui_' + c.rank + c.suit + '.svg',
              alt: c.rank + c.suit,
              loading: 'eager'
            });
        })
      );
    }

    function getSplayStyle(index, total, angle, yOffset) {
      if (total <= 1) return {};
      var step = (2 * angle) / (total - 1);
      var rot = -angle + step * index;
      var extraY = yOffset || 0;
      if (total <= 2) {
        return {
          transform: 'rotate(' + rot + 'deg)',
          transformOrigin: '50% 120%',
          marginLeft: index === 0 ? 0 : -22,
          marginTop: extraY || undefined,
          zIndex: index,
        };
      }
      // 3+ cards: trig-based arc from a true shared pivot point
      var rad = rot * Math.PI / 180;
      var radius = total <= 5 ? 85 : 110;
      var x = Math.sin(rad) * radius;
      var y = -Math.cos(rad) * radius + radius + extraY;
      return {
        position: 'absolute',
        left: '50%',
        bottom: 0,
        transform: 'translate(calc(-50% + ' + x.toFixed(1) + 'px), ' + y.toFixed(1) + 'px) rotate(' + rot + 'deg)',
        zIndex: index,
      };
    }

    function ordinalSuffix(n) {
      const s = ['th','st','nd','rd'], v = n % 100;
      return (s[(v-20)%10] || s[v] || s[0]);
    }

    function formatLiveUpdate(u) {
      if (!u) return '';
      const parts = [];
      if (u.stack) {
        let s = formatChips(u.stack);
        if (u.sb || u.bb) {
          const blindParts = [u.sb ? formatChips(u.sb) : null, u.bb ? formatChips(u.bb) : null].filter(Boolean);
          if (u.bb_ante || u.bbAnte) blindParts.push(formatChips(u.bb_ante || u.bbAnte));
          if (blindParts.length) s += ' @ ' + blindParts.join('/');
        }
        const bbVal = Number(u.bb || 0);
        if (bbVal > 0) {
          const bbCount = (Number(u.stack) / bbVal).toFixed(1).replace(/\.0$/, '');
          s += ' (' + bbCount + 'bb)';
        }
        parts.push(s);
      }
      const bub = u.bubble;
      if (bub && !(u.is_itm || u.isItm)) parts.push(bub + ' from money');
      if (u.is_itm || u.isItm) {
        const locked = u.locked_amount || u.lockedAmount;
        parts.push('ITM' + (locked ? ' ($' + Number(locked).toLocaleString() + ' locked)' : ''));
      }
      const ft = u.is_final_table || u.isFinalTable;
      if (ft) {
        let ftStr = 'FT';
        const pl = u.places_left || u.placesLeft;
        if (pl) ftStr += ' (' + pl + ' left)';
        const fp = u.first_place_prize || u.firstPlacePrize;
        if (fp) ftStr += ' 1st: $' + Number(fp).toLocaleString();
        parts.push(ftStr);
      }
      const deal = u.is_deal || u.isDeal;
      if (deal) {
        let dStr = 'Deal';
        const dp = u.deal_place || u.dealPlace;
        if (dp) dStr += ' ' + dp + ordinalSuffix(dp);
        const dpay = u.deal_payout || u.dealPayout;
        if (dpay) dStr += ' $' + Number(dpay).toLocaleString();
        parts.push(dStr);
      }
      if (u.is_busted || u.isBusted) parts.push('Busted');
      const entries = u.total_entries || u.totalEntries;
      if (entries) parts.push(Number(entries).toLocaleString() + ' entries');
      const bagged = u.is_bagged || u.isBagged;
      const day = u.bag_day || u.bagDay;
      if (bagged) parts.push('Bagged' + (day ? ' Day ' + day : ''));
      return parts.join(' · ');
    }

    function LiveUpdateButton({ mySchedule, myActiveUpdates, onPost, onAddTracking }) {
      const containerRef = useRef(null);
      const panelRef = useRef(null);
      const toggleRef = useRef(null);
      const [open, setOpen] = useState(false);
      const [selectedTournamentId, setSelectedTournamentId] = useState(null);
      const [stack, setStack] = useState('');
      const [sb, setSb] = useState('');
      const [bb, setBb] = useState('');
      const [bbAnte, setBbAnte] = useState('');
      const [isRegClosed, setIsRegClosed] = useState(false);
      const [bubble, setBubble] = useState('');
      const [isItm, setIsItm] = useState(false);
      const [lockedAmount, setLockedAmount] = useState('');
      const [isFinalTable, setIsFinalTable] = useState(false);
      const [placesLeft, setPlacesLeft] = useState('');
      const [firstPlacePrize, setFirstPlacePrize] = useState('');
      const [isDeal, setIsDeal] = useState(false);
      const [dealPlace, setDealPlace] = useState('');
      const [dealPayout, setDealPayout] = useState('');
      const [isBusted, setIsBusted] = useState(false);
      const [totalEntries, setTotalEntries] = useState('');
      const [isBagged, setIsBagged] = useState(false);
      const [bagDay, setBagDay] = useState('');
      const [cameraOpen, setCameraOpen] = useState(false);
      const [stackHistory, setStackHistory] = useState([]);
      const [isRegistered, setIsRegistered] = useState(false);
      const [registrationOpen, setRegistrationOpen] = useState(false);
      const [hasJoinLevel, setHasJoinLevel] = useState(false);
      const [joiningSb, setJoiningSb] = useState('');
      const [joiningBb, setJoiningBb] = useState('');
      const [joiningAnte, setJoiningAnte] = useState('');
      const [updateType, setUpdateType] = useState('update'); // 'register' | 'update' | 'hand' | 'finish'
      const externalTabRef = useRef(null); // tracks tab override from custom event
      const externalBagRef = useRef(null); // tracks bag override from custom event

      // Listen for external requests to open to a specific tab + tournament
      useEffect(() => {
        const handler = (e) => {
          const { tab, tournamentId, bag } = e.detail || {};
          if (tab) externalTabRef.current = tab;
          if (bag) externalBagRef.current = bag;
          if (tournamentId) setSelectedTournamentId(tournamentId);
          if (tab) setUpdateType(tab);
          if (bag) { setIsBagged(true); setBagDay(String(bag)); }
          setOpen(true);
        };
        window.addEventListener('openLiveUpdate', handler);
        return () => window.removeEventListener('openLiveUpdate', handler);
      }, []);
      const [bustPlace, setBustPlace] = useState('');
      const [bustPayout, setBustPayout] = useState('');
      const [bustNote, setBustNote] = useState('');
      const [heroHand, setHeroHand] = useState('');
      const [boardCards, setBoardCards] = useState('');
      const [numOpponents, setNumOpponents] = useState(1);
      const [opponentHands, setOpponentHands] = useState(['', '', '', '', '']);
      const [handNote, setHandNote] = useState('');
      const hasOpponents = opponentHands.slice(0, numOpponents).some(h => parseCardNotation(h).length > 0);
      const activeOpponents = opponentHands.slice(0, numOpponents);
      const [handGame, setHandGame] = useState(null);

      const todayISO = getToday();
      const activeUpdateMap = useMemo(() => {
        const map = {};
        (myActiveUpdates || []).forEach(u => { map[u.tournament_id] = u; });
        return map;
      }, [myActiveUpdates]);

      const todayTournaments = useMemo(() =>
        (mySchedule || []).filter(t =>
          normaliseDate(t.date) === todayISO && t.venue !== 'Personal'
        ),
        [mySchedule, todayISO]
      );

      // Past schedule events that aren't busted — unless late reg still open + re-entry allowed
      const previousActive = useMemo(() => {
        const todayIds = new Set(todayTournaments.map(t => t.id));
        const bustedMap = {};
        (myActiveUpdates || []).filter(u => u.is_busted).forEach(u => { bustedMap[u.tournament_id] = u; });
        const now = Date.now();
        return (mySchedule || []).filter(t => {
          if (todayIds.has(t.id) || t.venue === 'Personal') return false;
          if (normaliseDate(t.date) >= todayISO) return false;
          if (!bustedMap[t.id]) return true; // not busted — include
          // Busted: keep if re-entry allowed AND late reg still open
          if (!t.reentry) return false;
          const lateEnd = parseLateRegEnd(t.late_reg_end, t.date);
          return !isNaN(lateEnd) && now < lateEnd;
        });
      }, [mySchedule, todayTournaments, myActiveUpdates, todayISO]);

      const allOptions = useMemo(() => {
        const today = todayTournaments.map(t => ({ id: t.id, name: t.event_name, group: 'Today' }));
        const prev = previousActive.map(t => ({ id: t.id, name: t.event_name, group: 'In Progress' }));
        return [...today, ...prev];
      }, [todayTournaments, previousActive]);

      const isRegPastClose = (tournamentId) => {
        const t = todayTournaments.find(x => x.id === tournamentId);
        if (!t?.late_reg_end) return false;
        const now = new Date();
        const [h, m] = t.late_reg_end.split(':').map(Number);
        const closeTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m);
        return now >= closeTime;
      };

      const resetFields = (prefill, tournamentId) => {
        setStack(prefill?.stack || '');
        setSb(prefill?.sb || '');
        setBb(prefill?.bb || '');
        setBbAnte(prefill?.bb_ante || '');
        setIsRegClosed(prefill ? !!prefill.is_reg_closed : isRegPastClose(tournamentId));
        setBubble(prefill?.bubble || '');
        setIsItm(!!prefill?.is_itm);
        setLockedAmount(prefill?.locked_amount || '');
        setIsFinalTable(!!prefill?.is_final_table);
        setPlacesLeft(prefill?.places_left || '');
        setFirstPlacePrize(prefill?.first_place_prize || '');
        setIsDeal(!!prefill?.is_deal);
        setDealPlace(prefill?.deal_place || '');
        setDealPayout(prefill?.deal_payout || '');
        setIsBusted(!!prefill?.is_busted);
        setTotalEntries(prefill?.total_entries || '');
        if (externalBagRef.current) {
          setIsBagged(true);
          setBagDay(String(externalBagRef.current));
          externalBagRef.current = null;
        } else {
          setIsBagged(!!prefill?.is_bagged);
          setBagDay(prefill?.bag_day || '');
        }
        setBustPlace('');
        setBustPayout('');
        setBustNote('');
        setHeroHand('');
        setBoardCards('');
        setNumOpponents(1);
        setOpponentHands(['', '', '', '', '']);
        setHandNote('');
        setHandGame(null);
        // Auto-select tab based on tournament state (unless overridden by custom event)
        if (externalTabRef.current) {
          setUpdateType(externalTabRef.current);
          externalTabRef.current = null;
        } else if (prefill && !prefill.is_busted) {
          setUpdateType('update');
        } else if (!prefill) {
          setUpdateType('register');
        }
      };

      useEffect(() => {
        if (!open) return;
        // Auto-select: most recent active update's tournament, or single today tournament
        const mostRecent = (myActiveUpdates || [])[0];
        if (mostRecent && allOptions.find(o => o.id === mostRecent.tournament_id)) {
          setSelectedTournamentId(mostRecent.tournament_id);
          resetFields(mostRecent, mostRecent.tournament_id);
        } else if (allOptions.length === 1) {
          setSelectedTournamentId(allOptions[0].id);
          resetFields(activeUpdateMap[allOptions[0].id] || null, allOptions[0].id);
        } else {
          setSelectedTournamentId(null);
          resetFields(null, null);
        }
      }, [open, allOptions, myActiveUpdates]);

      useEffect(() => {
        if (!open) return;
        const handler = (e) => {
          // Don't close panel while camera or registration overlay is active
          if (cameraOpen || registrationOpen) return;
          if (panelRef.current && panelRef.current.contains(e.target)) return;
          if (toggleRef.current && toggleRef.current.contains(e.target)) return;
          setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
      }, [open, cameraOpen, registrationOpen]);

      const ps = (v) => Number(parseShorthand(v)) || 0;
      const buildUpdateData = () => {
        const base = { tournamentId: selectedTournamentId, updateType };
        if (updateType === 'finish') {
          return {
            ...base,
            stack: stack ? ps(stack) : 0,
            sb: sb ? ps(sb) : null, bb: bb ? ps(bb) : null, bbAnte: bbAnte ? ps(bbAnte) : null,
            isBusted: true,
            placesLeft: bustPlace ? Number(bustPlace) : null,
            dealPayout: bustPayout ? Number(bustPayout) : null,
            updateText: bustNote || null,
            totalEntries: totalEntries ? Number(totalEntries) : null,
          };
        }
        if (updateType === 'hand') {
          const handPayload = {
            game: activeGame, hero: heroHand,
            board: gameConfig.hasBoard ? (boardCards || null) : null,
            opponents: hasOpponents ? activeOpponents.filter(h => h) : null, note: handNote || null
          };
          if (handResult && handResult.length > 0) {
            handPayload.results = handResult.map(r => ({
              oppIndex: r.index,
              outcome: r.result.outcome,
              text: r.result.text,
              heroHand: r.heroHigh?.name || r.heroLow?.name || r.heroBadugi?.name || null,
              opponentHand: r.opponentHigh?.name || r.opponentLow?.name || r.opponentBadugi?.name || null
            }));
          }
          return { ...base, updateText: JSON.stringify(handPayload) };
        }
        if (updateType === 'register') {
          return { ...base, isRegistered: true };
        }
        // 'update' tab — full update
        return {
          ...base,
          stack: ps(stack), sb: sb ? ps(sb) : null, bb: bb ? ps(bb) : null, bbAnte: bbAnte ? ps(bbAnte) : null,
          isRegClosed, bubble: isRegClosed && !isItm && bubble ? Number(bubble) : null,
          isItm, lockedAmount: isItm && lockedAmount ? Number(lockedAmount) : null,
          isFinalTable, placesLeft: isFinalTable && placesLeft ? Number(placesLeft) : null,
          firstPlacePrize: isFinalTable && firstPlacePrize ? Number(firstPlacePrize) : null,
          isDeal, dealPlace: isDeal && dealPlace ? Number(dealPlace) : null,
          dealPayout: isDeal && dealPayout ? Number(dealPayout) : null,
          isBusted, totalEntries: totalEntries ? Number(totalEntries) : null,
          isBagged, bagDay: isBagged && bagDay ? Number(bagDay) : null
        };
      };

      const handleSubmit = () => {
        if (!selectedTournamentId) return;
        if (updateType === 'update' && !isBusted && !stack) return;
        if (updateType === 'hand' && !parseCardNotation(heroHand).length) return;
        haptic(25);
        const data = buildUpdateData();
        onPost(data);
        // Auto-create tracking entry on bust
        if ((updateType === 'finish' || (updateType === 'update' && data.isBusted)) && onAddTracking) {
          const bc = activeUpdateMap[selectedTournamentId]?.bust_count || 0;
          const payout = data.dealPayout || 0;
          onAddTracking({
            tournamentId: selectedTournamentId,
            numEntries: bc + 1,
            cashed: payout > 0,
            finishPlace: data.placesLeft || null,
            cashAmount: payout,
            notes: data.updateText || null,
            totalFieldSize: data.totalEntries || null
          });
        }
        setOpen(false);
      };

      const selectedTournamentName = useMemo(() => {
        const opt = allOptions.find(o => o.id === selectedTournamentId);
        return opt ? opt.name : '';
      }, [allOptions, selectedTournamentId]);

      const selectedTournament = useMemo(() =>
        (mySchedule || []).find(t => t.id === selectedTournamentId) || null,
        [mySchedule, selectedTournamentId]);

      // Entry label for register tab
      const entryLabel = useMemo(() => {
        const bc = activeUpdateMap[selectedTournamentId]?.bust_count || 0;
        if (bc === 0) return 'Register';
        const n = bc + 1;
        return n + ordinalSuffix(n) + ' Entry';
      }, [activeUpdateMap, selectedTournamentId]);

      // Next event countdown for bust tab
      const nextEvent = useMemo(() => {
        const now = Date.now();
        const upcoming = (mySchedule || [])
          .filter(t => {
            if (t.id === selectedTournamentId) return false;
            const startMs = parseLateRegEnd(t.time, t.date);
            return !isNaN(startMs) && startMs > now;
          })
          .sort((a, b) => parseLateRegEnd(a.time, a.date) - parseLateRegEnd(b.time, b.date));
        if (!upcoming.length) return null;
        const t = upcoming[0];
        const startMs = parseLateRegEnd(t.time, t.date);
        const diffMs = startMs - now;
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        const timeStr = hours > 0 ? hours + 'h ' + mins + 'm' : mins + 'm';
        return { name: t.event_name, buyin: t.buyin, venue: t.venue, timeUntil: timeStr };
      }, [mySchedule, selectedTournamentId]);

      // Game variant pills for hand tab
      const gamePills = useMemo(() =>
        selectedTournament ? getGamePills(selectedTournament.game_variant, selectedTournament.event_name) : ['NLH'],
        [selectedTournament]);
      const activeGame = handGame || gamePills[0] || 'NLH';
      const gameConfig = HAND_CONFIG[activeGame] || HAND_CONFIG_DEFAULT;

      const handResult = useMemo(() => {
        if (!hasOpponents || !GAME_EVAL[activeGame]) return null;
        const hRaw = parseCardNotation(heroHand);
        const bCards = gameConfig.hasBoard ? parseCardNotation(boardCards) : [];
        if (gameConfig.hasBoard && bCards.length < 3) return null;
        const boardSuits = new Set(bCards.map(c => c.suit));
        const usedKeys = bCards.map(c => c.rank + c.suit);

        // Hero: for stud, filter out 'x'; for others, assign neutral suits
        let hCards;
        if (gameConfig.isStud) {
          hCards = hRaw.filter(c => c.suit !== 'x');
          if (hCards.length < 5) return null;
        } else {
          if (hRaw.length < gameConfig.heroCards) return null;
          hCards = assignNeutralSuits(hRaw, usedKeys, boardSuits);
        }
        hCards.forEach(c => { if (c.suit !== 'x') usedKeys.push(c.rank + c.suit); });

        const results = [];
        for (let i = 0; i < numOpponents; i++) {
          const oRaw = parseCardNotation(opponentHands[i]);
          let oCards;
          if (gameConfig.isStud) {
            oCards = oRaw.filter(c => c.suit !== 'x');
            if (oCards.length < 5) continue;
          } else {
            if (oRaw.length < gameConfig.heroCards) continue;
            oCards = assignNeutralSuits(oRaw, usedKeys, boardSuits);
          }
          const ev = evaluateHand(activeGame, hCards, oCards, bCards);
          if (ev && ev.result) results.push({ index: i, ...ev });
          oCards.forEach(c => { if (c.suit !== 'x') usedKeys.push(c.rank + c.suit); });
        }
        return results.length ? results : null;
      }, [heroHand, opponentHands, numOpponents, boardCards, activeGame, gameConfig]);

      const shareHandImage = async () => {
        if (!parseCardNotation(heroHand).length) return;
        const handDataObj = {
          heroHand, opponents: hasOpponents ? activeOpponents : [],
          boardCards: gameConfig.hasBoard ? boardCards : null,
          activeGame, gameConfig, handResult
        };
        const allCards = [
          ...parseCardNotation(heroHand),
          ...(hasOpponents ? activeOpponents.flatMap(h => h ? parseCardNotation(h) : []) : []),
          ...(gameConfig.hasBoard && boardCards ? parseCardNotation(boardCards) : [])
        ];
        try {
          const images = await loadCardImages(allCards);
          const outW = 1080, outH = 1080;
          const canvas = document.createElement('canvas');
          canvas.width = outW; canvas.height = outH;
          const ctx = canvas.getContext('2d');
          // Dark gradient background
          const grad = ctx.createLinearGradient(0, 0, 0, outH);
          grad.addColorStop(0, '#1a1a2e');
          grad.addColorStop(1, '#0f0f1a');
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, outW, outH);
          // Draw felt-like subtle texture line
          ctx.strokeStyle = 'rgba(34,197,94,0.08)';
          ctx.lineWidth = 1;
          for (let y = 0; y < outH; y += 40) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(outW, y); ctx.stroke();
          }
          drawHandImageOverlay(ctx, outW, outH, handDataObj, images, selectedTournamentName);
          const dataUrl = canvas.toDataURL('image/png');
          const blob = await (await fetch(dataUrl)).blob();
          const file = new File([blob], 'hand-history.png', { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
          } else {
            const a = document.createElement('a');
            a.href = dataUrl; a.download = 'hand-history.png'; a.click();
          }
        } catch (e) { console.error('Share hand error:', e); }
      };

      const openCamera = async () => {
        if (!selectedTournamentId) return;
        try {
          const tk = localStorage.getItem('token');
          const resp = await fetch(`${API_URL}/live-updates/history/${selectedTournamentId}`, {
            headers: { Authorization: 'Bearer ' + tk }
          });
          if (resp.ok) setStackHistory(await resp.json());
          else setStackHistory([]);
        } catch (e) { console.error('Stack history fetch failed:', e); setStackHistory([]); }
        setCameraOpen(true);
      };

      return (
        <div ref={containerRef} style={{position:'relative'}}>
          <button
            ref={toggleRef}
            className={`btn btn-ghost btn-icon live-update-btn ${myActiveUpdates.some(u => !u.is_busted) ? 'has-update' : ''}`}
            onClick={() => setOpen(o => !o)}
            title="Post live update"
          >
            <Icon.signal />
          </button>
          {open && !cameraOpen && !registrationOpen && ReactDOM.createPortal(
            <div className="dropdown-backdrop" onClick={() => setOpen(false)} />,
            document.body
          )}
          {open && !cameraOpen && !registrationOpen && ReactDOM.createPortal(
            <div ref={panelRef} className="live-update-panel" style={(() => {
              const r = toggleRef.current?.getBoundingClientRect();
              if (!r) return { top: 68, left: '50%', transform: 'translateX(-50%)' };
              const vw = window.innerWidth || document.documentElement.clientWidth || 375;
              const vh = window.innerHeight || document.documentElement.clientHeight || 700;
              const panelW = 300;
              const left = Math.max(8, Math.min((vw - panelW) / 2, vw - panelW - 8));
              return { top: r.bottom + 8, left, maxWidth: vw - 16, maxHeight: vh - r.bottom - 16 };
            })()}>
              {allOptions.length === 0 ? (
                <div className="live-update-empty">No tournaments on your schedule today</div>
              ) : (
                <>
                  {allOptions.length > 1 ? (
                    <select
                      value={selectedTournamentId || ''}
                      onChange={e => { const id = Number(e.target.value); setSelectedTournamentId(id); resetFields(activeUpdateMap[id] || null, id); }}
                    >
                      <option value="">Select tournament...</option>
                      {todayTournaments.length > 0 && (
                        <optgroup label="Today">
                          {todayTournaments.map(t => (
                            <option key={t.id} value={t.id}>{t.event_name}</option>
                          ))}
                        </optgroup>
                      )}
                      {previousActive.length > 0 && (
                        <optgroup label="In Progress">
                          {previousActive.map(t => (
                            <option key={t.id} value={t.id}>{t.event_name}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  ) : (
                    <div className="live-update-tournament-label">
                      {allOptions[0].name}
                    </div>
                  )}

                  {activeUpdateMap[selectedTournamentId] && (
                    <div className="live-update-last">
                      Last: {formatLiveUpdate(activeUpdateMap[selectedTournamentId])}
                    </div>
                  )}

                  {/* ── Tab bar ── */}
                  <div className="live-update-tabs">
                    <button className={updateType === 'register' ? 'active' : ''} onClick={() => {
                      setUpdateType('register');
                      if (selectedTournamentId) setRegistrationOpen(true);
                    }}>{entryLabel}</button>
                    <button className={updateType === 'update' ? 'active' : ''} onClick={() => setUpdateType('update')}>Update</button>
                    <button className={updateType === 'hand' ? 'active' : ''} onClick={() => setUpdateType('hand')}>Hand</button>
                    <button className={updateType === 'finish' ? 'active' : ''} onClick={() => setUpdateType('finish')}>Finish</button>
                  </div>

                  {/* ── Register tab ── */}
                  {updateType === 'register' && (
                    <>
                      <div className="live-update-registered-section">
                        <div className="live-update-row">
                          <label className="live-update-toggle">
                            <input type="checkbox" checked={hasJoinLevel} onChange={e => { setHasJoinLevel(e.target.checked); if (!e.target.checked) { setJoiningSb(''); setJoiningBb(''); setJoiningAnte(''); } }} />
                            Join Level
                          </label>
                          {hasJoinLevel && (
                            <>
                              <div className="live-update-field">
                                <label>SB</label>
                                <input type="text" inputMode="decimal" placeholder="100" value={joiningSb} onChange={e => {
                                  const raw = e.target.value; setJoiningSb(raw);
                                  const num = Number(parseShorthand(raw));
                                  if (num > 0) { setJoiningBb(String(num * 2)); setJoiningAnte(String(num * 2)); }
                                }} onBlur={e => { const v = parseShorthand(e.target.value); if (v !== e.target.value) setJoiningSb(v); }} />
                              </div>
                              <div className="live-update-field">
                                <label>BB</label>
                                <input type="text" inputMode="decimal" placeholder="200" value={joiningBb} onChange={e => { const raw = e.target.value; setJoiningBb(raw); const num = Number(parseShorthand(raw)); if (num > 0) setJoiningAnte(String(num)); }} onBlur={e => { const v = parseShorthand(e.target.value); if (v !== e.target.value) setJoiningBb(v); }} />
                              </div>
                              <div className="live-update-field">
                                <label>Ante</label>
                                <input type="text" inputMode="decimal" placeholder="200" value={joiningAnte} onChange={e => setJoiningAnte(e.target.value)} onBlur={e => { const v = parseShorthand(e.target.value); if (v !== e.target.value) setJoiningAnte(v); }} />
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {/* ── Update tab ── */}
                  {updateType === 'update' && (
                    <>
                      <div className={`live-update-field${isBagged ? ' bag-highlight' : ''}`}>
                        <label>Stack</label>
                        <input type="text" inputMode="decimal" placeholder="275k" value={stack} onChange={e => setStack(e.target.value)} onBlur={e => { const v = parseShorthand(e.target.value); if (v !== e.target.value) setStack(v); }} autoFocus />
                      </div>

                      <div className="live-update-row">
                        <div className={`live-update-field${isBagged ? ' bag-highlight' : ''}`}>
                          <label>SB</label>
                          <input type="text" inputMode="decimal" placeholder="1k" value={sb} onChange={e => {
                            const raw = e.target.value;
                            setSb(raw);
                            const parsed = parseShorthand(raw);
                            const num = Number(parsed);
                            if (num > 0) { setBb(String(num * 2)); setBbAnte(String(num * 2)); }
                          }} onBlur={e => { const v = parseShorthand(e.target.value); if (v !== e.target.value) setSb(v); }} />
                        </div>
                        <div className={`live-update-field${isBagged ? ' bag-highlight' : ''}`}>
                          <label>BB</label>
                          <input type="text" inputMode="decimal" placeholder="2k" value={bb} onChange={e => { const raw = e.target.value; setBb(raw); const num = Number(parseShorthand(raw)); if (num > 0) setBbAnte(String(num)); }} onBlur={e => { const v = parseShorthand(e.target.value); if (v !== e.target.value) setBb(v); }} />
                        </div>
                        <div className={`live-update-field${isBagged ? ' bag-highlight' : ''}`}>
                          <label>BB Ante</label>
                          <input type="text" inputMode="decimal" placeholder="2k" value={bbAnte} onChange={e => setBbAnte(e.target.value)} onBlur={e => { const v = parseShorthand(e.target.value); if (v !== e.target.value) setBbAnte(v); }} />
                        </div>
                      </div>

                      <div className="live-update-field">
                        <label>Total Entries</label>
                        <input type="number" placeholder="1234" value={totalEntries} onChange={e => setTotalEntries(e.target.value)} />
                      </div>

                      <div className="live-update-row">
                        <label className="live-update-toggle">
                          <input type="checkbox" checked={isRegClosed} onChange={e => { setIsRegClosed(e.target.checked); if (!e.target.checked) { setBubble(''); setIsItm(false); setLockedAmount(''); setIsFinalTable(false); setPlacesLeft(''); setFirstPlacePrize(''); setIsDeal(false); setDealPlace(''); setDealPayout(''); } }} />
                          Reg Closed
                        </label>
                      </div>

                      {isRegClosed && !isItm && (
                        <div className="live-update-field">
                          <label>Bubble (players from money)</label>
                          <input type="number" placeholder="12" value={bubble} onChange={e => setBubble(e.target.value)} min="0" />
                        </div>
                      )}

                      <div className="live-update-row">
                        <label className="live-update-toggle">
                          <input type="checkbox" checked={isItm} onChange={e => { setIsItm(e.target.checked); if (e.target.checked) { setIsRegClosed(true); setBubble(''); } if (!e.target.checked) { setLockedAmount(''); setIsFinalTable(false); setPlacesLeft(''); setFirstPlacePrize(''); setIsDeal(false); setDealPlace(''); setDealPayout(''); } }} />
                          ITM?
                        </label>
                        {isItm && (
                          <div className="live-update-field" style={{flex:'0 0 100px'}}>
                            <label>Locked $</label>
                            <input type="number" placeholder="5000" value={lockedAmount} onChange={e => setLockedAmount(e.target.value)} />
                          </div>
                        )}
                      </div>

                      <div className="live-update-row">
                        <label className="live-update-toggle">
                          <input type="checkbox" checked={isBagged} onChange={e => { setIsBagged(e.target.checked); if (!e.target.checked) setBagDay(''); }} />
                          Bagged
                        </label>
                        {isBagged && (
                          <div className="live-update-field bag-highlight" style={{flex:'0 0 70px'}}>
                            <label>For Day #</label>
                            <input type="number" placeholder="2" value={bagDay} onChange={e => setBagDay(e.target.value)} min="1" />
                          </div>
                        )}
                      </div>

                      {isItm && (
                        <div className="live-update-row live-update-row-indent">
                          <label className="live-update-toggle">
                            <input type="checkbox" checked={isFinalTable} onChange={e => { setIsFinalTable(e.target.checked); if (!e.target.checked) { setPlacesLeft(''); setFirstPlacePrize(''); } }} />
                            Final Table
                          </label>
                          {isFinalTable && (
                            <>
                              <div className="live-update-field" style={{flex:'0 0 70px'}}>
                                <label>Places Left</label>
                                <input type="number" placeholder="6" value={placesLeft} onChange={e => setPlacesLeft(e.target.value)} min="1" />
                              </div>
                              <div className="live-update-field" style={{flex:'0 0 90px'}}>
                                <label>1st Prize $</label>
                                <input type="number" placeholder="50000" value={firstPlacePrize} onChange={e => setFirstPlacePrize(e.target.value)} />
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {isItm && (
                        <div className="live-update-row live-update-row-indent">
                          <label className="live-update-toggle">
                            <input type="checkbox" checked={isDeal} onChange={e => { setIsDeal(e.target.checked); if (!e.target.checked) { setDealPlace(''); setDealPayout(''); } }} />
                            Deal
                          </label>
                          {isDeal && (
                            <>
                              <div className="live-update-field" style={{flex:'0 0 70px'}}>
                                <label>Place</label>
                                <input type="number" placeholder="3" value={dealPlace} onChange={e => setDealPlace(e.target.value)} min="1" />
                              </div>
                              <div className="live-update-field" style={{flex:'0 0 90px'}}>
                                <label>Payout $</label>
                                <input type="number" placeholder="25000" value={dealPayout} onChange={e => setDealPayout(e.target.value)} />
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Hand tab ── */}
                  {updateType === 'hand' && (
                    <>
                      {gamePills.length > 1 ? (
                        <div className="hand-game-pills">
                          {(() => {
                            const n = gamePills.length;
                            const numRows = Math.ceil(n / 5);
                            const base = Math.floor(n / numRows);
                            const extra = n % numRows;
                            // Try each way to place the larger rows, pick arrangement
                            // where the longest-text rows get fewer items
                            const textLen = (arr) => arr.reduce((s, g) => s + g.length, 0);
                            let bestRows = null, bestScore = Infinity;
                            // Bitmask which rows get base+1 items
                            const combos = (extra === 0) ? [0] : [];
                            if (extra > 0) {
                              // For small numRows, try all combos of which rows get +1
                              const gen = (mask, bit, count) => {
                                if (count === 0) { combos.push(mask); return; }
                                if (bit >= numRows) return;
                                gen(mask | (1 << bit), bit + 1, count - 1);
                                gen(mask, bit + 1, count);
                              };
                              gen(0, 0, extra);
                            }
                            for (const mask of combos) {
                              const rows = []; let idx = 0;
                              for (let r = 0; r < numRows; r++) {
                                const cnt = base + ((mask >> r) & 1);
                                rows.push(gamePills.slice(idx, idx + cnt));
                                idx += cnt;
                              }
                              // Score: max text length per row (lower = more balanced)
                              const maxLen = Math.max(...rows.map(textLen));
                              if (maxLen < bestScore) { bestScore = maxLen; bestRows = rows; }
                            }
                            return bestRows.map((row, ri) =>
                              React.createElement('div', { key: ri, className: 'hand-game-pill-row' },
                                row.map(g =>
                                  React.createElement('button', { key: g, className: activeGame === g ? 'active' : '', onClick: () => setHandGame(g) }, g)
                                )
                              )
                            );
                          })()}
                        </div>
                      ) : (
                        <div className="hand-game-label">{activeGame}</div>
                      )}
                      {(() => {
                        const cardKeys = (str) => parseCardNotation(str).filter(c => c.suit !== 'x').map(c => c.rank + c.suit);
                        const hasDupes = (newVal, ...others) => {
                          const used = new Set(others.flatMap(cardKeys));
                          const incoming = cardKeys(newVal);
                          const seen = new Set();
                          for (const k of incoming) {
                            if (used.has(k) || seen.has(k)) return true;
                            seen.add(k);
                          }
                          return false;
                        };
                        const oppOthers = (idx) => [heroHand, boardCards, ...opponentHands.filter((_, j) => j !== idx).slice(0, numOpponents)];
                        return <>
                      <div className="live-update-field">
                        <label>Hero Hand</label>
                        <input type="text" placeholder={dualPlaceholder(gameConfig.heroPlaceholder)} value={heroHand} onChange={e => { const v = e.target.value; if (parseCardNotation(v).length <= gameConfig.heroCards && !hasDupes(v, boardCards, ...opponentHands.slice(0, numOpponents))) setHeroHand(v); }} autoFocus />
                        <CardRow text={heroHand} stud={gameConfig.isStud} max={gameConfig.heroCards} />
                      </div>
                      {gameConfig.hasBoard && (
                        <div className="live-update-field">
                          <label>Board</label>
                          <input type="text" placeholder={dualPlaceholder(gameConfig.boardPlaceholder)} value={boardCards} onChange={e => { const v = e.target.value; if (parseCardNotation(v).length <= gameConfig.boardMax && !hasDupes(v, heroHand, ...opponentHands.slice(0, numOpponents))) setBoardCards(v); }} />
                          <CardRow text={boardCards} max={gameConfig.boardMax} />
                        </div>
                      )}
                      <div className="live-update-field">
                        <label>Opponent Hand</label>
                        <input type="text" placeholder={dualPlaceholder(gameConfig.heroPlaceholder)} value={opponentHands[0]} onChange={e => { const v = e.target.value; if (parseCardNotation(v).length <= gameConfig.heroCards && !hasDupes(v, ...oppOthers(0))) setOpponentHands(prev => { const next = [...prev]; next[0] = v; return next; }); }} />
                        <CardRow text={opponentHands[0]} stud={gameConfig.isStud} max={gameConfig.heroCards} placeholderCount={!opponentHands[0] ? gameConfig.heroCards : 0} />
                      </div>
                      <div className="live-update-field">
                        <label>Additional Opponents</label>
                        <div style={{display:'flex',gap:'6px',marginTop:'4px'}}>
                          {[2, 3, 4, 5].map(n => (
                            <button key={n} type="button" className={`filter-chip ${numOpponents === n ? 'active' : ''}`} onClick={() => setNumOpponents(numOpponents === n ? 1 : n)}>
                              {n}
                            </button>
                          ))}
                        </div>
                      </div>
                      {Array.from({ length: Math.max(0, numOpponents - 1) }, (_, i) => (
                        <div className="live-update-field" key={'opp' + (i + 1)}>
                          <label>Opponent {i + 2}</label>
                          <input type="text" placeholder={dualPlaceholder(gameConfig.heroPlaceholder)} value={opponentHands[i + 1]} onChange={e => { const v = e.target.value; if (parseCardNotation(v).length <= gameConfig.heroCards && !hasDupes(v, ...oppOthers(i + 1))) setOpponentHands(prev => { const next = [...prev]; next[i + 1] = v; return next; }); }} />
                          <CardRow text={opponentHands[i + 1]} stud={gameConfig.isStud} max={gameConfig.heroCards} placeholderCount={!opponentHands[i + 1] ? gameConfig.heroCards : 0} />
                        </div>
                      ))}
                        </>;
                      })()}
                      {handResult && handResult.length > 0 && handResult.map((r, ri) => (
                        <div key={ri} className={`hand-result hand-result-${r.result.color === 'green' ? 'hero' : r.result.color === 'red' ? 'opponent' : 'split'}`}>
                          {numOpponents > 1 ? `vs Opp ${r.index + 1}: ` : ''}{r.result.text}
                        </div>
                      ))}
                      <div className="live-update-field">
                        <label>Notes</label>
                        <input type="text" placeholder="All in on flop, hero holds" value={handNote} onChange={e => setHandNote(e.target.value)} />
                      </div>
                    </>
                  )}

                  {/* ── Finish tab ── */}
                  {updateType === 'finish' && (
                    <>
                      <div className="live-update-row">
                        <div className="live-update-field">
                          <label>Place (optional)</label>
                          <input type="number" placeholder="152" value={bustPlace} onChange={e => setBustPlace(e.target.value)} min="1" />
                        </div>
                        <div className="live-update-field">
                          <label>Payout $ (optional)</label>
                          <input type="number" placeholder="2500" value={bustPayout} onChange={e => setBustPayout(e.target.value)} />
                        </div>
                      </div>
                      <div className="live-update-row">
                        <div className="live-update-field">
                          <label>Note (optional)</label>
                          <input type="text" placeholder="AK < QQ all in pre" value={bustNote} onChange={e => setBustNote(e.target.value)} />
                        </div>
                        <div className="live-update-field" style={{flex:'0 0 90px'}}>
                          <label>Total Entries</label>
                          <input type="number" placeholder="1234" value={totalEntries} onChange={e => setTotalEntries(e.target.value)} />
                        </div>
                      </div>
                      {nextEvent && (
                        <div className="live-update-next-event">
                          Next: <strong>{nextEvent.name}</strong>
                          {nextEvent.buyin ? ' · ' + nextEvent.buyin : ''}
                          {' · in ' + nextEvent.timeUntil}
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Bottom row: camera + share + post ── */}
                  <div style={{display:'flex',justifyContent:'flex-end',alignItems:'center',marginTop:'4px',gap:'6px'}}>
                    {updateType === 'hand' && parseCardNotation(heroHand).length > 0 && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={shareHandImage}
                        title="Share hand image"
                        style={{padding:'6px'}}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:'16px',height:'16px'}}>
                          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                        </svg>
                      </button>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={openCamera}
                      disabled={!selectedTournamentId}
                      title="Camera overlay"
                      style={{padding:'6px'}}
                    >
                      <Icon.camera />
                    </button>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleSubmit}
                      disabled={!selectedTournamentId || (updateType === 'update' && !isBusted && !stack) || (updateType === 'hand' && !parseCardNotation(heroHand).length)}
                    >
                      {updateType === 'finish' ? 'Finish Event' : updateType === 'hand' ? 'Post Hand' : 'Post Update'}
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
                  </div>
                </>
              )}
            </div>,
            document.body
          )}
          {cameraOpen && ReactDOM.createPortal(
            <CameraOverlay
              updateData={buildUpdateData()}
              tournamentName={selectedTournamentName}
              tournament={selectedTournament}
              stackHistory={stackHistory}
              defaultOverlay={updateType === 'hand' ? 'hand' : updateType === 'finish' ? 'countdown' : 'stats'}
              handData={updateType === 'hand' && parseCardNotation(heroHand).length > 0 ? {
                heroHand, opponents: hasOpponents ? activeOpponents : [],
                boardCards: gameConfig.hasBoard ? boardCards : null,
                activeGame, gameConfig, handResult
              } : null}
              onClose={() => { setCameraOpen(false); setOpen(true); }}
            />,
            document.body
          )}
          {registrationOpen && selectedTournament && ReactDOM.createPortal(
            <RegistrationCameraFlow
              tournament={selectedTournament}
              guarantee={selectedTournament.prize_pool || null}
              joiningSb={joiningSb}
              joiningBb={joiningBb}
              joiningAnte={joiningAnte}
              entryNumber={(activeUpdateMap[selectedTournamentId]?.bust_count || 0) + 1}
              onClose={() => { setRegistrationOpen(false); setOpen(true); }}
            />,
            document.body
          )}
        </div>
      );
    }

    function drawStatsOnCanvas(ctx, w, h, updateData, tournamentName) {
      const barH = Math.round(h * 0.08);
      const barY = h - barH - Math.round(h * 0.04);
      // Semi-transparent bar
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, barY, w, barH);
      // Tournament name
      const nameSize = Math.round(h * 0.018);
      ctx.font = nameSize + 'px Univers Condensed, Univers, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(tournamentName || '', Math.round(w * 0.04), barY + Math.round(barH * 0.38));
      // Stats line
      const statsSize = Math.round(h * 0.026);
      ctx.font = '600 ' + statsSize + 'px Univers Condensed, Univers, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.fillText(formatLiveUpdate(updateData) || '', Math.round(w * 0.04), barY + Math.round(barH * 0.78));
      // Watermark top-left
      const wmSize = Math.round(h * 0.014);
      ctx.font = wmSize + 'px Univers Condensed, Univers, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('snbwsop.com', Math.round(w * 0.03), Math.round(h * 0.03));
    }

    function drawRegistrationOverlay(ctx, w, h, data) {
      const barH = Math.round(h * 0.18);
      const barY = h - barH - Math.round(h * 0.04);
      const padX = Math.round(w * 0.05);
      const lineH = Math.round(barH / 5);
      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, barY, w, barH);
      // Line 1: Series name
      const l1s = Math.round(h * 0.020);
      ctx.font = l1s + 'px Univers Condensed, Univers, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(data.seriesName || '', padX, barY + lineH * 0.85);
      // Line 2: Event # + buyin + name
      const num = data.eventNumber ? 'Event #' + data.eventNumber + ': ' : '';
      const buy = data.buyin ? '$' + Number(data.buyin).toLocaleString() + ' ' : '';
      const l2s = Math.round(h * 0.024);
      ctx.font = '600 ' + l2s + 'px Univers Condensed, Univers, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(num + buy + (data.eventName || ''), padX, barY + lineH * 1.85);
      // Line 3: Starting chips + level duration
      const ss = data.startingChips ? formatChips(data.startingChips) + ' ss' : '';
      const lvl = data.levelDuration ? data.levelDuration + ' min levels' : '';
      const l3s = Math.round(h * 0.022);
      ctx.font = l3s + 'px Univers Condensed, Univers, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.fillText([ss, lvl].filter(Boolean).join(' / '), padX, barY + lineH * 2.85);
      // Line 4 (optional): guarantee
      let nextLine = 3.75;
      if (data.guarantee) {
        const l4s = Math.round(h * 0.018);
        ctx.font = l4s + 'px Univers Condensed, Univers, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('$' + Number(data.guarantee).toLocaleString() + ' guarantee', padX, barY + lineH * nextLine);
        nextLine += 0.9;
      }
      // Line 5 (optional): joining blinds
      if (data.joiningBlinds) {
        const l5s = Math.round(h * 0.018);
        ctx.font = l5s + 'px Univers Condensed, Univers, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillText('Joining at ' + data.joiningBlinds, padX, barY + lineH * nextLine);
        nextLine += 0.9;
      }
      // Entry number (optional): show for re-entries
      if (data.entryNumber && data.entryNumber > 1) {
        const eS = Math.round(h * 0.018);
        ctx.font = '600 ' + eS + 'px Univers Condensed, Univers, sans-serif';
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(data.entryNumber + ordinalSuffix(data.entryNumber) + ' Entry', padX, barY + lineH * nextLine);
      }
      // Watermark
      const wms = Math.round(h * 0.014);
      ctx.font = wms + 'px Univers Condensed, Univers, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('snbwsop.com', Math.round(w * 0.03), Math.round(h * 0.03));
    }


    // ── Skeleton loading components ──
    function SkeletonDashboard() {
      return (
        <div className="dashboard-view" style={{gap: 16}}>
          <div className="dashboard-section">
            <div className="dashboard-section-header">
              <div className="skeleton skeleton-text" style={{width: 80, height: 14}} />
            </div>
            <div className="skeleton skeleton-card" style={{height: 180}}>
              <div className="skeleton-strip skeleton" style={{width: '100%'}} />
              <div className="skeleton-row">
                <div className="skeleton skeleton-text lg" />
              </div>
              <div className="skeleton-row" style={{gap: 6}}>
                <div className="skeleton skeleton-text sm" />
                <div className="skeleton skeleton-text sm" />
              </div>
              <div className="skeleton skeleton-btn" style={{width: '100%', background: 'transparent'}} />
            </div>
          </div>
          <div className="dashboard-section">
            <div className="dashboard-section-header">
              <div className="skeleton skeleton-text" style={{width: 70, height: 14}} />
            </div>
            <div className="skeleton" style={{height: 60, borderRadius: 'var(--radius-sm)'}} />
          </div>
          <div className="dashboard-section">
            <div className="dashboard-section-header">
              <div className="skeleton skeleton-text" style={{width: 100, height: 14}} />
            </div>
            <div className="skeleton" style={{height: 60, borderRadius: 'var(--radius-sm)'}} />
          </div>
        </div>
      );
    }

    function SkeletonSchedule() {
      return (
        <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
          {[0,1,2].map(g => (
            <div key={g}>
              <div style={{display: 'flex', alignItems: 'baseline', gap: 4, padding: '12px 12px 8px 2px'}}>
                <div className="skeleton" style={{width: 30, height: 24, borderRadius: 4}} />
                <div className="skeleton skeleton-text" style={{width: 28, height: 12}} />
              </div>
              {[0,1,2].map(i => (
                <div key={i} className="skeleton" style={{height: 52, marginBottom: 4, borderRadius: 'var(--radius-sm)'}} />
              ))}
            </div>
          ))}
        </div>
      );
    }

    // Pull-to-refresh hook
    function usePullToRefresh(scrollRef, onRefresh) {
      const ptrStart = useRef(null);
      const ptrDy = useRef(0);
      const ptrIndicator = useRef(null);
      const [refreshing, setRefreshing] = useState(false);
      const threshold = 60;

      const onPtrTouchStart = useCallback((e) => {
        const el = scrollRef.current;
        if (!el || el.scrollTop > 0 || refreshing) return;
        ptrStart.current = e.touches[0].clientY;
        ptrDy.current = 0;
      }, [refreshing]);

      const onPtrTouchMove = useCallback((e) => {
        if (ptrStart.current === null) return;
        const dy = e.touches[0].clientY - ptrStart.current;
        if (dy < 0) { ptrStart.current = null; return; }
        ptrDy.current = dy;
        if (ptrIndicator.current) {
          const progress = Math.min(dy / threshold, 1);
          const offset = Math.min(dy * 0.5, 50);
          ptrIndicator.current.style.transform = `translateX(-50%) translateY(${offset}px) rotate(${progress * 360}deg)`;
          ptrIndicator.current.classList.toggle('visible', dy > 10);
        }
      }, []);

      const onPtrTouchEnd = useCallback(async () => {
        const dy = ptrDy.current;
        ptrStart.current = null;
        if (dy >= threshold && !refreshing) {
          setRefreshing(true);
          if (ptrIndicator.current) {
            ptrIndicator.current.style.transform = 'translateX(-50%) translateY(40px)';
            ptrIndicator.current.classList.add('visible');
          }
          try { await onRefresh(); } catch (e) { console.error('Refresh failed:', e); }
          setRefreshing(false);
        }
        if (ptrIndicator.current) {
          ptrIndicator.current.classList.remove('visible');
          ptrIndicator.current.style.transform = 'translateX(-50%)';
        }
      }, [onRefresh, refreshing]);

      const ptrProps = { onTouchStart: onPtrTouchStart, onTouchMove: onPtrTouchMove, onTouchEnd: onPtrTouchEnd };
      return { ptrProps, ptrIndicator, refreshing };
    }

    // Pinch-to-zoom helper for camera video elements
    // Uses MediaStreamTrack zoom when available (Android Chrome), falls back to CSS transform (iOS Safari)
    function usePinchZoom(videoRef, streamRef) {
      const zoomRef = useRef(1);
      const baseDist = useRef(null);
      const baseZoom = useRef(1);
      useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        const getTrack = () => streamRef.current && streamRef.current.getVideoTracks()[0];
        const hasTrackZoom = () => {
          const track = getTrack();
          if (!track || typeof track.getCapabilities !== 'function') return false;
          const caps = track.getCapabilities();
          return caps && caps.zoom;
        };
        const getZoomRange = () => {
          const track = getTrack();
          if (!track) return null;
          const caps = track.getCapabilities();
          return caps && caps.zoom ? caps.zoom : null;
        };
        const applyZoom = (z) => {
          if (hasTrackZoom()) {
            // Native track zoom (Android Chrome)
            const range = getZoomRange();
            const clamped = Math.min(Math.max(z, range.min), range.max);
            zoomRef.current = clamped;
            getTrack().applyConstraints({ advanced: [{ zoom: clamped }] }).catch(() => {});
          } else {
            // CSS transform fallback (iOS Safari)
            const clamped = Math.min(Math.max(z, 1), 5);
            zoomRef.current = clamped;
            el.style.transform = 'scale(' + clamped + ')';
          }
        };
        const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        const onTouchStart = (e) => {
          if (e.touches.length === 2) {
            e.preventDefault();
            baseDist.current = dist(e.touches[0], e.touches[1]);
            baseZoom.current = zoomRef.current;
          }
        };
        const onTouchMove = (e) => {
          if (e.touches.length === 2 && baseDist.current) {
            e.preventDefault();
            const scale = dist(e.touches[0], e.touches[1]) / baseDist.current;
            applyZoom(baseZoom.current * scale);
          }
        };
        const onTouchEnd = () => { baseDist.current = null; };
        el.addEventListener('touchstart', onTouchStart, { passive: false });
        el.addEventListener('touchmove', onTouchMove, { passive: false });
        el.addEventListener('touchend', onTouchEnd, { passive: true });
        return () => {
          el.removeEventListener('touchstart', onTouchStart);
          el.removeEventListener('touchmove', onTouchMove);
          el.removeEventListener('touchend', onTouchEnd);
        };
      }, []);
      const resetZoom = useCallback(() => {
        zoomRef.current = 1;
        if (videoRef.current) videoRef.current.style.transform = '';
      }, []);
      return resetZoom;
    }

    function CameraOverlay({ updateData, tournamentName, tournament, stackHistory, defaultOverlay, handData, onClose }) {
      const videoRef = useRef(null);
      const canvasRef = useRef(null);
      const streamRef = useRef(null);
      const fileInputRef = useRef(null);
      const [captured, setCaptured] = useState(null);
      const [error, setError] = useState(null);
      const [overlayType, setOverlayType] = useState(defaultOverlay || 'stats');
      const resetZoom = usePinchZoom(videoRef, streamRef);

      const startCamera = (onError) => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          (onError || setError)('Camera requires a secure (HTTPS) connection.');
          return Promise.resolve(null);
        }
        return navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        }).catch(err => {
          (onError || setError)('Camera access denied. Please allow camera permission and try again.');
          return null;
        });
      };

      useEffect(() => {
        let cancelled = false;
        startCamera(msg => { if (!cancelled) setError(msg); }).then(s => {
          if (!s) return;
          if (cancelled) { s.getTracks().forEach(t => t.stop()); return; }
          streamRef.current = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play();
          }
        });
        return () => { cancelled = true; stopStream(); };
      }, []);

      const stopStream = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      };

      // Compute countdown for "Next Up" overlay
      const countdownText = useMemo(() => {
        if (!tournament) return '—';
        const dateStr = tournament.date;
        const timeStr = tournament.time;
        if (!dateStr || !timeStr) return '—';
        const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
        if (!match) return '—';
        let h = parseInt(match[1]); const m = parseInt(match[2]);
        if (match[3].toUpperCase() === 'PM' && h !== 12) h += 12;
        if (match[3].toUpperCase() === 'AM' && h === 12) h = 0;
        const parts = dateStr.split('-');
        const target = new Date(parts[0], parts[1] - 1, parts[2], h, m);
        const diff = target - new Date();
        if (diff <= 0) return 'now';
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        if (hrs > 24) return Math.floor(hrs / 24) + 'd ' + (hrs % 24) + 'h';
        if (hrs > 0) return hrs + 'h ' + mins + 'm';
        return mins + 'm';
      }, [tournament]);

      // Check which overlay types are available
      const canDeepRun = !!(updateData.totalEntries && updateData.stack);
      const canFinalTable = !!(updateData.isFinalTable);
      const canStackGraph = (stackHistory || []).filter(u => u.stack && Number(u.stack) > 0).length >= 2;

      // Shared overlay-drawing logic used by both camera capture and gallery pick
      const applyOverlay = async (ctx, outW, outH) => {
        try {
          if (overlayType === 'stackgraph') {
            // Standalone stack graph story (no camera background, renders own bg)
            drawChipStackStory(ctx, outW, outH, {
              tournamentName,
              stackHistory: stackHistory || [],
              startingStack: tournament?.starting_chips,
              bb: updateData.bb
            });
          } else if (overlayType === 'hand' && handData) {
            const allCards = [
              ...parseCardNotation(handData.heroHand),
              ...(handData.opponents || []).flatMap(h => h ? parseCardNotation(h) : []),
              ...(handData.boardCards ? parseCardNotation(handData.boardCards) : [])
            ];
            const images = await loadCardImages(allCards);
            drawHandOverlay(ctx, outW, outH, handData, images);
          } else if (overlayType === 'deeprun') {
            drawDeepRunOverlay(ctx, outW, outH, {
              tournamentName,
              stack: updateData.stack,
              totalEntries: updateData.totalEntries,
              placesLeft: updateData.placesLeft || updateData.totalEntries,
              stackHistory: stackHistory || [],
              startingStack: tournament?.starting_chips
            });
          } else if (overlayType === 'finaltable') {
            drawFinalTableOverlay(ctx, outW, outH, {
              tournamentName,
              buyin: tournament?.buyin,
              placesLeft: updateData.placesLeft,
              stack: updateData.stack,
              firstPlacePrize: updateData.firstPlacePrize,
              totalEntries: updateData.totalEntries,
              bb: updateData.bb
            });
          } else if (overlayType === 'countdown') {
            drawCountdownOverlay(ctx, outW, outH, {
              tournamentName,
              buyin: tournament?.buyin,
              venue: tournament?.venue,
              timeUntil: countdownText
            });
          } else {
            drawStatsOnCanvas(ctx, outW, outH, updateData, tournamentName);
          }
        } catch (e) { console.error('Overlay draw error:', e); }
      };

      // Draw source image crop-to-fill onto canvas
      const drawCropToFill = (ctx, source, srcW, srcH, outW, outH) => {
        const targetRatio = outW / outH;
        const srcRatio = srcW / srcH;
        let sx, sy, sw, sh;
        if (srcRatio > targetRatio) {
          sh = srcH; sw = srcH * targetRatio; sx = (srcW - sw) / 2; sy = 0;
        } else {
          sw = srcW; sh = srcW / targetRatio; sx = 0; sy = (srcH - sh) / 2;
        }
        ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
      };

      const handleCapture = async () => {
        const video = videoRef.current;
        if (!video) return;
        const outW = 1080, outH = 1920;
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        const ctx = canvas.getContext('2d');
        drawCropToFill(ctx, video, video.videoWidth || 1080, video.videoHeight || 1920, outW, outH);
        await applyOverlay(ctx, outW, outH);
        setCaptured(canvas.toDataURL('image/png'));
        stopStream();
      };

      const handleGalleryPick = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = async () => {
            const outW = 1080, outH = 1920;
            const canvas = canvasRef.current || document.createElement('canvas');
            canvas.width = outW; canvas.height = outH;
            const ctx = canvas.getContext('2d');
            drawCropToFill(ctx, img, img.width, img.height, outW, outH);
            await applyOverlay(ctx, outW, outH);
            setCaptured(canvas.toDataURL('image/png'));
            stopStream();
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      };

      const handleRetake = () => {
        setCaptured(null);
        setError(null);
        resetZoom();
        startCamera().then(s => {
          if (!s) return;
          streamRef.current = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
            videoRef.current.play();
          }
        });
      };

      const handleShare = async () => {
        if (!captured) return;
        const fname = overlayType === 'hand' ? 'hand-history.png'
          : overlayType === 'finaltable' ? 'final-table.png'
          : overlayType === 'deeprun' ? 'deep-run.png'
          : overlayType === 'countdown' ? 'next-event.png'
          : overlayType === 'stackgraph' ? 'stack-graph.png'
          : 'poker-update.png';
        try {
          const blob = await (await fetch(captured)).blob();
          const file = new File([blob], fname, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
          } else {
            const a = document.createElement('a');
            a.href = captured;
            a.download = fname;
            a.click();
          }
        } catch (e) {
          if (e.name !== 'AbortError') {
            const a = document.createElement('a');
            a.href = captured;
            a.download = fname;
            a.click();
          }
        }
      };

      const handleClose = () => {
        stopStream();
        onClose();
      };

      const statsText = formatLiveUpdate(updateData);

      if (error) {
        return (
          <div className="camera-overlay">
            <div className="camera-error">
              <div>
                <div style={{fontSize:'2rem',marginBottom:'12px'}}>📷</div>
                <div>{error}</div>
              </div>
            </div>
            <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={handleGalleryPick} />
            <div className="camera-actions">
              <button className="camera-btn-close" onClick={handleClose}>Close</button>
              <button className="camera-btn-gallery" onClick={() => fileInputRef.current?.click()}>Choose Photo</button>
            </div>
          </div>
        );
      }

      if (captured) {
        return (
          <div className="camera-overlay">
            <div className="camera-preview">
              <img src={captured} alt="Captured" />
            </div>
            <div className="camera-actions">
              <button className="camera-btn-retake" onClick={handleRetake}>Retake</button>
              <button className="camera-btn-share" onClick={handleShare}>Share</button>
            </div>
          </div>
        );
      }

      // Live preview bar content based on overlay type
      const renderPreviewBar = () => {
        if (overlayType === 'stackgraph') {
          const history = (stackHistory || []).filter(u => u.stack && Number(u.stack) > 0);
          return (
            <div className="camera-stats-bar">
              <div style={{color:'#22c55e',fontWeight:600,fontFamily:"'Univers Condensed','Univers',sans-serif",fontSize:'0.65rem',letterSpacing:'1px'}}>STACK GRAPH</div>
              <div className="tournament-name">{tournamentName}</div>
              <div className="stats-line">{history.length} update{history.length !== 1 ? 's' : ''} tracked</div>
            </div>
          );
        }
        if (overlayType === 'hand' && handData) {
          const hCards = parseCardNotation(handData.heroHand);
          const oppGroups = (handData.opponents || []).map(h => h ? parseCardNotation(h) : []);
          const bCards = handData.boardCards ? parseCardNotation(handData.boardCards) : [];
          const cardImg = (c, i) => c.suit !== 'x'
            ? React.createElement('img', { key: i, src: '/cards/cards_gui_' + c.rank + c.suit + '.svg', alt: c.rank + c.suit, style: { height: '22px', borderRadius: '2px' } })
            : React.createElement('span', { key: i, style: { display: 'inline-block', width: '16px', height: '22px', background: 'rgba(255,255,255,0.15)', borderRadius: '2px', textAlign: 'center', fontSize: '0.55rem', lineHeight: '22px', color: 'rgba(255,255,255,0.5)' } }, '?');
          const results = Array.isArray(handData.handResult) ? handData.handResult : [];
          return (
            React.createElement('div', { className: 'camera-stats-bar' },
              React.createElement('div', { style: { fontSize: '0.6rem', color: 'rgba(255,255,255,0.5)', fontFamily: "'Univers Condensed','Univers',sans-serif", marginBottom: '2px' } }, handData.activeGame),
              React.createElement('div', { style: { display: 'flex', gap: '2px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '2px' } },
                hCards.map(cardImg),
                bCards.length > 0 && React.createElement('span', { key: 'sep', style: { margin: '0 4px', color: 'rgba(255,255,255,0.3)', fontSize: '0.6rem' } }, '|'),
                bCards.map((c, i) => cardImg(c, 'b' + i)),
                ...oppGroups.flatMap((oCards, oi) => oCards.length > 0 ? [
                  React.createElement('span', { key: 'vs' + oi, style: { margin: '0 4px', color: 'rgba(255,255,255,0.4)', fontSize: '0.55rem', fontFamily: "'Univers Condensed','Univers',sans-serif" } }, 'vs'),
                  ...oCards.map((c, ci) => cardImg(c, 'o' + oi + '_' + ci))
                ] : [])
              ),
              results.length > 0 && results.map((r, ri) =>
                React.createElement('div', { key: ri, style: { fontSize: '0.65rem', fontFamily: "'Univers Condensed','Univers',sans-serif", fontWeight: 600, color: r.result.color === 'green' ? '#4ade80' : r.result.color === 'red' ? '#f87171' : '#facc15' } },
                  (results.length > 1 ? 'vs Opp ' + (r.index + 1) + ': ' : '') + r.result.text
                )
              )
            )
          );
        }
        if (overlayType === 'deeprun') {
          const posNum = updateData.placesLeft || updateData.totalEntries || '?';
          const totalNum = updateData.totalEntries ? Number(updateData.totalEntries).toLocaleString() : '?';
          const pct = (updateData.totalEntries && updateData.placesLeft)
            ? Math.max(2, Math.round((1 - (Number(updateData.placesLeft) - 1) / Number(updateData.totalEntries)) * 100))
            : 0;
          return (
            <div className="camera-stats-bar">
              <div className="tournament-name">{tournamentName}</div>
              <div className="stats-line">{posNum}{typeof posNum === 'number' ? ordinalSuffix(posNum) : ''} of {totalNum}</div>
              <div style={{marginTop:'4px',height:'6px',borderRadius:'3px',background:'rgba(255,255,255,0.15)',overflow:'hidden'}}>
                <div style={{height:'100%',width:pct+'%',background:'#22c55e',borderRadius:'3px'}} />
              </div>
              {updateData.stack && <div style={{marginTop:'2px',fontSize:'0.7rem',color:'#22c55e',fontFamily:"'Univers Condensed','Univers',sans-serif"}}>{formatChips(updateData.stack)} chips</div>}
            </div>
          );
        }
        if (overlayType === 'finaltable') {
          return (
            <div className="camera-stats-bar">
              <div style={{color:'#f59e0b',fontWeight:600,fontFamily:"'Univers Condensed','Univers',sans-serif",fontSize:'0.9rem'}}>🏆 FINAL TABLE</div>
              <div className="tournament-name">{tournament?.buyin ? '$' + Number(tournament.buyin).toLocaleString() + ' ' : ''}{tournamentName}</div>
              <div className="stats-line">
                {updateData.placesLeft ? updateData.placesLeft + ' remain' : ''}
                {updateData.stack ? '  ·  ' + formatChips(updateData.stack) : ''}
                {updateData.firstPlacePrize ? '  ·  1st: $' + Number(updateData.firstPlacePrize).toLocaleString() : ''}
              </div>
            </div>
          );
        }
        if (overlayType === 'countdown') {
          return (
            <div className="camera-stats-bar">
              <div style={{color:'#22c55e',fontWeight:600,fontFamily:"'Univers Condensed','Univers',sans-serif",fontSize:'0.65rem',letterSpacing:'1px'}}>NEXT UP</div>
              <div className="tournament-name">{tournament?.buyin ? '$' + Number(tournament.buyin).toLocaleString() + ' ' : ''}{tournamentName}</div>
              <div className="stats-line">in {countdownText}</div>
            </div>
          );
        }
        // Default: stats
        return (
          <div className="camera-stats-bar">
            <div className="tournament-name">{tournamentName}</div>
            <div className="stats-line">{statsText}</div>
          </div>
        );
      };

      return (
        <div className="camera-overlay">
          <video ref={videoRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} style={{display:'none'}} />
          <div className="camera-watermark">snbwsop.com</div>
          <div className="camera-overlay-picker">
            <button className={overlayType === 'stats' ? 'active' : ''} onClick={() => setOverlayType('stats')}>Stats</button>
            <button className={overlayType === 'deeprun' ? 'active' : ''} onClick={() => setOverlayType('deeprun')} disabled={!canDeepRun}>Deep Run</button>
            <button className={overlayType === 'finaltable' ? 'active' : ''} onClick={() => setOverlayType('finaltable')} disabled={!canFinalTable}>Final Table</button>
            <button className={overlayType === 'countdown' ? 'active' : ''} onClick={() => setOverlayType('countdown')}>Countdown</button>
            <button className={overlayType === 'hand' ? 'active' : ''} onClick={() => setOverlayType('hand')} disabled={!handData}>Hand</button>
            <button className={overlayType === 'stackgraph' ? 'active' : ''} onClick={() => setOverlayType('stackgraph')} disabled={!canStackGraph}>Graph</button>
          </div>
          {renderPreviewBar()}
          <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={handleGalleryPick} />
          <div className="camera-actions">
            <button className="camera-btn-close" onClick={handleClose}>✕</button>
            <button className="camera-btn-capture" onClick={handleCapture}>Capture</button>
            <button className="camera-btn-gallery" onClick={() => fileInputRef.current?.click()} title="Choose from gallery">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            </button>
          </div>
        </div>
      );
    }

    function RegistrationCameraFlow({ tournament, guarantee, joiningSb, joiningBb, joiningAnte, entryNumber, onClose }) {
      const videoRef = useRef(null);
      const canvasRef = useRef(null);
      const streamRef = useRef(null);
      const fileInputRef = useRef(null);
      const [step, setStep] = useState(1);
      const [captured, setCaptured] = useState(null);
      const [error, setError] = useState(null);
      const resetZoom = usePinchZoom(videoRef, streamRef);

      const joiningBlinds = useMemo(() => {
        if (!joiningSb && !joiningBb) return null;
        const parts = [joiningSb ? formatChips(Number(joiningSb)) : null, joiningBb ? formatChips(Number(joiningBb)) : null].filter(Boolean);
        if (joiningAnte) parts.push(formatChips(Number(joiningAnte)));
        return parts.join('/');
      }, [joiningSb, joiningBb, joiningAnte]);

      const registrationData = useMemo(() => ({
        seriesName: VENUE_TO_SERIES[tournament.venue] || tournament.venue,
        eventNumber: tournament.event_number,
        buyin: tournament.buyin,
        eventName: tournament.event_name,
        startingChips: tournament.starting_chips,
        levelDuration: tournament.level_duration,
        guarantee: guarantee || null,
        joiningBlinds: joiningBlinds,
        entryNumber: entryNumber || 1,
      }), [tournament, guarantee, joiningBlinds, entryNumber]);

      const startCam = (onErr) => {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          (onErr || setError)('Camera requires a secure (HTTPS) connection.');
          return Promise.resolve(null);
        }
        return navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false
        }).catch(() => { (onErr || setError)('Camera access denied. Please allow camera permission.'); return null; });
      };

      const stopStream = () => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(t => t.stop());
          streamRef.current = null;
        }
      };

      useEffect(() => {
        stopStream();
        setCaptured(null);
        setError(null);
        resetZoom();
        let cancelled = false;
        startCam(msg => { if (!cancelled) setError(msg); }).then(s => {
          if (!s || cancelled) { if (s) s.getTracks().forEach(t => t.stop()); return; }
          streamRef.current = s;
          if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
        });
        return () => { cancelled = true; stopStream(); };
      }, [step]);

      const drawCropToFill = (ctx, source, srcW, srcH, outW, outH) => {
        const targetRatio = outW / outH, srcRatio = srcW / srcH;
        let sx, sy, sw, sh;
        if (srcRatio > targetRatio) { sh = srcH; sw = srcH * targetRatio; sx = (srcW - sw) / 2; sy = 0; }
        else { sw = srcW; sh = srcW / targetRatio; sx = 0; sy = (srcH - sh) / 2; }
        ctx.drawImage(source, sx, sy, sw, sh, 0, 0, outW, outH);
      };

      const handleCapture = () => {
        const video = videoRef.current;
        if (!video) return;
        const outW = 1080, outH = 1920;
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = outW; canvas.height = outH;
        const ctx = canvas.getContext('2d');
        drawCropToFill(ctx, video, video.videoWidth || 1080, video.videoHeight || 1920, outW, outH);
        if (step === 2) drawRegistrationOverlay(ctx, outW, outH, registrationData);
        setCaptured(canvas.toDataURL('image/png'));
        stopStream();
      };

      const handleGalleryPick = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const img = new Image();
          img.onload = () => {
            const outW = 1080, outH = 1920;
            const canvas = canvasRef.current || document.createElement('canvas');
            canvas.width = outW; canvas.height = outH;
            const ctx = canvas.getContext('2d');
            drawCropToFill(ctx, img, img.width, img.height, outW, outH);
            if (step === 2) drawRegistrationOverlay(ctx, outW, outH, registrationData);
            setCaptured(canvas.toDataURL('image/png'));
            stopStream();
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
        e.target.value = '';
      };

      const handleRetake = () => {
        setCaptured(null); setError(null); resetZoom();
        startCam().then(s => {
          if (!s) return;
          streamRef.current = s;
          if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
        });
      };

      const handleShare = async () => {
        if (!captured) return;
        const fname = step === 1 ? 'registration-receipt.png' : 'starting-stack.png';
        try {
          const blob = await (await fetch(captured)).blob();
          const file = new File([blob], fname, { type: 'image/png' });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
          } else {
            const a = document.createElement('a'); a.href = captured; a.download = fname; a.click();
          }
        } catch (e) {
          if (e.name !== 'AbortError') {
            const a = document.createElement('a'); a.href = captured; a.download = fname; a.click();
          }
        }
      };

      const handleClose = () => { stopStream(); onClose(); };

      // Overlay preview text for step 2 live viewfinder
      const overlayLine1 = registrationData.seriesName;
      const overlayLine2 = (registrationData.eventNumber ? '#' + registrationData.eventNumber + ' · ' : '')
        + (registrationData.startingChips ? formatChips(registrationData.startingChips) + ' ss' : '')
        + (registrationData.levelDuration ? ' / ' + registrationData.levelDuration + 'm lvls' : '');

      if (error) {
        return (
          <div className="camera-overlay">
            <div className="camera-error"><div><div style={{fontSize:'2rem',marginBottom:'12px'}}>📷</div><div>{error}</div></div></div>
            <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={handleGalleryPick} />
            <div className="camera-actions">
              <button className="camera-btn-close" onClick={handleClose}>Close</button>
              <button className="camera-btn-gallery" onClick={() => fileInputRef.current?.click()}>Choose Photo</button>
            </div>
          </div>
        );
      }

      if (captured) {
        return (
          <div className="camera-overlay">
            <div className="camera-preview"><img src={captured} alt="Captured" /></div>
            <div className="camera-step-indicator">Step {step} of 2</div>
            <div className="camera-actions">
              <button className="camera-btn-retake" onClick={handleRetake}>Retake</button>
              <button className="camera-btn-share" onClick={handleShare}>Save</button>
              {step === 1 && <button className="camera-btn-next" onClick={() => setStep(2)}>Next →</button>}
              {step === 2 && <button className="camera-btn-close" onClick={handleClose}>Done</button>}
            </div>
          </div>
        );
      }

      return (
        <div className="camera-overlay">
          <video ref={videoRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} style={{display:'none'}} />
          <div className="camera-watermark">snbwsop.com</div>
          <div className="camera-step-indicator">
            {step === 1 ? 'Step 1 of 2 — Receipt' : 'Step 2 of 2 — Starting Stack'}
          </div>
          {step === 2 && (
            <div className="camera-stats-bar">
              <div className="tournament-name">{overlayLine1}</div>
              <div className="stats-line">{overlayLine2}</div>
            </div>
          )}
          <input type="file" accept="image/*" ref={fileInputRef} style={{display:'none'}} onChange={handleGalleryPick} />
          <div className="camera-actions">
            <button className="camera-btn-close" onClick={handleClose}>✕</button>
            <button className="camera-btn-capture" onClick={handleCapture}>Capture</button>
            <button className="camera-btn-gallery" onClick={() => fileInputRef.current?.click()} title="Choose from gallery">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
            </button>
          </div>
        </div>
      );
    }

    // ── Table Scanner — OCR screenshot → Hendon Mob links ────

    // Common first names for OCR correction (lowercase)
    const COMMON_FIRST_NAMES = new Set([
      'aaron','adam','adrian','alan','albert','alex','alexander','alfred',
      'allen','andree','andrew','angel','anthony','antonio','arthur','austin',
      'barry','ben','benjamin','bernard','bill','billy','bobby','brad',
      'bradley','brandon','brian','bruce','bryan','carl','carlos','chad',
      'charles','charlie','chris','christian','christopher','clarence',
      'claude','clifford','cody','cole','colin','connor','conor','conrad','corey','craig',
      'dale','dan','daniel','danny','darren','dave','david','dean','dennis',
      'derek','derrick','dino','dom','dominic','don','donald','dong','doug',
      'douglas','drew','dustin','dwight','dylan','earl','eddie','edward',
      'edwin','eli','elias','elliot','eric','erik','ernest','ethan','eugene',
      'evan','felix','fernando','frank','fred','frederick','gabriel','gary',
      'gene','george','gerald','glen','glenn','gordon','grant','greg',
      'gregory','guy','hank','harold','harry','harvey','hector','henry',
      'herbert','herman','howard','hugh','ian','isaac','ivan','jack',
      'jacob','jake','james','jamie','jared','jason','jay','jeff','jeffrey',
      'jeremy','jerome','jerry','jesse','jim','jimmy','joe','joel','john',
      'johnny','jon','jonathan','jordan','jorge','jose','joseph','josh',
      'joshua','juan','julian','justin','karl','keith','kelly','ken',
      'kenneth','kevin','kimberly','kirk','kyle','lance','larry','lawrence','lee',
      'leon','leonard','lester','lewis','liam','logan','lonnie','louis',
      'luc','lucas','luis','luke','marcus','mario','mark','marshall','martin',
      'marvin','mason','matt','matthew','maurice','max','michael','miguel',
      'mike','miles','mitchell','mohammad','morris','murray','nathan',
      'nathaniel','neil','nelson','nicholas','nick','noah','norman','oliver',
      'omar','oscar','owen','pablo','patrick','paul','pedro','perry','pete',
      'peter','phil','philip','phillip','pierre','raj','ralph','ramon',
      'randy','ray','raymond','ricardo','rich','richard','rick','ricky',
      'rob','robert','robin','rod','rodney','rodolphe','roger','roland','roman','ron',
      'ronald','ross','roy','ruben','russell','ryan','sam','samuel','scott',
      'sean','sergio','seth','shane','shaun','shawn','simon','spencer',
      'stanley','stephen','steve','steven','stuart','ted','terry','thomas',
      'tim','timothy','todd','tom','tommy','tony','travis','trevor','troy',
      'tyler','victor','vincent','virgil','wade','walter','warren','wayne',
      'wesley','will','william','willie','zachary',
    ]);

    // OCR confusion pairs: [misread, correct] at character level
    const OCR_SUBS = [
      ['w', 'v'],  ['v', 'w'],   // Dawid→David, Vill→Will
      ['rn', 'm'], ['m', 'rn'],  // Tirn→Tim, Jarne→Jarne
      ['cl', 'd'], ['d', 'cl'],  // Dacl→Dad
      ['li', 'h'], ['h', 'li'],  // Jolm→John (l+i looks like h sometimes)
      ['l', 'i'],  ['i', 'l'],   // Mlke→Mike, Damel→Daniel
      ['0', 'o'],  ['o', '0'],   // R0bert→Robert
      ['1', 'l'],  ['l', '1'],   // Pau1→Paul
      ['ii', 'n'], ['n', 'ii'],  // Daii→Dan (unlikely but possible)
      ['vv', 'w'], ['w', 'vv'],  // Davvid edge case
    ];

    function ocrCorrectFirstName(word) {
      const lower = word.toLowerCase();
      if (COMMON_FIRST_NAMES.has(lower)) return word; // already valid

      // Try each substitution and see if result is a known name
      for (const [from, to] of OCR_SUBS) {
        let idx = 0;
        while ((idx = lower.indexOf(from, idx)) !== -1) {
          const candidate = lower.slice(0, idx) + to + lower.slice(idx + from.length);
          if (COMMON_FIRST_NAMES.has(candidate)) {
            // Rebuild with original casing style (Title Case)
            return candidate.charAt(0).toUpperCase() + candidate.slice(1);
          }
          idx++;
        }
      }
      return word; // no correction found, keep as-is
    }

    const WSOP_UI_NOISE = new Set([
      'table','day','players','player','largest','smallest','stack',
      'reg','closed','open','main','story','blinds','tabs','buy',
      'buyin','start','late','nlh','plo','gtd','flight','event',
      'monster','bounty','mystery','sat','mon','tue','wed','thu',
      'fri','sat','sun','jan','feb','mar','apr','may','jun','jul',
      'aug','sep','oct','nov','dec','the','and','for','lest',
      'hold','holdem','omaha','stud','razz','draw','mixed',
      'championship','deep','turbo','mega','super','hyper',
      'level','break','ante','big','small','blind','pot','limit',
      'seat','seats','chip','chips','round','final','heads','tag',
      'team','ladies','senior','employee','daily','special',
      'payouts','payout','structure','lobby','chat','cashier',
      'rebuy','addon','tournament','dealer','fold','check',
      'call','raise','hand','history','settings','menu',
    ]);

    // Parse chip count string like "405.0K" or "1.1M" into display format
    // Requires K/M suffix or a raw number >= 1000 (filters OCR noise like "1", "23")
    const CHIP_RE = /(\d[\d,]*\.?\d*)\s*([KkMm])?/;
    function parseChips(line) {
      const m = line.match(CHIP_RE);
      if (!m) return null;
      const num = parseFloat(m[1].replace(/,/g, ''));
      const suffix = (m[2] || '').toUpperCase();
      if (isNaN(num)) return null;
      // Must have K/M suffix or be >= 1000 raw
      if (!suffix && num < 1000) return null;
      if (suffix === 'M') return num >= 10 ? Math.round(num) + 'M' : num + 'M';
      if (suffix === 'K') return num >= 100 ? Math.round(num) + 'K' : num + 'K';
      if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
      if (num >= 1000) return (num / 1000).toFixed(0) + 'K';
      return null;
    }

    function isNameCandidate(text) {
      const line = text.trim();
      if (line.length < 4) return null;
      if (/\d/.test(line)) return null;
      if (/[#@:;{}()\[\]<>|\\\/~`!^*+=]/.test(line)) return null;

      let cleaned = line.replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '').trim();
      if (!cleaned || cleaned.length < 4) return null;

      const words = cleaned.split(/\s+/).filter(w => /^[A-Za-z'-]+$/.test(w) && w.length >= 2);
      if (words.length < 2 || words.length > 3) return null;
      if (words.some(w => w.replace(/['-]/g, '').length < 2)) return null;

      const allNoise = words.every(w => WSOP_UI_NOISE.has(w.toLowerCase()));
      if (allNoise) return null;
      const noiseCount = words.filter(w => WSOP_UI_NOISE.has(w.toLowerCase())).length;
      if (noiseCount > 0 && noiseCount >= words.length - 1 && words.length > 2) return null;

      const totalChars = words.join('').replace(/['-]/g, '').length;
      if (totalChars < 6) return null;
      if (!words.some(w => w.replace(/['-]/g, '').length >= 4)) return null;

      const titleCased = words.map(w => w.replace(/[A-Za-z]+/g, (m, i) =>
        i === 0 || w[i-1] === "'" || w[i-1] === '-'
          ? m.charAt(0).toUpperCase() + m.slice(1).toLowerCase()
          : m.toLowerCase()
      ));
      titleCased[0] = ocrCorrectFirstName(titleCased[0]);
      return titleCased.join(' ');
    }

    function extractPlayerNames(ocrData) {
      // Use Tesseract word-level bounding boxes for precise spatial matching
      const ocrLines = ocrData.lines || [];
      const nameBlocks = []; // {name, cx, cy}
      const chipBlocks = []; // {chips, cx, cy}
      const seen = new Set();

      for (const line of ocrLines) {
        const text = (line.text || '').trim();
        if (!text) continue;
        const box = line.bbox;
        const cx = (box.x0 + box.x1) / 2;
        const cy = (box.y0 + box.y1) / 2;

        // Try as name
        const name = isNameCandidate(text);
        if (name) {
          const key = name.toLowerCase();
          if (!seen.has(key)) {
            seen.add(key);
            nameBlocks.push({ name, cx, cy });
          }
          // DON'T continue — also scan this line's words for chip values
        }

        // Scan individual words for chip counts (word-level bboxes are more precise)
        const words = line.words || [];
        for (const word of words) {
          const wt = (word.text || '').trim();
          if (!/\d/.test(wt)) continue;
          const chips = parseChips(wt);
          if (chips) {
            const wb = word.bbox;
            chipBlocks.push({
              chips,
              cx: (wb.x0 + wb.x1) / 2,
              cy: (wb.y0 + wb.y1) / 2,
            });
          }
        }
        // Fallback: if no words array, try line-level chip detection
        if (!words.length && /\d/.test(text)) {
          const chips = parseChips(text);
          if (chips) chipBlocks.push({ chips, cx, cy });
        }
      }

      // Optimal 1:1 matching: sort ALL candidate pairs by distance,
      // assign best matches first so no name steals another's chip count
      const pairs = [];
      for (let ni = 0; ni < nameBlocks.length; ni++) {
        for (let ci = 0; ci < chipBlocks.length; ci++) {
          const nb = nameBlocks[ni], cb = chipBlocks[ci];
          pairs.push({ ni, ci, dist: (cb.cx - nb.cx) ** 2 + (cb.cy - nb.cy) ** 2 });
        }
      }
      pairs.sort((a, b) => a.dist - b.dist);

      const usedNames = new Set(), usedChips = new Set();
      const chipMap = {};
      for (const { ni, ci } of pairs) {
        if (usedNames.has(ni) || usedChips.has(ci)) continue;
        usedNames.add(ni);
        usedChips.add(ci);
        chipMap[ni] = chipBlocks[ci].chips;
      }
      // Compute image bounds for normalizing positions to 0-100%
      const allBlocks = [...nameBlocks, ...chipBlocks];
      const minX = Math.min(...allBlocks.map(b => b.cx));
      const maxX = Math.max(...allBlocks.map(b => b.cx));
      const minY = Math.min(...allBlocks.map(b => b.cy));
      const maxY = Math.max(...allBlocks.map(b => b.cy));
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;

      return nameBlocks.map((nb, ni) => ({
        name: nb.name,
        chips: chipMap[ni] || null,
        // Normalized position (0-100) from OCR bounding boxes
        px: ((nb.cx - minX) / rangeX) * 100,
        py: ((nb.cy - minY) / rangeY) * 100,
      }));
    }

    // ── PokerStars Live table format detection & parsing ──────
    // PokerStars Live screenshots show a structured table with columns:
    // Pos. | Player (name + country) | Chips | Seat (e.g. "7-1") | Prize
    // Dark background, no green felt — pure tabular data.

    // Detect whether screenshot is a green-felt table (WSOP Live) or a list/table (PokerStars Live)
    function detectImageFormat(img) {
      var canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      var pixels = ctx.getImageData(0, 0, img.width, img.height).data;
      var total = img.width * img.height;

      var greenFeltCount = 0;
      var whiteCount = 0;
      var purpleCount = 0;

      for (var i = 0; i < pixels.length; i += 4) {
        var r = pixels[i], g = pixels[i+1], b = pixels[i+2];
        // Green felt: green channel dominant
        if (g > r * 1.2 && g > b * 1.2 && g > 30) greenFeltCount++;
        // White/light (PS Live has white/light gray rows)
        if (r > 220 && g > 220 && b > 220) whiteCount++;
        // Purple (PS Live header is purple/magenta)
        if (r > 80 && b > 80 && g < 60 && Math.abs(r - b) < 40) purpleCount++;
      }

      var greenRatio = greenFeltCount / total;
      var whiteRatio = whiteCount / total;
      var purpleRatio = purpleCount / total;

      // PS Live: white background with purple accents, aspect ratio is portrait (tall)
      var aspectRatio = img.height / img.width;
      var isPortrait = aspectRatio > 1.3;

      // If mostly green felt (>5%), it's WSOP Live
      if (greenRatio > 0.05) return 'wsop';
      // Portrait with white bg or purple = PS Live list view
      if (isPortrait && (whiteRatio > 0.15 || purpleRatio > 0.02)) return 'pokerstars';
      // Fallback: if very little green, assume PS Live
      if (greenRatio < 0.03) return 'pokerstars';
      return 'wsop';
    }

    // Preprocess PokerStars Live screenshot for OCR
    // Returns multiple preprocessed versions to try
    // PS Live: dark background (#1a1a2e or similar), white/light gray text,
    // purple highlighted row for the user, flag emojis between name and country
    function preprocessPokerStarsImage(file) {
      // PS Live has mixed backgrounds: white rows (dark text) and dark/purple rows (light text).
      // Strategy: per-row normalization — detect each row's background brightness and
      // invert dark rows so all text ends up dark-on-light for Tesseract.
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const scale = 3;
          const w = img.width * scale;
          const h = img.height * scale;
          const c = document.createElement('canvas');
          c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, w, h);

          const id = ctx.getImageData(0, 0, w, h);
          const d = id.data;

          // Step 1: Convert to grayscale
          for (let i = 0; i < d.length; i += 4) {
            const gray = Math.round(0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]);
            d[i] = d[i+1] = d[i+2] = gray;
          }

          // Step 2: Per-row normalization — rows with dark bg get inverted
          // so text is always dark on a light background
          for (let y = 0; y < h; y++) {
            let rowSum = 0;
            for (let x = 0; x < w; x++) {
              rowSum += d[(y * w + x) * 4];
            }
            const avgBrightness = rowSum / w;
            // Dark row (dark bg or purple bg): invert so text becomes dark on light
            if (avgBrightness < 160) {
              for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                d[idx] = d[idx+1] = d[idx+2] = 255 - d[idx];
              }
            }
          }

          // Step 3: Contrast stretch — push grays toward black/white for crisper OCR
          for (let i = 0; i < d.length; i += 4) {
            const v = d[i];
            // Stretch: values below 80 → black, above 180 → white, linear in between
            const stretched = v < 80 ? 0 : v > 180 ? 255 : Math.round((v - 80) * (255 / 100));
            d[i] = d[i+1] = d[i+2] = stretched;
          }

          ctx.putImageData(id, 0, 0);
          c.toBlob((blob) => resolve({ gray3x: blob }), 'image/png');
        };
        img.src = URL.createObjectURL(file);
      });
    }

    // Country names commonly appearing in PokerStars Live player rows
    const PS_COUNTRIES = new Set([
      'argentina','australia','austria','bahamas','belgium','brazil','bulgaria',
      'canada','chile','china','colombia','croatia','czech republic','czechia',
      'denmark','egypt','england','estonia','finland','france','germany','greece',
      'hungary','iceland','india','indonesia','iran','ireland','israel','italy',
      'japan','kazakhstan','korea','latvia','lebanon','lithuania','luxembourg',
      'malaysia','mexico','monaco','morocco','netherlands','new zealand','nigeria',
      'norway','pakistan','peru','philippines','poland','portugal','romania',
      'russia','scotland','serbia','singapore','slovakia','slovenia','south africa',
      'south korea','spain','sweden','switzerland','taiwan','thailand','turkey',
      'ukraine','united kingdom','united states','uruguay','venezuela','vietnam',
      'wales','uk','us','usa','uae',
    ]);

    // 2-letter and 3-letter country codes
    const PS_COUNTRY_CODES = new Set([
      'ar','au','at','bs','be','br','bg','ca','cl','cn','co','hr','cz','dk',
      'eg','ee','fi','fr','de','gr','hu','is','in','id','ir','ie','il','it',
      'jp','kz','kr','lv','lb','lt','lu','my','mx','mc','ma','nl','nz','ng',
      'no','pk','pe','ph','pl','pt','ro','ru','rs','sg','sk','si','za','es',
      'se','ch','tw','th','tr','ua','gb','us','uy','ve','vn',
      'arg','aus','aut','bhs','bel','bra','bgr','can','chl','chn','col','hrv',
      'cze','dnk','egy','est','fin','fra','deu','grc','hun','isl','ind','idn',
      'irn','irl','isr','ita','jpn','kaz','kor','lva','lbn','ltu','lux','mys',
      'mex','mco','mar','nld','nzl','nga','nor','pak','per','phl','pol','prt',
      'rou','rus','srb','sgp','svk','svn','zaf','esp','swe','che','twn','tha',
      'tur','ukr','gbr','usa','ury','ven','vnm',
    ]);

    // Parse PokerStars Live tabular OCR text into player objects
    // Parse PokerStars Live OCR data using word-level bounding boxes
    // The table has 4 columns: Pos | Name+Country | Chips | Seat
    // We use x-position to identify columns and y-position to group rows
    function parsePokerStarsTable(ocrData) {
      const players = [];
      const seen = new Set();

      // Get all words with bounding boxes
      const words = [];
      if (ocrData.words) {
        for (const w of ocrData.words) {
          if (w.text && w.bbox) words.push(w);
        }
      } else if (ocrData.lines) {
        for (const line of ocrData.lines) {
          if (line.words) {
            for (const w of line.words) {
              if (w.text && w.bbox) words.push(w);
            }
          }
        }
      }

      if (words.length === 0) {
        // Fallback: parse from text
        return parsePokerStarsTableFromText(ocrData.text || '');
      }

      // Find seat words: match N-N pattern
      const seatWords = [];
      for (const w of words) {
        const m = w.text.match(/^(\d{1,2})[-–—](\d{1,2})$/);
        if (m) {
          const tbl = parseInt(m[1]);
          const st = parseInt(m[2]);
          if (tbl >= 1 && tbl <= 99 && st >= 1 && st <= 10) {
            seatWords.push({ tbl, st, seat: tbl + '-' + st, cy: (w.bbox.y0 + w.bbox.y1) / 2, cx: (w.bbox.x0 + w.bbox.x1) / 2, bbox: w.bbox });
          }
        }
      }

      console.log('[PSParser] Found', seatWords.length, 'seat words from', words.length, 'total words');

      if (seatWords.length === 0) {
        return parsePokerStarsTableFromText(ocrData.text || '');
      }

      // For each seat word, find nearby words on the same row (similar y)
      for (const sw of seatWords) {
        if (seen.has('seat:' + sw.seat)) continue;
        const rowY = sw.cy;
        const rowH = sw.bbox ? (sw.bbox.y1 - sw.bbox.y0) : 60;
        const tolerance = Math.max(rowH * 0.8, 50); // scale-aware row tolerance

        // Get all words on the same row (within tolerance)
        const rowWords = words.filter(w => {
          const wy = (w.bbox.y0 + w.bbox.y1) / 2;
          return Math.abs(wy - rowY) < tolerance;
        }).sort((a, b) => a.bbox.x0 - b.bbox.x0);

        // The seat is the rightmost column. Chips are just left of seat.
        // Name is everything to the left of chips, after position number.
        // Find chip count: look for comma-formatted number or large number left of seat
        let chips = null;
        let chipIdx = -1;
        for (let i = rowWords.length - 1; i >= 0; i--) {
          const t = rowWords[i].text;
          if (t === sw.tbl + '-' + sw.st || t === sw.tbl + '—' + sw.st || t === sw.tbl + '–' + sw.st) continue; // skip seat itself
          // Match chip counts: "27K", "120K", "1.2M", "106,000", raw numbers ≥1000
          const chipMatch = t.match(/^(\d{1,3}(?:[.,]\d{3})+|\d{4,}|(\d+(?:\.\d+)?)[KkMm])$/);
          if (chipMatch) {
            let chipVal;
            if (chipMatch[2] !== undefined) {
              // K or M suffix
              const num = parseFloat(chipMatch[2]);
              const suffix = t.slice(-1).toUpperCase();
              chipVal = suffix === 'M' ? num + 'M' : Math.round(num) + 'K';
            } else {
              const raw = parseInt(chipMatch[1].replace(/[,. ]/g, ''));
              if (raw < 1000) { continue; }
              chipVal = raw >= 1000000 ? (raw / 1000000).toFixed(1).replace(/\.0$/, '') + 'M' : Math.round(raw / 1000) + 'K';
            }
            chips = chipVal;
            chipIdx = i;
            break;
          }
        }

        // Name words: everything between position number and chips (or seat if no chips)
        // Skip first word if it's just a position number
        let nameStart = 0;
        if (rowWords.length > 0 && /^\d{1,3}$/.test(rowWords[0].text)) nameStart = 1;

        const nameEnd = chipIdx >= 0 ? chipIdx : rowWords.length - 1;
        const nameWordTexts = [];
        for (let i = nameStart; i < nameEnd; i++) {
          const t = rowWords[i].text.replace(/[^A-Za-z'-]/g, '');
          if (t.length >= 2) nameWordTexts.push(t);
        }

        // Strip country names from start and end
        while (nameWordTexts.length > 1) {
          const first2 = nameWordTexts.slice(0, 2).join(' ').toLowerCase();
          const first1 = nameWordTexts[0].toLowerCase();
          if (PS_COUNTRIES.has(first2)) { nameWordTexts.splice(0, 2); continue; }
          if (PS_COUNTRIES.has(first1) || PS_COUNTRY_CODES.has(first1)) { nameWordTexts.shift(); continue; }
          break;
        }
        while (nameWordTexts.length > 1) {
          const last2 = nameWordTexts.slice(-2).join(' ').toLowerCase();
          const last1 = nameWordTexts[nameWordTexts.length - 1].toLowerCase();
          if (PS_COUNTRIES.has(last2)) { nameWordTexts.splice(-2); continue; }
          if (PS_COUNTRIES.has(last1) || PS_COUNTRY_CODES.has(last1)) { nameWordTexts.pop(); continue; }
          break;
        }
        // Remove short artifacts
        const cleaned = nameWordTexts.filter(w => w.length >= 3 || COMMON_FIRST_NAMES.has(w.toLowerCase()));
        if (cleaned.length === 0) continue;

        // Title case
        let playerName = cleaned.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');

        // Skip if it's a country
        if (PS_COUNTRIES.has(playerName.toLowerCase())) continue;

        // OCR first name correction
        const nw = playerName.split(/\s+/);
        nw[0] = ocrCorrectFirstName(nw[0]);
        playerName = nw.join(' ');

        if (playerName.length < 3) continue;
        if (seen.has('seat:' + sw.seat)) continue;
        if (seen.has('name:' + playerName.toLowerCase())) continue;
        seen.add('seat:' + sw.seat);
        seen.add('name:' + playerName.toLowerCase());

        players.push({
          name: playerName, chips, seat: sw.seat, prize: null, country: null,
          position: players.length + 1, px: null, py: null,
        });
      }

      console.log('[PSParser] Spatial parse result:', players.length, 'players');
      return players;
    }

    // Fallback text-based parser when word bounding boxes aren't available
    function parsePokerStarsTableFromText(ocrText) {
      const allPlayers = [];
      const seen = new Set();
      const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);

      for (let i = 0; i < lines.length; i++) {
        // Merge with next line in case row is split
        const candidates = [lines[i]];
        if (i + 1 < lines.length) candidates.push(lines[i] + '  ' + lines[i + 1]);

        for (const line of candidates) {
          // Find seat pattern (rightmost N-N)
          const seatRe = /(\d{1,2})\s*[-–—]\s*(\d{1,2})/g;
          let lastMatch = null, m;
          while ((m = seatRe.exec(line)) !== null) {
            const tbl = parseInt(m[1]), st = parseInt(m[2]);
            if (tbl >= 1 && tbl <= 99 && st >= 1 && st <= 10) lastMatch = { m, tbl, st };
          }
          if (!lastMatch) continue;

          const seat = lastMatch.tbl + '-' + lastMatch.st;
          if (seen.has('seat:' + seat)) continue;

          const before = line.substring(0, lastMatch.m.index);
          // Extract chips
          let chips = null;
          const chipM = before.match(/\b(\d{1,3}(?:,\d{3})+|\d{4,})\b/);
          if (chipM) {
            const raw = parseInt(chipM[1].replace(/,/g, ''));
            if (raw >= 1000) chips = Math.round(raw / 1000) + 'K';
          }

          // Extract name: remove numbers, country names
          let nameArea = before.replace(/\b\d[\d,]*\b/g, ' ').replace(/[^A-Za-z\s'-]/g, ' ').replace(/\s+/g, ' ').trim();
          let nameWords = nameArea.split(/\s+/).filter(w => w.length >= 2);
          // Strip countries from both ends
          while (nameWords.length > 1 && (PS_COUNTRIES.has(nameWords.slice(0, 2).join(' ').toLowerCase()) || PS_COUNTRIES.has(nameWords[0].toLowerCase()) || PS_COUNTRY_CODES.has(nameWords[0].toLowerCase()))) {
            if (PS_COUNTRIES.has(nameWords.slice(0, 2).join(' ').toLowerCase())) nameWords.splice(0, 2);
            else nameWords.shift();
          }
          while (nameWords.length > 1 && (PS_COUNTRIES.has(nameWords.slice(-2).join(' ').toLowerCase()) || PS_COUNTRIES.has(nameWords[nameWords.length-1].toLowerCase()) || PS_COUNTRY_CODES.has(nameWords[nameWords.length-1].toLowerCase()))) {
            if (nameWords.length >= 2 && PS_COUNTRIES.has(nameWords.slice(-2).join(' ').toLowerCase())) nameWords.splice(-2);
            else nameWords.pop();
          }
          nameWords = nameWords.filter(w => w.length >= 3 || COMMON_FIRST_NAMES.has(w.toLowerCase()));
          if (nameWords.length === 0) continue;

          let playerName = nameWords.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          if (PS_COUNTRIES.has(playerName.toLowerCase())) continue;
          const nw = playerName.split(/\s+/);
          nw[0] = ocrCorrectFirstName(nw[0]);
          playerName = nw.join(' ');
          if (playerName.length < 3) continue;

          if (seen.has('name:' + playerName.toLowerCase())) continue;
          seen.add('seat:' + seat);
          seen.add('name:' + playerName.toLowerCase());
          allPlayers.push({ name: playerName, chips, seat, tableNum: lastMatch.tbl, prize: null, country: null, position: 0, px: null, py: null });
          break;
        }
      }

      // Return all players with tableNum preserved for table picker filtering
      return allPlayers.map((p, i) => ({ ...p, position: i + 1 }));
    }

    function preprocessImage(file) {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          // Step 1: Detect the green table felt region
          const tmpCanvas = document.createElement('canvas');
          tmpCanvas.width = img.width;
          tmpCanvas.height = img.height;
          const tmpCtx = tmpCanvas.getContext('2d');
          tmpCtx.drawImage(img, 0, 0);
          const fullPixels = tmpCtx.getImageData(0, 0, img.width, img.height).data;

          // Scan rows for green felt pixels
          let tableTop = -1, tableBottom = -1;
          for (let y = 0; y < img.height; y++) {
            let greenCount = 0;
            for (let x = 0; x < img.width; x++) {
              const idx = (y * img.width + x) * 4;
              const r = fullPixels[idx], g = fullPixels[idx+1], b = fullPixels[idx+2];
              // Green felt: green channel dominant over red and blue
              if (g > r * 1.2 && g > b * 1.2 && g > 30) greenCount++;
            }
            if (greenCount / img.width > 0.1) {
              if (tableTop === -1) tableTop = y;
              tableBottom = y;
            }
          }

          // Crop to table area with padding for player name labels
          const pad = Math.round(img.height * 0.02);
          const cropY = Math.max(0, (tableTop !== -1 ? tableTop : 0) - pad);
          const cropEnd = Math.min(img.height, (tableBottom !== -1 ? tableBottom : img.height) + pad);
          const cropH = cropEnd - cropY;

          // Build header image (area above the table) for event title extraction
          let headerBlob = null;
          if (cropY > 30) {
            const hCanvas = document.createElement('canvas');
            const hScale = 2;
            hCanvas.width = img.width * hScale;
            hCanvas.height = cropY * hScale;
            const hCtx = hCanvas.getContext('2d');
            hCtx.drawImage(img, 0, 0, img.width, cropY, 0, 0, hCanvas.width, hCanvas.height);
            // Invert for OCR (white text on dark bg → dark on light)
            const hData = hCtx.getImageData(0, 0, hCanvas.width, hCanvas.height);
            const hd = hData.data;
            for (let i = 0; i < hd.length; i += 4) {
              const gray = 0.299 * hd[i] + 0.587 * hd[i+1] + 0.114 * hd[i+2];
              hd[i] = hd[i+1] = hd[i+2] = 255 - gray;
            }
            hCtx.putImageData(hData, 0, 0);
            headerBlob = new Promise(r => hCanvas.toBlob(r, 'image/png'));
          }

          // Step 2: Scale up 2x and preprocess cropped region
          const scale = 2;
          const canvas = document.createElement('canvas');
          canvas.width = img.width * scale;
          canvas.height = cropH * scale;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, cropY, img.width, cropH, 0, 0, canvas.width, canvas.height);

          // Invert + grayscale: WSOP app has white text on dark bg
          // Tesseract works best with dark text on light bg
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const d = imageData.data;
          for (let i = 0; i < d.length; i += 4) {
            const gray = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
            const inverted = 255 - gray;
            const val = inverted < 80 ? Math.max(0, inverted * 0.5) :
                        inverted > 180 ? 255 :
                        Math.round((inverted - 80) / 100 * 255);
            d[i] = d[i+1] = d[i+2] = val;
          }
          ctx.putImageData(imageData, 0, 0);
          canvas.toBlob(async (tableBlob) => {
            resolve({ tableBlob, headerBlob: headerBlob ? await headerBlob : null });
          }, 'image/png');
        };
        img.src = URL.createObjectURL(file);
      });
    }

    function cleanOcrTitle(raw) {
      // Strip leading/trailing non-alphanumeric OCR noise (e.g., "<{", "}")
      let s = raw.replace(/^[^A-Za-z0-9#$]+/, '').replace(/[^A-Za-z0-9%)+]+$/, '');
      // Collapse whitespace
      s = s.replace(/\s+/g, ' ').trim();
      // Strip trailing " - Fi" or similar truncated suffixes from OCR
      s = s.replace(/\s*-\s*[A-Z][a-z]?\.{0,3}$/, '');
      return s;
    }

    function extractEventTitle(ocrText) {
      const lines = ocrText.split('\n').map(l => l.trim()).filter(Boolean);
      // Try to find "#XX: Event Name" anywhere in a line
      for (const line of lines) {
        const m = line.match(/#\s*(\d{1,3})\s*[:\-—]\s*(.+)/);
        if (m) {
          const num = m[1];
          const name = cleanOcrTitle(m[2]);
          if (name.length > 4) return `#${num}: ${name}`;
        }
      }
      // Look for "Event #XX" pattern
      for (const line of lines) {
        const m = line.match(/Event\s*#?\s*(\d{1,3})\b/i);
        if (m) {
          // Try to grab the rest after the number
          const after = line.slice(m.index + m[0].length).replace(/^[\s:\-—]+/, '');
          const name = cleanOcrTitle(after);
          if (name.length > 4) return `#${m[1]}: ${name}`;
          return `Event #${m[1]}`;
        }
      }
      // Look for poker keywords
      const keywords = ['hold\'em', 'holdem', 'no limit', 'no-limit', 'nlh', 'omaha', 'plo', 'stud', 'razz', 'mixed', 'bounty', 'deepstack', 'turbo', 'mega', 'monster'];
      for (const line of lines) {
        const lower = line.toLowerCase();
        if (keywords.some(kw => lower.includes(kw)) && line.length > 8 && line.length < 80) {
          return cleanOcrTitle(line);
        }
      }
      return null;
    }

    function TableScanner() {
      const [state, setState] = useState('idle'); // idle | processing | tableSelect | results
      const [progress, setProgress] = useState(0);
      const [players, setPlayers] = useState([]);
      const [eventTitle, setEventTitle] = useState('');
      const [error, setError] = useState('');
      const [availableTables, setAvailableTables] = useState(null); // { tableNum: [players] }
      const [allParsedPlayers, setAllParsedPlayers] = useState([]);
      const [feltColor, setFeltColor] = useState('#1a5c2e');
      const [portrait, setPortrait] = useState(false);
      const ovalRef = useRef(null);
      const fileRef = useRef(null);
      const colorRef = useRef(null);

      const SCANNER_LAYOUTS = {
        2:  [[50,12],[50,88]],
        3:  [[50,12],[85,75],[15,75]],
        4:  [[50,12],[98,50],[50,88],[2,50]],
        5:  [[50,12],[98,40],[80,88],[20,88],[2,40]],
        6:  [[30,12],[70,12],[98,50],[70,88],[30,88],[2,50]],
        7:  [[50,12],[98,28],[98,65],[70,88],[30,88],[2,65],[2,28]],
        8:  [[30,12],[70,12],[98,28],[98,72],[70,88],[30,88],[2,72],[2,28]],
        9:  [[50,12],[80,16],[98,42],[98,72],[70,88],[30,88],[2,72],[2,42],[20,16]],
        10: [[35,12],[65,12],[98,22],[98,50],[98,78],[65,88],[35,88],[2,78],[2,50],[2,22]],
      };

      function getDisplayPlayers(rawPlayers) {
        const hasSeatData = rawPlayers.some(p => p.seat);
        const sorted = [...rawPlayers].sort((a, b) => {
          if (hasSeatData) {
            const sA = a.seat ? parseInt(a.seat.split('-')[1]) || 0 : (a.position || 99);
            const sB = b.seat ? parseInt(b.seat.split('-')[1]) || 0 : (b.position || 99);
            return sA - sB;
          }
          return (a.position || 0) - (b.position || 0);
        });
        const n = Math.min(Math.max(sorted.length, 2), 10);
        const heroIdx = sorted.findIndex(p => p.isHero);
        const PORTRAIT_LAYOUTS = {
          2:  [[50,12],[50,88]],
          3:  [[50,12],[75,65],[25,65]],
          4:  [[50,12],[88,50],[50,88],[12,50]],
          5:  [[50,10],[85,35],[75,85],[25,85],[15,35]],
          6:  [[50,8],[85,30],[85,70],[50,92],[15,70],[15,30]],
          7:  [[50,8],[82,22],[88,50],[72,85],[28,85],[12,50],[18,22]],
          8:  [[35,8],[65,8],[88,30],[88,70],[65,92],[35,92],[12,70],[12,30]],
          9:  [[50,6],[78,14],[88,38],[88,62],[70,88],[30,88],[12,62],[12,38],[22,14]],
          10: [[35,6],[65,6],[88,20],[88,42],[88,64],[65,90],[35,90],[12,64],[12,42],[12,20]],
        };
        const rawSeats = portrait
          ? (PORTRAIT_LAYOUTS[n] || PORTRAIT_LAYOUTS[9])
          : (SCANNER_LAYOUTS[n] || SCANNER_LAYOUTS[9]);
        const seats = rawSeats;
        if (heroIdx < 0) return { display: sorted, n, seats };
        const targetIdx = Math.floor(n / 2);
        const delta = (heroIdx - targetIdx + n) % n;
        const display = [...sorted.slice(delta), ...sorted.slice(0, delta)];
        return { display, n, seats };
      }

      function handleExport() {
        const el = ovalRef.current;
        if (!el) return;

        // Measure actual bounds including overflowing seats
        const ovalRect = el.getBoundingClientRect();
        const seatEls = el.querySelectorAll('.table-scanner-seat');
        let minX = ovalRect.left, minY = ovalRect.top, maxX = ovalRect.right, maxY = ovalRect.bottom;
        seatEls.forEach(s => {
          const r = s.getBoundingClientRect();
          if (r.left < minX) minX = r.left;
          if (r.top < minY) minY = r.top;
          if (r.right > maxX) maxX = r.right;
          if (r.bottom > maxY) maxY = r.bottom;
        });
        // Add padding
        minX -= 8; minY -= 8; maxX += 8; maxY += 8;

        const W = maxX - minX, H = maxY - minY;
        const SCALE = 2;
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(W * SCALE);
        canvas.height = Math.round(H * SCALE);
        const ctx = canvas.getContext('2d');
        ctx.scale(SCALE, SCALE);

        // ── Felt: pill shape (roundRect with half-height radius), matching CSS border-radius:999px ──
        const feltEl = el.querySelector('.table-scanner-felt');
        const feltRect = feltEl.getBoundingClientRect();
        const fx = feltRect.left - minX, fy = feltRect.top - minY;
        const fw = feltRect.width, fh = feltRect.height;
        const feltStyle = getComputedStyle(feltEl);
        const borderW = parseFloat(feltStyle.borderWidth) || 10;
        const pillR = fh / 2; // 999px border-radius = pill = half shorter side

        const hexToRgb = h => { const m = h.match(/\w\w/g); return m ? m.map(x => parseInt(x, 16)) : [0,0,0]; };
        const [fr,fg,fb] = hexToRgb(feltColor);

        // Outer pill (rail) with drop shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 24;
        ctx.shadowOffsetY = 4;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(fx, fy, fw, fh, pillR);
        else ctx.rect(fx, fy, fw, fh);
        ctx.fillStyle = feltStyle.borderColor || feltColor;
        ctx.fill();
        ctx.restore();

        // Inner felt with radial gradient
        const ix = fx + borderW, iy = fy + borderW;
        const iw = fw - borderW * 2, ih = fh - borderW * 2;
        const innerR = ih / 2;
        const grad = ctx.createRadialGradient(ix + iw/2, iy + ih*0.4, 0, ix + iw/2, iy + ih/2, Math.max(iw, ih)/2);
        grad.addColorStop(0, `rgba(${Math.min(255,fr+30)},${Math.min(255,fg+30)},${Math.min(255,fb+30)},0.8)`);
        grad.addColorStop(1, feltColor);
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(ix, iy, iw, ih, innerR);
        else ctx.rect(ix, iy, iw, ih);
        ctx.fillStyle = grad;
        ctx.fill();

        // Inset shadow (matching CSS: inset 0 2px 12px rgba(0,0,0,0.4))
        ctx.save();
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(ix, iy, iw, ih, innerR);
        else ctx.rect(ix, iy, iw, ih);
        ctx.clip();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 2;
        // Draw a ring outside the clip — only the inward shadow leaks through
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(ix - 20, iy - 20, iw + 40, ih + 40, innerR + 20);
        else ctx.rect(ix - 20, iy - 20, iw + 40, ih + 40);
        // Cut out the inside so only the shadow edge remains
        if (ctx.roundRect) ctx.roundRect(ix, iy, iw, ih, innerR);
        else ctx.rect(ix, iy, iw, ih);
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.fill('evenodd');
        ctx.restore();

        // ── Player cards ──
        const FONT = '"Univers Condensed",Univers,-apple-system,system-ui,sans-serif';
        seatEls.forEach(seat => {
          const btn = seat.querySelector('.table-scanner-link');
          if (!btn) return;
          const btnRect = btn.getBoundingClientRect();
          const bx = btnRect.left - minX, by = btnRect.top - minY;
          const bw = btnRect.width, bh = btnRect.height;
          const bs = getComputedStyle(btn);

          const nameEl = seat.querySelector('.table-scanner-name-stack > span:first-child');
          const chipsEl = seat.querySelector('.table-scanner-chips');

          // Card bg + border
          ctx.save();
          ctx.beginPath();
          if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 6);
          else ctx.rect(bx, by, bw, bh);
          ctx.fillStyle = bs.backgroundColor;
          ctx.fill();
          ctx.strokeStyle = bs.borderColor;
          ctx.lineWidth = 1;
          ctx.stroke();
          // Hero outline
          if (btn.style.outline && btn.style.outline.includes('accent')) {
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#10b981';
            ctx.lineWidth = 2;
            ctx.stroke();
          }
          ctx.restore();

          // Name text
          const nameSize = nameEl ? parseFloat(getComputedStyle(nameEl).fontSize) : parseFloat(bs.fontSize);
          ctx.fillStyle = bs.color;
          ctx.font = `500 ${nameSize}px ${FONT}`;
          ctx.fillText(nameEl?.textContent || '', bx + 8, by + nameSize + 2, bw - 16);

          // Chips/seat text
          if (chipsEl) {
            const cs = getComputedStyle(chipsEl);
            const chipsSize = parseFloat(cs.fontSize);
            ctx.fillStyle = cs.color;
            ctx.font = `400 ${chipsSize}px ${FONT}`;
            ctx.fillText(chipsEl.textContent, bx + 8, by + nameSize + chipsSize + 4, bw - 16);
          }
        });

        // Use native share sheet on iOS (save to Photos), fallback to download
        canvas.toBlob(async blob => {
          try {
            const file = new File([blob], 'table.png', { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
              await navigator.share({ files: [file] });
              return;
            }
          } catch (e) {
            if (e.name === 'AbortError') return;
          }
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'table.png'; a.click();
          URL.revokeObjectURL(url);
        }, 'image/png');
      }

      const handleFile = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setState('processing');
        setProgress(0);
        setError('');
        setPlayers([]);
        setEventTitle('');

        try {
          // Detect image format first
          const formatImg = new Image();
          const formatUrl = URL.createObjectURL(file);
          await new Promise((resolve) => { formatImg.onload = resolve; formatImg.src = formatUrl; });
          const format = detectImageFormat(formatImg);
          URL.revokeObjectURL(formatUrl);

          if (format === 'pokerstars') {
            // ── PokerStars Live: use Claude Vision API via server ──
            setProgress(30);
            const formData = new FormData();
            formData.append('image', file);
            const token = localStorage.getItem('token');
            const resp = await fetch('/api/scan-table', {
              method: 'POST',
              headers: token ? { Authorization: 'Bearer ' + token } : {},
              body: formData,
            });
            setProgress(90);
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.error || 'Scan failed (' + resp.status + ')');
            }
            const { players: rawPlayers } = await resp.json();
            setProgress(100);

            // Normalize players to the internal format
            const extracted = (rawPlayers || []).map((p, i) => ({
              name: p.name || '',
              chips: p.chips || null,
              seat: p.seat || null,
              isHero: p.isHero || false,
              prize: null, country: null,
              position: i + 1, px: null, py: null,
            })).filter(p => p.name.length > 1);

            console.log('[TableScanner] Claude found', extracted.length, 'players');
            console.log('[TableScanner] Seats:', extracted.map(p => p.seat).join(', '));
            console.log('[TableScanner] Hero:', extracted.find(p => p.isHero)?.name || 'none');

            // Group by table number
            const tableGroups = {};
            extracted.forEach(function(p) {
              if (p.seat && p.seat.includes('-')) {
                var tbl = p.seat.split('-')[0];
                if (!tableGroups[tbl]) tableGroups[tbl] = [];
                tableGroups[tbl].push(p);
              }
            });
            var tableNums = Object.keys(tableGroups).sort(function(a, b) { return parseInt(a) - parseInt(b); });
            console.log('[TableScanner] Table groups:', tableNums.map(t => t + ':' + tableGroups[t].length).join(', ') || 'none');

            if (tableNums.length > 1) {
              // Multiple tables detected — always show the table picker
              // Pre-select hero's table visually but let user confirm
              setAvailableTables(tableGroups);
              setAllParsedPlayers(extracted);
              setEventTitle('PokerStars Live');
              setState('tableSelect');
            } else if (extracted.length === 0) {
              setError('No players found in image. Make sure the full seating list is visible.');
              setState('idle');
            } else if (extracted.length > 11 && tableNums.length <= 1) {
              // Too many players for one table — AI probably merged adjacent tables
              // Show table picker if we have at least one group, otherwise show all with warning
              if (tableNums.length === 1) {
                setAvailableTables(tableGroups);
                setAllParsedPlayers(extracted);
                setEventTitle('PokerStars Live');
                setState('tableSelect');
              } else {
                // No table-seat format at all — show all but warn
                setEventTitle('PokerStars Live');
                setPlayers(extracted);
                setState('results');
              }
            } else {
              setEventTitle('PokerStars Live');
              setPlayers(extracted);
              setState('results');
            }
          } else {
            // ── WSOP Live felt screenshot: use Claude Vision API via server ──
            setProgress(30);
            const formData = new FormData();
            formData.append('image', file);
            formData.append('format', 'wsop');
            const token = localStorage.getItem('token');
            const resp = await fetch('/api/scan-table', {
              method: 'POST',
              headers: token ? { Authorization: 'Bearer ' + token } : {},
              body: formData,
            });
            setProgress(90);
            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              throw new Error(err.error || 'Scan failed (' + resp.status + ')');
            }
            const { players: rawPlayers } = await resp.json();
            setProgress(100);

            const extracted = (rawPlayers || []).map((p, i) => ({
              name: p.name || '',
              chips: p.chips || null,
              seat: null,
              prize: null, country: null,
              position: p.position || (i + 1), px: null, py: null,
            })).filter(p => p.name.length > 1)
              .sort((a, b) => a.position - b.position);

            if (extracted.length === 0) {
              setError('No players found. Try a clearer screenshot of the table view.');
              setState('idle');
            } else {
              setPlayers(extracted);
              setState('results');
            }
          }
        } catch (err) {
          console.error('OCR error:', err);
          setError('Scan failed: ' + err.message);
          setState('idle');
        }
        if (fileRef.current) fileRef.current.value = '';
      };

      return (
        <div className="table-scanner">
          <input ref={fileRef} type="file" accept="image/*"
            style={{display:'none'}} onChange={handleFile} />

          {state === 'idle' && (
            <button className="cal-structure-link" onClick={() => fileRef.current?.click()}
              style={{display:'flex',alignItems:'center',justifyContent:'center',gap:'6px',background:'none',border:'1px solid var(--accent)',borderRadius:'6px',padding:'10px 12px',cursor:'pointer',color:'var(--accent)',font:'inherit',fontSize:'0.78rem',width:'100%'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
                <circle cx="12" cy="13" r="4"/>
              </svg>
              Upload Table Screenshot (WSOP Live / PokerStars Live)
            </button>
          )}

          {state === 'processing' && (
            <div className="table-scanner-progress">
              <div className="table-scanner-progress-label">Scanning image…</div>
              <div className="table-scanner-bar-track">
                <div className="table-scanner-bar-fill" style={{width: progress + '%'}} />
              </div>
              <div className="table-scanner-progress-pct">{progress}%</div>
            </div>
          )}

          {state === 'tableSelect' && availableTables && (
            <div className="table-scanner-table-select">
              <div style={{fontWeight:700,fontSize:'0.9rem',color:'var(--text)',marginBottom:'8px'}}>
                Multiple tables detected — select yours:
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>
                {(function() {
                  // Find the hero's table to highlight it
                  var heroP = (allParsedPlayers || []).find(function(p) { return p.isHero; });
                  var heroTbl = heroP && heroP.seat && heroP.seat.includes('-') ? heroP.seat.split('-')[0] : null;
                  return Object.keys(availableTables).sort(function(a, b) { return parseInt(a) - parseInt(b); }).map(function(tbl) {
                    var isHeroTable = tbl === heroTbl;
                    return React.createElement('button', {
                      key: tbl,
                      className: isHeroTable ? 'btn btn-accent btn-sm' : 'btn btn-primary btn-sm',
                      style: {minWidth:'60px',padding:'8px 16px', border: isHeroTable ? '2px solid var(--accent)' : undefined},
                      onClick: function() {
                        var tablePlayers = availableTables[tbl];
                        setPlayers(tablePlayers);
                        setEventTitle('Table ' + tbl);
                        setAvailableTables(null);
                        setState('results');
                      }
                    }, 'Table ' + tbl + ' (' + availableTables[tbl].length + ')' + (isHeroTable ? ' ★' : ''));
                  });
                })()}
              </div>
              <button className="btn btn-ghost btn-sm" style={{marginTop:'8px'}} onClick={function() { setState('idle'); setAvailableTables(null); }}>Cancel</button>
            </div>
          )}

          {state === 'results' && (
            <div className="table-scanner-results">
              <div className="table-scanner-results-header">
                <span style={{fontWeight:600,fontSize:'0.82rem',color:'var(--text)',flex:1,minWidth:0}}>
                  {eventTitle || `${players.length} player${players.length !== 1 ? 's' : ''} found`}
                </span>
                <button className="table-scanner-rescan" onClick={() => setPortrait(p => !p)} style={{padding:'4px 6px',marginRight:'4px'}} title={portrait ? 'Landscape' : 'Portrait'}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
                <button className="table-scanner-rescan" onClick={handleExport} style={{padding:'4px 6px',marginRight:'4px'}} title="Export as PNG">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                </button>
                <button className="table-scanner-rescan" onClick={() => { setState('idle'); setPlayers([]); setEventTitle(''); }}>
                  Rescan
                </button>
              </div>
              <div className="table-scanner-oval" ref={ovalRef} style={portrait ? {aspectRatio:'3 / 4', width:'75%', margin:'4px auto'} : undefined}>
                <label className="table-scanner-felt" title="Change felt colour"
                  style={{
                    background: `radial-gradient(ellipse at ${portrait ? '40% 50%' : '50% 40%'}, ${feltColor}cc 0%, ${feltColor} 100%)`,
                    borderColor: feltColor,
                    cursor: 'pointer',
                    display: 'block',
                    ...(portrait ? {inset:'10% 18%'} : {}),
                  }}>
                  <input type="color" value={feltColor}
                    onChange={e => setFeltColor(e.target.value)}
                    style={{opacity:0,position:'absolute',width:'100%',height:'100%',top:0,left:0,cursor:'pointer',border:'none',padding:0}} />
                </label>
                {(() => {
                  const { display, seats } = getDisplayPlayers(players);
                  return display.map((player, i) => {
                  const pos = seats[i] || [50, 50];
                  const align = pos[0] <= 5 ? ' seat-left' : pos[0] >= 95 ? ' seat-right' : '';
                  // Nickname detection: real names have 2+ words, each starting capital + lowercase
                  const words = player.name.trim().split(/\s+/);
                  const isNickname = words.length < 2 || !words.every(w => /^[A-Z][a-zA-Z'-]+$/.test(w));
                  return (
                    <div key={i} className={'table-scanner-seat' + align}
                      style={{left: pos[0] + '%', top: pos[1] + '%'}}>
                      <button className="table-scanner-link"
                        disabled={isNickname}
                        style={{...(isNickname ? {cursor:'default'} : {}), ...(player.isHero ? {outline:'2px solid var(--accent)',outlineOffset:'2px'} : {})}}
                        onClick={isNickname ? undefined : () => window.open(`/api/hendon-redirect?name=${encodeURIComponent(player.name)}`, '_blank', 'noopener,noreferrer')}>
                        <span className="table-scanner-name-stack">
                          <span>{player.name}</span>
                          {player.chips && <span className="table-scanner-chips">{player.chips}{player.seat ? ` \u00B7 Seat ${player.seat}` : ''}</span>}
                          {!player.chips && player.seat && <span className="table-scanner-chips">Seat {player.seat}</span>}
                          {player.prize && <span className="table-scanner-chips" style={{color:'var(--accent)'}}>{player.prize}</span>}
                        </span>
                        {!isNickname && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0,opacity:0.4}}>
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                          <polyline points="15 3 21 3 21 9"/>
                          <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>}
                      </button>
                    </div>
                  );
                });
                })()}
              </div>
            </div>
          )}

          {error && <div style={{fontSize:'0.78rem',color:'#ef4444',marginTop:4}}>{error}</div>}
        </div>
      );
    }

    // ── Swap/Crossbook Suggestion Modal ───────────────────────
    function SwapModal({ buddy, tournament, token, onClose }) {
      const dn = useDisplayName();
      const [type, setType] = useState('swap');
      const [myPct, setMyPct] = useState('5');
      const [theirPct, setTheirPct] = useState('5');
      const [cbPct, setCbPct] = useState('50');
      const [cbCap, setCbCap] = useState('');
      const [sending, setSending] = useState(false);
      const [msg, setMsg] = useState('');

      const handleSend = async () => {
        setSending(true);
        setMsg('');
        const sendMyPct = type === 'crossbook' ? cbPct : myPct;
        const sendTheirPct = type === 'crossbook' ? cbPct : theirPct;
        try {
          const res = await fetch(`${API_URL}/swap-suggest`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ toUserId: buddy.id, tournamentId: tournament.id, type, myPct: sendMyPct, theirPct: sendTheirPct, cap: type === 'crossbook' && cbCap ? Number(cbCap) : undefined })
          });
          const data = await res.json();
          if (!res.ok) { setMsg(data.error || 'Failed'); setSending(false); return; }
          setMsg('Sent!');
          setTimeout(onClose, 800);
        } catch (e) { console.error('Send failed:', e); setMsg('Failed to send'); setSending(false); }
      };

      return (
        <div style={{position:'fixed',inset:0,zIndex:9999,overflowY:'auto',WebkitOverflowScrolling:'touch'}} onClick={onClose}>
          <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)'}} />
          <div style={{position:'relative',minHeight:'100%',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px 16px'}}>
          <div style={{position:'relative',width:'100%',maxWidth:380,background:'var(--surface)',borderRadius:16,padding:'16px 20px'}} onClick={e => e.stopPropagation()}>
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
              <Avatar src={buddy.avatar} username={buddy.username} size={32} />
              <div>
                <div style={{fontWeight:700,color:'var(--text)',fontSize:'0.9rem'}}>{dn(buddy)}</div>
                <div style={{color:'var(--text-muted)',fontSize:'0.72rem'}}>@{buddy.username}</div>
              </div>
            </div>
            <div style={{background:'var(--surface2)',borderRadius:8,padding:'8px 12px',marginBottom:'12px',fontSize:'0.82rem'}}>
              <div style={{color:'var(--text)',fontWeight:600}}>{tournament.event_name}</div>
              <div style={{color:'var(--text-muted)',fontSize:'0.72rem',marginTop:2}}>{tournament.date} · {tournament.time} · {formatBuyin(tournament.buyin, tournament.venue)}</div>
            </div>
            <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
              {['swap', 'crossbook'].map(t => (
                <button key={t} onClick={() => setType(t)} style={{
                  flex:1,padding:'8px',borderRadius:8,border:'1px solid var(--border)',
                  background: type === t ? 'var(--accent)' : 'var(--surface)',
                  color: type === t ? 'var(--bg)' : 'var(--text)',
                  fontWeight:600,fontSize:'0.85rem',fontFamily:'Univers Condensed, Univers, sans-serif',textTransform:'uppercase',cursor:'pointer'
                }}>{t}</button>
              ))}
            </div>
            {type === 'swap' ? (
              <div style={{display:'flex',gap:'12px',marginBottom:'12px'}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:'0.7rem',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4}}>You give</label>
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <input type="number" min="1" max="100" value={myPct} onChange={e => setMyPct(e.target.value)}
                      style={{width:'100%',padding:'8px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:'1rem',textAlign:'center'}} />
                    <span style={{color:'var(--text-muted)',fontWeight:600}}>%</span>
                  </div>
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:'0.7rem',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4}}>They give</label>
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <input type="number" min="1" max="100" value={theirPct} onChange={e => setTheirPct(e.target.value)}
                      style={{width:'100%',padding:'8px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:'1rem',textAlign:'center'}} />
                    <span style={{color:'var(--text-muted)',fontWeight:600}}>%</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{display:'flex',gap:'12px',marginBottom:'12px'}}>
                <div style={{flex:1}}>
                  <label style={{fontSize:'0.7rem',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4}}>Percentage</label>
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <input type="number" min="1" max="100" value={cbPct} onChange={e => setCbPct(e.target.value)}
                      style={{width:'100%',padding:'8px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:'1rem',textAlign:'center'}} />
                    <span style={{color:'var(--text-muted)',fontWeight:600}}>%</span>
                  </div>
                </div>
                <div style={{flex:1}}>
                  <label style={{fontSize:'0.7rem',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',textTransform:'uppercase',letterSpacing:'0.05em',display:'block',marginBottom:4}}>Cap (optional)</label>
                  <div style={{display:'flex',alignItems:'center',gap:4}}>
                    <input type="number" min="0" value={cbCap} onChange={e => setCbCap(e.target.value)} placeholder="—"
                      style={{width:'100%',padding:'8px',background:'var(--surface2)',border:'1px solid var(--border)',borderRadius:8,color:'var(--text)',fontSize:'1rem',textAlign:'center'}} />
                    <span style={{color:'var(--text-muted)',fontWeight:600}}>{currencySymbol(tournament.venue)}</span>
                  </div>
                </div>
              </div>
            )}
            {msg && <div style={{textAlign:'center',fontSize:'0.82rem',color: msg === 'Sent!' ? '#22c55e' : '#ef4444',marginBottom:6}}>{msg}</div>}
            <button onClick={handleSend} disabled={sending} style={{
              width:'100%',padding:'10px',borderRadius:10,border:'none',
              background:'var(--accent)',color:'var(--bg)',fontWeight:700,fontSize:'0.9rem',
              fontFamily:'Univers Condensed, Univers, sans-serif',cursor: sending ? 'wait' : 'pointer',opacity: sending ? 0.6 : 1
            }}>
              {sending ? 'Sending...' : `Send ${type === 'swap' ? 'Swap' : 'Crossbook'} Offer`}
            </button>
          </div>
          </div>
        </div>
      );
    }

    function BuddyAvatarRow({ buddies, liveUpdates, onBuddyClick }) {
      const dn = useDisplayName();
      const [expanded, setExpanded] = useState(false);
      return (
        <div
          style={{display:'flex',alignItems:'center',gap: expanded ? '8px' : '0',marginBottom:'10px',flexWrap:'wrap',cursor:'pointer'}}
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
        >
          {buddies.map((b, i) => (
            <div key={b.id} style={{
              display:'flex',alignItems:'center',gap:'4px',
              marginLeft: !expanded && i > 0 ? '-6px' : '0',
              transition: 'margin 0.15s ease'
            }}>
              <div style={{
                borderRadius:'50%', padding: b.isAnchor ? '2px' : '0',
                border: b.isAnchor ? '2px solid var(--text)' : 'none',
                lineHeight: 0, cursor: onBuddyClick ? 'pointer' : undefined
              }}
              onClick={onBuddyClick ? (e) => { e.stopPropagation(); onBuddyClick(b); } : undefined}
              >
                <Avatar src={b.avatar} username={b.username} size={22} />
              </div>
              {expanded && (
                <div style={{display:'flex',flexDirection:'column'}}>
                  <span
                    style={{fontSize:'0.72rem',color: b.isAnchor ? 'var(--text)' : 'var(--text-muted)', fontWeight: b.isAnchor ? 600 : 400, cursor: onBuddyClick ? 'pointer' : undefined, textDecoration: onBuddyClick ? 'underline' : 'none', textDecorationColor: 'var(--border)', textUnderlineOffset: '2px'}}
                    onClick={onBuddyClick ? (e) => { e.stopPropagation(); onBuddyClick(b); } : undefined}
                  >
                    {dn(b)}
                  </span>
                  {liveUpdates && liveUpdates[b.id] && (
                    <span style={{fontSize:'0.62rem',color:'#22c55e',fontFamily:'Univers Condensed, Univers, sans-serif'}}>
                      {formatLiveUpdate(liveUpdates[b.id])}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      );
    }

    // ── Currency helpers ────────────────────────────────────────
    const VENUE_CURRENCY = { 'Irish Poker Open': 'EUR', 'WSOP Europe': 'EUR' };
    function nativeCurrency(venue) { return VENUE_CURRENCY[venue] || 'USD'; }
    const CURRENCY_CONFIG = {
      USD: { symbol: '$', pos: 'pre', label: 'US Dollar' },
      EUR: { symbol: '€', pos: 'pre', label: 'Euro' },
      GBP: { symbol: '£', pos: 'pre', label: 'British Pound' },
      CAD: { symbol: 'C$', pos: 'pre', label: 'Canadian Dollar' },
      AUD: { symbol: 'A$', pos: 'pre', label: 'Australian Dollar' },
      JPY: { symbol: '¥', pos: 'pre', label: 'Japanese Yen' },
      CHF: { symbol: 'CHF', pos: 'pre', label: 'Swiss Franc' },
      SEK: { symbol: 'kr', pos: 'suf', label: 'Swedish Krona' },
      DKK: { symbol: 'kr', pos: 'suf', label: 'Danish Krone' },
      NOK: { symbol: 'kr', pos: 'suf', label: 'Norwegian Krone' },
      CZK: { symbol: 'Kč', pos: 'suf', label: 'Czech Koruna' },
      PLN: { symbol: 'zł', pos: 'suf', label: 'Polish Złoty' },
      HKD: { symbol: 'HK$', pos: 'pre', label: 'Hong Kong Dollar' },
      SGD: { symbol: 'S$', pos: 'pre', label: 'Singapore Dollar' },
      BRL: { symbol: 'R$', pos: 'pre', label: 'Brazilian Real' },
      MXN: { symbol: 'MX$', pos: 'pre', label: 'Mexican Peso' },
      INR: { symbol: '₹', pos: 'pre', label: 'Indian Rupee' },
      CNY: { symbol: '¥', pos: 'pre', label: 'Chinese Yuan' },
    };
    function currencySymbol(venue) { return (CURRENCY_CONFIG[nativeCurrency(venue)] || CURRENCY_CONFIG.USD).symbol; }
    function formatCurrencyAmount(val, currCode) {
      if (!val && val !== 0) return '—';
      const cfg = CURRENCY_CONFIG[currCode] || CURRENCY_CONFIG.USD;
      const num = Math.round(Math.abs(val)).toLocaleString();
      const sign = val < 0 ? '-' : '';
      return cfg.pos === 'suf' ? sign + num + ' ' + cfg.symbol : sign + cfg.symbol + num;
    }
    function convertAmount(amount, fromCurr, toCurr, rates) {
      if (!amount || !rates || fromCurr === toCurr) return amount;
      // rates are relative to USD
      const inUSD = fromCurr === 'USD' ? amount : amount / (rates[fromCurr] || 1);
      return toCurr === 'USD' ? inUSD : inUSD * (rates[toCurr] || 1);
    }

    function formatEventName(name) {
      if (!name) return name;
      // Match " - Flight X", " - Day N", " - Final", " - Round N", " - Quarter-Final", " - Semi-Final"
      var match = name.match(/^(.+?)\s*-\s*(Flight\s+\w+|Day\s+\d+|Final(?:\s+Day)?|Round\s+\d+|Quarter-?Final|Semi-?Final)$/i);
      if (match) {
        return React.createElement(React.Fragment, null,
          match[1].trim(),
          React.createElement('br'),
          React.createElement('span', { style: { fontSize: '0.78em', opacity: 0.7 } }, match[2])
        );
      }
      return name;
    }

    // Measure combined height of sticky elements (filters + stuck date break)
    // READ-ONLY — never mutates scrollTop
    function measureStickyStack(container) {
      const caTop = container.getBoundingClientRect().top;
      let bottom = 0;
      const sticky = container.querySelector('.sticky-filters') || container.querySelector('.schedule-sticky-header') || container.querySelector('.gto-sticky-header');
      if (sticky) bottom = sticky.getBoundingClientRect().bottom - caTop;
      container.querySelectorAll('.schedule-date-break').forEach(db => {
        const dbTop = db.getBoundingClientRect().top - caTop;
        if (dbTop < bottom + 5) {
          const dbBottom = db.getBoundingClientRect().bottom - caTop;
          if (dbBottom > bottom) bottom = dbBottom;
        }
      });
      return bottom;
    }

    // Calculate the exact scrollTop to place el just below all sticky headers.
    // PURE CALCULATION — never mutates scrollTop, so no visual flicker.
    function calcStickyTarget(el, gap) {
      const offset = gap != null ? gap : 2;
      const container = el.closest('.content-area');
      if (!container) return null;
      const caTop = container.getBoundingClientRect().top;

      // Get fixed header height (filters bar)
      let filtersH = 0;
      const sticky = container.querySelector('.sticky-filters') || container.querySelector('.schedule-sticky-header') || container.querySelector('.gto-sticky-header');
      if (sticky) filtersH = sticky.getBoundingClientRect().height;

      // Get the date break height for the group this element belongs to
      let dateBreakH = 0;
      const dateGroup = el.closest('[data-date-group]');
      if (dateGroup) {
        const db = dateGroup.querySelector('.schedule-date-break');
        if (db) dateBreakH = db.getBoundingClientRect().height;
      }

      // Element's absolute position in the scrollable content
      const elAbsTop = el.getBoundingClientRect().top - caTop + container.scrollTop;

      // The sticky stack at the target position = filters + date break (both will be stuck)
      const totalStickyH = filtersH + dateBreakH;

      return elAbsTop - totalStickyH - offset;
    }

    // Scroll expanded card just below sticky headers.
    // Uses pure calculation — no scrollTop mutation during measurement.
    function scrollBelowSticky(el) {
      const container = el.closest('.content-area');
      if (!container) return;
      const target = calcStickyTarget(el, 0);
      if (target == null) return;
      if (Math.abs(container.scrollTop - target) <= 2) return;
      container.scrollTo({ top: target, behavior: 'smooth' });
    }

    // ── Calendar Event Row (collapsible) ──────────────────────

    function CalendarEventRow({ tournament, isInSchedule, onToggle, isPast, showMiniLateReg, focusEventId, readOnly, conditions, onSetCondition, onRemoveCondition, allTournaments, isAnchor, onToggleAnchor, plannedEntries, onSetPlannedEntries, onUpdatePersonalEvent, buddyEvents, buddyLiveUpdates, onBuddySwap, scheduleIds, isAdmin, onAdminEdit }) {
      const [open, setOpen] = useState(false);
      const [showConditionUI, setShowConditionUI] = useState(false);
      const [showRakeBreakdown, setShowRakeBreakdown] = useState(false);
      const [travelNotes, setTravelNotes] = useState(tournament.notes || '');
      const [editing, setEditing] = useState(false);
      const [editFields, setEditFields] = useState({});
      const [saving, setSaving] = useState(false);
      const rowRef = React.useRef(null);

      // Auto-expand and scroll when this event is the focus target
      useEffect(() => {
        if (focusEventId && tournament.id === focusEventId) {
          setOpen(true);
        }
      }, [focusEventId]);

      // Scroll expanded event to just below sticky header
      useEffect(() => {
        if (open && rowRef.current) {
          const el = rowRef.current;
          // Use rAF to wait for DOM expansion, then scroll
          const raf = requestAnimationFrame(() => {
            scrollBelowSticky(el);
          });
          return () => cancelAnimationFrame(raf);
        }
      }, [open]);

      const tzAbbr = getVenueTzAbbr(tournament.venue);
      const timeLabel = (tournament.time || '—') + (tzAbbr ? ' ' + tzAbbr : '');
      const variantColor = getVariantColor(tournament.game_variant);
      const bracelet   = isBraceletEvent(tournament);
      const venueClass = getVenueClass(tournament);
      const venue      = getVenueInfo(tournament.venue);
      const isBounty   = /bounty|mystery millions/i.test(tournament.event_name);
      const isSat      = !!tournament.is_satellite;
      const isRestart  = !!tournament.is_restart;
      const isRingEvent = /^WSOPC/.test(getVenueInfo(tournament.venue).longName) && !!tournament.event_number && !tournament.is_satellite;

      const rowClasses = [
        'cal-event-row',
        open ? 'open' : '',
        isInSchedule ? 'saved' : '',
        isAnchor ? 'anchor' : (conditions && conditions.length > 0 ? 'conditional' : ''),
        venueClass,
        bracelet ? 'bracelet' : '',
        isPast ? 'past' : '',
      ].filter(Boolean).join(' ');

      const stripColor = getVenueBrandColor(venue.abbr);
      const stripTextColor = venue.abbr === 'WSOP' ? 'var(--bg)' : 'rgba(255,255,255,0.85)';

      return (
        <div ref={rowRef} className={rowClasses} style={isInSchedule && isAnchor ? {boxShadow: `inset 0 0 0 1.5px ${stripColor}`} : undefined}>
          <div
            className={`cal-venue-strip venue-strip-${venue.abbr.toLowerCase().replace(/\s+/g, '-')}`}
            style={{ background: stripColor, color: stripTextColor, cursor: 'pointer' }}
            onClick={() => setOpen(o => !o)}
          >{open && venue.longName ? venue.longName : venue.abbr}</div>
          <div className="cal-event-row-content" style={isInSchedule ? {borderColor: conditions && conditions.length > 0 ? (venue.abbr === 'WSOP' ? 'var(--venue-wsop-cond)' : stripColor) : stripColor} : undefined}>
            {/* Collapsed bar — always visible */}
            <div className="cal-event-bar" onClick={() => setOpen(o => !o)}>
              {tournament.venue === 'Personal' ? (
                <div className="cal-bar-row2" style={{display:'flex', alignItems:'center', gap:'8px'}}>
                  <span className="cal-event-name" style={{fontSize:'0.88rem'}}>
                    {tournament.event_name === 'Travel Day' ? '✈️' : '🏖️'} {tournament.event_name}
                  </span>
                  {tournament.notes && (
                    <span style={{fontSize:'0.78rem', color:'var(--text-muted)', fontStyle:'italic', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      — {tournament.notes}
                    </span>
                  )}
                </div>
              ) : (
                <>
                  <div className="cal-bar-row1">
                    <span className="cal-event-time">{timeLabel}</span>
                    <span className="cal-event-buyin">{currencySymbol(tournament.venue)}{Number(tournament.buyin).toLocaleString()}</span>
                  </div>
                  <div className="cal-bar-row2">
                    <span className="cal-event-name">{formatEventName(tournament.event_name)}</span>
                    {isBounty && !isSat && <span className="cal-bounty-icon"><Icon.crosshairs /></span>}
                    {isSat && <span className="cal-bounty-icon"><Icon.satellite /></span>}
                    {isRestart && <span className="cal-bounty-icon"><Icon.restart /></span>}
                    {bracelet && <span className="cal-bracelet-icon"><Icon.bracelet /></span>}
                    {isRingEvent && <span className="cal-ring-icon"><Icon.ring /></span>}
                  </div>
                </>
              )}
            </div>
            {showMiniLateReg && !open && <MiniLateRegBar lateRegEnd={tournament.late_reg_end} date={tournament.date} time={tournament.time} venueAbbr={venue.abbr} venue={tournament.venue} openOnly />}
            <div className={`cal-event-chevron ${open ? 'open' : ''}`} onClick={() => setOpen(o => !o)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>

            {/* Expanded detail panel — animated */}
            <div className={`cal-event-detail-wrap ${open ? 'open' : ''}`} onClick={e => {
              const tag = e.target.tagName;
              if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT') return;
              if (e.target.closest('.badge-clickable') || e.target.closest('.condition-picker') || e.target.closest('.cal-action-row')) return;
              setOpen(false);
            }}>
              <div className="cal-event-detail-inner">
                <div className="cal-event-detail">
                  {tournament.venue === 'Personal' ? (
                    <>
                      {tournament.event_name === 'Travel Day' && !readOnly && onUpdatePersonalEvent ? (
                        <div style={{marginBottom:'12px'}}>
                          <label style={{fontSize:'0.78rem', color:'var(--text-muted)', display:'block', marginBottom:'4px'}}>Travel details</label>
                          <div style={{display:'flex', gap:'6px', alignItems:'center'}}>
                            <input
                              type="text"
                              value={travelNotes}
                              onChange={e => setTravelNotes(e.target.value)}
                              onBlur={() => { if (travelNotes !== (tournament.notes || '')) onUpdatePersonalEvent(tournament.id, travelNotes); }}
                              onKeyDown={e => { if (e.key === 'Enter') { e.target.blur(); }}}
                              placeholder="e.g. 6h flight LAX → LAS"
                              style={{
                                flex:1, padding:'6px 10px', fontSize:'0.83rem',
                                borderRadius:'6px', border:'1px solid var(--border)',
                                background:'var(--surface)', color:'var(--text)',
                                outline:'none'
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <p style={{fontSize:'0.85rem', color:'var(--text-muted)', marginBottom:'12px'}}>
                          {tournament.event_name === 'Travel Day'
                            ? (tournament.notes || 'Travel day — no tournaments planned')
                            : 'Day off — rest and recover'}
                        </p>
                      )}
                      {!readOnly && (
                        <div className="cal-action-row">
                          <button className="cal-action-btn remove" onClick={() => onToggle(tournament.id)}>
                            <span className="cal-action-icon">✕</span>
                            <span className="cal-action-label">Remove</span>
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                  <>
                  <div className="cal-detail-badges">
                    <div className="cal-badges-left">
                      {tournament.event_number && (
                        <span className="badge badge-event" style={{background: stripColor, color: stripTextColor}}>#{tournament.event_number.replace(/^[A-Za-z]+-/, '')}</span>
                      )}
                      {tournament.game_variant && getGamePills(tournament.game_variant, tournament.event_name).map((g, i) => (
                        <span key={i} className="badge badge-variant">{g}</span>
                      ))}
                    </div>
                    <div className="cal-badges-right">
                      {tournament.rake_pct != null && tournament.rake_pct > 0 && (
                        <span
                          className={`badge badge-rake badge-clickable ${tournament.rake_pct <= 8 ? 'rake-low' : tournament.rake_pct <= 13 ? 'rake-mid' : 'rake-high'}`}
                          style={{cursor:'pointer'}}
                          onClick={e => { e.stopPropagation(); setShowRakeBreakdown(v => !v); }}
                        >
                          {tournament.rake_pct}% rake {showRakeBreakdown ? '▾' : '▸'}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="cal-detail-grid">
                    {tournament.starting_chips && (
                      <div className="cal-detail-item">
                        <span className="cal-detail-label">Starting Chips</span>
                        <span className="cal-detail-value">{Number(tournament.starting_chips).toLocaleString()}</span>
                      </div>
                    )}
                    {tournament.level_duration && (
                      <div className="cal-detail-item">
                        <span className="cal-detail-label">Levels</span>
                        <span className="cal-detail-value">{tournament.level_duration} min</span>
                      </div>
                    )}
                    {tournament.reentry && (
                      <div className="cal-detail-item">
                        <span className="cal-detail-label">Re-entry</span>
                        <span className="cal-detail-value">{tournament.reentry === 'N/A' ? 'Freezeout' : tournament.reentry}</span>
                      </div>
                    )}
                    {tournament.late_reg && (
                      <div className="cal-detail-item">
                        <span className="cal-detail-label">Late Reg</span>
                        <span className="cal-detail-value">{tournament.late_reg}</span>
                      </div>
                    )}
                    {showRakeBreakdown && tournament.prize_pool > 0 && (
                      <div className="cal-detail-item">
                        <span className="cal-detail-label">Prize Pool</span>
                        <span className="cal-detail-value">{currencySymbol(tournament.venue)}{Number(tournament.prize_pool).toLocaleString()}</span>
                      </div>
                    )}
                    {showRakeBreakdown && tournament.house_fee > 0 && (
                      <div className="cal-detail-item">
                        <span className="cal-detail-label">House Fee</span>
                        <span className="cal-detail-value">{currencySymbol(tournament.venue)}{Number(tournament.house_fee).toLocaleString()}</span>
                      </div>
                    )}
                    {showRakeBreakdown && tournament.opt_add_on > 0 && (
                      <div className="cal-detail-item">
                        <span className="cal-detail-label">Staff Fee</span>
                        <span className="cal-detail-value">{currencySymbol(tournament.venue)}{Number(tournament.opt_add_on).toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  {conditions && conditions.length > 0 && (
                    <div style={{display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'10px'}}>
                      {conditions.map((c, ci) => (
                        <span key={ci} className="badge badge-condition">
                          {formatConditionBadge(c, allTournaments)}
                        </span>
                      ))}
                    </div>
                  )}

                  {tournament.notes && (
                    <p style={{fontSize:'0.78rem', color:'var(--text-muted)', fontStyle:'italic', marginBottom:'10px'}}>
                      {tournament.notes}
                    </p>
                  )}

                  <LateRegBar lateRegEnd={tournament.late_reg_end} date={tournament.date} time={tournament.time} venueAbbr={venue.abbr} venue={tournament.venue} />

                  {buddyEvents && buddyEvents[tournament.id] && buddyEvents[tournament.id].length > 0 && (
                    <BuddyAvatarRow buddies={buddyEvents[tournament.id]} liveUpdates={buddyLiveUpdates}
                      onBuddyClick={isInSchedule && onBuddySwap ? (buddy) => onBuddySwap(buddy, tournament) : undefined} />
                  )}

                  {venue.abbr === 'WSOP' && (
                    <a
                      href="https://wsop.gg-global-cdn.com/wsop/9597cb0c-1322-4d57-831c-8160a0e6abd4.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cal-structure-link"
                    >
                      View Structure Sheet ↗
                    </a>
                  )}

                  {isAdmin && editing && (() => {
                    const f = { ...tournament, ...editFields };
                    const field = (label, key, type) => (
                      <div className="cal-detail-item" key={key}>
                        <span className="cal-detail-label">{label}</span>
                        {type === 'select-category' ? (
                          <select value={f[key] || ''} onChange={e => setEditFields(p => ({...p, [key]: e.target.value}))}
                            style={{fontSize:'0.83rem', padding:'4px 8px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)'}}>
                            <option value="primary">Primary</option>
                            <option value="side">Side</option>
                          </select>
                        ) : (
                          <input type={type || 'text'} value={f[key] ?? ''} onChange={e => setEditFields(p => ({...p, [key]: e.target.value}))}
                            style={{width:'100%', fontSize:'0.83rem', padding:'4px 8px', borderRadius:'6px', border:'1px solid var(--border)', background:'var(--surface)', color:'var(--text)', outline:'none'}} />
                        )}
                      </div>
                    );
                    return (
                      <div className="admin-edit-panel" onClick={e => e.stopPropagation()} style={{marginBottom:'10px', padding:'10px', borderRadius:'8px', background:'var(--surface)', border:'1px solid var(--border)'}}>
                        <div style={{fontSize:'0.75rem', fontWeight:700, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'8px'}}>Admin Edit</div>
                        <div className="cal-detail-grid" style={{gap:'8px'}}>
                          {field('Event Name', 'event_name')}
                          {field('Event #', 'event_number')}
                          {field('Buy-in', 'buyin', 'number')}
                          {field('Game Variant', 'game_variant')}
                          {field('Date', 'date', 'date')}
                          {field('Time', 'time')}
                          {field('Starting Chips', 'starting_chips', 'number')}
                          {field('Level Duration', 'level_duration')}
                          {field('Re-entry', 'reentry')}
                          {field('Late Reg', 'late_reg')}
                          {field('Venue', 'venue')}
                          {field('Category', 'category', 'select-category')}
                          {field('Notes', 'notes')}
                        </div>
                        <div style={{display:'flex', gap:'8px', marginTop:'10px'}}>
                          <button disabled={saving} onClick={async () => {
                            if (Object.keys(editFields).length === 0) { setEditing(false); return; }
                            setSaving(true);
                            try {
                              await onAdminEdit(tournament.id, editFields);
                              setEditing(false);
                              setEditFields({});
                            } catch(e) { alert('Save failed: ' + e.message); }
                            setSaving(false);
                          }} style={{flex:1, padding:'8px', borderRadius:'6px', border:'none', background:'var(--accent)', color:'#fff', fontWeight:600, fontSize:'0.83rem', cursor:'pointer', opacity: saving ? 0.6 : 1}}>
                            {saving ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => { setEditing(false); setEditFields({}); }} style={{padding:'8px 16px', borderRadius:'6px', border:'1px solid var(--border)', background:'transparent', color:'var(--text)', fontSize:'0.83rem', cursor:'pointer'}}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {!readOnly && (
                  <div className="cal-action-row">
                    <button
                      className={`cal-action-btn ${isInSchedule ? 'remove' : ''}`}
                      onClick={() => onToggle(tournament.id)}
                    >
                      <span className="cal-action-icon">{isInSchedule ? '✕' : '+'}</span>
                      <span className="cal-action-label">{isInSchedule ? 'Remove' : 'Add'}</span>
                    </button>
                    {isInSchedule && onToggleAnchor && (
                      <button
                        className={`cal-action-btn anchor-btn ${isAnchor ? 'locked' : ''}`}
                        onClick={() => onToggleAnchor(tournament.id, !isAnchor)}
                      >
                        <span className="cal-action-icon">🔒</span>
                        <span className="cal-action-label">Priority</span>
                      </button>
                    )}
                    {isAdmin && onAdminEdit && !editing && (
                      <button
                        className="cal-action-btn"
                        onClick={() => setEditing(true)}
                      >
                        <span className="cal-action-icon">✎</span>
                        <span className="cal-action-label">Edit</span>
                      </button>
                    )}
                    {isInSchedule && onSetCondition && (
                      <button
                        className="cal-action-btn condition-btn"
                        onClick={() => setShowConditionUI(prev => !prev)}
                      >
                        <span className="cal-action-icon"><Icon.condition /></span>
                        <span className="cal-action-label">Condition</span>
                      </button>
                    )}
                    {isInSchedule && onSetPlannedEntries && tournament.reentry && tournament.reentry !== 'N/A' && (() => {
                      const maxE = getMaxEntries(tournament.reentry);
                      const cur = plannedEntries || 1;
                      return (
                      <div className="cal-entries-counter" onClick={e => e.stopPropagation()}>
                        <div className="cal-entries-stepper">
                          <div className="cal-entries-display">
                            <span className={`minus ${cur <= 1 ? 'disabled' : ''}`}>−</span>
                            <span className="value">{cur}</span>
                            <span className={`plus ${cur >= maxE ? 'disabled' : ''}`}>+</span>
                          </div>
                          <div className="cal-entries-overlay">
                            <button
                              onClick={() => onSetPlannedEntries(tournament.id, Math.max(1, cur - 1))}
                              disabled={cur <= 1}
                              aria-label="Decrease entries"
                            />
                            <button
                              onClick={() => onSetPlannedEntries(tournament.id, Math.min(maxE, cur + 1))}
                              disabled={cur >= maxE}
                              aria-label="Increase entries"
                            />
                          </div>
                        </div>
                        <span className="cal-action-label">Max Entries</span>
                      </div>
                      );
                    })()}
                  </div>
                  )}
                  {showConditionUI && isInSchedule && onSetCondition && (
                    <ConditionPicker
                      tournament={tournament}
                      conditions={conditions || []}
                      allTournaments={allTournaments || []}
                      onSet={(conditionsArr, pub) => { onSetCondition(tournament.id, conditionsArr, pub); setShowConditionUI(false); }}
                      onRemove={() => { onRemoveCondition(tournament.id); setShowConditionUI(false); }}
                      onClose={() => setShowConditionUI(false)}
                      scheduleIds={scheduleIds}
                      onToggle={onToggle}
                    />
                  )}
                  </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ── Tournament Card ────────────────────────────────────────

    function TournamentCard({ tournament, isInSchedule, onToggle, showCountdown, hasConflict, isPast }) {
      const countdown = showCountdown ? calculateCountdown(tournament.date, tournament.time, tournament.venue) : null;
      const bracelet   = isBraceletEvent(tournament);
      const venueClass = getVenueClass(tournament);
      const venue      = getVenueInfo(tournament.venue);
      const isRingEvent = /^WSOPC/.test(getVenueInfo(tournament.venue).longName) && !!tournament.event_number && !tournament.is_satellite;
      const stripColor = getVenueBrandColor(venue.abbr);
      const stripTextColor = venue.abbr === 'WSOP' ? 'var(--bg)' : 'rgba(255,255,255,0.85)';

      const cardClasses = [
        't-card',
        isInSchedule ? 'saved' : '',
        venueClass,
        bracelet ? 'bracelet' : '',
        isPast ? 'past' : '',
      ].filter(Boolean).join(' ');

      return (
        <div className={cardClasses}>
          <div className="t-card-main">
            <div className="t-card-top">
              <div className="t-card-badges">
                {tournament.event_number && (
                  <span className="badge badge-event" style={{background: stripColor, color: stripTextColor}}>#{tournament.event_number.replace(/^[A-Za-z]+-/, '')}</span>
                )}
                {tournament.game_variant && getGamePills(tournament.game_variant, tournament.event_name).map((g, i) => (
                  <span key={i} className="badge badge-variant">{g}</span>
                ))}
                {isRingEvent && <span className="cal-ring-icon" style={{marginLeft:'2px'}}><Icon.ring /></span>}
                {bracelet && <span className="cal-bracelet-icon" style={{position:'static',margin:'0 0 0 2px'}}><Icon.bracelet /></span>}
              </div>
              <span className="t-buyin">{formatBuyin(tournament.buyin)}</span>
            </div>

            <div className="t-name">{formatEventName(tournament.event_name)}</div>

            <div className="t-meta">
              <div className="t-meta-item">
                <span className="t-meta-label">Date</span>
                <span className="t-meta-value">{tournament.date}</span>
              </div>
              <div className="t-meta-item">
                <span className="t-meta-label">Time</span>
                <span className="t-meta-value">{(tournament.time || '—') + (tournament.venue ? ' ' + getVenueTzAbbr(tournament.venue) : '')}</span>
              </div>
              {tournament.starting_chips && (
                <div className="t-meta-item">
                  <span className="t-meta-label">Starting Chips</span>
                  <span className="t-meta-value">{Number(tournament.starting_chips).toLocaleString()}</span>
                </div>
              )}
              {tournament.level_duration && (
                <div className="t-meta-item">
                  <span className="t-meta-label">Levels</span>
                  <span className="t-meta-value">{tournament.level_duration} min</span>
                </div>
              )}
              {tournament.reentry && (
                <div className="t-meta-item">
                  <span className="t-meta-label">Re-entry</span>
                  <span className="t-meta-value">{tournament.reentry === 'N/A' ? 'Freezeout' : tournament.reentry}</span>
                </div>
              )}
              {tournament.late_reg && (
                <div className="t-meta-item">
                  <span className="t-meta-label">Late Reg</span>
                  <span className="t-meta-value">{tournament.late_reg}</span>
                </div>
              )}
              {tournament.notes && (
                <div className="t-meta-item t-notes" style={{gridColumn:'span 2'}}>
                  {tournament.notes}
                </div>
              )}
            </div>

            {countdown && (
              <div className="countdown-pill">
                <Icon.clock /> Starts in {countdown}
              </div>
            )}

            {hasConflict && (
              <div className="conflict-badge">
                <Icon.warn /> Schedule conflict
              </div>
            )}

            <LateRegBar lateRegEnd={tournament.late_reg_end} date={tournament.date} time={tournament.time} venueAbbr={venue.abbr} venue={tournament.venue} />
          </div>

          <div className="t-card-footer">
            <button
              className={`t-action-btn ${isInSchedule ? 'remove' : ''}`}
              onClick={() => onToggle(tournament.id)}
            >
              {isInSchedule ? '✕ Remove from My Schedule' : '+ Add to My Schedule'}
            </button>
          </div>
        </div>
      );
    }

    // ── Game Variant Filter (grouped checkboxes) ───────────────

    const GAME_GROUPS = [
      { label: 'NLH', variants: ['NLH'] },
      { label: 'PLO', variants: ['PLO'] },
      { label: 'Omaha', variants: ['O8', 'PLO8', 'Big O'] },
      { label: 'Stud', variants: ['7-Card Stud', 'Razz', 'Stud 8'] },
      { label: 'Draw', variants: ['2-7 Triple Draw', 'Mixed Triple Draw', 'NL 2-7 Single Draw', 'Badugi'] },
      { label: 'Mixed', variants: ['8-Game Mix', '9-Game Mix', 'HORSE', 'TORSE', 'Mixed', "Dealer's Choice", 'Limit Hold\'em'] },
    ];

    function GameVariantFilter({ selectedGames, setFilters }) {
      const [expandedGroups, setExpandedGroups] = useState({});
      const allVariants = GAME_GROUPS.flatMap(g => g.variants);
      const allSelected = selectedGames.length === 0;

      const toggleGroup = (group, checked) => {
        setFilters(f => {
          const without = f.selectedGames.filter(v => !group.variants.includes(v));
          return { ...f, selectedGames: checked ? [...without, ...group.variants] : without };
        });
      };

      const toggleVariant = (v, checked) => {
        setFilters(f => ({
          ...f,
          selectedGames: checked
            ? [...f.selectedGames, v]
            : f.selectedGames.filter(g => g !== v)
        }));
      };

      const isGroupFullySelected = (group) => group.variants.every(v => selectedGames.includes(v));
      const isGroupPartial = (group) => group.variants.some(v => selectedGames.includes(v)) && !isGroupFullySelected(group);

      const chipStyle = {cursor:'pointer',display:'flex',alignItems:'center',gap:'5px',fontSize:'0.78rem'};
      const subChipStyle = {...chipStyle, fontSize:'0.72rem', marginLeft:'4px'};

      return (
        <div className="filter-group" style={{gridColumn:'1 / -1'}}>
          <label>Game</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:'6px',alignItems:'flex-start'}}>
            <label className={`filter-chip ${allSelected ? 'active' : ''}`} style={chipStyle}>
              <input type="checkbox" checked={allSelected}
                onChange={() => setFilters(f => ({...f, selectedGames: []}))}
                style={{margin:0}}
              />All
            </label>
            {GAME_GROUPS.map(group => {
              const isSingle = group.variants.length === 1;
              const groupChecked = isGroupFullySelected(group);
              const groupPartial = isGroupPartial(group);
              const expanded = expandedGroups[group.label];

              if (isSingle) {
                const v = group.variants[0];
                return (
                  <label key={group.label} className={`filter-chip ${selectedGames.includes(v) ? 'active' : ''}`} style={chipStyle}>
                    <input type="checkbox" checked={selectedGames.includes(v)}
                      onChange={e => toggleVariant(v, e.target.checked)}
                      style={{margin:0}}
                    />{group.label}
                  </label>
                );
              }

              return (
                <div key={group.label} style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                  <label className={`filter-chip ${groupChecked ? 'active' : groupPartial ? 'active' : ''}`} style={chipStyle}
                    onClick={e => {
                      if (e.target.tagName === 'INPUT') return;
                      e.preventDefault();
                      setExpandedGroups(g => ({...g, [group.label]: !g[group.label]}));
                    }}
                  >
                    <input type="checkbox" checked={groupChecked}
                      ref={el => { if (el) el.indeterminate = groupPartial; }}
                      onChange={e => toggleGroup(group, e.target.checked)}
                      style={{margin:0}}
                    />{group.label}
                    <span style={{fontSize:'0.6rem',marginLeft:'2px',color:'var(--text-muted)'}}>{expanded ? '▲' : '▼'}</span>
                  </label>
                  {expanded && (
                    <div style={{display:'flex',flexDirection:'column',gap:'3px'}}>
                      {group.variants.map(v => (
                        <label key={v} className={`filter-chip ${selectedGames.includes(v) ? 'active' : ''}`} style={subChipStyle}>
                          <input type="checkbox" checked={selectedGames.includes(v)}
                            onChange={e => toggleVariant(v, e.target.checked)}
                            style={{margin:0}}
                          />{v}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    // ── Filters ────────────────────────────────────────────────

    function Filters({ filters, setFilters, gameVariants, venues, buyinOptions, tournaments, open, setOpen, toggleRef, eventCount, onImport }) {
      const panelRef = useRef(null);
      const [whereOpen, setWhereOpen] = useState(false);
      const [howMuchOpen, setHowMuchOpen] = useState(false);
      const [whichOpen, setWhichOpen] = useState(false);
      const [specialOpen, setSpecialOpen] = useState(false);
      const [distanceOpen, setDistanceOpen] = useState(false);
      const dateBounds = useMemo(() => {
        const today = getToday();
        let earliest = null, latestDay1 = null;
        for (const t of (tournaments || [])) {
          const d = normaliseDate(t.date);
          if (!d) continue;
          if (!earliest || d < earliest) earliest = d;
          if (!t.is_restart && (!latestDay1 || d > latestDay1)) latestDay1 = d;
        }
        const minDate = (!earliest || earliest < today) ? today : earliest;
        const maxDate = latestDay1 || today;
        const totalDays = daysBetween(minDate, maxDate);
        return { minDate, maxDate, totalDays };
      }, [tournaments]);

      const availableVenues = useMemo(() => {
        const today = getToday();
        const countMap = {};
        (tournaments || []).forEach(t => {
          const d = normaliseDate(t.date);
          if (d < today) return; // hide venues whose events have all passed
          if (filters.dateFrom && d < filters.dateFrom) return;
          if (filters.dateTo && d > filters.dateTo) return;
          countMap[t.venue] = (countMap[t.venue] || 0) + 1;
        });
        return Object.keys(countMap)
          .sort((a, b) => countMap[b] - countMap[a])
          .map(v => ({ venue: v, series: VENUE_TO_SERIES[v] || v, count: countMap[v] }));
      }, [tournaments, filters.dateFrom, filters.dateTo]);

      const availableGameVariants = useMemo(() => {
        const variantSet = new Set();
        (tournaments || []).forEach(t => {
          const d = normaliseDate(t.date);
          if (filters.dateFrom && d < filters.dateFrom) return;
          if (filters.dateTo && d > filters.dateTo) return;
          if (t.game_variant) variantSet.add(t.game_variant);
        });
        return variantSet;
      }, [tournaments, filters.dateFrom, filters.dateTo]);

      useEffect(() => {
        if (!open) return;
        const handler = (e) => {
          if (panelRef.current && panelRef.current.contains(e.target)) return;
          if (toggleRef.current && toggleRef.current.contains(e.target)) return;
          setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
      }, [open]);

      const hasActive = filters.minBuyin || filters.maxBuyin || (filters.buyinRanges && filters.buyinRanges.length > 0) || (filters.rakeRanges && filters.rakeRanges.length > 0) ||
        filters.selectedGames.length > 0 || (filters.hiddenVenues && filters.hiddenVenues.length > 0) || filters.bountyOnly || filters.mysteryBountyOnly || filters.headsUpOnly || filters.tagTeamOnly || filters.employeesOnly || !filters.hideSatellites || !filters.hideRestarts || !filters.hideSideEvents || filters.ladiesOnly || filters.seniorsOnly || filters.mixedOnly || filters.dateFrom || filters.dateTo || filters.maxDistance;

      return (
        <>
          <div className="filter-row" style={{gap:'8px',marginBottom:'0',width:'100%',alignItems:'center'}}>
            {onImport && <button
              onClick={onImport}
              style={{background:'none',border:'1px solid var(--border)',borderRadius:'6px',padding:'3px 8px',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'0.72rem',color:'var(--accent)',fontWeight:600,whiteSpace:'nowrap'}}
              title="Import a tournament schedule"
            >
              <Icon.upload style={{width:12,height:12}} /> Import Schedule
            </button>}
            <span style={{marginLeft:'auto',fontSize:'0.7rem',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Show:</span>
            <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'4px',fontSize:'0.78rem',color:'var(--text)',whiteSpace:'nowrap'}}>
              <input type="checkbox" checked={!filters.hideSatellites}
                onChange={e => setFilters(f => ({...f, hideSatellites:!e.target.checked}))}
                style={{margin:0}}
              /> Satellites
            </label>
            <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'4px',fontSize:'0.78rem',color:'var(--text)',whiteSpace:'nowrap'}}>
              <input type="checkbox" checked={!filters.hideRestarts}
                onChange={e => setFilters(f => ({...f, hideRestarts:!e.target.checked}))}
                style={{margin:0}}
              /> Restarts
            </label>
            <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'4px',fontSize:'0.78rem',color:'var(--text)',whiteSpace:'nowrap'}}>
              <input type="checkbox" checked={!filters.hideSideEvents}
                onChange={e => setFilters(f => ({...f, hideSideEvents:!e.target.checked}))}
                style={{margin:0}}
              /> Side Events
            </label>
            {filters.selectedGames.length > 0 && (
              <span className="filter-chip active">
                {filters.selectedGames.length === 1 ? filters.selectedGames[0] : `${filters.selectedGames.length} games`}
                <span
                  style={{marginLeft:'4px',cursor:'pointer'}}
                  onClick={() => setFilters(f => ({...f, selectedGames:[]}))}
                >✕</span>
              </span>
            )}
            {filters.buyinRanges && filters.buyinRanges.length > 0 && (
              <span className="filter-chip active">
                {filters.buyinRanges.length === 1 ? ({'0-500':'< $500','500-1500':'$500–$1.5K','1500-5000':'$1.5K–$5K','5000-10000':'$5K–$10K','10000+':'$10K+'})[filters.buyinRanges[0]] : `${filters.buyinRanges.length} buy-ins`}
                <span
                  style={{marginLeft:'4px',cursor:'pointer'}}
                  onClick={() => setFilters(f => ({...f, buyinRanges:[]}))}
                >✕</span>
              </span>
            )}
            {filters.rakeRanges && filters.rakeRanges.length > 0 && (
              <span className="filter-chip active">
                {filters.rakeRanges.length === 1 ? ({'0-5':'< 5%','5-8':'5–8%','8-10':'8–10%','10-13':'10–13%','13+':'13%+'})[filters.rakeRanges[0]] : `${filters.rakeRanges.length} rake ranges`}
                <span
                  style={{marginLeft:'4px',cursor:'pointer'}}
                  onClick={() => setFilters(f => ({...f, rakeRanges:[]}))}
                >✕</span>
              </span>
            )}
            {filters.bountyOnly && (
              <span className="filter-chip active">
                Bounty
                <span
                  style={{marginLeft:'4px',cursor:'pointer'}}
                  onClick={() => setFilters(f => ({...f, bountyOnly:false}))}
                >✕</span>
              </span>
            )}
            {filters.mysteryBountyOnly && (
              <span className="filter-chip active">
                Mystery Bounty
                <span
                  style={{marginLeft:'4px',cursor:'pointer'}}
                  onClick={() => setFilters(f => ({...f, mysteryBountyOnly:false}))}
                >✕</span>
              </span>
            )}
            {filters.headsUpOnly && (
              <span className="filter-chip active">
                Heads Up
                <span
                  style={{marginLeft:'4px',cursor:'pointer'}}
                  onClick={() => setFilters(f => ({...f, headsUpOnly:false}))}
                >✕</span>
              </span>
            )}
            {filters.tagTeamOnly && (
              <span className="filter-chip active">
                Tag Team
                <span
                  style={{marginLeft:'4px',cursor:'pointer'}}
                  onClick={() => setFilters(f => ({...f, tagTeamOnly:false}))}
                >✕</span>
              </span>
            )}
            {filters.employeesOnly && (
              <span className="filter-chip active">
                Employees
                <span
                  style={{marginLeft:'4px',cursor:'pointer'}}
                  onClick={() => setFilters(f => ({...f, employeesOnly:false}))}
                >✕</span>
              </span>
            )}
            {filters.hiddenVenues && filters.hiddenVenues.length > 0 && (
              <span className="filter-chip active">
                {availableVenues.length - filters.hiddenVenues.filter(v => availableVenues.some(av => av.venue === v)).length} of {availableVenues.length} venues
                <span
                  style={{marginLeft:'4px',cursor:'pointer'}}
                  onClick={() => setFilters(f => ({...f, hiddenVenues:[]}))}
                >✕</span>
              </span>
            )}
            {filters.ladiesOnly && (
              <span className="filter-chip active">
                Ladies Only
                <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, ladiesOnly:false}))}>✕</span>
              </span>
            )}
            {filters.seniorsOnly && (
              <span className="filter-chip active">
                Seniors Only
                <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, seniorsOnly:false}))}>✕</span>
              </span>
            )}
            {filters.mixedOnly && (
              <span className="filter-chip active">
                Mixed
                <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, mixedOnly:false}))}>✕</span>
              </span>
            )}
            {(filters.dateFrom || filters.dateTo) && (
              <span className="filter-chip active">
                {filters.dateFrom && filters.dateTo ? `${fmtShortDate(filters.dateFrom)} — ${fmtShortDate(filters.dateTo)}` : filters.dateFrom ? `From ${fmtShortDate(filters.dateFrom)}` : `Until ${fmtShortDate(filters.dateTo)}`}
                <span style={{marginLeft:'4px',cursor:'pointer'}} onClick={() => setFilters(f => ({...f, dateFrom:'', dateTo:''}))}>✕</span>
              </span>
            )}
            {/* Distance chip hidden for now */}
          </div>

          {open && ReactDOM.createPortal(
            <div className="dropdown-backdrop" onClick={() => setOpen(false)} />,
            document.body
          )}
          {open && ReactDOM.createPortal(
            <div ref={panelRef} className="filter-panel" style={(() => {
              const r = toggleRef.current?.getBoundingClientRect();
              if (!r) return { top: 60, left: 8, right: 8 };
              const vw = window.innerWidth || document.documentElement.clientWidth || 375;
              const vh = window.innerHeight || document.documentElement.clientHeight || 700;
              return { top: r.bottom + 10, left: 8, right: 8, maxHeight: vh - r.bottom - 22 };
            })()}>
              {(() => {
                const quickFilters = [
                  { label: 'NLH', isActive: filters.selectedGames.includes('NLH'),
                    toggle: () => setFilters(f => ({ ...f, selectedGames: f.selectedGames.includes('NLH') ? f.selectedGames.filter(g => g !== 'NLH') : [...f.selectedGames, 'NLH'] })) },
                  { label: 'PLO', isActive: filters.selectedGames.includes('PLO'),
                    toggle: () => setFilters(f => ({ ...f, selectedGames: f.selectedGames.includes('PLO') ? f.selectedGames.filter(g => g !== 'PLO') : [...f.selectedGames, 'PLO'] })) },
                  { label: 'Mixed', isActive: !!filters.mixedOnly,
                    toggle: () => setFilters(f => ({ ...f, mixedOnly: !f.mixedOnly })) },
                  { label: 'Ladies', isActive: !!filters.ladiesOnly,
                    toggle: () => setFilters(f => ({ ...f, ladiesOnly: !f.ladiesOnly })) },
                  { label: 'Seniors', isActive: !!filters.seniorsOnly,
                    toggle: () => setFilters(f => ({ ...f, seniorsOnly: !f.seniorsOnly })) },
                ];
                return (
                  <div style={{display:'flex',gap:'6px',marginBottom:'10px',gridColumn:'1 / -1'}}>
                    {quickFilters.map(qf => (
                      <button key={qf.label} className={`filter-chip ${qf.isActive ? 'active' : ''}`}
                        style={{flex:'1 1 0',minWidth:0,justifyContent:'center',textAlign:'center'}}
                        onClick={qf.toggle}
                      >{qf.label}</button>
                    ))}
                  </div>
                );
              })()}
              {dateBounds.totalDays > 0 && (() => {
                const { minDate, maxDate, totalDays } = dateBounds;
                const fromIdx = filters.dateFrom ? Math.max(0, daysBetween(minDate, filters.dateFrom)) : 0;
                const toIdx = filters.dateTo ? Math.min(totalDays, daysBetween(minDate, filters.dateTo)) : totalDays;
                const fromDate = addDays(minDate, fromIdx);
                const toDate = addDays(minDate, toIdx);
                const pctL = (fromIdx / totalDays) * 100;
                const pctR = (toIdx / totalDays) * 100;
                return (
                  <div className="filter-group filter-span2" style={{marginBottom:'6px'}}>
                    <label style={{fontSize:'0.75rem',color:'var(--text-muted)',marginBottom:'6px',display:'block',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>Date Range</label>
                    <div style={{padding:'0 6px'}}>
                      <div className="date-slider-wrap">
                        <div className="date-slider-track" />
                        <div className="date-slider-fill" style={{left: pctL + '%', right: (100 - pctR) + '%'}} />
                        <input type="range" className="date-slider-input" min={0} max={totalDays} value={fromIdx}
                          onChange={e => {
                            const v = Math.min(Number(e.target.value), toIdx);
                            setFilters(f => ({...f, dateFrom: v <= 0 ? '' : addDays(minDate, v)}));
                          }}
                        />
                        <input type="range" className="date-slider-input" min={0} max={totalDays} value={toIdx}
                          onChange={e => {
                            const v = Math.max(Number(e.target.value), fromIdx);
                            setFilters(f => ({...f, dateTo: v >= totalDays ? '' : addDays(minDate, v)}));
                          }}
                        />
                      </div>
                      <div className="date-slider-labels">
                        <span>{fmtShortDate(fromDate)}</span>
                        <span>{fmtShortDate(toDate)}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
              <div className="filter-group filter-span2">
                <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}} onClick={() => setWhereOpen(w => !w)}>
                  Series
                  <span style={{fontSize:'0.7rem',transition:'transform 0.15s',transform: whereOpen ? 'rotate(180deg)' : 'rotate(0deg)'}}>▼</span>
                </label>
                {whereOpen && (<div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                  <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:600,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                    <input type="checkbox"
                      checked={!filters.hiddenVenues || filters.hiddenVenues.length === 0}
                      ref={el => { if (el) el.indeterminate = filters.hiddenVenues && filters.hiddenVenues.length > 0 && filters.hiddenVenues.length < availableVenues.length; }}
                      onChange={e => setFilters(f => ({...f, hiddenVenues: e.target.checked ? [] : availableVenues.map(v => v.venue)}))}
                      style={{marginTop:'1px'}}
                    /> All
                  </label>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 12px'}}>
                    {availableVenues.map(({ venue, series, count }) => {
                      const hidden = (filters.hiddenVenues || []).includes(venue);
                      return (
                        <label key={venue} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                          <input type="checkbox" checked={!hidden}
                            onChange={e => setFilters(f => {
                              const hv = f.hiddenVenues || [];
                              return {...f, hiddenVenues: e.target.checked ? hv.filter(v => v !== venue) : [...hv, venue]};
                            })}
                            style={{marginTop:'1px',flexShrink:0}}
                          />
                          <span style={{lineHeight:1.3}}>{series}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>)}
              </div>
              {/* Distance filter — hidden for now */}
              <div className="filter-group filter-span2">
                <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}} onClick={() => setHowMuchOpen(h => !h)}>
                  Buy-in / Rake
                  <span style={{fontSize:'0.7rem',transition:'transform 0.15s',transform: howMuchOpen ? 'rotate(180deg)' : 'rotate(0deg)'}}>{'\u25BC'}</span>
                </label>
                {howMuchOpen && (() => {
                  const buyinOpts = [
                    { key: '0-500', label: 'Under $500' },
                    { key: '500-1500', label: '$500 – $1.5K' },
                    { key: '1500-5000', label: '$1.5K – $5K' },
                    { key: '5000-10000', label: '$5K – $10K' },
                    { key: '10000+', label: '$10K+' },
                  ];
                  const rakeOpts = [
                    { key: '0-5', label: 'Under 5%' },
                    { key: '5-8', label: '5% – 8%' },
                    { key: '8-10', label: '8% – 10%' },
                    { key: '10-13', label: '10% – 13%' },
                    { key: '13+', label: '13%+' },
                  ];
                  const toggleArr = (arr, key) => arr.includes(key) ? arr.filter(k => k !== key) : [...arr, key];
                  const allBuyinKeys = buyinOpts.map(o => o.key);
                  const allRakeKeys = rakeOpts.map(o => o.key);
                  const allBuyinChecked = (filters.buyinRanges || []).length === 0;
                  const allRakeChecked = (filters.rakeRanges || []).length === 0;
                  return (<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0 12px'}}>
                    <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                      <label style={{fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'2px'}}>Buy-in</label>
                      <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.82rem',fontWeight:600,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                        <input type="checkbox" checked={allBuyinChecked}
                          onChange={() => setFilters(f => ({...f, buyinRanges: [], minBuyin: '', maxBuyin: ''}))}
                          style={{marginTop:'1px',flexShrink:0}}
                        />
                        <span>All</span>
                      </label>
                      {buyinOpts.map(opt => (
                        <label key={opt.key} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                          <input type="checkbox" checked={(filters.buyinRanges || []).includes(opt.key)}
                            onChange={() => setFilters(f => ({...f, buyinRanges: toggleArr(f.buyinRanges || [], opt.key), minBuyin: '', maxBuyin: ''}))}
                            style={{marginTop:'1px',flexShrink:0}}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                      <label style={{fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'2px'}}>Rake</label>
                      <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.82rem',fontWeight:600,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                        <input type="checkbox" checked={allRakeChecked}
                          onChange={() => setFilters(f => ({...f, rakeRanges: []}))}
                          style={{marginTop:'1px',flexShrink:0}}
                        />
                        <span>All</span>
                      </label>
                      {rakeOpts.map(opt => (
                        <label key={opt.key} style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                          <input type="checkbox" checked={(filters.rakeRanges || []).includes(opt.key)}
                            onChange={() => setFilters(f => ({...f, rakeRanges: toggleArr(f.rakeRanges || [], opt.key)}))}
                            style={{marginTop:'1px',flexShrink:0}}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>);
                })()}
              </div>
              <div className="filter-group filter-span2">
                <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}} onClick={() => setWhichOpen(w => !w)}>
                  Variant
                  <span style={{fontSize:'0.7rem',transition:'transform 0.15s',transform: whichOpen ? 'rotate(180deg)' : 'rotate(0deg)'}}>▼</span>
                </label>
                {whichOpen && (() => {
                  const allSelected = filters.selectedGames.length === 0;
                  const toggleGroup = (group, checked) => {
                    setFilters(f => {
                      const without = f.selectedGames.filter(v => !group.variants.includes(v));
                      return {...f, selectedGames: checked ? [...without, ...group.variants] : without};
                    });
                  };
                  const toggleVariant = (v, checked) => {
                    setFilters(f => ({...f, selectedGames: checked ? [...f.selectedGames, v] : f.selectedGames.filter(g => g !== v)}));
                  };
                  return (<div style={{display:'flex',flexDirection:'column',gap:'4px'}}>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:600,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                      <input type="checkbox" checked={allSelected}
                        onChange={() => setFilters(f => ({...f, selectedGames:[]}))}
                        style={{marginTop:'1px'}}
                      /> All
                    </label>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 12px',paddingLeft:'21px'}}>
                    {GAME_GROUPS.map(group => {
                      const availVars = group.variants.filter(v => availableGameVariants.has(v));
                      if (availVars.length === 0) return null;
                      const isSingle = availVars.length === 1 && group.variants.length === 1;
                      const groupChecked = availVars.every(v => filters.selectedGames.includes(v));
                      const groupPartial = availVars.some(v => filters.selectedGames.includes(v)) && !groupChecked;
                      if (isSingle) {
                        const v = availVars[0];
                        return (
                          <label key={group.label} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)',marginBottom:'6px'}}>
                            <input type="checkbox" checked={filters.selectedGames.includes(v)}
                              onChange={e => toggleVariant(v, e.target.checked)}
                              style={{marginTop:'1px'}}
                            /> {group.label}
                          </label>
                        );
                      }
                      const needsTopGap = group.label === 'Draw' || group.label === 'Mixed';
                      return (
                        <div key={group.label} style={needsTopGap ? {marginTop:'6px'} : undefined}>
                          <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:600,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                            <input type="checkbox" checked={groupChecked}
                              ref={el => { if (el) el.indeterminate = groupPartial; }}
                              onChange={e => {
                                const checked = e.target.checked;
                                setFilters(f => {
                                  const without = f.selectedGames.filter(v => !availVars.includes(v));
                                  return {...f, selectedGames: checked ? [...without, ...availVars] : without};
                                });
                              }}
                              style={{marginTop:'1px'}}
                            /> {group.label}
                          </label>
                          <div style={{display:'flex',flexDirection:'column',gap:'2px',paddingLeft:'21px',marginTop:'2px'}}>
                            {availVars.map(v => (
                              <label key={v} style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.78rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text-muted)'}}>
                                <input type="checkbox" checked={filters.selectedGames.includes(v)}
                                  onChange={e => toggleVariant(v, e.target.checked)}
                                  style={{marginTop:'1px'}}
                                /> {v}
                              </label>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>);
                })()}
              </div>
              <div className="filter-group filter-span2">
                <label style={{cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}} onClick={() => setSpecialOpen(s => !s)}>
                  Special
                  <span style={{fontSize:'0.7rem',transition:'transform 0.15s',transform: specialOpen ? 'rotate(180deg)' : 'rotate(0deg)'}}>▼</span>
                </label>
                {specialOpen && (
                  <div style={{display:'flex',flexDirection:'column',gap:'4px',marginTop:'4px'}}>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                      <input type="checkbox" checked={!!filters.ladiesOnly}
                        onChange={() => setFilters(f => ({...f, ladiesOnly:!f.ladiesOnly}))}
                        style={{marginTop:'1px'}}
                      /> Ladies
                    </label>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                      <input type="checkbox" checked={!!filters.seniorsOnly}
                        onChange={() => setFilters(f => ({...f, seniorsOnly:!f.seniorsOnly}))}
                        style={{marginTop:'1px'}}
                      /> Seniors
                    </label>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                      <input type="checkbox" checked={filters.bountyOnly}
                        onChange={e => setFilters(f => ({...f, bountyOnly:e.target.checked}))}
                        style={{marginTop:'1px'}}
                      /> Bounty
                    </label>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                      <input type="checkbox" checked={filters.mysteryBountyOnly}
                        onChange={e => setFilters(f => ({...f, mysteryBountyOnly:e.target.checked}))}
                        style={{marginTop:'1px'}}
                      /> Mystery Bounty
                    </label>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                      <input type="checkbox" checked={filters.headsUpOnly}
                        onChange={e => setFilters(f => ({...f, headsUpOnly:e.target.checked}))}
                        style={{marginTop:'1px'}}
                      /> Heads Up
                    </label>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                      <input type="checkbox" checked={filters.tagTeamOnly}
                        onChange={e => setFilters(f => ({...f, tagTeamOnly:e.target.checked}))}
                        style={{marginTop:'1px'}}
                      /> Tag Team
                    </label>
                    <label style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'0.82rem',fontWeight:400,textTransform:'none',letterSpacing:0,cursor:'pointer',color:'var(--text)'}}>
                      <input type="checkbox" checked={filters.employeesOnly}
                        onChange={e => setFilters(f => ({...f, employeesOnly:e.target.checked}))}
                        style={{marginTop:'1px'}}
                      /> Casino Employees
                    </label>
                  </div>
                )}
              </div>
              {hasActive && (
                <div className="filter-group filter-span2">
                  <button className="btn btn-ghost btn-sm" onClick={() =>
                    setFilters({minBuyin:'',maxBuyin:'',buyinRanges:[],rakeRanges:[],selectedGames:[],hiddenVenues:[],bountyOnly:false,mysteryBountyOnly:false,headsUpOnly:false,tagTeamOnly:false,employeesOnly:false,hideSatellites:true,hideRestarts:true,hideSideEvents:true,hiddenMonths:[],ladiesOnly:false,seniorsOnly:false,mixedOnly:false,dateFrom:'',dateTo:'',maxDistance:'',userLocation:null})
                  }>Clear all filters</button>
                </div>
              )}
            </div>,
            document.body
          )}
        </>
      );
    }

    // ── Tournaments View ───────────────────────────────────────

    function TournamentsView({ tournaments, mySchedule, onToggle, gameVariants, venues, onSetCondition, onRemoveCondition, onToggleAnchor, onSetPlannedEntries, buddyEvents, buddyLiveUpdates, onBuddySwap, onImport, isAdmin, onAdminEdit }) {
      const toast = useToast();
      const [search, setSearch] = useState('');
      const deferredSearch = React.useDeferredValue(search);
      const [filters, setFilters] = useState({
        minBuyin: '', maxBuyin: '', buyinRanges: [], rakeRanges: [], selectedGames: [], hiddenVenues: [], bountyOnly: false, mysteryBountyOnly: false, headsUpOnly: false, tagTeamOnly: false, employeesOnly: false, hideSatellites: true, hideRestarts: true, hideSideEvents: false, hiddenMonths: [], ladiesOnly: false, seniorsOnly: false, mixedOnly: false, dateFrom: '', dateTo: '', maxDistance: '', userLocation: null
      });
      const [filterPanelOpen, setFilterPanelOpen] = useState(false);
      const filterToggleRef = useRef(null);
      const [focusEventId, setFocusEventId] = useState(null);
      const todayScrollRef = useRef(null);
      const hasScrolled = useRef(false);
      const stickyFiltersRef = useRef(null);
      const [dateBreakTop, setDateBreakTop] = useState(0);
      const scrollAnchorRef = useRef(null); // { date, offsetFromTop }
      const [showBackToToday, setShowBackToToday] = useState(false);

      // Wrap setFilters to preserve scroll position when toggling show checkboxes
      const setFiltersWithScroll = useCallback((updater) => {
        const container = document.querySelector('.content-area');
        if (container) {
          // Find the first visible date-group element
          const groups = container.querySelectorAll('[data-date-group]');
          for (const g of groups) {
            const rect = g.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            if (rect.bottom > containerRect.top) {
              scrollAnchorRef.current = { date: g.getAttribute('data-date-group'), offsetFromTop: rect.top - containerRect.top };
              break;
            }
          }
        }
        setFilters(updater);
      }, []);

      // After re-render, restore scroll to the anchored date group
      useEffect(() => {
        if (!scrollAnchorRef.current) return;
        const { date, offsetFromTop } = scrollAnchorRef.current;
        scrollAnchorRef.current = null;
        const container = document.querySelector('.content-area');
        if (!container) return;
        requestAnimationFrame(() => {
          const target = container.querySelector(`[data-date-group="${date}"]`);
          if (target) {
            const containerRect = container.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const currentOffset = targetRect.top - containerRect.top;
            container.scrollTop += (currentOffset - offsetFromTop);
          } else {
            // Anchored date group no longer visible — ensure first group isn't behind sticky header
            const firstGroup = container.querySelector('[data-date-group]');
            if (firstGroup) {
              const stickyEl = container.querySelector('.sticky-filters');
              const stickyH = stickyEl ? stickyEl.getBoundingClientRect().bottom - container.getBoundingClientRect().top : 0;
              const groupTop = firstGroup.getBoundingClientRect().top - container.getBoundingClientRect().top;
              if (groupTop < stickyH) {
                container.scrollTop += (groupTop - stickyH);
                if (container.scrollTop < 0) container.scrollTop = 0;
              }
            }
          }
        });
      }, [filters]);

      useEffect(() => {
        const measure = () => {
          if (stickyFiltersRef.current) {
            const h = stickyFiltersRef.current.offsetHeight;
            const style = getComputedStyle(stickyFiltersRef.current);
            const mt = parseFloat(style.marginTop) || 0;
            setDateBreakTop(h + mt);
          }
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
      }, [filters, search]);

      const buyinOptions = useMemo(() =>
        [...new Set(tournaments.map(t => parseInt(t.buyin, 10)).filter(n => n > 0 && !isNaN(n)))].sort((a, b) => a - b),
        [tournaments]
      );

      const scheduleIds = useMemo(() => new Set(mySchedule.map(t => t.id)), [mySchedule]);
      const anchorSet = useMemo(() => new Set(mySchedule.filter(t => t.is_anchor).map(t => t.id)), [mySchedule]);
      const plannedEntriesMap = useMemo(() => {
        const m = {};
        for (const t of mySchedule) m[t.id] = t.planned_entries || 1;
        return m;
      }, [mySchedule]);
      const conditionMap = useMemo(() => {
        const m = {};
        for (const t of mySchedule) {
          const c = extractConditions(t);
          if (c.length > 0) m[t.id] = c;
        }
        return m;
      }, [mySchedule]);

      // Hide series that have ended (2 days after their last Day 1 / flight)
      const endedVenues = useMemo(() => {
        const todayISO = getToday();
        const lastDay1ByVenue = {};
        for (const t of tournaments) {
          if (t.is_restart || t.is_satellite) continue;
          const d = normaliseDate(t.date);
          if (!d) continue;
          if (!lastDay1ByVenue[t.venue] || d > lastDay1ByVenue[t.venue]) lastDay1ByVenue[t.venue] = d;
        }
        const ended = new Set();
        for (const [venue, lastDate] of Object.entries(lastDay1ByVenue)) {
          const cutoff = new Date(lastDate + 'T00:00:00');
          cutoff.setDate(cutoff.getDate() + 2);
          const cutoffISO = cutoff.toISOString().slice(0, 10);
          if (todayISO > cutoffISO) ended.add(venue);
        }
        return ended;
      }, [tournaments]);

      const filtered = useMemo(() => {
        return tournaments
          .filter(t => {
            if (endedVenues.has(t.venue)) return false;
            if (deferredSearch) {
              const q = deferredSearch.toLowerCase();
              if (!t.event_name?.toLowerCase().includes(q) &&
                  !String(t.event_number).includes(q) &&
                  !t.game_variant?.toLowerCase().includes(q)) return false;
            }
            if (filters.buyinRanges && filters.buyinRanges.length > 0) {
              const b = Number(t.buyin) || 0;
              const matchesBuyin = filters.buyinRanges.some(r => {
                if (r === '0-500') return b < 500;
                if (r === '500-1500') return b >= 500 && b < 1500;
                if (r === '1500-5000') return b >= 1500 && b < 5000;
                if (r === '5000-10000') return b >= 5000 && b <= 10000;
                if (r === '10000+') return b > 10000;
                return true;
              });
              if (!matchesBuyin) return false;
            }
            if (filters.rakeRanges && filters.rakeRanges.length > 0) {
              if (t.rake_pct == null) return false;
              const r = Number(t.rake_pct);
              const matchesRake = filters.rakeRanges.some(rng => {
                if (rng === '0-5') return r < 5;
                if (rng === '5-8') return r >= 5 && r < 8;
                if (rng === '8-10') return r >= 8 && r < 10;
                if (rng === '10-13') return r >= 10 && r < 13;
                if (rng === '13+') return r >= 13;
                return true;
              });
              if (!matchesRake) return false;
            }
            if (filters.selectedGames.length > 0 || filters.mixedOnly) {
              const isMixed = t.game_variant !== 'NLH' && t.game_variant !== 'PLO';
              const matchesGame = filters.selectedGames.length > 0 && filters.selectedGames.includes(t.game_variant);
              const matchesMixed = filters.mixedOnly && isMixed;
              if (!matchesGame && !matchesMixed) return false;
            }
            if (filters.hiddenVenues && filters.hiddenVenues.length > 0 && filters.hiddenVenues.includes(t.venue)) return false;
            if (filters.maxDistance && filters.userLocation) {
              const coords = VENUE_COORDS[t.venue];
              if (coords) {
                const dist = haversineDistance(filters.userLocation.lat, filters.userLocation.lng, coords.lat, coords.lng);
                if (dist > Number(filters.maxDistance)) return false;
              }
            }
            {
              const specialActive = filters.bountyOnly || filters.mysteryBountyOnly || filters.headsUpOnly || filters.tagTeamOnly || filters.employeesOnly || filters.ladiesOnly || filters.seniorsOnly;
              if (specialActive) {
                let matchesSpecial = false;
                if (filters.bountyOnly && /bounty|mystery millions/i.test(t.event_name)) matchesSpecial = true;
                if (filters.mysteryBountyOnly && /mystery bounty|mystery millions/i.test(t.event_name)) matchesSpecial = true;
                if (filters.headsUpOnly && /heads.up/i.test(t.event_name)) matchesSpecial = true;
                if (filters.tagTeamOnly && /tag.team/i.test(t.event_name)) matchesSpecial = true;
                if (filters.employeesOnly && /employee/i.test(t.event_name)) matchesSpecial = true;
                if (filters.ladiesOnly && /women|ladies/i.test(t.event_name)) matchesSpecial = true;
                if (filters.seniorsOnly && /senior/i.test(t.event_name)) matchesSpecial = true;
                if (!matchesSpecial) return false;
              }
            }
            if (filters.hideSatellites && t.is_satellite) return false;
            if (filters.hideRestarts && t.is_restart) return false;
            if (filters.hideSideEvents && t.category === 'side') return false;
            if (filters.hiddenMonths && filters.hiddenMonths.length > 0) {
              const m = new Date(t.date).getMonth();
              if (filters.hiddenMonths.includes(m)) return false;
            }
            if (filters.dateFrom && normaliseDate(t.date) < filters.dateFrom) return false;
            if (filters.dateTo && normaliseDate(t.date) > filters.dateTo) return false;
            return true;
          })
          .sort((a, b) => {
            // Primary: chronological by date, then time
            const da = parseTournamentTime(a);
            const db = parseTournamentTime(b);
            if (da !== db) return da - db;
            // Tiebreak: numeric event number (SAT-xxx sorted after main events, restarts after those)
            const na = a.event_number.startsWith('SAT') ? 10000 + parseInt(a.event_number.slice(4)) : (parseInt(a.event_number) || 9999);
            const nb = b.event_number.startsWith('SAT') ? 10000 + parseInt(b.event_number.slice(4)) : (parseInt(b.event_number) || 9999);
            return na - nb;
          });
      }, [tournaments, deferredSearch, filters, endedVenues]);

      // Show "Back to Today" button when scrolled past today's section
      useEffect(() => {
        const container = document.querySelector('.content-area');
        if (!container) return;
        let ticking = false;
        const onScroll = () => {
          if (ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            ticking = false;
            const todayEl = container.querySelector('[data-today-scroll]');
            if (!todayEl) { setShowBackToToday(false); return; }
            const rect = todayEl.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            setShowBackToToday(rect.bottom < containerRect.top + 120);
          });
        };
        container.addEventListener('scroll', onScroll, { passive: true });
        return () => container.removeEventListener('scroll', onScroll);
      }, [filtered]);

      function findBestFlight(eventNum, satTournament) {
        const flights = filtered.filter(t => t.event_number === eventNum);
        const best = findClosestFlight(flights, parseTournamentTime(satTournament));
        return best ? best.id : null;
      }

      // Auto-scroll to today's date group before first paint
      React.useLayoutEffect(() => {
        if (!hasScrolled.current && todayScrollRef.current) {
          hasScrolled.current = true;
          const container = todayScrollRef.current.closest('.content-area');
          if (!container) return;
          // Scroll so the date group top aligns with the sticky filters bottom
          const filters = container.querySelector('.sticky-filters');
          const filtersH = filters ? filters.getBoundingClientRect().bottom - container.getBoundingClientRect().top : 0;
          const groupAbsTop = todayScrollRef.current.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
          container.scrollTop = Math.max(0, groupAbsTop - filtersH);
        }
      }, [filtered]);

      return (
        <div>
          <div className="sticky-filters" ref={stickyFiltersRef}>
            <div style={{display:'flex',gap:'8px',alignItems:'center',marginBottom:'8px'}}>
              <button
                ref={filterToggleRef}
                className={`filter-chip ${filterPanelOpen ? 'active' : ''}`}
                onClick={() => setFilterPanelOpen(o => !o)}
                style={{flexShrink:0,height:'44px'}}
              >
                <Icon.filter />
              </button>
              <button
                className={`filter-chip ${filters.userLocation ? 'active' : ''}`}
                onClick={() => {
                  if (!filters.userLocation) {
                    if (navigator.geolocation) {
                      navigator.geolocation.getCurrentPosition(
                        (pos) => {
                          setFiltersWithScroll(f => ({...f, userLocation: { lat: pos.coords.latitude, lng: pos.coords.longitude }}));
                        },
                        (err) => {
                          console.warn('Geolocation error:', err);
                          toast.error('Could not get your location');
                        },
                        { enableHighAccuracy: false, timeout: 10000 }
                      );
                    } else {
                      toast.error('Geolocation not supported');
                    }
                  } else {
                    setFiltersWithScroll(f => ({...f, userLocation: null, maxDistance: ''}));
                  }
                }}
                style={{flexShrink:0,height:'44px'}}
                title="Sort by distance"
              >
                <Icon.mapPin />
              </button>
              <div className="search-bar" style={{flex:1,marginBottom:0}}>
                <Icon.search />
                <input
                  type="text"
                  placeholder="Search events, games…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
                {search && (
                  <button onClick={() => setSearch('')}
                    style={{background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:'1rem',padding:'0 2px'}}>✕</button>
                )}
              </div>
            </div>

            <Filters filters={filters} setFilters={setFiltersWithScroll} gameVariants={gameVariants} venues={venues} buyinOptions={buyinOptions} tournaments={tournaments} open={filterPanelOpen} setOpen={setFilterPanelOpen} toggleRef={filterToggleRef} eventCount={filtered.filter(t => !t.is_restart).length} onImport={onImport} />
          </div>

          {filtered.length === 0 ? (
            <div className="empty-state">
              <Icon.empty />
              <h3>No events found</h3>
              <p>Try adjusting your search or filters</p>
            </div>
          ) : (
            <div style={{minHeight:'100vh', paddingBottom:'60vh'}}>
              {(() => {
                const todayISO = getToday();
                const groups = [];
                let cur = null;
                for (const t of filtered) {
                  const d = normaliseDate(t.date);
                  if (!cur || cur.date !== d) {
                    cur = { date: d, events: [] };
                    groups.push(cur);
                  }
                  cur.events.push(t);
                }
                let scrollRefAssigned = false;
                return groups.map((group, gi) => {
                  const isToday = group.date === todayISO;
                  const past = group.date < todayISO;
                  const dateObj = new Date(group.date + 'T12:00:00');
                  const monthAbbr = MONTHS[dateObj.getMonth()];
                  const dayOfWeek = ['Su','M','Tu','W','Th','F','Sa'][dateObj.getDay()];
                  const dayNum = String(dateObj.getDate()).padStart(2, '0');
                  // Assign scroll ref to first group that is today or future
                  const needsRef = !scrollRefAssigned && group.date >= todayISO;
                  if (needsRef) scrollRefAssigned = true;
                  const dayEventCount = group.events.filter(t => !t.is_restart).length;
                  return (
                    <div key={group.date} ref={needsRef ? todayScrollRef : undefined} data-today-scroll={needsRef ? 'true' : undefined} data-date-group={group.date} style={{marginTop: gi === 0 ? 0 : '8px'}}>
                      <div className="schedule-date-break" style={{
                        position: 'sticky', top: dateBreakTop + 'px', zIndex: 5,
                        padding: '12px 12px 8px 2px',
                        background: 'var(--bg)',
                        color: 'var(--text)',
                        fontWeight: 700,
                        borderBottom: 'none',
                        display: 'flex', alignItems: 'baseline', gap: '4px'
                      }}>
                        {isToday ? (
                          <>
                            <span style={{
                              background: 'var(--accent)', display: 'inline-flex', alignItems: 'baseline', gap: '4px',
                              padding: '4px 12px', borderRadius: '999px'
                            }}>
                              <span style={{fontSize: '1.7rem', lineHeight: 1, fontFamily: "var(--serif)", color: 'var(--bg)'}}>{dayNum}</span>
                              <span style={{fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)", textTransform: 'capitalize', color: 'var(--bg)'}}>{monthAbbr}</span>
                            </span>
                            <span style={{fontSize:'0.7rem',color:'var(--text-muted)',fontWeight:600,marginLeft:'4px'}}>{dayEventCount} event{dayEventCount !== 1 ? 's' : ''}</span>
                            <span style={{marginLeft: 'auto', fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)"}}>{dayOfWeek}</span>
                          </>
                        ) : (
                          <>
                            <span style={{fontSize: '1.7rem', lineHeight: 1, fontFamily: "var(--serif)"}}>{dayNum}</span>
                            <span style={{fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)", textTransform: 'capitalize'}}>{monthAbbr}</span>
                            <span style={{fontSize:'0.7rem',color:'var(--text-muted)',fontWeight:600,marginLeft:'4px'}}>{dayEventCount} event{dayEventCount !== 1 ? 's' : ''}</span>
                            <span style={{marginLeft: 'auto', fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)"}}>{dayOfWeek}</span>
                          </>
                        )}
                      </div>
                      {group.events.map(t => (
                        <div key={t.id}>
                          <CalendarEventRow
                            tournament={t}
                            isInSchedule={scheduleIds.has(t.id)}
                            onToggle={onToggle}
                            isPast={past}
                            showMiniLateReg={!past}
                            focusEventId={focusEventId}
                            onNavigateToEvent={(num, sat) => {
                              const targetId = findBestFlight(num, sat);
                              if (targetId) { setFocusEventId(null); setTimeout(() => setFocusEventId(targetId), 0); }
                            }}
                            conditions={conditionMap[t.id] || []}
                            onSetCondition={onSetCondition}
                            onRemoveCondition={onRemoveCondition}
                            allTournaments={tournaments}
                            isAnchor={anchorSet.has(t.id)}
                            onToggleAnchor={onToggleAnchor}
                            plannedEntries={plannedEntriesMap[t.id] || 1}
                            onSetPlannedEntries={onSetPlannedEntries}
                            buddyEvents={buddyEvents}
                            buddyLiveUpdates={buddyLiveUpdates}
                            onBuddySwap={onBuddySwap}
                            scheduleIds={scheduleIds}
                            isAdmin={isAdmin}
                            onAdminEdit={onAdminEdit}
                          />
                        </div>
                      ))}
                    </div>
                  );
                });
              })()}
            </div>
          )}

          {showBackToToday && (
            <button
              className="back-to-today-fab"
              onClick={() => {
                const container = document.querySelector('.content-area');
                const todayEl = container && container.querySelector('[data-today-scroll]');
                if (todayEl && container) {
                  const stickyEl = container.querySelector('.sticky-filters');
                  const stickyH = stickyEl ? stickyEl.getBoundingClientRect().bottom - container.getBoundingClientRect().top : 0;
                  const groupAbsTop = todayEl.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
                  container.scrollTo({ top: Math.max(0, groupAbsTop - stickyH), behavior: 'smooth' });
                }
              }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" style={{width:'14px',height:'14px'}}>
                <polyline points="18 15 12 9 6 15"/>
              </svg>
              Today
            </button>
          )}
        </div>
      );
    }

    // ── Travel Day Picker ─────────────────────────────────────
    function TravelDayPicker({ onSave, onCancel }) {
      const [date, setDate] = useState('');
      const [depHour, setDepHour] = useState(8);
      const [depMinute, setDepMinute] = useState(0);
      const [depAmPm, setDepAmPm] = useState('AM');
      const [arrHour, setArrHour] = useState(2);
      const [arrMinute, setArrMinute] = useState(0);
      const [arrAmPm, setArrAmPm] = useState('PM');
      const dateRef = React.useRef(null);

      const hours = [1,2,3,4,5,6,7,8,9,10,11,12];
      const minutes = [0, 15, 30, 45];

      const fmtTime = (h, m, ap) => `${h}:${String(m).padStart(2,'0')} ${ap}`;

      const handleSave = () => {
        if (!date) return;
        const notes = `Depart ${fmtTime(depHour, depMinute, depAmPm)} → Arrive ${fmtTime(arrHour, arrMinute, arrAmPm)}`;
        onSave(date, notes);
      };

      const selectStyle = {
        padding: '6px 4px', fontSize: '0.85rem', borderRadius: '6px',
        border: '1px solid var(--border)', background: 'var(--surface)',
        color: 'var(--text)', outline: 'none', cursor: 'pointer',
        WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none',
        textAlign: 'center', minWidth: '44px'
      };

      const TimeSelector = ({ hour, minute, amPm, onHour, onMinute, onAmPm, label }) => (
        <div>
          <div style={{fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:'4px', fontWeight:600}}>{label}</div>
          <div style={{display:'flex', gap:'3px', alignItems:'center'}}>
            <select value={hour} onChange={e => onHour(Number(e.target.value))} style={selectStyle}>
              {hours.map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <span style={{color:'var(--text-muted)', fontWeight:700}}>:</span>
            <select value={minute} onChange={e => onMinute(Number(e.target.value))} style={selectStyle}>
              {minutes.map(m => <option key={m} value={m}>{String(m).padStart(2,'0')}</option>)}
            </select>
            <select value={amPm} onChange={e => onAmPm(e.target.value)} style={{...selectStyle, minWidth:'50px'}}>
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </div>
        </div>
      );

      return (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '10px', padding: '14px', marginBottom: '12px'
        }}>
          <div style={{display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px'}}>
            <span style={{fontSize:'1rem'}}>✈️</span>
            <span style={{fontWeight:700, fontSize:'0.88rem', color:'var(--text)'}}>Add Travel Day</span>
          </div>

          {/* Date picker */}
          <div style={{marginBottom:'14px'}}>
            <div style={{fontSize:'0.72rem', color:'var(--text-muted)', marginBottom:'4px', fontWeight:600}}>Date</div>
            <input ref={dateRef} type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{
                padding:'6px 10px', fontSize:'0.85rem', borderRadius:'6px',
                border:'1px solid var(--border)', background:'var(--surface)',
                color:'var(--text)', outline:'none', width:'100%', boxSizing:'border-box'
              }}
            />
          </div>

          {/* Time selectors */}
          <div style={{display:'flex', gap:'16px', marginBottom:'14px', flexWrap:'wrap'}}>
            <TimeSelector label="DEPART" hour={depHour} minute={depMinute} amPm={depAmPm}
              onHour={setDepHour} onMinute={setDepMinute} onAmPm={setDepAmPm} />
            <div style={{display:'flex', alignItems:'flex-end', paddingBottom:'2px'}}>
              <span style={{color:'var(--text-muted)', fontSize:'0.9rem'}}>→</span>
            </div>
            <TimeSelector label="ARRIVE" hour={arrHour} minute={arrMinute} amPm={arrAmPm}
              onHour={setArrHour} onMinute={setArrMinute} onAmPm={setArrAmPm} />
          </div>

          {/* Actions */}
          <div style={{display:'flex', gap:'8px', justifyContent:'flex-end'}}>
            <button className="btn btn-ghost btn-sm" onClick={onCancel}
              style={{fontSize:'0.8rem'}}>Cancel</button>
            <button className="btn btn-sm" onClick={handleSave}
              style={{
                fontSize:'0.8rem', background:'var(--accent)', color:'#fff',
                border:'none', borderRadius:'6px', padding:'6px 16px', cursor:'pointer',
                opacity: date ? 1 : 0.4
              }}
              disabled={!date}>Save</button>
          </div>
        </div>
      );
    }

    // ── My Schedule View ───────────────────────────────────────

    function ScheduleView({ mySchedule, onToggle, shareBuddies, pendingIncoming, lastSeenShares, onAcceptRequest, onRejectRequest, token, onSetCondition, onRemoveCondition, allTournaments, onToggleAnchor, onSetPlannedEntries, onAddPersonalEvent, onUpdatePersonalEvent, buddyEvents, buddyLiveUpdates, onBuddySwap, isAdmin, onAdminEdit }) {
      const displayName = useDisplayName();
      const { conflicts, expectedConflicts } = useMemo(() => detectConflicts(mySchedule), [mySchedule]);
      const scheduleIds = useMemo(() => new Set(mySchedule.map(t => t.id)), [mySchedule]);
      const todayRef = React.useRef(null);
      const hasScrolled = React.useRef(false);
      const dayOffDateRef = React.useRef(null);
      const schedHeaderRef = React.useRef(null);
      const [focusEventId, setFocusEventId] = useState(null);
      const [showTravelPicker, setShowTravelPicker] = useState(false);
      const [showExportModal, setShowExportModal] = useState(false);
      const [schedDateTop, setSchedDateTop] = useState(0);
      const [listVisible, setListVisible] = useState(false);

      useEffect(() => {
        const measure = () => {
          if (schedHeaderRef.current) {
            const h = schedHeaderRef.current.offsetHeight;
            const style = getComputedStyle(schedHeaderRef.current);
            const mt = parseFloat(style.marginTop) || 0;
            setSchedDateTop(h + mt);
          }
        };
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
      }, []);

      const todayISO = getToday();

      const sorted = useMemo(() =>
        [...mySchedule].sort((a, b) => {
          const da = parseTournamentTime(a);
          const db = parseTournamentTime(b);
          return da - db;
        }), [mySchedule]);

      // Auto-scroll to first event of today (or first upcoming event).
      // useLayoutEffect fires before paint so we can scroll + reveal atomically,
      // preventing the flash of content at the top before scroll lands.
      React.useLayoutEffect(() => {
        if (sorted.length === 0) return;
        if (hasScrolled.current) return;
        if (!todayRef.current) {
          // All events are in the past — no scroll needed, just reveal
          setListVisible(true);
          return;
        }
        hasScrolled.current = true;
        const el = todayRef.current;
        const container = el.closest('.content-area') || document.querySelector('.content-area');
        if (!container) { setListVisible(true); return; }
        // Scroll synchronously (layout is complete at this point)
        const caTop = container.getBoundingClientRect().top;
        const sticky = container.querySelector('.schedule-sticky-header');
        const stickyH = sticky ? sticky.getBoundingClientRect().bottom - caTop : 0;
        const elTop = el.getBoundingClientRect().top - caTop + container.scrollTop;
        container.scrollTop = Math.max(0, elTop - stickyH);
        // Reveal list — this setState in useLayoutEffect is synchronous before paint
        setListVisible(true);
        // Phase 2: minor fine-correction after the first paint
        requestAnimationFrame(() => {
          const firstCard = el.querySelector('.cal-event-row');
          if (!firstCard) return;
          const stickyBottom = measureStickyStack(container);
          const cardVisualTop = firstCard.getBoundingClientRect().top - container.getBoundingClientRect().top;
          if (cardVisualTop < stickyBottom + 2) {
            container.scrollTop -= (stickyBottom + 2 - cardVisualTop);
          }
        });
      }, [sorted]);

      // Find best flight: closest on or after satellite date within my schedule
      function findBestFlightSchedule(eventNum, sat) {
        const flights = sorted.filter(t => t.event_number === eventNum);
        const best = findClosestFlight(flights, parseTournamentTime(sat));
        return best ? best.id : null;
      }

      return (
        <div>
          {pendingIncoming && pendingIncoming.length > 0 && (
            <div style={{marginBottom:'16px'}}>
              <div className="section-header">
                <h2>Share Requests</h2>
              </div>
              {pendingIncoming.map(req => (
                <div key={req.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                  background:'var(--surface)',border:'1px solid var(--border)',
                  borderRadius:'var(--radius-sm)',padding:'10px 12px',marginBottom:'8px',
                  fontSize:'0.85rem',color:'var(--text)'}}>
                  <span style={{display:'flex',alignItems:'center',gap:'8px'}}>
                    <Avatar src={req.avatar} username={req.username} size={26} />
                    <strong>{displayName(req)}</strong>
                    <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>wants to share schedules</span>
                  </span>
                  <span style={{display:'flex',gap:'6px'}}>
                    <button className="btn btn-ghost btn-sm" style={{color:'#22c55e',padding:'4px 10px',fontWeight:600}} onClick={() => onAcceptRequest(req.id)}>Accept</button>
                    <button className="btn btn-ghost btn-sm" style={{color:'#b91c1c',padding:'4px 8px'}} onClick={() => onRejectRequest(req.id)}>Decline</button>
                  </span>
                </div>
              ))}
            </div>
          )}

          {sorted.length === 0 ? (
            <div className="empty-state">
              <Icon.star />
              <h3>No events saved</h3>
              <p>Browse All Tournaments and tap "+ Add to My Schedule"</p>
            </div>
          ) : (
          <div style={{opacity: listVisible ? 1 : 0}}>
          <div className="schedule-sticky-header" ref={schedHeaderRef}>
            <div className="section-header" style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:0}}>
              <h2>My Schedule</h2>
              <span style={{fontSize:'0.82rem',color:'var(--text-muted)',flex:1}}>{sorted.filter(t => !t.is_restart).length} event{sorted.filter(t => !t.is_restart).length !== 1 ? 's' : ''}</span>
              <button className="btn btn-ghost btn-sm"
                style={{display:'inline-flex',alignItems:'center',gap:'4px',fontSize:'0.78rem',padding:'4px 10px'}}
                onClick={() => setShowExportModal(true)}
                title="Export schedule">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Export
              </button>
            </div>
          </div>
          {onAddPersonalEvent && (
            <>
              <div style={{display:'flex', gap:'8px', marginBottom: showTravelPicker ? '0' : '12px', padding:'0 2px'}}>
                <button className="btn btn-ghost btn-sm"
                  style={{display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'0.8rem'}}
                  onClick={() => setShowTravelPicker(v => !v)}>
                  ✈️ Travel Day
                </button>
                <button className="btn btn-ghost btn-sm"
                  style={{display:'inline-flex', alignItems:'center', gap:'4px', fontSize:'0.8rem'}}
                  onClick={() => dayOffDateRef.current?.showPicker()}>
                  🏖️ Day Off
                </button>
                <input ref={dayOffDateRef} type="date"
                  style={{position:'absolute', opacity:0, pointerEvents:'none', width:0, height:0}}
                  onChange={e => { if (e.target.value) { onAddPersonalEvent(e.target.value, 'Day Off'); e.target.value = ''; }}} />
              </div>
              {showTravelPicker && (
                <div style={{padding:'0 2px', marginBottom:'12px'}}>
                  <TravelDayPicker
                    onSave={(date, notes) => {
                      onAddPersonalEvent(date, 'Travel Day', notes);
                      setShowTravelPicker(false);
                    }}
                    onCancel={() => setShowTravelPicker(false)}
                  />
                </div>
              )}
            </>
          )}
          {conflicts.size > 0 && (
            <div className="alert alert-error" style={{marginBottom:'12px'}}>
              <Icon.warn /> {conflicts.size} event{conflicts.size !== 1 ? 's have' : ' has'} a time conflict
            </div>
          )}
          <div style={{minHeight:'100vh', paddingBottom:'60vh'}}>
            {(() => {
              // Group sorted events by date so each group is its own sticky container
              const groups = [];
              let currentGroup = null;
              let globalIdx = 0;
              for (const t of sorted) {
                const d = normaliseDate(t.date);
                if (!currentGroup || currentGroup.date !== d) {
                  currentGroup = { date: d, events: [] };
                  groups.push(currentGroup);
                }
                currentGroup.events.push({ t, globalIdx });
                globalIdx++;
              }
              let scrollRefAssigned = false;
              return groups.map((group, gi) => {
                const isGroupToday = group.date === todayISO;
                const dateObj = new Date(group.date + 'T12:00:00');
                const monthAbbr = MONTHS[dateObj.getMonth()];
                const dayOfWeek = ['Su','M','Tu','W','Th','F','Sa'][dateObj.getDay()];
                const dayNum = String(dateObj.getDate()).padStart(2, '0');
                const past = group.date < todayISO;
                const needsRef = !scrollRefAssigned && group.date >= todayISO;
                if (needsRef) scrollRefAssigned = true;
                return (
                  <div key={group.date} ref={needsRef ? todayRef : null} style={{marginTop: gi === 0 ? 0 : '8px'}}>
                    <div className="schedule-date-break" style={{
                      position: 'sticky', top: schedDateTop + 'px', zIndex: 5,
                      padding: '12px 12px 8px 2px',
                      background: 'var(--bg)',
                      color: 'var(--text)',
                      fontWeight: 700,
                      borderBottom: 'none',
                      display: 'flex', alignItems: 'baseline', gap: '4px'
                    }}>
                      {isGroupToday ? (
                        <>
                          <span style={{
                            background: 'var(--accent)', display: 'inline-flex', alignItems: 'baseline', gap: '4px',
                            padding: '4px 12px', borderRadius: '999px'
                          }}>
                            <span style={{fontSize: '1.7rem', lineHeight: 1, fontFamily: "var(--serif)", color: 'var(--bg)'}}>{dayNum}</span>
                            <span style={{fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)", textTransform: 'capitalize', color: 'var(--bg)'}}>{monthAbbr}</span>
                          </span>
                          <span style={{marginLeft: 'auto', fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)"}}>{dayOfWeek}</span>
                        </>
                      ) : (
                        <>
                          <span style={{fontSize: '1.7rem', lineHeight: 1, fontFamily: "var(--serif)"}}>{dayNum}</span>
                          <span style={{fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)", textTransform: 'capitalize'}}>{monthAbbr}</span>
                          <span style={{marginLeft: 'auto', fontSize: '0.85rem', lineHeight: 1, fontFamily: "var(--serif)", }}>{dayOfWeek}</span>
                        </>
                      )}
                    </div>
                    {group.events.map(({ t, globalIdx: gIdx }) => (
                      <div key={t.id} style={{contentVisibility:'auto', containIntrinsicSize:'auto 72px'}}>
                        <CalendarEventRow
                          tournament={t}
                          isInSchedule={true}
                          onToggle={onToggle}
                          isPast={past}
                          showMiniLateReg={!past}
                          focusEventId={focusEventId}
                          onNavigateToEvent={(num, sat) => {
                            const targetId = findBestFlightSchedule(num, sat);
                            if (targetId) { setFocusEventId(null); setTimeout(() => setFocusEventId(targetId), 0); }
                          }}
                          conditions={extractConditions(t)}
                          onSetCondition={onSetCondition}
                          onRemoveCondition={onRemoveCondition}
                          allTournaments={allTournaments}
                          isAnchor={!!t.is_anchor}
                          onToggleAnchor={onToggleAnchor}
                          plannedEntries={t.planned_entries || 1}
                          onSetPlannedEntries={onSetPlannedEntries}
                          onUpdatePersonalEvent={onUpdatePersonalEvent}
                          buddyEvents={buddyEvents}
                          buddyLiveUpdates={buddyLiveUpdates}
                          onBuddySwap={onBuddySwap}
                          scheduleIds={scheduleIds}
                          isAdmin={isAdmin}
                          onAdminEdit={onAdminEdit}
                        />
                      </div>
                    ))}
                  </div>
                );
              });
            })()}
          </div>
          </div>
          )}

          {showExportModal && <ScheduleExportModal events={sorted} onClose={() => setShowExportModal(false)} />}
        </div>
      );
    }

    // ── Calendar View ──────────────────────────────────────────

    // Build a contiguous list of dates spanning all tournaments
    function buildAllDates(tournaments) {
      if (!tournaments || tournaments.length === 0) return [];
      let min = null, max = null;
      for (const t of tournaments) {
        const d = normaliseDate(t.date);
        if (!d) continue;
        if (!min || d < min) min = d;
        if (!max || d > max) max = d;
      }
      if (!min || !max) return [];
      const dates = [];
      for (let d = new Date(min + 'T12:00:00'); d <= new Date(max + 'T12:00:00'); d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10));
      }
      return dates;
    }
    const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    function CalendarView({ allTournaments, mySchedule, onToggle, gameVariants, venues, onSetCondition, onRemoveCondition, onToggleAnchor, onSetPlannedEntries, buddyEvents, buddyLiveUpdates }) {
      const allDates = useMemo(() => buildAllDates(allTournaments), [allTournaments]);
      const today = getToday();
      const defaultDate = allDates.includes(today) ? today : allDates[0] || today;
      const [selectedDate, setSelectedDate] = useState(defaultDate);
      const activeDateRef = React.useRef(null);
      const [focusEventId, setFocusEventId] = useState(null);

      // Always snap to today when the tab is visited
      useEffect(() => {
        const t = getToday();
        if (allDates.includes(t)) setSelectedDate(t);
      }, []);

      // Scroll the active date button into view in the carousel
      useEffect(() => {
        if (activeDateRef.current) {
          activeDateRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      }, [selectedDate]);
      const [filters, setFilters] = useState({
        minBuyin: '', maxBuyin: '', buyinRanges: [], rakeRanges: [], selectedGames: [], hiddenVenues: [], bountyOnly: false, mysteryBountyOnly: false, headsUpOnly: false, tagTeamOnly: false, employeesOnly: false, hideSatellites: true, hideRestarts: true, hideSideEvents: false, maxDistance: '', userLocation: null
      });

      const buyinOptions = useMemo(() =>
        [...new Set(allTournaments.map(t => parseInt(t.buyin, 10)).filter(n => n > 0 && !isNaN(n)))].sort((a, b) => a - b),
        [allTournaments]
      );

      // Map normalised date → all tournaments
      const byDate = useMemo(() => {
        const map = {};
        for (const t of allTournaments) {
          const key = normaliseDate(t.date);
          if (!map[key]) map[key] = [];
          map[key].push(t);
        }
        return map;
      }, [allTournaments]);

      const scheduleIds = useMemo(() => new Set(mySchedule.map(t => t.id)), [mySchedule]);
      const anchorSet = useMemo(() => new Set(mySchedule.filter(t => t.is_anchor).map(t => t.id)), [mySchedule]);
      const plannedEntriesMap = useMemo(() => {
        const m = {};
        for (const t of mySchedule) m[t.id] = t.planned_entries || 1;
        return m;
      }, [mySchedule]);
      const conditionMap = useMemo(() => {
        const m = {};
        for (const t of mySchedule) {
          const c = extractConditions(t);
          if (c.length > 0) m[t.id] = c;
        }
        return m;
      }, [mySchedule]);

      // Hide series that have ended (2 days after their last Day 1 / flight)
      const calEndedVenues = useMemo(() => {
        const todayISO = getToday();
        const lastDay1ByVenue = {};
        for (const t of allTournaments) {
          if (t.is_restart || t.is_satellite) continue;
          const d = normaliseDate(t.date);
          if (!d) continue;
          if (!lastDay1ByVenue[t.venue] || d > lastDay1ByVenue[t.venue]) lastDay1ByVenue[t.venue] = d;
        }
        const ended = new Set();
        for (const [venue, lastDate] of Object.entries(lastDay1ByVenue)) {
          const cutoff = new Date(lastDate + 'T00:00:00');
          cutoff.setDate(cutoff.getDate() + 2);
          if (todayISO > cutoff.toISOString().slice(0, 10)) ended.add(venue);
        }
        return ended;
      }, [allTournaments]);

      const selDateObj  = new Date(selectedDate + 'T12:00:00');
      const todayEvents = byDate[selectedDate] || [];

      // Filter + sort by time
      const sortedEvents = useMemo(() => {
        return [...todayEvents]
          .filter(t => {
            if (calEndedVenues.has(t.venue)) return false;
            if (filters.minBuyin && t.buyin < Number(filters.minBuyin)) return false;
            if (filters.maxBuyin && t.buyin > Number(filters.maxBuyin)) return false;
            if (filters.buyinRanges && filters.buyinRanges.length > 0) {
              const b = Number(t.buyin) || 0;
              const matchesBuyin = filters.buyinRanges.some(r => {
                if (r === '0-500') return b < 500;
                if (r === '500-1500') return b >= 500 && b < 1500;
                if (r === '1500-5000') return b >= 1500 && b < 5000;
                if (r === '5000-10000') return b >= 5000 && b <= 10000;
                if (r === '10000+') return b > 10000;
                return true;
              });
              if (!matchesBuyin) return false;
            }
            if (filters.rakeRanges && filters.rakeRanges.length > 0) {
              if (t.rake_pct == null) return false;
              const r = Number(t.rake_pct);
              const matchesRake = filters.rakeRanges.some(rng => {
                if (rng === '0-5') return r < 5;
                if (rng === '5-8') return r >= 5 && r < 8;
                if (rng === '8-10') return r >= 8 && r < 10;
                if (rng === '10-13') return r >= 10 && r < 13;
                if (rng === '13+') return r >= 13;
                return true;
              });
              if (!matchesRake) return false;
            }
            if (filters.selectedGames.length > 0 && !filters.selectedGames.includes(t.game_variant)) return false;
            if (filters.hiddenVenues && filters.hiddenVenues.length > 0 && filters.hiddenVenues.includes(t.venue)) return false;
            if (filters.maxDistance && filters.userLocation) {
              const coords = VENUE_COORDS[t.venue];
              if (coords) {
                const dist = haversineDistance(filters.userLocation.lat, filters.userLocation.lng, coords.lat, coords.lng);
                if (dist > Number(filters.maxDistance)) return false;
              }
            }
            {
              const specialActive = filters.bountyOnly || filters.mysteryBountyOnly || filters.headsUpOnly || filters.tagTeamOnly || filters.employeesOnly || filters.ladiesOnly || filters.seniorsOnly;
              if (specialActive) {
                let matchesSpecial = false;
                if (filters.bountyOnly && /bounty|mystery millions/i.test(t.event_name)) matchesSpecial = true;
                if (filters.mysteryBountyOnly && /mystery bounty|mystery millions/i.test(t.event_name)) matchesSpecial = true;
                if (filters.headsUpOnly && /heads.up/i.test(t.event_name)) matchesSpecial = true;
                if (filters.tagTeamOnly && /tag.team/i.test(t.event_name)) matchesSpecial = true;
                if (filters.employeesOnly && /employee/i.test(t.event_name)) matchesSpecial = true;
                if (filters.ladiesOnly && /women|ladies/i.test(t.event_name)) matchesSpecial = true;
                if (filters.seniorsOnly && /senior/i.test(t.event_name)) matchesSpecial = true;
                if (!matchesSpecial) return false;
              }
            }
            if (filters.hideSatellites && t.is_satellite) return false;
            if (filters.hideRestarts && t.is_restart) return false;
            if (filters.hideSideEvents && t.category === 'side') return false;
            return true;
          })
          .sort((a, b) => {
            const ta = a.venue ? parseDateTimeInTz(a.date, a.time, a.venue) : parseDateTime(a.date, (a.time || '').replace(/\s*GMT\s*$/i, ''));
            const tb = b.venue ? parseDateTimeInTz(b.date, b.time, b.venue) : parseDateTime(b.date, (b.time || '').replace(/\s*GMT\s*$/i, ''));
            if (ta !== tb) return ta - tb;
            const na = (a.event_number || '').startsWith('SAT') ? 10000 + parseInt((a.event_number || '').slice(4)) : (parseInt(a.event_number) || 9999);
            const nb = (b.event_number || '').startsWith('SAT') ? 10000 + parseInt((b.event_number || '').slice(4)) : (parseInt(b.event_number) || 9999);
            return na - nb;
          });
      }, [todayEvents, filters]);

      const myTodayCount = sortedEvents.filter(t => scheduleIds.has(t.id)).length;

      // Split events for "My Events" section on today's date
      const isToday = selectedDate === getToday();
      const myEvents = useMemo(() => sortedEvents.filter(t => scheduleIds.has(t.id)), [sortedEvents, scheduleIds]);
      const otherEvents = useMemo(() => sortedEvents.filter(t => !scheduleIds.has(t.id)), [sortedEvents, scheduleIds]);
      const showMySection = isToday && myEvents.length > 0;

      const renderEvent = (t) => (
        <CalendarEventRow
          key={t.id}
          tournament={t}
          isInSchedule={scheduleIds.has(t.id)}
          onToggle={onToggle}
          showMiniLateReg={selectedDate >= today}
          focusEventId={focusEventId}
          onNavigateToEvent={(num, sat) => {
            const flights = allTournaments.filter(f => f.event_number === num);
            const best = findClosestFlight(flights, parseTournamentTime(sat));
            if (best) {
              if (best.date !== selectedDate) setSelectedDate(best.date);
              setFocusEventId(null);
              setTimeout(() => setFocusEventId(best.id), 50);
            }
          }}
          conditions={conditionMap[t.id] || []}
          onSetCondition={onSetCondition}
          onRemoveCondition={onRemoveCondition}
          allTournaments={allTournaments}
          isAnchor={anchorSet.has(t.id)}
          onToggleAnchor={onToggleAnchor}
          plannedEntries={plannedEntriesMap[t.id] || 1}
          onSetPlannedEntries={onSetPlannedEntries}
          buddyEvents={buddyEvents}
          buddyLiveUpdates={buddyLiveUpdates}
          scheduleIds={scheduleIds}
        />
      );

      function move(dir) {
        const idx  = allDates.indexOf(selectedDate);
        const next = idx + dir;
        if (next >= 0 && next < allDates.length) setSelectedDate(allDates[next]);
      }

      return (
        <div>
          <div className="sticky-filters">
            {/* Date navigation header */}
            <div className="calendar-nav">
              <button className="cal-nav-btn" onClick={() => move(-1)}>
                <Icon.chevLeft />
              </button>
              <div className="cal-date-label">
                <div className="day-name">{DOW[selDateObj.getDay()]}</div>
                <div className="day-full">
                  {MONTHS[selDateObj.getMonth()]} {selDateObj.getDate()}, {selDateObj.getFullYear()}
                </div>
              </div>
              <button className="cal-nav-btn" onClick={() => move(1)}>
                <Icon.chevRight />
              </button>
            </div>

            {/* Scrollable date strip */}
            <div className="cal-date-strip">
              {allDates.map(d => {
                const dObj  = new Date(d + 'T12:00:00');
                const hasEv = (byDate[d] || []).length > 0;
                const isSel = d === selectedDate;
                return (
                  <button
                    key={d}
                    ref={isSel ? activeDateRef : null}
                    className={`cal-date-btn ${isSel ? 'active' : ''} ${hasEv && !isSel ? 'has-events' : ''}`}
                    onClick={() => setSelectedDate(d)}
                  >
                    <span className="dow">{DOW[dObj.getDay()]}</span>
                    <span className="dom">{dObj.getDate()}</span>
                    {hasEv && <span className="ev-dot" />}
                  </button>
                );
              })}
            </div>

            <Filters filters={filters} setFilters={setFilters} gameVariants={gameVariants || []} venues={venues || []} buyinOptions={buyinOptions} tournaments={allTournaments} />

            {/* Summary row */}
            <p className="cal-event-count">
              {sortedEvents.length} event{sortedEvents.length !== 1 ? 's' : ''}
              {myTodayCount > 0 && ` · ${myTodayCount} in my schedule`}
            </p>
          </div>

          {sortedEvents.length === 0 ? (
            <div className="empty-state" style={{padding:'40px 24px'}}>
              <Icon.empty />
              <h3>No events</h3>
              <p>No tournaments scheduled for this date</p>
            </div>
          ) : showMySection ? (
            <div style={{minHeight:'100vh'}}>
              <div className="section-header" style={{marginTop:'8px'}}>
                <h2>My Events</h2>
                <span style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>{myEvents.length} event{myEvents.length !== 1 ? 's' : ''}</span>
              </div>
              {myEvents.map(renderEvent)}

              {otherEvents.length > 0 && (
                <React.Fragment>
                  <div className="section-header" style={{marginTop:'16px'}}>
                    <h2>All Events</h2>
                    <span style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>{otherEvents.length} event{otherEvents.length !== 1 ? 's' : ''}</span>
                  </div>
                  {otherEvents.map(renderEvent)}
                </React.Fragment>
              )}
            </div>
          ) : (
            <div style={{minHeight:'100vh'}}>
              {sortedEvents.map(renderEvent)}
            </div>
          )}
        </div>
      );
    }

    // ── Upload View ────────────────────────────────────────────

    function UploadView({ onUpload, success, error, uploadVenue, onUploadVenueChange }) {
      return (
        <div className="upload-card">
          <h2>Upload Schedule PDF</h2>
          <p>Upload a PDF schedule from any poker series. The format is auto-detected.</p>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <input type="text" placeholder="Venue (optional — auto-detected from PDF)" value={uploadVenue} onChange={e => onUploadVenueChange(e.target.value)} style={{padding:'8px 12px',borderRadius:'6px',border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:'0.85rem',width:'100%',boxSizing:'border-box',marginBottom:'12px'}} />

          <div className="drop-zone">
            <Icon.upload />
            <p>Select a PDF file to upload</p>
          </div>

          <input type="file" id="pdf-upload" className="file-input" accept=".pdf" onChange={onUpload} />
          <label htmlFor="pdf-upload" className="btn btn-primary" style={{display:'inline-flex',alignItems:'center',gap:'8px'}}>
            <Icon.upload /> Choose PDF File
          </label>
        </div>
      );
    }

    // ── Shared Schedule View (public, no auth) ─────────────────

    function SharedScheduleView({ shareToken }) {
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      const [loading, setLoading] = useState(true);
      const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');

      useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
      }, [theme]);

      useEffect(() => {
        fetch(`${API_URL}/shared/${shareToken}`)
          .then(r => { if (!r.ok) throw new Error('Schedule not found'); return r.json(); })
          .then(d => { setData(d); setLoading(false); })
          .catch(e => { setError(e.message); setLoading(false); });
      }, [shareToken]);

      if (loading) return (
        <div className="auth-wrap">
          <div className="auth-card" style={{textAlign:'center'}}>
            <div className="auth-logo"><h1>futurega.me</h1><p>spring/summer 2026</p></div>
            <p style={{color:'var(--text-muted)',marginTop:'16px'}}>Loading schedule...</p>
          </div>
        </div>
      );

      if (error || !data) return (
        <div className="auth-wrap">
          <div className="auth-card" style={{textAlign:'center'}}>
            <div className="auth-logo"><h1>futurega.me</h1><p>spring/summer 2026</p></div>
            <p style={{color:'var(--text-muted)',marginTop:'16px'}}>{error || 'Schedule not found'}</p>
          </div>
        </div>
      );

      const todayISO = getToday();
      const sorted = [...data.tournaments].sort((a, b) => {
        const da = parseTournamentTime(a);
        const db2 = parseTournamentTime(b);
        return da - db2;
      });

      return (
        <div className="app-shell">
          <header className="top-bar">
            <div className="top-bar-title">
              <h1>futurega.me</h1>
              <small>{(data.real_name || data.username)}'s schedule</small>
            </div>
            <div className="top-bar-actions">
              <span style={{display:'flex',alignItems:'center',gap:'6px'}}>
                <Avatar src={data.avatar} username={data.username} size={22} />
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setTheme(t => { const n = THEME_ORDER[(THEME_ORDER.indexOf(t)+1)%THEME_ORDER.length]; localStorage.setItem('theme', n); return n; })} title={`Switch to ${THEME_LABEL[THEME_ORDER[(THEME_ORDER.indexOf(theme)+1)%THEME_ORDER.length]]} mode`}>
                {React.createElement(Icon[THEME_ICON[theme]] || Icon.moon)}
              </button>
            </div>
          </header>
          <main className="content-area">
            <div className="section-header">
              <h2 style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <Avatar src={data.avatar} username={data.username} size={26} />
                {(data.real_name || data.username)}'s Schedule
              </h2>
              <span className="event-count-badge">{sorted.filter(t => !t.is_restart).length} event{sorted.filter(t => !t.is_restart).length !== 1 ? 's' : ''}</span>
            </div>
            <div style={{minHeight:'100vh'}}>
            {sorted.length === 0 ? (
              <div className="empty-state"><Icon.star /><h3>No events yet</h3><p>This schedule is empty</p></div>
            ) : (
              sorted.map(t => (
                <CalendarEventRow
                  key={t.id}
                  tournament={t}
                  isInSchedule={true}
                  onToggle={() => {}}

                  isPast={normaliseDate(t.date) < todayISO}
                  readOnly={true}
                  conditions={extractConditions(t, true)}
                  isAnchor={!!t.is_anchor}
                />
              ))
            )}
            </div>
          </main>
        </div>
      );
    }

    // ── Shared User Schedule (collapsible in Me tab) ──────────

    function SharedUserSchedule({ user, token, isNew }) {
      const displayName = useDisplayName();
      const [open, setOpen] = useState(false);
      const [schedule, setSchedule] = useState([]);
      const [loaded, setLoaded] = useState(false);

      const loadSchedule = () => {
        if (loaded) { setOpen(o => !o); return; }
        fetch(`${API_URL}/schedule/${user.id}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
          .then(r => r.json())
          .then(data => { setSchedule(data); setLoaded(true); setOpen(true); })
          .catch(() => {});
      };

      const todayISO = getToday();

      return (
        <div style={{marginBottom:'12px'}}>
          <div
            onClick={loadSchedule}
            style={{display:'flex',justifyContent:'space-between',alignItems:'center',
              background:'var(--surface)',border:'1px solid var(--border)',
              borderRadius:'var(--radius-sm)',padding:'10px 12px',cursor:'pointer',
              fontSize:'0.85rem',color:'var(--text)'}}
          >
            <span style={{display:'flex',alignItems:'center',gap:'8px'}}>
              <Avatar src={user.avatar} username={user.username} size={24} />
              {displayName(user)}'s schedule
              {isNew && (
                <span style={{
                  background:'#ef4444', color:'#fff', fontSize:'0.6rem', fontWeight:700,
                  padding:'1px 6px', borderRadius:'8px', letterSpacing:'0.5px'
                }}>NEW</span>
              )}
            </span>
            <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>{open ? '▲' : '▼'}</span>
          </div>
          {open && schedule.length > 0 && (
            <div style={{marginTop:'4px'}}>
              {schedule.map(t => (
                <CalendarEventRow
                  key={t.id}
                  tournament={t}
                  isInSchedule={false}
                  onToggle={() => {}}

                  isPast={normaliseDate(t.date) < todayISO}
                  readOnly={true}
                  conditions={extractConditions(t, true)}
                  isAnchor={!!t.is_anchor}
                />
              ))}
            </div>
          )}
          {open && schedule.length === 0 && loaded && (
            <p style={{fontSize:'0.82rem',color:'var(--text-muted)',padding:'12px'}}>No events in this schedule</p>
          )}
        </div>
      );
    }

    // ── Auth Screen ────────────────────────────────────────────

    function RealNamePrompt({ onSave, onDismiss }) {
      const [name, setName] = useState('');
      const [saving, setSaving] = useState(false);
      const [err, setErr] = useState('');

      const handleSave = async () => {
        if (!name.trim()) return;
        setSaving(true); setErr('');
        try {
          const res = await fetch(`${API_URL}/profile`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: JSON.stringify({ realName: name.trim() })
          });
          const data = await res.json();
          if (!res.ok) { setErr(data.error || 'Failed to save'); setSaving(false); return; }
          onSave(data.realName);
        } catch (e) { console.error('Profile save:', e); setErr('Network error'); setSaving(false); }
      };

      return ReactDOM.createPortal(
        React.createElement('div', { className: 'modal-backdrop', onClick: onDismiss },
          React.createElement('div', { className: 'modal-content', onClick: e => e.stopPropagation(), style: { maxWidth: '380px' } },
            React.createElement('h3', { style: { marginBottom: '4px' } }, 'What\'s your name?'),
            React.createElement('p', { style: { color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' } },
              'Your connections and group members will see this.'
            ),
            err && React.createElement('div', { className: 'alert alert-error', style: { marginBottom: '12px' } }, err),
            React.createElement('input', {
              type: 'text', value: name, onChange: e => setName(e.target.value),
              placeholder: 'Your real name', maxLength: 40, autoFocus: true,
              style: { width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.95rem', boxSizing: 'border-box' },
              onKeyDown: e => { if (e.key === 'Enter' && name.trim()) handleSave(); }
            }),
            React.createElement('div', { style: { display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' } },
              React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: onDismiss }, 'Later'),
              React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: handleSave, disabled: saving || !name.trim() },
                saving ? 'Saving...' : 'Save'
              )
            )
          )
        ), document.body
      );
    }

    function AuthScreen({ onSubmit, error, success, theme, toggleTheme, onForgotPassword, onGuestLogin, initialRegister }) {
      const [isRegister, setIsRegister] = useState(!!initialRegister);
      const [keepSignedIn, setKeepSignedIn] = useState(true);
      const nextThemeLabel = THEME_LABEL[THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]];

      return (
        <div className="auth-wrap">
          <div className="auth-card">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'8px'}}>
              <button className="btn btn-ghost btn-sm" onClick={toggleTheme} title={`Switch to ${nextThemeLabel} mode`}>
                {React.createElement(Icon[THEME_ICON[theme]] || Icon.moon)}
              </button>
            </div>
            <div className="auth-logo">
              <h1>futurega.me</h1>
              <p>spring/summer 2026</p>
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            <form onSubmit={e => onSubmit(e, isRegister, keepSignedIn)}>
              {isRegister && (
                <div className="form-field">
                  <label>Full Name</label>
                  <input type="text" name="realName" placeholder="Your real name" required maxLength="40" autoComplete="name" />
                </div>
              )}
              {isRegister && (
                <div className="form-field">
                  <label>Username</label>
                  <input type="text" name="username" placeholder="Choose a username" required autoComplete="username" />
                </div>
              )}
              <div className="form-field">
                <label>Email</label>
                <input type="email" name="email" placeholder="you@example.com" required autoComplete="email" />
              </div>
              <div className="form-field">
                <label>Password</label>
                <input type="password" name="password" placeholder={isRegister ? 'Min. 6 characters' : 'Your password'} required minLength="6" autoComplete={isRegister ? 'new-password' : 'current-password'} />
              </div>
              {!isRegister && (
                <label style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'0.8rem',color:'var(--text-muted)',marginTop:'10px',cursor:'pointer'}}>
                  <input type="checkbox" checked={keepSignedIn} onChange={e => setKeepSignedIn(e.target.checked)}
                    style={{accentColor:'var(--accent)',cursor:'pointer'}} />
                  Keep me signed in
                </label>
              )}
              <button type="submit" className="btn btn-primary btn-full" style={{marginTop:'8px'}}>
                {isRegister ? 'Create Account' : 'Sign In'}
              </button>
            </form>

            {!isRegister && (
              <p style={{textAlign:'center',marginTop:'12px',marginBottom:'-8px'}}>
                <button onClick={onForgotPassword}
                  style={{color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer',fontSize:'0.82rem'}}>
                  Forgot password?
                </button>
              </p>
            )}

            <p style={{textAlign:'center',marginTop:'20px',fontSize:'0.85rem',color:'var(--text-muted)'}}>
              {isRegister ? 'Already have an account? ' : "Don't have an account? "}
              <button onClick={() => setIsRegister(r => !r)}
                style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:'600',fontSize:'0.85rem'}}>
                {isRegister ? 'Sign in' : 'Register'}
              </button>
            </p>

            <div style={{borderTop:'1px solid var(--border)',marginTop:'20px',paddingTop:'16px'}}>
              <button onClick={onGuestLogin} className="btn btn-full"
                style={{background:'transparent',border:'1px solid var(--border)',color:'var(--text-muted)',fontSize:'0.85rem'}}>
                Continue as Guest
              </button>
              <p style={{textAlign:'center',marginTop:'8px',fontSize:'0.72rem',color:'var(--text-muted)',opacity:0.7}}>
                Browse tournaments without an account
              </p>
            </div>
          </div>
        </div>
      );
    }

    function ForgotPasswordForm({ onBack, theme, toggleTheme }) {
      const nextThemeLabel = THEME_LABEL[THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]];
      const [email, setEmail] = useState('');
      const [error, setError] = useState('');
      const [success, setSuccess] = useState('');
      const [loading, setLoading] = useState(false);

      const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccess(''); setLoading(true);
        try {
          const res = await fetch(`${API_URL}/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const data = await res.json();
          if (!res.ok) { setError(data.error || 'Request failed'); }
          else { setSuccess(data.message); }
        } catch (e) {
          console.error('Forgot password:', e);
          setError('Network error. Please try again.');
        } finally { setLoading(false); }
      };

      return (
        <div className="auth-wrap">
          <div className="auth-card">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'8px'}}>
              <button className="btn btn-ghost btn-sm" onClick={toggleTheme} title={`Switch to ${nextThemeLabel} mode`}>
                {React.createElement(Icon[THEME_ICON[theme]] || Icon.moon)}
              </button>
            </div>
            <div className="auth-logo">
              <h1>futurega.me</h1>
              <p>reset password</p>
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {!success && (
              <form onSubmit={handleSubmit}>
                <div className="form-field">
                  <label>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    placeholder="you@example.com" required autoComplete="email" />
                </div>
                <button type="submit" className="btn btn-primary btn-full"
                  style={{marginTop:'8px'}} disabled={loading}>
                  {loading ? 'Sending...' : 'Send Reset Link'}
                </button>
              </form>
            )}

            <p style={{textAlign:'center',marginTop:'20px',fontSize:'0.85rem',color:'var(--text-muted)'}}>
              <button onClick={onBack}
                style={{color:'var(--accent)',background:'none',border:'none',cursor:'pointer',fontWeight:'600',fontSize:'0.85rem'}}>
                Back to Sign In
              </button>
            </p>
          </div>
        </div>
      );
    }

    function ResetPasswordForm({ resetToken, theme, toggleTheme }) {
      const nextThemeLabel = THEME_LABEL[THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]];
      const [password, setPassword] = useState('');
      const [confirmPassword, setConfirmPassword] = useState('');
      const [error, setError] = useState('');
      const [success, setSuccess] = useState('');
      const [loading, setLoading] = useState(false);

      const handleSubmit = async (e) => {
        e.preventDefault();
        setError(''); setSuccess('');
        if (password !== confirmPassword) {
          setError('Passwords do not match'); return;
        }
        if (password.length < 8) {
          setError('Password must be at least 8 characters'); return;
        }
        setLoading(true);
        try {
          const res = await fetch(`${API_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: resetToken, password }),
          });
          const data = await res.json();
          if (!res.ok) { setError(data.error || 'Reset failed'); }
          else { setSuccess(data.message); }
        } catch (e) {
          console.error('Reset password:', e);
          setError('Network error. Please try again.');
        } finally { setLoading(false); }
      };

      const goToLogin = () => {
        window.location.hash = '';
        window.location.reload();
      };

      return (
        <div className="auth-wrap">
          <div className="auth-card">
            <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'8px'}}>
              <button className="btn btn-ghost btn-sm" onClick={toggleTheme} title={`Switch to ${nextThemeLabel} mode`}>
                {React.createElement(Icon[THEME_ICON[theme]] || Icon.moon)}
              </button>
            </div>
            <div className="auth-logo">
              <h1>futurega.me</h1>
              <p>set new password</p>
            </div>

            {error && <div className="alert alert-error">{error}</div>}
            {success && <div className="alert alert-success">{success}</div>}

            {!success ? (
              <form onSubmit={handleSubmit}>
                <div className="form-field">
                  <label>New Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="Min. 8 characters" required minLength="8" autoComplete="new-password" />
                </div>
                <div className="form-field">
                  <label>Confirm Password</label>
                  <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Repeat your password" required minLength="8" autoComplete="new-password" />
                </div>
                <button type="submit" className="btn btn-primary btn-full"
                  style={{marginTop:'8px'}} disabled={loading}>
                  {loading ? 'Updating...' : 'Set New Password'}
                </button>
              </form>
            ) : (
              <button onClick={goToLogin} className="btn btn-primary btn-full" style={{marginTop:'8px'}}>
                Go to Sign In
              </button>
            )}
          </div>
        </div>
      );
    }

    // ══════════════════════════════════════════════════════════
    // ── SOCIAL OVERLAY UI COMPONENTS ───────────────────────
    // ══════════════════════════════════════════════════════════

    function ShareMenu({ trackingData, tournaments, mySchedule, myActiveUpdates, onClose, onOpenWrapUp }) {
      const scorecardData = useMemo(() => computeScorecardData(trackingData, null, tournaments), [trackingData, tournaments]);

      const hasTrackingData = trackingData && trackingData.length > 0;
      const hasActiveUpdate = myActiveUpdates && myActiveUpdates.some(u => !u.is_busted);

      // Find next upcoming event from schedule
      const nextEvent = useMemo(() => {
        if (!mySchedule || mySchedule.length === 0) return null;
        const now = Date.now();
        const parseTs = (t) => t.venue ? parseDateTimeInTz(t.date, t.time, t.venue) : parseDateTime(t.date, t.time);
        return [...mySchedule]
          .filter(t => {
            if (!t.date) return false;
            const ts = parseTs(t);
            return !isNaN(ts) && ts > now;
          })
          .sort((a, b) => parseTs(a) - parseTs(b))[0] || null;
      }, [mySchedule]);

      // Countdown text for next event
      const nextCountdown = useMemo(() => {
        if (!nextEvent) return null;
        const ts = nextEvent.venue ? parseDateTimeInTz(nextEvent.date, nextEvent.time, nextEvent.venue) : parseDateTime(nextEvent.date, nextEvent.time);
        if (isNaN(ts)) return '\u2014';
        const diff = ts - Date.now();
        if (diff <= 0) return 'now';
        const hrs = Math.floor(diff / 3600000);
        const mins = Math.floor((diff % 3600000) / 60000);
        if (hrs > 24) return Math.floor(hrs / 24) + 'd ' + (hrs % 24) + 'h';
        if (hrs > 0) return hrs + 'h ' + mins + 'm';
        return mins + 'm';
      }, [nextEvent]);

      // Find two upcoming events for poll
      const nextTwoEvents = useMemo(() => {
        if (!mySchedule || mySchedule.length < 2) return null;
        const now = new Date();
        const upcoming = [...mySchedule]
          .filter(t => {
            if (!t.date) return false;
            return new Date(t.date + 'T23:59:59') >= now;
          })
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .slice(0, 2);
        return upcoming.length === 2 ? upcoming : null;
      }, [mySchedule]);

      const handleGenerate = async (type) => {
        const canvas = document.createElement('canvas');
        let ctx, filename;

        if (type === 'scorecard') {
          canvas.width = 1080; canvas.height = 1080;
          ctx = canvas.getContext('2d');
          drawSeriesScorecard(ctx, 1080, 1080, scorecardData);
          filename = 'series-scorecard.png';
        } else if (type === 'countdown') {
          if (!nextEvent) return;
          canvas.width = 1080; canvas.height = 1920;
          ctx = canvas.getContext('2d');
          drawCountdownStory(ctx, 1080, 1920, {
            tournamentName: nextEvent.event_name,
            buyin: nextEvent.buyin,
            venue: nextEvent.venue,
            gameType: nextEvent.game_variant,
            timeUntil: nextCountdown,
            date: nextEvent.date,
            time: nextEvent.time
          });
          filename = 'next-event.png';
        } else if (type === 'wrapup') {
          // Open the multi-slide wrap-up viewer
          onClose();
          if (onOpenWrapUp) onOpenWrapUp();
          return;
        } else if (type === 'poll-events') {
          if (!nextTwoEvents) return;
          canvas.width = 1080; canvas.height = 1920;
          ctx = canvas.getContext('2d');
          drawPollEventVsEvent(ctx, 1080, 1920, {
            event1: { name: nextTwoEvents[0].event_name, buyin: nextTwoEvents[0].buyin, time: nextTwoEvents[0].time },
            event2: { name: nextTwoEvents[1].event_name, buyin: nextTwoEvents[1].buyin, time: nextTwoEvents[1].time }
          });
          filename = 'poll-events.png';
        } else {
          return;
        }

        await shareOrDownloadCanvas(canvas, filename);
        onClose();
      };

      return ReactDOM.createPortal(
        React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'share-menu-backdrop', onClick: onClose }),
          React.createElement('div', { className: 'share-menu-panel' },
            React.createElement('h3', null, 'Share & Social'),
            React.createElement('div', { className: 'share-menu-grid' },
              // Scorecard
              React.createElement('div', {
                className: 'share-menu-item' + (!hasTrackingData ? ' disabled' : ''),
                onClick: () => hasTrackingData && handleGenerate('scorecard')
              },
                React.createElement('span', { className: 'share-icon' }, '\u{1F4CA}'),
                React.createElement('span', { className: 'share-label' }, 'Series Scorecard'),
                React.createElement('span', { className: 'share-desc' }, 'Stats card with P&L, ROI, streak')
              ),
              // Countdown
              React.createElement('div', {
                className: 'share-menu-item' + (!nextEvent ? ' disabled' : ''),
                onClick: () => nextEvent && handleGenerate('countdown')
              },
                React.createElement('span', { className: 'share-icon' }, '\u23F0'),
                React.createElement('span', { className: 'share-label' }, 'Next Event'),
                React.createElement('span', { className: 'share-desc' }, 'Countdown story graphic')
              ),
              // Wrap-up
              React.createElement('div', {
                className: 'share-menu-item' + (!hasTrackingData ? ' disabled' : ''),
                onClick: () => hasTrackingData && handleGenerate('wrapup')
              },
                React.createElement('span', { className: 'share-icon' }, '\u{1F3AC}'),
                React.createElement('span', { className: 'share-label' }, 'Series Wrap'),
                React.createElement('span', { className: 'share-desc' }, 'Spotify Wrapped style recap')
              ),
              // Poll: Event vs Event
              React.createElement('div', {
                className: 'share-menu-item' + (!nextTwoEvents ? ' disabled' : ''),
                onClick: () => nextTwoEvents && handleGenerate('poll-events')
              },
                React.createElement('span', { className: 'share-icon' }, '\u{1F4CA}'),
                React.createElement('span', { className: 'share-label' }, 'Event Poll'),
                React.createElement('span', { className: 'share-desc' }, 'A vs B poll template')
              ),
              // Import from Hendon Mob placeholder
              React.createElement('div', {
                className: 'share-menu-item disabled',
                onClick: () => {}
              },
                React.createElement('span', { className: 'share-icon' }, '\u{1F30D}'),
                React.createElement('span', { className: 'share-label' }, 'Import Hendon Mob'),
                React.createElement('span', { className: 'share-desc' }, 'Coming soon')
              )
            )
          )
        ),
        document.body
      );
    }

    // ── Series Wrap-Up Viewer (multi-slide) ──
    function WrapUpViewer({ trackingData, tournaments, onClose }) {
      const [currentSlide, setCurrentSlide] = useState(0);
      const data = useMemo(() => computeScorecardData(trackingData, null, tournaments), [trackingData, tournaments]);

      const slideNames = ['Overview', 'Numbers', 'Best Moment', 'Game Mix', 'Fun Facts'];
      const slideFns = [drawWrapSlide1, drawWrapSlide2, drawWrapSlide3, drawWrapSlide4, drawWrapSlide5];

      const handleShare = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1080; canvas.height = 1920;
        const ctx = canvas.getContext('2d');
        slideFns[currentSlide](ctx, 1080, 1920, data);
        await shareOrDownloadCanvas(canvas, 'series-wrap-' + (currentSlide + 1) + '.png');
      };

      const handleShareAll = async () => {
        for (let i = 0; i < slideFns.length; i++) {
          const canvas = document.createElement('canvas');
          canvas.width = 1080; canvas.height = 1920;
          const ctx = canvas.getContext('2d');
          slideFns[i](ctx, 1080, 1920, data);
          await shareOrDownloadCanvas(canvas, 'series-wrap-' + (i + 1) + '.png');
        }
      };

      // Preview canvas
      const previewRef = useRef(null);
      useEffect(() => {
        const cvs = previewRef.current;
        if (!cvs) return;
        cvs.width = 1080; cvs.height = 1920;
        const ctx = cvs.getContext('2d');
        slideFns[currentSlide](ctx, 1080, 1920, data);
      }, [currentSlide, data]);

      return ReactDOM.createPortal(
        React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'share-menu-backdrop', onClick: onClose }),
          React.createElement('div', { className: 'share-menu-panel', style: { maxHeight: '85vh' } },
            React.createElement('h3', null, 'Series Wrap-Up'),
            React.createElement('div', { className: 'wrapup-slide-picker' },
              slideNames.map((name, i) =>
                React.createElement('button', {
                  key: i,
                  className: currentSlide === i ? 'active' : '',
                  onClick: () => setCurrentSlide(i)
                }, name)
              )
            ),
            React.createElement('div', { style: { textAlign: 'center', margin: '12px 0' } },
              React.createElement('canvas', {
                ref: previewRef,
                style: { width: '200px', height: '356px', borderRadius: '8px', border: '1px solid var(--border)' }
              })
            ),
            React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } },
              React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: handleShare }, 'Share This Slide'),
              React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: handleShareAll }, 'Download All'),
              React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: onClose }, 'Close')
            )
          )
        ),
        document.body
      );
    }

    // ── Schedule Export Modal ──
    function ScheduleExportModal({ events, onClose }) {
      const [mode, setMode] = useState('menu'); // menu | preview
      const [canvases, setCanvases] = useState([]);
      const [currentSlide, setCurrentSlide] = useState(0);
      const [generating, setGenerating] = useState(false);
      const previewRef = useRef(null);

      // ── Export customization state ──
      const [docTitle, setDocTitle] = useState('MY SCHEDULE');

      // Derive unique venues present in the schedule
      const venueList = useMemo(() => {
        const seen = new Map();
        events.forEach(e => {
          const v = getVenueInfo(e.venue);
          if (!seen.has(v.abbr)) seen.set(v.abbr, { longName: v.longName || v.abbr, color: v.color || '#808080' });
        });
        return [...seen.entries()]; // [[abbr, {longName, color}], ...]
      }, [events]);

      const [selectedVenues, setSelectedVenues] = useState(() => new Set(venueList.map(([a]) => a)));
      const [excludeSatellites, setExcludeSatellites] = useState(false);
      const [lightMode, setLightMode] = useState(false);
      const [groupByBuyin, setGroupByBuyin] = useState(false);
      const DEFAULT_BUYIN_RANGES = [
        { label: 'Up to $1,500', min: 0, max: 1500 },
        { label: 'Up to $3,000', min: 1501, max: 3000 },
        { label: '$5,000 \u2013 $10,000', min: 5000, max: 10000 },
        { label: '$25,000+', min: 25000, max: Infinity },
      ];
      const [buyinRanges, setBuyinRanges] = useState(DEFAULT_BUYIN_RANGES);

      const allSelected = selectedVenues.size === venueList.length;
      const toggleAll = () => {
        if (allSelected) setSelectedVenues(new Set());
        else setSelectedVenues(new Set(venueList.map(([a]) => a)));
      };
      const toggleVenue = (abbr) => {
        setSelectedVenues(prev => {
          const next = new Set(prev);
          if (next.has(abbr)) next.delete(abbr); else next.add(abbr);
          return next;
        });
      };

      // Filtered events based on selected venues + satellite exclusion
      const filteredEvents = useMemo(() =>
        events.filter(e => selectedVenues.has(getVenueInfo(e.venue).abbr) && (!excludeSatellites || !e.is_satellite)),
        [events, selectedVenues, excludeSatellites]
      );

      const handlePDF = async () => {
        if (!filteredEvents.length) return;
        try {
          await generateSchedulePDF(filteredEvents, docTitle, { light: lightMode, groupByBuyin, buyinRanges: groupByBuyin ? buyinRanges : undefined });
          onClose();
        } catch (err) {
          console.error('PDF generation failed:', err);
          alert('PDF generation failed: ' + (err.message || 'Unknown error'));
        }
      };

      const handleImages = () => {
        if (!filteredEvents.length) return;
        setGenerating(true);
        setTimeout(() => {
          const imgs = generateScheduleImages(filteredEvents, docTitle, { light: lightMode });
          setCanvases(imgs);
          setMode('preview');
          setGenerating(false);
        }, 50);
      };

      // Render preview canvas when slide changes
      useEffect(() => {
        if (mode !== 'preview' || !previewRef.current || canvases.length === 0) return;
        const cvs = previewRef.current;
        cvs.width = 1080; cvs.height = 1920;
        const ctx = cvs.getContext('2d');
        ctx.drawImage(canvases[currentSlide], 0, 0);
      }, [mode, currentSlide, canvases]);

      const handleShareSlide = async () => {
        if (canvases[currentSlide]) {
          await shareOrDownloadCanvas(canvases[currentSlide], 'my-schedule-' + (currentSlide + 1) + '.png');
        }
      };

      const handleDownloadAll = async () => {
        for (let i = 0; i < canvases.length; i++) {
          await shareOrDownloadCanvas(canvases[i], 'my-schedule-' + (i + 1) + '.png');
          if (i < canvases.length - 1) await new Promise(r => setTimeout(r, 400));
        }
      };

      return ReactDOM.createPortal(
        React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'share-menu-backdrop', onClick: onClose }),
          React.createElement('div', { className: 'share-menu-panel', style: { maxHeight: '85vh' } },
            mode === 'menu' ? React.createElement(React.Fragment, null,
              React.createElement('h3', null, 'Export Schedule'),

              // ── Document title input ──
              React.createElement('div', { className: 'filter-group', style: { marginBottom: '12px' } },
                React.createElement('label', null, 'Document Title'),
                React.createElement('input', {
                  type: 'text',
                  value: docTitle,
                  onChange: e => setDocTitle(e.target.value),
                  placeholder: 'MY SCHEDULE',
                  style: { padding: '8px 12px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Univers Condensed', 'Univers', sans-serif", fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }
                })
              ),

              // ── Series filter checkboxes ──
              React.createElement('div', { style: { marginBottom: '12px' } },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
                  React.createElement('label', { style: { fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' } }, 'Include Series'),
                  React.createElement('button', {
                    onClick: toggleAll,
                    style: { background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: "'Univers Condensed', 'Univers', sans-serif", padding: 0 }
                  }, allSelected ? 'None' : 'All')
                ),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '140px', overflowY: 'auto' } },
                  venueList.map(([abbr, info]) =>
                    React.createElement('label', {
                      key: abbr,
                      style: { fontSize: '0.82rem', fontFamily: "'Univers Condensed', 'Univers', sans-serif", fontWeight: 500, color: info.color, cursor: 'pointer', userSelect: 'none', display: 'flex', alignItems: 'center', gap: '8px' }
                    },
                      React.createElement('input', {
                        type: 'checkbox',
                        checked: selectedVenues.has(abbr),
                        onChange: () => toggleVenue(abbr),
                        style: { width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }
                      }),
                      info.longName
                    )
                  )
                ),
              ),

              // ── Exclude satellites + event count row ──
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
                React.createElement('label', {
                  style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontFamily: "'Univers Condensed', 'Univers', sans-serif", fontWeight: 500, color: 'var(--text)', cursor: 'pointer' }
                },
                  React.createElement('input', {
                    type: 'checkbox',
                    checked: excludeSatellites,
                    onChange: e => setExcludeSatellites(e.target.checked),
                    style: { width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }
                  }),
                  'Exclude Satellites'
                ),
                React.createElement('span', {
                  style: { fontSize: '0.72rem', color: 'var(--text-muted)' }
                }, filteredEvents.length + ' event' + (filteredEvents.length !== 1 ? 's' : ''))
              ),

              // ── Light mode toggle ──
              React.createElement('label', {
                style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontFamily: "'Univers Condensed', 'Univers', sans-serif", fontWeight: 500, color: 'var(--text)', cursor: 'pointer', marginBottom: '12px' }
              },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: lightMode,
                  onChange: e => setLightMode(e.target.checked),
                  style: { width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }
                }),
                'Export in Light Mode'
              ),

              // ── Group by buy-in range toggle ──
              React.createElement('label', {
                style: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.82rem', fontFamily: "'Univers Condensed', 'Univers', sans-serif", fontWeight: 500, color: 'var(--text)', cursor: 'pointer', marginBottom: groupByBuyin ? '8px' : '12px' }
              },
                React.createElement('input', {
                  type: 'checkbox',
                  checked: groupByBuyin,
                  onChange: e => setGroupByBuyin(e.target.checked),
                  style: { width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' }
                }),
                'Group by Buy-in Range'
              ),

              // ── Buy-in range editor (visible when groupByBuyin is on) ──
              groupByBuyin && React.createElement('div', {
                style: { marginBottom: '12px', padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }
              },
                React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } },
                  React.createElement('span', { style: { fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: "'Univers Condensed', 'Univers', sans-serif" } }, 'Ranges'),
                  React.createElement('button', {
                    onClick: () => setBuyinRanges(prev => [...prev, { min: 0, max: 0, label: '' }]),
                    style: { background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', cursor: 'pointer', fontFamily: "'Univers Condensed', 'Univers', sans-serif", padding: 0 }
                  }, '+ Add Range')
                ),
                React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
                  buyinRanges.map((range, idx) =>
                    React.createElement('div', { key: idx, style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                      React.createElement('input', {
                        type: 'text',
                        value: range.label,
                        onChange: e => {
                          const next = [...buyinRanges];
                          next[idx] = { ...next[idx], label: e.target.value };
                          setBuyinRanges(next);
                        },
                        placeholder: 'Label',
                        style: { flex: 1, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Univers Condensed', 'Univers', sans-serif", fontSize: '0.78rem' }
                      }),
                      React.createElement('input', {
                        type: 'number',
                        value: range.min === 0 ? '0' : range.min,
                        onChange: e => {
                          const next = [...buyinRanges];
                          next[idx] = { ...next[idx], min: Number(e.target.value) || 0 };
                          setBuyinRanges(next);
                        },
                        placeholder: 'Min',
                        style: { width: '55px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Univers Condensed', 'Univers', sans-serif", fontSize: '0.78rem', textAlign: 'right' }
                      }),
                      React.createElement('span', { style: { fontSize: '0.72rem', color: 'var(--text-muted)' } }, '\u2013'),
                      React.createElement('input', {
                        type: 'text',
                        value: range.max === Infinity ? '' : range.max,
                        onChange: e => {
                          const next = [...buyinRanges];
                          const val = e.target.value.trim();
                          next[idx] = { ...next[idx], max: val === '' ? Infinity : (Number(val) || 0) };
                          setBuyinRanges(next);
                        },
                        placeholder: '\u221E',
                        style: { width: '55px', padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg)', color: 'var(--text)', fontFamily: "'Univers Condensed', 'Univers', sans-serif", fontSize: '0.78rem', textAlign: 'right' }
                      }),
                      buyinRanges.length > 1 && React.createElement('button', {
                        onClick: () => setBuyinRanges(prev => prev.filter((_, i) => i !== idx)),
                        style: { background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.9rem', padding: '0 2px', lineHeight: 1 }
                      }, '\u00D7')
                    )
                  )
                ),
                React.createElement('button', {
                  onClick: () => setBuyinRanges(DEFAULT_BUYIN_RANGES),
                  style: { marginTop: '6px', background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.68rem', cursor: 'pointer', fontFamily: "'Univers Condensed', 'Univers', sans-serif", padding: 0 }
                }, 'Reset to Defaults')
              ),

              // ── Total max buyins ──
              (() => {
                const totalMax = filteredEvents.reduce((sum, e) => {
                  if (e.is_restart) return sum;
                  const buyin = Number(e.buyin) || 0;
                  const entries = e.planned_entries || 1;
                  return sum + buyin * entries;
                }, 0);
                return totalMax > 0 ? React.createElement('div', {
                  style: { marginBottom: '12px', padding: '10px 12px', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }
                },
                  React.createElement('div', { style: { fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px', fontFamily: "'Univers Condensed', 'Univers', sans-serif" } }, 'Total Maximum Buy-ins'),
                  React.createElement('div', { style: { fontSize: '1.1rem', fontWeight: 700, color: 'var(--text)', fontFamily: "'Univers Condensed', 'Univers', sans-serif" } }, '$' + totalMax.toLocaleString())
                ) : null;
              })(),

              // ── Export buttons ──
              React.createElement('div', { className: 'export-options' },
                React.createElement('button', {
                  className: 'export-option-btn',
                  onClick: handlePDF,
                  disabled: !filteredEvents.length
                },
                  React.createElement('span', { className: 'export-option-icon' }, '\uD83D\uDCC4'),
                  React.createElement('div', null,
                    React.createElement('div', { className: 'export-option-label' }, 'Download PDF'),
                    React.createElement('div', { className: 'export-option-desc' }, 'Table layout, great for printing')
                  )
                ),
                React.createElement('button', {
                  className: 'export-option-btn',
                  onClick: handleImages,
                  disabled: generating || !filteredEvents.length
                },
                  React.createElement('span', { className: 'export-option-icon' }, generating ? '\u23F3' : '\uD83D\uDDBC\uFE0F'),
                  React.createElement('div', null,
                    React.createElement('div', { className: 'export-option-label' }, generating ? 'Generating...' : 'Download Images'),
                    React.createElement('div', { className: 'export-option-desc' }, 'Story-sized, perfect for sharing')
                  )
                )
              ),
              React.createElement('div', { style: { textAlign: 'center', marginTop: '12px' } },
                React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: onClose }, 'Cancel')
              )
            ) : React.createElement(React.Fragment, null,
              React.createElement('h3', null, 'Schedule Images'),
              canvases.length > 1 && React.createElement('div', { className: 'wrapup-slide-picker' },
                canvases.map((_, i) =>
                  React.createElement('button', {
                    key: i,
                    className: currentSlide === i ? 'active' : '',
                    onClick: () => setCurrentSlide(i)
                  }, 'Page ' + (i + 1))
                )
              ),
              React.createElement('div', { style: { textAlign: 'center', margin: '12px 0' } },
                React.createElement('canvas', {
                  ref: previewRef,
                  style: { width: '200px', height: '356px', borderRadius: '8px', border: '1px solid var(--border)' }
                })
              ),
              React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } },
                React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: handleShareSlide }, canvases.length > 1 ? 'Share This Page' : 'Share Image'),
                canvases.length > 1 && React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: handleDownloadAll }, 'Download All'),
                React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: () => { setMode('menu'); setCanvases([]); setCurrentSlide(0); } }, 'Back')
              )
            )
          )
        ),
        document.body
      );
    }

    // ── Milestone Celebration Modal ──
    function MilestoneCelebration({ milestone, onShare, onDismiss }) {
      if (!milestone) return null;

      const icons = {
        'break-even': '\u2696\uFE0F',
        'first-profit': '\u{1F4B0}',
        'career-high': '\u{1F3C6}',
        'game-best': '\u{1F3AF}'
      };

      const handleShare = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1080; canvas.height = 1080;
        const ctx = canvas.getContext('2d');
        drawMilestoneImage(ctx, 1080, 1080, milestone);
        await shareOrDownloadCanvas(canvas, 'milestone.png');
        if (onShare) onShare();
      };

      return ReactDOM.createPortal(
        React.createElement('div', { className: 'milestone-modal-backdrop', onClick: onDismiss },
          React.createElement('div', { className: 'milestone-modal', onClick: e => e.stopPropagation() },
            React.createElement('div', { className: 'milestone-icon' }, icons[milestone.type] || '\u2B50'),
            React.createElement('div', { className: 'milestone-title' }, milestone.title),
            React.createElement('div', { className: 'milestone-desc' }, milestone.description),
            milestone.value && React.createElement('div', {
              style: { fontSize: '1.5rem', fontWeight: 700, color: '#22c55e', fontFamily: "'Univers Condensed','Univers',sans-serif", marginBottom: '16px' }
            }, milestone.value),
            React.createElement('div', { className: 'milestone-actions' },
              React.createElement('button', { className: 'btn btn-primary btn-sm', onClick: handleShare }, 'Share'),
              React.createElement('button', { className: 'btn btn-ghost btn-sm', onClick: onDismiss }, 'Dismiss')
            )
          )
        ),
        document.body
      );
    }

    // ══════════════════════════════════════════════════════════
    // ── END SOCIAL OVERLAY UI COMPONENTS ───────────────────
    // ══════════════════════════════════════════════════════════

    // ── Tracking Entry Form ─────────────────────────────────────

    function TrackingEntryForm({ tournaments, mySchedule, existingEntryIds, initialValues, tournamentLabel, entryForPOY, onSubmit, onCancel, isEdit }) {
      const [tournamentId, setTournamentId] = useState(initialValues?.tournamentId || '');
      const [numEntries, setNumEntries] = useState(initialValues?.numEntries || 1);
      const [cashed, setCashed] = useState(initialValues?.cashed || false);
      const [finishPlace, setFinishPlace] = useState(initialValues?.finishPlace || '');
      const [cashAmount, setCashAmount] = useState(initialValues?.cashAmount || '');
      const [notes, setNotes] = useState(initialValues?.notes || '');
      const [totalFieldSize, setTotalFieldSize] = useState(initialValues?.totalEntries || '');
      const [showLfg, setShowLfg] = useState(false);

      const tournamentOptions = useMemo(() => {
        if (isEdit) return [];
        const scheduleIds = new Set((mySchedule || []).map(t => t.id));
        return (tournaments || [])
          .filter(t => !existingEntryIds || !existingEntryIds.has(t.id))
          .sort((a, b) => {
            const aS = scheduleIds.has(a.id) ? 0 : 1;
            const bS = scheduleIds.has(b.id) ? 0 : 1;
            if (aS !== bS) return aS - bS;
            return new Date(a.date) - new Date(b.date);
          });
      }, [tournaments, mySchedule, existingEntryIds, isEdit]);

      const showFieldSize = useMemo(() => {
        if (isEdit && entryForPOY) return isPOYEligible(entryForPOY);
        if (!tournamentId || !tournaments) return false;
        const t = tournaments.find(t => t.id === parseInt(tournamentId));
        return t ? isPOYEligible(t) : false;
      }, [isEdit, entryForPOY, tournamentId, tournaments]);

      const handleSubmit = (e) => {
        e.preventDefault();
        if (!isEdit && !tournamentId) return;
        onSubmit({
          tournamentId: parseInt(tournamentId),
          numEntries: parseInt(numEntries) || 1,
          cashed,
          finishPlace: cashed && finishPlace ? parseInt(finishPlace) : null,
          cashAmount: cashed && cashAmount ? parseInt(cashAmount) : 0,
          notes: notes || null,
          totalFieldSize: totalFieldSize ? parseInt(totalFieldSize) : null
        });
      };

      return (
        <form onSubmit={handleSubmit} className="tracking-card" style={{padding:'16px',marginBottom:'12px'}}>
          <div style={{fontSize:'0.9rem',fontWeight:700,color:'var(--text)',marginBottom:'12px',fontFamily:"'Univers Condensed','Univers',sans-serif"}}>
            {isEdit ? `Edit: ${tournamentLabel}` : 'Log Tournament Result'}
          </div>

          {!isEdit && (
            <div className="filter-group" style={{marginBottom:'12px'}}>
              <label>Tournament</label>
              <select value={tournamentId} onChange={e => setTournamentId(e.target.value)} required>
                <option value="">Select event...</option>
                {tournamentOptions.map(t => (
                  <option key={t.id} value={t.id}>
                    #{t.event_number} — {t.event_name} ({t.date}) — {currencySymbol(t.venue)}{Number(t.buyin).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="tracking-form-grid">
            <div className="filter-group">
              <label>Buy-ins (incl. re-entries)</label>
              <input type="number" min="1" max="50" value={numEntries}
                onChange={e => setNumEntries(e.target.value)} />
            </div>
            <div className="filter-group">
              <label>Cashed?</label>
              <div style={{display:'flex',gap:'8px',marginTop:'4px',alignItems:'center'}}>
                <button type="button" className={`filter-chip ${!cashed ? 'active' : ''}`}
                  onClick={() => { setCashed(false); setShowLfg(false); }}>No</button>
                <button type="button" className={`filter-chip ${cashed ? 'active' : ''}`}
                  onClick={() => { if (!cashed) { setCashed(true); setShowLfg(true); setTimeout(() => setShowLfg(false), 1000); } }}>Yes</button>
                {showLfg && <span className="lfg-burst" style={{fontSize:'0.9rem',marginLeft:'4px'}}>lfg!</span>}
              </div>
            </div>
          </div>

          {cashed && (
            <div className="tracking-form-grid">
              <div className="filter-group">
                <label>Finish Place</label>
                <input type="number" min="1" value={finishPlace}
                  onChange={e => setFinishPlace(e.target.value)} placeholder="e.g. 3" />
              </div>
              <div className="filter-group">
                <label>Cash Amount ($)</label>
                <input type="number" min="0" value={cashAmount}
                  onChange={e => setCashAmount(e.target.value)} placeholder="e.g. 15000" />
              </div>
            </div>
          )}

          {showFieldSize && (
            <div className="filter-group" style={{marginBottom:'12px'}}>
              <label>Field Size (total entries)</label>
              <input type="number" min="1" value={totalFieldSize}
                onChange={e => setTotalFieldSize(e.target.value)} placeholder="e.g. 8500"
                style={{padding:'10px 12px',border:'1.5px solid var(--border)',borderRadius:'var(--radius-sm)',
                  background:'var(--bg)',color:'var(--text)',fontFamily:"'Univers Condensed','Univers',sans-serif",fontSize:'0.9rem',width:'100%'}} />
              <span style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:'2px',display:'block'}}>
                Used for POY points calculation
              </span>
            </div>
          )}

          <div className="filter-group" style={{marginBottom:'14px'}}>
            <label>Notes (optional)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Optional notes about this session"
              style={{padding:'10px 12px',border:'1.5px solid var(--border)',borderRadius:'var(--radius-sm)',
                background:'var(--bg)',color:'var(--text)',fontFamily:"'Univers Condensed','Univers',sans-serif",fontSize:'0.9rem',width:'100%'}} />
          </div>

          <div style={{display:'flex',gap:'8px'}}>
            <button type="submit" className="btn btn-primary btn-sm">
              {isEdit ? 'Save Changes' : 'Log Result'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          </div>
        </form>
      );
    }

    // ── Tracking Entry Row ────────────────────────────────────

    function TrackingEntryRow({ entry, onEdit, onDelete, isEditing, onUpdate, onCancelEdit, displayCurrency, exchangeRates }) {
      const from = nativeCurrency(entry.venue);
      const to = displayCurrency === 'NATIVE' ? from : displayCurrency;
      const cv = (val) => convertAmount(val, from, to, exchangeRates);
      const fmt = (val) => formatCurrencyAmount(val, to);
      const fmtSigned = (val) => { const c = cv(val); return (c >= 0 ? '+' : '') + formatCurrencyAmount(c, to); };

      const totalCost = (entry.buyin || 0) * (entry.num_entries || 1);
      const profit = (entry.cash_amount || 0) - totalCost;
      const poyEligible = isPOYEligible(entry);
      const poyPoints = poyEligible
        ? calculatePOYPoints(entry.buyin, entry.finish_place, entry.total_entries, !!entry.cashed, entry.event_name)
        : null;

      if (isEditing) {
        return (
          <TrackingEntryForm
            initialValues={{
              tournamentId: entry.tournament_id,
              numEntries: entry.num_entries,
              cashed: !!entry.cashed,
              finishPlace: entry.finish_place,
              cashAmount: entry.cash_amount,
              notes: entry.notes,
              totalEntries: entry.total_entries
            }}
            entryForPOY={entry}
            tournamentLabel={`#${entry.event_number} ${entry.event_name}`}
            onSubmit={onUpdate}
            onCancel={onCancelEdit}
            isEdit
          />
        );
      }

      return (
        <div className="tracking-card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'6px'}}>
            <div>
              <div style={{fontSize:'0.72rem',color:'var(--text-muted)',fontFamily:"'Univers Condensed','Univers',sans-serif",letterSpacing:'0.03em'}}>
                {entry.date} · #{entry.event_number}
              </div>
              <div style={{fontSize:'0.88rem',fontWeight:600,color:'var(--text)',marginTop:'2px',fontFamily:"'Univers Condensed','Univers',sans-serif"}}>
                {entry.event_name}
              </div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontFamily:"var(--serif)",fontSize:'1rem',fontWeight:700}}
                className={profit >= 0 && entry.cashed ? 'tracking-profit-pos' : 'tracking-profit-neg'}>
                {fmtSigned(profit)}
              </div>
            </div>
          </div>

          <div className="cal-detail-grid" style={{marginBottom:'8px'}}>
            <div className="cal-detail-item">
              <span className="cal-detail-label">Cost</span>
              <span className="cal-detail-value">{fmt(cv(totalCost))}</span>
            </div>
            <div className="cal-detail-item">
              <span className="cal-detail-label">Entries</span>
              <span className="cal-detail-value">{entry.num_entries || 1}</span>
            </div>
            {entry.cashed ? (
              <React.Fragment>
                <div className="cal-detail-item">
                  <span className="cal-detail-label">Cashed</span>
                  <span className="cal-detail-value">{fmt(cv(entry.cash_amount))}</span>
                </div>
                <div className="cal-detail-item">
                  <span className="cal-detail-label">Finish</span>
                  <span className="cal-detail-value">{entry.finish_place ? `${entry.finish_place}${getOrdinal(entry.finish_place)}` : '—'}</span>
                </div>
              </React.Fragment>
            ) : (
              <div className="cal-detail-item">
                <span className="cal-detail-label">Result</span>
                <span className="cal-detail-value" style={{color:'var(--text-muted)'}}>No cash</span>
              </div>
            )}
            {poyEligible && (
              <div className="cal-detail-item">
                <span className="cal-detail-label">POY Pts</span>
                <span className={`cal-detail-value ${poyPoints > 0 ? 'tracking-poy' : ''}`}>
                  {poyPoints !== null ? poyPoints.toFixed(1) : '—'}
                </span>
              </div>
            )}
          </div>

          {poyEligible && !entry.total_entries && (
            <p style={{fontSize:'0.72rem',color:'#d97706',marginBottom:'4px'}}>
              ⚑ Edit to add field size for POY points
            </p>
          )}

          {entry.notes && (
            <p style={{fontSize:'0.78rem',color:'var(--text-muted)',fontStyle:'italic',marginBottom:'8px'}}>{entry.notes}</p>
          )}

          <div style={{display:'flex',gap:'8px'}}>
            <button className="btn btn-ghost btn-sm" onClick={onEdit}>Edit</button>
            <button className="btn btn-ghost btn-sm" style={{color:'var(--accent2)'}} onClick={onDelete}>Delete</button>
          </div>
        </div>
      );
    }

    // ── Tracking View ─────────────────────────────────────────

    function TrackingView({ trackingData, tournaments, mySchedule, onAdd, onUpdate, onDelete, myActiveUpdates }) {
      const [showAddForm, setShowAddForm] = useState(false);
      const [editingId, setEditingId] = useState(null);
      const [pendingFormId, setPendingFormId] = useState(null);
      const [showShareMenu, setShowShareMenu] = useState(false);
      const [showWrapUp, setShowWrapUp] = useState(false);
      const [displayCurrency, setDisplayCurrency] = useState(
        () => localStorage.getItem('trackingCurrency') || 'NATIVE'
      );
      const [exchangeRates, setExchangeRates] = useState(null);
      const [ratesStale, setRatesStale] = useState(false);

      useEffect(() => {
        fetch(API_URL + '/exchange-rates')
          .then(r => r.json())
          .then(data => { setExchangeRates(data.rates); setRatesStale(data.stale); })
          .catch(() => { setExchangeRates({ EUR:0.91, GBP:0.79, CAD:1.36, AUD:1.53, JPY:149.5, USD:1 }); setRatesStale(true); });
      }, []);

      const onCurrencyChange = useCallback((c) => {
        setDisplayCurrency(c);
        localStorage.setItem('trackingCurrency', c);
      }, []);

      const stats = useMemo(() => {
        let totalBuyins = 0, totalCashes = 0, eventsCashed = 0;
        const poyScores = [];
        for (const e of trackingData) {
          const from = nativeCurrency(e.venue);
          const to = displayCurrency === 'NATIVE' ? from : displayCurrency;
          const cost = (e.buyin || 0) * (e.num_entries || 1);
          totalBuyins += convertAmount(cost, from, to, exchangeRates);
          if (e.cashed) { totalCashes += convertAmount(e.cash_amount || 0, from, to, exchangeRates); eventsCashed++; }
          if (isPOYEligible(e)) {
            const pts = calculatePOYPoints(e.buyin, e.finish_place, e.total_entries, !!e.cashed, e.event_name);
            if (pts !== null) poyScores.push(pts);
          }
        }
        const profit = totalCashes - totalBuyins;
        const roi = totalBuyins > 0 ? ((profit / totalBuyins) * 100) : 0;
        poyScores.sort((a, b) => b - a);
        const totalPOY = poyScores.slice(0, 15).reduce((s, p) => s + p, 0);
        return { totalBuyins, totalCashes, profit, roi, totalEntries: trackingData.length, eventsCashed,
                 totalPOY, poyEventCount: poyScores.length, hasMoreThan15: poyScores.length > 15 };
      }, [trackingData, displayCurrency, exchangeRates]);

      const fmtStat = (val) => {
        const code = displayCurrency === 'NATIVE' ? 'USD' : displayCurrency;
        return formatCurrencyAmount(val, code);
      };

      const existingEntryIds = useMemo(() => new Set(trackingData.map(e => e.tournament_id)), [trackingData]);

      // Find most recent scheduled event that hasn't been tracked yet
      const pendingEvent = useMemo(() => {
        if (!mySchedule || mySchedule.length === 0) return null;
        const todayISO = getToday();
        return [...mySchedule]
          .filter(t => t.venue !== 'Personal' && !existingEntryIds.has(t.id) && normaliseDate(t.date) <= todayISO)
          .sort((a, b) => {
            const da = parseTournamentTime(a);
            const db = parseTournamentTime(b);
            return db - da; // most recent first
          })[0] || null;
      }, [mySchedule, existingEntryIds]);

      return (
        <div>
          <div className="section-header">
            <h2>Tracking</h2>
            <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
              {trackingData.length > 0 && (
                <button className="btn-share-overlay" onClick={() => setShowShareMenu(true)} title="Share & Social">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  Share
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={() => { setShowAddForm(f => !f); setEditingId(null); }}>
                {showAddForm ? 'Cancel' : '+ Log Result'}
              </button>
            </div>
          </div>

          {trackingData.length > 0 && (
            <div className="tracking-card" style={{padding:'16px',marginBottom:'12px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                <span style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Summary</span>
                {exchangeRates && (
                  <select value={displayCurrency} onChange={e => onCurrencyChange(e.target.value)}
                    style={{fontSize:'0.7rem',padding:'3px 6px',border:'1px solid var(--border)',borderRadius:'6px',
                      background:'var(--surface)',color:'var(--text)',cursor:'pointer',fontWeight:600}}>
                    <option value="NATIVE">Native</option>
                    {(exchangeRates ? Object.keys(CURRENCY_CONFIG) : ['USD','EUR']).map(c => (
                      <option key={c} value={c}>{(CURRENCY_CONFIG[c]||{}).symbol} {c}</option>
                    ))}
                  </select>
                )}
              </div>
              <div className="tracking-stats">
                <div className="cal-detail-item">
                  <span className="cal-detail-label">Total Buyins</span>
                  <span className="cal-detail-value">{fmtStat(stats.totalBuyins)}</span>
                </div>
                <div className="cal-detail-item">
                  <span className="cal-detail-label">Total Cashes</span>
                  <span className="cal-detail-value">{fmtStat(stats.totalCashes)}</span>
                </div>
                <div className="cal-detail-item">
                  <span className="cal-detail-label">Profit</span>
                  <span className={`cal-detail-value ${stats.profit >= 0 ? 'tracking-profit-pos' : 'tracking-profit-neg'}`}>
                    {stats.profit >= 0 ? '+' : '-'}{fmtStat(stats.profit)}
                  </span>
                </div>
                <div className="cal-detail-item">
                  <span className="cal-detail-label">ROI</span>
                  <span className={`cal-detail-value ${stats.roi >= 0 ? 'tracking-profit-pos' : 'tracking-profit-neg'}`}>
                    {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(1)}%
                  </span>
                </div>
                {stats.poyEventCount > 0 && (
                  <div className="cal-detail-item">
                    <span className="cal-detail-label">POY Pts{stats.hasMoreThan15 ? ' (Top 15)' : ''}</span>
                    <span className="cal-detail-value tracking-poy">{stats.totalPOY.toFixed(1)}</span>
                  </div>
                )}
              </div>
              <p style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:'8px'}}>
                {stats.totalEntries} event{stats.totalEntries !== 1 ? 's' : ''} played · {stats.eventsCashed} cash{stats.eventsCashed !== 1 ? 'es' : ''}
                {stats.poyEventCount > 0 && <> · {stats.poyEventCount} POY event{stats.poyEventCount !== 1 ? 's' : ''}</>}
                {displayCurrency !== 'NATIVE' && exchangeRates && (
                  <> · {ratesStale ? 'fallback rates' : 'live rates'}</>
                )}
              </p>
            </div>
          )}

          {pendingEvent && !showAddForm && pendingFormId !== pendingEvent.id && (
            <div className="tracking-card" style={{padding:'14px', marginBottom:'12px', border:'1.5px dashed var(--accent)'}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:'0.7rem', color:'var(--text-muted)', fontFamily:"'Univers Condensed','Univers',sans-serif", letterSpacing:'0.03em'}}>
                    {pendingEvent.date} · #{pendingEvent.event_number?.replace(/^[A-Za-z]+-/, '')}
                  </div>
                  <div style={{fontSize:'0.85rem', fontWeight:600, color:'var(--text)', marginTop:'2px', fontFamily:"'Univers Condensed','Univers',sans-serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                    {pendingEvent.event_name}
                  </div>
                  <div style={{fontSize:'0.72rem', color:'var(--text-muted)', marginTop:'2px'}}>
                    Awaiting result
                  </div>
                </div>
                <button className="btn btn-primary btn-sm" style={{flexShrink:0, marginLeft:'12px'}}
                  onClick={() => setPendingFormId(pendingEvent.id)}>
                  Log Result
                </button>
              </div>
            </div>
          )}

          {pendingFormId && pendingEvent && (
            <TrackingEntryForm
              tournaments={tournaments}
              mySchedule={mySchedule}
              existingEntryIds={existingEntryIds}
              initialValues={{ tournamentId: pendingFormId }}
              tournamentLabel={`#${(pendingEvent.event_number || '').replace(/^[A-Za-z]+-/, '')} ${pendingEvent.event_name}`}
              entryForPOY={pendingEvent}
              onSubmit={(data) => { onAdd({ ...data, tournamentId: pendingFormId }); setPendingFormId(null); }}
              onCancel={() => setPendingFormId(null)}
              isEdit
            />
          )}

          {showAddForm && (
            <TrackingEntryForm
              tournaments={tournaments}
              mySchedule={mySchedule}
              existingEntryIds={existingEntryIds}
              onSubmit={(data) => { onAdd(data); setShowAddForm(false); }}
              onCancel={() => setShowAddForm(false)}
            />
          )}

          {trackingData.length === 0 && !showAddForm && !pendingFormId ? (
            <div className="empty-state">
              <Icon.tracking />
              <h3>No results tracked yet</h3>
              <p>Tap "+ Log Result" to record your first tournament entry</p>
            </div>
          ) : (
            trackingData.map(entry => (
              <TrackingEntryRow
                key={entry.id}
                entry={entry}
                onEdit={() => setEditingId(entry.id)}
                onDelete={() => onDelete(entry.id)}
                isEditing={editingId === entry.id}
                onUpdate={(data) => { onUpdate(entry.id, data); setEditingId(null); }}
                onCancelEdit={() => setEditingId(null)}
                displayCurrency={displayCurrency}
                exchangeRates={exchangeRates}
              />
            ))
          )}

          {showShareMenu && (
            <ShareMenu
              trackingData={trackingData}
              tournaments={tournaments}
              mySchedule={mySchedule}
              myActiveUpdates={myActiveUpdates || []}
              onClose={() => setShowShareMenu(false)}
              onOpenWrapUp={() => setShowWrapUp(true)}
            />
          )}

          {showWrapUp && (
            <WrapUpViewer
              trackingData={trackingData}
              tournaments={tournaments}
              onClose={() => setShowWrapUp(false)}
            />
          )}
        </div>
      );
    }

    // ── CountdownClock (lightweight per-event ticking countdown) ──
    function CountdownClock({ startMs }) {
      const [now, setNow] = React.useState(Date.now());
      useEffect(() => {
        const diff = startMs - Date.now();
        const interval = diff < 3600000 ? 1000 : 30000;
        const id = setInterval(() => setNow(Date.now()), interval);
        return () => clearInterval(id);
      }, [startMs]);

      const diff = startMs - now;
      if (diff <= 0) return React.createElement('span', { className: 'dash-collapsed-countdown live' }, 'LIVE');

      const totalSec = Math.floor(diff / 1000);
      const d = Math.floor(totalSec / 86400);
      const h = Math.floor((totalSec % 86400) / 3600);
      const m = Math.floor((totalSec % 3600) / 60);
      const s = totalSec % 60;

      let label;
      if (d > 0) label = `${d}d ${h}h`;
      else if (h > 0) label = `${h}h ${m}m`;
      else if (m > 0) label = `${m}m ${s}s`;
      else label = `${s}s`;

      const cls = 'dash-collapsed-countdown' + (h === 0 && d === 0 ? ' soon' : '');
      return React.createElement('span', { className: cls }, label);
    }

    // ── Dashboard View ──────────────────────────────────────────

    function DashboardView({ mySchedule, myActiveUpdates, trackingData, shareBuddies, buddyLiveUpdates, buddyEvents, displayName, onPost, onDeleteUpdate, onAddTracking, onNavigate, tournaments, onToggle, onRefresh }) {
      const [selectedUpNextIdx, setSelectedUpNextIdx] = useState(0);
      const [connDropdownId, setConnDropdownId] = useState(null);
      const [now, setNow] = useState(getNow());
      const [dashCurrency, setDashCurrency] = useState(() => localStorage.getItem('trackingCurrency') || 'NATIVE');
      const [dashRates, setDashRates] = useState(null);
      const [dashRatesStale, setDashRatesStale] = useState(false);
      useEffect(() => {
        fetch(API_URL + '/exchange-rates')
          .then(r => r.json())
          .then(data => { setDashRates(data.rates); setDashRatesStale(data.stale); })
          .catch(() => { setDashRates({ EUR:0.91, GBP:0.79, CAD:1.36, AUD:1.53, JPY:149.5, USD:1 }); setDashRatesStale(true); });
      }, []);
      const onDashCurrencyChange = useCallback((c) => {
        setDashCurrency(c);
        localStorage.setItem('trackingCurrency', c);
      }, []);
      const rebuyingRef = useRef(false);
      const [bustMenuEventId, setBustMenuEventId] = useState(null);

      // Smooth swipe handling for carousel
      const swipeRef = useRef(null);       // total event count
      const swipeStart = useRef(null);     // starting X
      const swipeDx = useRef(0);           // current drag offset
      const trackRef = useRef(null);       // DOM ref to track element
      const onTouchStart = useCallback((e) => {
        swipeStart.current = e.touches[0].clientX;
        swipeDx.current = 0;
        if (trackRef.current) trackRef.current.classList.add('swiping');
      }, []);
      const onTouchMove = useCallback((e) => {
        if (swipeStart.current === null) return;
        const dx = e.touches[0].clientX - swipeStart.current;
        swipeDx.current = dx;
        if (trackRef.current) {
          const len = swipeRef.current || 1;
          // Read current index from data attribute
          const idx = parseInt(trackRef.current.dataset.idx || '0', 10);
          const pct = -(idx * 100) + (dx / trackRef.current.parentElement.offsetWidth) * 100;
          trackRef.current.style.transform = `translateX(${pct}%)`;
        }
      }, []);
      const onTouchEnd = useCallback((e) => {
        if (swipeStart.current === null) return;
        const dx = swipeDx.current;
        swipeStart.current = null;
        if (trackRef.current) trackRef.current.classList.remove('swiping');
        const threshold = 40;
        if (Math.abs(dx) < threshold) {
          // Snap back — re-apply current position with transition
          if (trackRef.current) {
            const idx = parseInt(trackRef.current.dataset.idx || '0', 10);
            trackRef.current.style.transform = `translateX(${-(idx * 100)}%)`;
          }
          return;
        }
        setSelectedUpNextIdx(i => {
          const len = swipeRef.current || 1;
          return dx < 0 ? Math.min(i + 1, len - 1) : Math.max(i - 1, 0);
        });
      }, []);

      useEffect(() => {
        const id = setInterval(() => setNow(getNow()), 1000);
        return () => clearInterval(id);
      }, []);

      const todayISO = getToday();

      // ── Build bagged events from previous days ──
      const baggedEvents = useMemo(() => {
        const bustedMap = {};
        const baggedMap = {};
        (myActiveUpdates || []).forEach(u => {
          if (u.is_busted) bustedMap[u.tournament_id] = true;
          if (u.is_bagged) baggedMap[u.tournament_id] = u;
        });
        return Object.entries(baggedMap)
          .filter(([tid]) => !bustedMap[tid])
          .map(([tid, update]) => {
            const t = (mySchedule || []).find(x => x.id === Number(tid)) || (tournaments || []).find(x => x.id === Number(tid));
            if (!t) return null;
            return { ...t, _bagUpdate: update, _type: 'bagged' };
          })
          .filter(Boolean);
      }, [myActiveUpdates, mySchedule, tournaments]);

      // ── Today's events from user schedule ──
      const todayEvents = useMemo(() => {
        return (mySchedule || [])
          .filter(t => normaliseDate(t.date) === todayISO && t.venue !== 'Personal' && !t.is_restart)
          .map(t => {
            const isBagged = baggedEvents.some(b => b.id === t.id);
            if (isBagged) return null; // Already shown as bagged
            const isAnchor = !!t.is_anchor;
            const hasCondition = !!(t.conditions_json);
            return { ...t, _type: isAnchor ? 'anchor' : (hasCondition ? 'conditional' : 'normal') };
          })
          .filter(Boolean);
      }, [mySchedule, todayISO, baggedEvents]);

      // ── Active previous-day events (not bagged, not busted, still playing) ──
      const activePrevDayEvents = useMemo(() => {
        const todayIds = new Set((mySchedule || []).filter(t => normaliseDate(t.date) === todayISO).map(t => t.id));
        const baggedIds = new Set(baggedEvents.map(b => b.id));
        return (myActiveUpdates || [])
          .filter(u => !u.is_busted && !u.is_bagged && !todayIds.has(u.tournament_id) && !baggedIds.has(u.tournament_id))
          .map(u => {
            const t = (mySchedule || []).find(x => x.id === u.tournament_id) || (tournaments || []).find(x => x.id === u.tournament_id);
            if (!t) return null;
            return { ...t, _type: 'normal' };
          })
          .filter(Boolean);
      }, [myActiveUpdates, mySchedule, tournaments, todayISO, baggedEvents]);

      // ── Combined "What's Next" list ──
      // Bagged events go to the top. If there's a bagged event, all other
      // today events become "conditional on end of that event"
      const whatsNextEvents = useMemo(() => {
        const events = [...baggedEvents, ...activePrevDayEvents];
        if (baggedEvents.length > 0) {
          // All non-bagged today events become conditional on the bagged event
          events.push(...todayEvents.map(t => ({
            ...t,
            _type: t._type === 'anchor' ? 'anchor' : 'conditional',
            _conditionalOnBag: true,
          })));
        } else {
          events.push(...todayEvents);
        }
        // Sort: bagged first, then anchors, then normal, then conditional
        const typeOrder = { bagged: 0, anchor: 1, normal: 2, conditional: 3 };
        events.sort((a, b) => (typeOrder[a._type] || 2) - (typeOrder[b._type] || 2));
        return events;
      }, [baggedEvents, activePrevDayEvents, todayEvents]);

      // ── Next upcoming event (when nothing today) ──
      const nextUpcomingEvent = useMemo(() => {
        if (whatsNextEvents.length > 0) return null;
        const today = todayISO;
        return (mySchedule || [])
          .filter(t => normaliseDate(t.date) > today && t.venue !== 'Personal' && !t.is_restart)
          .sort((a, b) => {
            const ta = a.venue ? parseDateTimeInTz(a.date, a.time, a.venue) : parseDateTime(a.date, a.time);
            const tb = b.venue ? parseDateTimeInTz(b.date, b.time, b.venue) : parseDateTime(b.date, b.time);
            return ta - tb;
          })[0] || null;
      }, [whatsNextEvents, mySchedule, todayISO]);

      // ── Parse level duration from tournament data ──
      function parseLevelDuration(t) {
        if (!t.level_duration) return null;
        const match = t.level_duration.match(/(\d+)/);
        return match ? parseInt(match[1]) : null;
      }

      // ── Check if late reg has ended ──
      function isLateRegClosed(t) {
        if (!t.late_reg_end) return false;
        const endMs = parseLateRegEnd(t.late_reg_end, t.date);
        return !isNaN(endMs) && now > endMs;
      }

      // ── Active event map (currently playing = has update, not bagged, not busted) ──
      const activeEventMap = useMemo(() => {
        const map = {};
        (myActiveUpdates || []).forEach(u => {
          if (!u.is_busted && !u.is_bagged) map[u.tournament_id] = u;
        });
        return map;
      }, [myActiveUpdates]);

      // ── Busted event map ──
      const bustedEventMap = useMemo(() => {
        const map = {};
        (myActiveUpdates || []).forEach(u => {
          if (u.is_busted) map[u.tournament_id] = u;
        });
        return map;
      }, [myActiveUpdates]);

      // ── Is anything currently being played? ──
      const hasActivePlaying = useMemo(() =>
        whatsNextEvents.some(e => !!activeEventMap[e.id]),
        [whatsNextEvents, activeEventMap]
      );

      // ── Determine the "next up" event to expand when nothing is currently playing ──
      const nextUpEventId = useMemo(() => {
        if (hasActivePlaying) return null;
        const nextUp = whatsNextEvents.find(e =>
          e._type !== 'bagged' && !bustedEventMap[e.id]
        );
        return nextUp?.id || null;
      }, [whatsNextEvents, hasActivePlaying, bustedEventMap]);

      // ── Auto-advance carousel when current event finishes (not on rebuy) ──
      const prevBustedRef = useRef(new Set());
      useEffect(() => {
        if (rebuyingRef.current) return; // skip auto-advance during rebuy
        const curBusted = new Set(Object.keys(bustedEventMap).map(Number));
        const prev = prevBustedRef.current;
        if (whatsNextEvents.length > 1) {
          const safeIdx = Math.min(selectedUpNextIdx, whatsNextEvents.length - 1);
          const current = whatsNextEvents[safeIdx];
          if (current && curBusted.has(current.id) && !prev.has(current.id)) {
            // Current event just got busted — advance to next non-busted event
            const nextIdx = whatsNextEvents.findIndex((e, i) => i !== safeIdx && !curBusted.has(e.id));
            if (nextIdx >= 0) setSelectedUpNextIdx(nextIdx);
          }
        }
        prevBustedRef.current = curBusted;
      }, [bustedEventMap, whatsNextEvents, selectedUpNextIdx]);

      // ── Render a single event card ──
      function renderEventCard(event) {
        const startMs = parseTournamentTime(event);
        const started = now >= startMs;
        const regClosed = isLateRegClosed(event);
        const levelDuration = parseLevelDuration(event);
        const blindInfo = started && levelDuration ? estimateBlindLevel(startMs, levelDuration) : null;
        const startingChips = event.starting_chips || 20000; // GUESS: default starting stack

        const currentStack = (activeEventMap[event.id]?.stack) ? Number(activeEventMap[event.id].stack) : startingChips;
        const bbCount = blindInfo ? Math.floor(currentStack / blindInfo.bb) : null;
        const hasLiveStack = !!(activeEventMap[event.id]?.stack);
        const isCurrentlyPlaying = !!activeEventMap[event.id];
        const isExpanded = true; // Always expanded in carousel mode
        const isConditionalOnPlaying = !isCurrentlyPlaying && hasActivePlaying && event._type !== 'bagged';
        const bustedUpdate = bustedEventMap[event.id];
        const isBustedDone = bustedUpdate && (bustedUpdate.bust_count || 1) >= getMaxEntries(event.reentry);

        const venueInfo = getVenueInfo(event.venue);
        const venueColor = getVenueBrandColor(venueInfo.abbr);
        const venueStripText = venueInfo.abbr === 'WSOP' ? 'var(--bg)' : 'rgba(255,255,255,0.85)';

        // NOTE: collapsed branch removed — carousel shows 1 expanded card at a time
        if (false) {
          return (
            <div key={event.id} className={'dash-event-card collapsed' + (isBustedDone ? ' done' : '') + (isConditionalOnPlaying ? ' conditional' : '') + (regClosed && event._type !== 'bagged' ? ' reg-closed' : '')}
              style={{borderColor: venueColor, cursor: 'pointer'}}
              onClick={() => {}}>
              <div className="dash-venue-strip" style={{background: venueColor, color: venueStripText}}>{venueInfo.abbr}</div>
              <div className="dash-collapsed-row">
                <span className="dash-collapsed-time">{event.time || 'TBD'}</span>
                <span className="dash-collapsed-name">{event.event_name}</span>
                {isBustedDone && <span className="dash-collapsed-tag" style={{color:'var(--text-muted)',border:'1px solid var(--border)'}}>Done</span>}
                {isConditionalOnPlaying && onToggle && (
                  <button className="dash-undo-x muted" onClick={(e) => { e.stopPropagation(); if (confirm('Remove from schedule?')) onToggle(event.id); }} title="Remove from schedule" style={{marginLeft:0}}>✕</button>
                )}
                <span className="dash-collapsed-buyin">{formatBuyin(event.buyin)}</span>
                <CountdownClock startMs={startMs} />
              </div>
              {event._type !== 'bagged' && !isBustedDone && !(isConditionalOnPlaying && regClosed) && (
                (bustedEventMap[event.id] || isConditionalOnPlaying) ? (
                  <MiniLateRegBar lateRegEnd={event.late_reg_end} date={event.date} time={event.time} venueAbbr={getVenueInfo(event.venue).abbr} venue={event.venue} openOnly />
                ) : null
              )}
            </div>
          );
        }

        const cardClass = [
          'dash-event-card',
          isBustedDone ? 'done' : '',
          event._type === 'bagged' ? 'bagged' : '',
          event._type === 'anchor' && !isConditionalOnPlaying ? 'anchor' : '',
          isConditionalOnPlaying ? 'conditional' : '',
          isCurrentlyPlaying ? 'playing' : 'next-up',
          regClosed && event._type !== 'bagged' ? 'reg-closed' : '',
        ].filter(Boolean).join(' ');

        const cardStyle = isBustedDone
          ? { borderColor: 'var(--border)' }
          : {};

        const activeUpdate = activeEventMap[event.id];
        const liveStack = activeUpdate?.stack;
        const stackBB = blindInfo && liveStack ? Math.floor(liveStack / blindInfo.bb) : null;

        return (
          <div key={event.id} className={cardClass} style={cardStyle}>
            <div className="dash-venue-strip" style={{background: venueColor, color: venueStripText}}>{venueInfo.abbr}</div>
            <div className="dash-card-content" style={isConditionalOnPlaying ? {borderColor: venueInfo.abbr === 'WSOP' ? 'var(--venue-wsop-cond)' : venueColor} : undefined}>
            {!isConditionalOnPlaying && (
              <div style={{display:'flex',flexWrap:'wrap',gap:'4px',alignItems:'center'}}>
                {event._type === 'bagged' && (
                  <span className="dash-event-tag bagged">Bagged — Day {event._bagUpdate?.bag_day || '?'}</span>
                )}
                {event._type === 'anchor' && !event._conditionalOnBag && (
                  <span className="dash-event-tag anchor">Locked In</span>
                )}
                {event._type === 'conditional' && (
                  <span className="dash-event-tag conditional">
                    {event._conditionalOnBag ? 'Conditional on bag' : 'Conditional'}
                  </span>
                )}
                {regClosed && event._type !== 'bagged' && (
                  <span className="dash-event-tag reg-closed">Reg Closed</span>
                )}
              </div>
            )}

            <div className="dash-event-header">
              <div style={{flex:1}}>
                <div className="dash-event-name">{formatEventName(event.event_name)}</div>
                {!isConditionalOnPlaying && (
                  <div className="dash-event-meta" style={{marginTop:'2px'}}>
                    <span><Icon.clock /> {event.time || 'TBD'}{event.venue ? ' ' + getVenueTzAbbr(event.venue) : ''}</span>
                  </div>
                )}
              </div>
              <div className="dash-event-buyin">{formatBuyin(event.buyin, event.venue)}</div>
              {onToggle && (
                <button className="dash-undo-x muted" onClick={(e) => { e.stopPropagation(); if (confirm('Remove from schedule?')) onToggle(event.id); }} title="Remove from schedule">✕</button>
              )}
            </div>

            {isExpanded && blindInfo && (
              <div className="dash-event-stats">
                <div className="dash-stat-box">
                  <div className="dash-stat-value">{blindInfo.ante ? `${formatChips(blindInfo.sb)}/${formatChips(blindInfo.bb)}/${formatChips(blindInfo.ante)}` : `${formatChips(blindInfo.sb)}/${formatChips(blindInfo.bb)}`}</div>
                  <div className="dash-stat-label">Level {blindInfo.level}</div>
                </div>
                <div className="dash-stat-box">
                  <div className="dash-stat-value">{currentStack.toLocaleString()}</div>
                  <div className="dash-stat-label">{bbCount ? `${bbCount} BB` : 'START STACK'}</div>
                </div>
                <div className="dash-stat-box">
                  <div className="dash-stat-value">
                    {blindInfo.remainingMin}:{String(blindInfo.remainingSec).padStart(2, '0')}
                  </div>
                  <div className="dash-stat-label">Clock</div>
                </div>
              </div>
            )}

            {event._type === 'bagged' && (() => {
              // Find the restart tournament for this bagged event
              const restartT = (tournaments || []).find(t =>
                t.is_restart && t.parent_event === event.event_number &&
                normaliseDate(t.date) > normaliseDate(event.date)
              );
              const undoBag = () => {
                const bu = event._bagUpdate;
                if (bu?.id && onDeleteUpdate) {
                  onDeleteUpdate(bu.id);
                }
              };
              if (restartT) {
                const restartMs = parseTournamentTime(restartT);
                const diffMs = restartMs - now;
                if (diffMs > 0) {
                  const h = Math.floor(diffMs / 3600000);
                  const m = Math.floor((diffMs % 3600000) / 60000);
                  return (
                    <div className="dash-restart-badge">
                      <Icon.restart /> Restart in {h}:{String(m).padStart(2, '0')}
                      <button className="dash-unbag-x" onClick={(e) => { e.stopPropagation(); if (confirm('Undo bag?')) undoBag(); }} title="Undo bag">✕</button>
                    </div>
                  );
                }
              }
              return (
                <div className="dash-restart-badge">
                  <Icon.restart /> Bagged
                  <button className="dash-unbag-x" onClick={(e) => { e.stopPropagation(); if (confirm('Undo bag?')) undoBag(); }} title="Undo bag">✕</button>
                </div>
              );
            })()}

            {event._type !== 'bagged' && (() => {
              const isActive = !!activeEventMap[event.id];
              const isBusted = !!bustedEventMap[event.id];

              if (isBusted) {
                const bustedUpdate = bustedEventMap[event.id];
                const maxEntries = getMaxEntries(event.reentry);
                const usedEntries = bustedUpdate?.bust_count || 1;
                const canRebuy = usedEntries < maxEntries && !regClosed;
                const nextBullet = usedEntries + 1;
                return (
                  <div className="dash-status-row">
                    <div className="dash-finished-badge">
                      Finished
                      <button className="dash-undo-x muted" onClick={(e) => {
                        e.stopPropagation();
                        if (bustedUpdate?.id && onDeleteUpdate && confirm('Undo finish? This will restore the event to playing.')) onDeleteUpdate(bustedUpdate.id);
                      }} title="Undo finish">✕</button>
                    </div>
                    {canRebuy ? (
                      <button className="dash-rebuy-btn" onClick={() => {
                        if (onPost) {
                          onPost({
                            tournamentId: event.id,
                            stack: event.starting_chips || 20000,
                            update_text: `Bullet ${nextBullet}`,
                            playStartedAt: new Date().toISOString(),
                          });
                        }
                      }}>Rebuys: {maxEntries >= 99 ? 'Unlimited' : maxEntries - usedEntries}</button>
                    ) : (
                      <div className="dash-no-rebuy">All entries used</div>
                    )}
                  </div>
                );
              }

              if (isActive) {
                const activeUpdate = activeEventMap[event.id];
                const bulletNum = (activeUpdate?.bust_count || 0) + 1;
                const showBustMenu = bustMenuEventId === event.id;

                const maxEntries = getMaxEntries(event.reentry);
                const canRebuy = bulletNum < maxEntries && !regClosed;

                if (showBustMenu) {
                  return (
                    <div className="dash-status-row">
                      <button className="dash-update-btn" onClick={() => setBustMenuEventId(null)}>Cancel</button>
                      {canRebuy && (
                        <button className="dash-rebuy-btn" onClick={() => {
                          haptic(25);
                          if (onPost) {
                            rebuyingRef.current = true;
                            onPost({
                              tournamentId: event.id,
                              stack: event.starting_chips || 20000,
                              update_text: `Bullet ${bulletNum + 1}`,
                              isBusted: true,
                            });
                            setTimeout(() => {
                              onPost({
                                tournamentId: event.id,
                                stack: event.starting_chips || 20000,
                                update_text: `Re-entry — Bullet ${bulletNum + 1}`,
                                playStartedAt: new Date().toISOString(),
                              });
                              setTimeout(() => { rebuyingRef.current = false; }, 500);
                            }, 300);
                          }
                          setBustMenuEventId(null);
                        }}>Rebuys: {maxEntries >= 99 ? 'Unlimited' : maxEntries - bulletNum}</button>
                      )}
                      <button className="dash-bust-btn" onClick={() => {
                        haptic(25);
                        window.dispatchEvent(new CustomEvent('openLiveUpdate', {
                          detail: { tab: 'finish', tournamentId: event.id }
                        }));
                        setBustMenuEventId(null);
                      }}>Finish</button>
                    </div>
                  );
                }

                return (
                  <div className="dash-status-stack">
                    <div className="dash-playing-badge">
                      <span className="dash-playing-dot" /> Currently Playing{bulletNum > 1 ? `; Bullet ${bulletNum}` : ''}
                      <button className="dash-undo-x" onClick={(e) => {
                        e.stopPropagation();
                        if (activeUpdate?.id && onDeleteUpdate && confirm('Undo playing status for this event?')) onDeleteUpdate(activeUpdate.id);
                      }} title="Undo start">✕</button>
                    </div>
                    <div className="dash-action-row">
                      <button className="dash-update-btn" onClick={() => {
                        window.dispatchEvent(new CustomEvent('openLiveUpdate', {
                          detail: { tab: 'update', tournamentId: event.id }
                        }));
                      }}>Update</button>
                      <button className="dash-bag-btn" onClick={() => {
                        haptic(25);
                        const nextBagDay = (activeUpdate?.bag_day || 0) + 1 || 1;
                        window.dispatchEvent(new CustomEvent('openLiveUpdate', {
                          detail: { tab: 'update', tournamentId: event.id, bag: nextBagDay }
                        }));
                      }}>Bag</button>
                      {!regClosed ? (
                        <button className="dash-bust-btn" onClick={() => { haptic(); setBustMenuEventId(event.id); }}>Bust</button>
                      ) : (
                        <button className="dash-bust-btn" onClick={() => {
                          haptic(25);
                          window.dispatchEvent(new CustomEvent('openLiveUpdate', {
                            detail: { tab: 'finish', tournamentId: event.id }
                          }));
                        }}>Finish</button>
                      )}
                    </div>
                  </div>
                );
              }

              if (regClosed) return null;
              return (
                <button
                  className="dash-start-btn"
                  onClick={() => {
                    haptic(25);
                    if (onPost) {
                      onPost({
                        tournamentId: event.id,
                        stack: event.starting_chips || 20000,
                        update_text: 'Registered — GL!',
                        playStartedAt: new Date().toISOString(),
                      });
                    }
                  }}
                >
                  <Icon.play /> Start Event
                </button>
              );
            })()}

            {event._type !== 'bagged' && !isBustedDone && !(isConditionalOnPlaying && regClosed) && (
              (bustedEventMap[event.id] || isConditionalOnPlaying) ? (
                <MiniLateRegBar
                  lateRegEnd={event.late_reg_end}
                  date={event.date}
                  time={event.time}
                  venueAbbr={getVenueInfo(event.venue).abbr}
                />
              ) : (
                <LateRegBar
                  lateRegEnd={event.late_reg_end}
                  date={event.date}
                  time={event.time}
                  venueAbbr={getVenueInfo(event.venue).abbr}
                />
              )
            )}
            </div>
          </div>
        );
      }

      // ── P&L data ──
      const plData = useMemo(() => {
        if (!trackingData || trackingData.length === 0) {
          return { invested: 0, cashed: 0, net: 0, roi: 0, count: 0, byVenue: {} };
        }
        let invested = 0;
        let cashed = 0;
        const byVenue = {};
        trackingData.forEach(entry => {
          const t = (tournaments || []).find(x => x.id === entry.tournament_id);
          const buyin = t ? t.buyin : 0;
          const venueRaw = t ? t.venue : '';
          const venue = t ? getVenueInfo(t.venue).abbr : 'Other';
          const from = nativeCurrency(venueRaw);
          const to = dashCurrency === 'NATIVE' ? from : dashCurrency;
          const entryBuyin = convertAmount(buyin * (entry.num_entries || 1), from, to, dashRates);
          const entryCash = convertAmount(entry.cash_amount || 0, from, to, dashRates);
          invested += entryBuyin;
          cashed += entryCash;
          if (!byVenue[venue]) byVenue[venue] = { invested: 0, cashed: 0 };
          byVenue[venue].invested += entryBuyin;
          byVenue[venue].cashed += entryCash;
        });
        const net = cashed - invested;
        const roi = invested > 0 ? ((net / invested) * 100) : 0;
        return { invested, cashed, net, roi, count: trackingData.length, byVenue };
      }, [trackingData, tournaments, dashCurrency, dashRates]);

      const [plDropdown, setPlDropdown] = useState(null); // 'buyins' | 'cashes' | null

      // ── Friends currently playing ──
      const activeFriends = useMemo(() => {
        if (!shareBuddies || !buddyLiveUpdates) return [];
        return shareBuddies
          .filter(b => {
            const lu = buddyLiveUpdates[b.id];
            return lu && !lu.isBusted;
          })
          .map(b => ({
            ...b,
            liveUpdate: buddyLiveUpdates[b.id],
          }));
      }, [shareBuddies, buddyLiveUpdates]);

      // ── Friends with events scheduled today ──
      const scheduledFriends = useMemo(() => {
        if (!shareBuddies || !buddyEvents || !tournaments) return [];
        const todayISO = getToday();
        // Build a map of buddyId -> today's tournaments
        const buddyToday = {};
        Object.entries(buddyEvents).forEach(([tid, buddies]) => {
          const t = tournaments.find(x => x.id === Number(tid));
          if (!t || t.date !== todayISO) return;
          buddies.forEach(b => {
            if (!buddyToday[b.id]) buddyToday[b.id] = [];
            buddyToday[b.id].push(t);
          });
        });
        return shareBuddies
          .filter(b => buddyToday[b.id] && buddyToday[b.id].length > 0)
          .map(b => ({
            ...b,
            todayEvents: buddyToday[b.id].sort((a, c) => (a.time || '') < (c.time || '') ? -1 : 1),
          }));
      }, [shareBuddies, buddyEvents, tournaments]);

      // ── Merged connections: playing + scheduled, deduplicated ──
      const allConnections = useMemo(() => {
        const map = {};
        // Add playing friends first
        activeFriends.forEach(f => {
          map[f.id] = { ...f, isPlaying: true, liveUpdate: f.liveUpdate, todayEvents: [] };
        });
        // Merge scheduled friends
        scheduledFriends.forEach(f => {
          if (map[f.id]) {
            map[f.id].todayEvents = f.todayEvents || [];
          } else {
            map[f.id] = { ...f, isPlaying: false, liveUpdate: null, todayEvents: f.todayEvents || [] };
          }
        });
        // Sort: playing first, then scheduled-only
        return Object.values(map).sort((a, b) => (b.isPlaying ? 1 : 0) - (a.isPlaying ? 1 : 0));
      }, [activeFriends, scheduledFriends]);

      const connDropdownRef = useRef(null);

      // Close connection dropdown on outside click
      useEffect(() => {
        if (!connDropdownId) return;
        const handler = (e) => {
          if (connDropdownRef.current && !connDropdownRef.current.contains(e.target)) {
            setConnDropdownId(null);
          }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
      }, [connDropdownId]);

      return (
        <div className="dashboard-view">

          {/* ── Today ── */}
          <div className="dashboard-section">
            <div className="dashboard-section-header">
              <div className="dashboard-section-title">Up Next</div>
              {whatsNextEvents.length > 0 && (
                <span className="dashboard-section-badge">{whatsNextEvents.length} event{whatsNextEvents.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            {whatsNextEvents.length > 0 ? (() => {
              const safeIdx = Math.min(selectedUpNextIdx, whatsNextEvents.length - 1);
              swipeRef.current = whatsNextEvents.length;
              return (
                <div
                  onTouchStart={onTouchStart}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                  style={{overflow:'hidden', touchAction:'pan-y'}}
                >
                  <div
                    className="dash-carousel-track"
                    ref={trackRef}
                    data-idx={safeIdx}
                    style={{transform: `translateX(${-(safeIdx * 100)}%)`}}
                  >
                    {whatsNextEvents.map((evt, i) => (
                      <div className="dash-carousel-slide" key={evt.id}>
                        {renderEventCard(evt)}
                      </div>
                    ))}
                  </div>
                  {whatsNextEvents.length > 1 && (
                    <div className="dash-upnext-dots">
                      {whatsNextEvents.map((_, i) => (
                        <div key={i} className={'dash-upnext-dot' + (i === safeIdx ? ' active' : '')} onClick={() => setSelectedUpNextIdx(i)} style={{cursor:'pointer'}} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })() : (
              nextUpcomingEvent ? (
                <div style={{padding:'12px',background:'var(--surface)',borderRadius:'var(--radius)',border:'1px solid var(--border)'}}>
                  <div style={{fontSize:'0.68rem',color:'var(--text-muted)',fontFamily:"'Univers Condensed','Univers',sans-serif",textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:'6px'}}>Next on your schedule</div>
                  <div style={{fontWeight:700,fontSize:'0.85rem',marginBottom:'2px'}}>{nextUpcomingEvent.event_name}</div>
                  <div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>
                    {fmtShortDate(normaliseDate(nextUpcomingEvent.date))}
                    {nextUpcomingEvent.time ? ' at ' + nextUpcomingEvent.time : ''}
                    {nextUpcomingEvent.venue ? ' — ' + nextUpcomingEvent.venue : ''}
                  </div>
                  {nextUpcomingEvent.buy_in ? <div style={{fontSize:'0.72rem',color:'var(--accent)',marginTop:'2px'}}>{formatBuyin(nextUpcomingEvent.buy_in, nextUpcomingEvent.venue)}</div> : null}
                </div>
              ) : (
              <div className="dash-empty">
                <Icon.calendar />
                <div>No events on your schedule</div>
                <div style={{fontSize:'0.72rem',marginTop:'4px'}}>
                  Add events from the <button onClick={() => onNavigate('tournaments')} style={{background:'none',border:'none',color:'var(--accent)',cursor:'pointer',fontFamily:'inherit',fontSize:'inherit',textDecoration:'underline',padding:0}}>schedule</button> to see them here.
                </div>
              </div>
              )
            )}
          </div>

          {/* ── Friends Playing ── */}
          {activeFriends.length > 0 && (
            <div className="dashboard-section" style={{flexShrink: 0}}>
              <div className="dashboard-section-header">
                <div className="dashboard-section-title">Friends Playing</div>
                <span className="dashboard-section-badge">{activeFriends.length} live</span>
              </div>
              <div className="dash-friends-scroll">
                {activeFriends.map(f => {
                  const lu = f.liveUpdate;
                  const stack = lu?.stack ? Number(lu.stack).toLocaleString() : null;
                  const blinds = lu?.bb ? `${lu.sb ? Number(lu.sb).toLocaleString() : '?'}/${Number(lu.bb).toLocaleString()}${(lu.bbAnte || lu.bb_ante) ? '/' + Number(lu.bbAnte || lu.bb_ante).toLocaleString() : ''}` : null;
                  return (
                    <div key={f.id} className="dash-friend-chip" onClick={() => onNavigate('social')}>
                      <Avatar src={f.avatar} username={f.username} size={28} />
                      <div className="friend-info">
                        <div className="friend-name">{displayName(f)}</div>
                        <div className="friend-event">{lu?.eventName || 'Playing'}</div>
                        {stack && (
                          <div className="friend-stack">
                            {stack}{blinds ? ` @ ${blinds}` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Table Scanner ── */}
          <div className="dashboard-section">
            <div className="dashboard-section-header">
              <div className="dashboard-section-title">Table Scanner <span style={{fontWeight:400,fontSize:'0.7rem',color:'var(--text-muted)'}}>(WSOP Live / PokerStars Live)</span></div>
            </div>
            <TableScanner />
          </div>

          <div className="dash-bottom-stack">
          {/* ── Results ── */}
          <div className="dashboard-section">
            <div className="dashboard-section-header">
              <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
                <div className="dashboard-section-title">Results</div>
                {plData.count > 0 && dashRates && (
                  <select value={dashCurrency} onChange={e => onDashCurrencyChange(e.target.value)}
                    style={{fontSize:'0.65rem',padding:'2px 4px',border:'1px solid var(--border)',borderRadius:'5px',
                      background:'var(--surface)',color:'var(--text)',cursor:'pointer',fontWeight:600}}>
                    <option value="NATIVE">Native</option>
                    {Object.keys(CURRENCY_CONFIG).map(c => (
                      <option key={c} value={c}>{(CURRENCY_CONFIG[c]||{}).symbol} {c}</option>
                    ))}
                  </select>
                )}
              </div>
              {plData.count > 0 && (
                <span className="dashboard-section-badge">{plData.count} result{plData.count !== 1 ? 's' : ''}</span>
              )}
            </div>
            {plData.count > 0 ? (
              <>
              <div className="dash-pl-grid">
                {(() => { const fmtPl = (v) => formatCurrencyAmount(v, dashCurrency === 'NATIVE' ? 'USD' : dashCurrency); return (<>
                <div className="dash-pl-card dash-pl-btn" onClick={() => setPlDropdown(d => d === 'buyins' ? null : 'buyins')}>
                  <div className="dash-pl-value">{fmtPl(plData.invested)}</div>
                  <div className="dash-pl-label">Total Buyins ▾</div>
                  {plDropdown === 'buyins' && (
                    <div className="dash-pl-dropdown">
                      {Object.entries(plData.byVenue)
                        .filter(([, v]) => v.invested > 0)
                        .sort((a, b) => b[1].invested - a[1].invested)
                        .map(([venue, v]) => (
                          <div key={venue} className="dash-pl-dropdown-row">
                            <span className="dash-pl-dropdown-venue">{venue}</span>
                            <span className="dash-pl-dropdown-amount">{fmtPl(v.invested)}</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
                <div className="dash-pl-card dash-pl-btn" onClick={() => setPlDropdown(d => d === 'cashes' ? null : 'cashes')}>
                  <div className="dash-pl-value">{fmtPl(plData.cashed)}</div>
                  <div className="dash-pl-label">Cashes ▾</div>
                  {plDropdown === 'cashes' && (
                    <div className="dash-pl-dropdown">
                      {Object.entries(plData.byVenue)
                        .filter(([, v]) => v.cashed > 0)
                        .sort((a, b) => b[1].cashed - a[1].cashed)
                        .map(([venue, v]) => (
                          <div key={venue} className="dash-pl-dropdown-row">
                            <span className="dash-pl-dropdown-venue">{venue}</span>
                            <span className="dash-pl-dropdown-amount">{fmtPl(v.cashed)}</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
                <div className="dash-pl-card">
                  <div className={`dash-pl-value ${plData.net >= 0 ? 'positive' : 'negative'}`}>
                    {plData.net >= 0 ? '+' : ''}{fmtPl(plData.net)}
                  </div>
                  <div className="dash-pl-label">
                    Net — {plData.roi >= 0 ? '+' : ''}{plData.roi.toFixed(1)}% ROI
                  </div>
                </div>
                </>); })()}
              </div>
              </>
            ) : (
              <div className="dash-empty" style={{padding:'12px 16px'}}>
                <Icon.tracking />
                <div>No results logged yet</div>
              </div>
            )}
          </div>



          {/* ── Connections ── */}
          <div className="dashboard-section">
            <div className="dashboard-section-header">
              <div className="dashboard-section-title">Connections</div>
              {allConnections.length > 0 && (
                <span className="dashboard-section-badge">
                  {activeFriends.length > 0 ? `${activeFriends.length} live` : `${allConnections.length}`}
                </span>
              )}
            </div>
            {allConnections.length > 0 ? (
              <div className="dash-connections-row">
                {allConnections.slice(0, 10).map(f => (
                  <button
                    key={f.id}
                    className="dash-conn-avatar"
                    onClick={() => setConnDropdownId(connDropdownId === f.id ? null : f.id)}
                    ref={connDropdownId === f.id ? connDropdownRef : undefined}
                  >
                    <Avatar src={f.avatar} username={f.username} size={32} />
                    {f.isPlaying && <span className="playing-dot" />}
                    <span className="conn-name">{displayName(f)}</span>
                    {connDropdownId === f.id && (() => {
                      const rect = connDropdownRef.current?.getBoundingClientRect();
                      const openAbove = rect && rect.top > window.innerHeight / 2;
                      return (
                        <div className={'dash-conn-dropdown ' + (openAbove ? 'above' : 'below')} onClick={e => e.stopPropagation()}>
                          <div className="dash-conn-dropdown-name">{displayName(f)}</div>
                          {f.isPlaying && f.liveUpdate && (
                            <>
                              <div className="dash-conn-dropdown-label">Now Playing</div>
                              <div className="dash-conn-dropdown-event">
                                {f.liveUpdate.eventName}
                                {f.liveUpdate.stack && <span className="muted"> — {Number(f.liveUpdate.stack).toLocaleString()}</span>}
                              </div>
                            </>
                          )}
                          {f.todayEvents && f.todayEvents.length > 0 && (
                            <>
                              <div className="dash-conn-dropdown-label">{f.isPlaying ? 'Also Scheduled' : 'Scheduled Today'}</div>
                              {f.todayEvents.map((t, i) => {
                                const v = getVenueInfo(t.venue);
                                return <div key={i} className="dash-conn-dropdown-event">{v.abbr} | {currencySymbol(t.venue)}{Number(t.buyin).toLocaleString()} {t.event_name}</div>;
                              })}
                            </>
                          )}
                          {!f.isPlaying && (!f.todayEvents || f.todayEvents.length === 0) && (
                            <div className="dash-conn-dropdown-event" style={{color:'var(--text-muted)'}}>No events today</div>
                          )}
                        </div>
                      );
                    })()}
                  </button>
                ))}
                {allConnections.length > 10 && (
                  <button className="dash-conn-overflow" onClick={() => onNavigate('social')}>
                    +{allConnections.length - 10}
                  </button>
                )}
              </div>
            ) : (
              <div className="dash-empty" style={{padding:'6px 16px',display:'flex',alignItems:'center',gap:'8px'}}>
                <Icon.people />
                <div>No connections active today</div>
              </div>
            )}
          </div>
          </div>
        </div>
      );
    }


    // ── Notifications Panel ─────────────────────────────────────
    function NotificationsPanel({ notifications, token, onClose, fetchNotifications, fetchShareBuddies, fetchMyGroups }) {
      const displayName = useDisplayName();
      const { groupInvites, buddyRequests, acceptedBuddies, swapSuggestions = [] } = notifications;
      const isEmpty = groupInvites.length === 0 && buddyRequests.length === 0 && acceptedBuddies.length === 0 && swapSuggestions.length === 0;

      const handleAcceptGroupInvite = async (inviteId) => {
        try {
          const res = await fetch(`/api/group-invites/${inviteId}/accept`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            fetchNotifications();
            fetchMyGroups();
          }
        } catch {}
      };

      const handleDeclineGroupInvite = async (inviteId) => {
        try {
          const res = await fetch(`/api/group-invites/${inviteId}/decline`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) fetchNotifications();
        } catch {}
      };

      const handleAcceptBuddy = async (requestId) => {
        try {
          const res = await fetch(`/api/share-request/${requestId}/accept`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            fetchNotifications();
            fetchShareBuddies();
          }
        } catch {}
      };

      const handleDeclineBuddy = async (requestId) => {
        try {
          const res = await fetch(`/api/share-request/${requestId}/reject`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) {
            fetchNotifications();
            fetchShareBuddies();
          }
        } catch {}
      };

      const handleSwapRespond = async (id, response) => {
        try {
          const res = await fetch(`${API_URL}/swap-suggest/${id}/respond`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ response })
          });
          if (res.ok) fetchNotifications();
        } catch {}
      };

      const timeAgo = (dateStr) => {
        if (!dateStr) return '';
        const now = new Date();
        const d = new Date(dateStr);
        const diffMs = now - d;
        const mins = Math.floor(diffMs / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        return `${days}d ago`;
      };

      return ReactDOM.createPortal(
        React.createElement('div', null,
          React.createElement('div', { className: 'notif-backdrop', onClick: onClose }),
          React.createElement('div', { className: 'notif-panel' },
            React.createElement('div', { className: 'notif-panel-header' },
              React.createElement('span', { className: 'notif-panel-title' }, 'Notifications'),
              React.createElement('button', {
                className: 'btn btn-ghost btn-sm',
                onClick: onClose,
                style: { padding: '2px 6px', fontSize: '1.1rem', lineHeight: 1 }
              }, '×')
            ),
            isEmpty
              ? React.createElement('div', { className: 'notif-empty' },
                  React.createElement('div', { style: { width: 20, height: 20, margin: '0 auto 8px', color: 'var(--text-muted)' } },
                    React.createElement(Icon.check)
                  ),
                  'All caught up!'
                )
              : React.createElement('div', { className: 'notif-list' },
                  groupInvites.length > 0 && React.createElement('div', { className: 'notif-section' },
                    React.createElement('div', { className: 'notif-section-title' }, 'Group Invites'),
                    groupInvites.map(inv =>
                      React.createElement('div', { key: `gi-${inv.id}`, className: 'notif-item' },
                        React.createElement('div', { className: 'notif-item-content' },
                          React.createElement('div', { className: 'notif-item-text' },
                            React.createElement('strong', null, inv.invited_by_real_name || inv.invited_by_username),
                            ' invited you to ',
                            React.createElement('strong', null, inv.group_name)
                          ),
                          React.createElement('div', { className: 'notif-item-time' }, timeAgo(inv.created_at))
                        ),
                        React.createElement('div', { className: 'notif-item-actions' },
                          React.createElement('button', {
                            className: 'btn btn-primary btn-xs',
                            onClick: () => handleAcceptGroupInvite(inv.id)
                          }, 'Accept'),
                          React.createElement('button', {
                            className: 'btn btn-ghost btn-xs',
                            onClick: () => handleDeclineGroupInvite(inv.id)
                          }, 'Decline')
                        )
                      )
                    )
                  ),
                  buddyRequests.length > 0 && React.createElement('div', { className: 'notif-section' },
                    React.createElement('div', { className: 'notif-section-title' }, 'Connection Requests'),
                    buddyRequests.map(req =>
                      React.createElement('div', { key: `br-${req.id}`, className: 'notif-item' },
                        React.createElement('div', { className: 'notif-item-content' },
                          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                            React.createElement(Avatar, { src: req.avatar, username: req.username, size: 24 }),
                            React.createElement('div', { className: 'notif-item-text' },
                              React.createElement('strong', null, displayName(req)),
                              ' wants to connect'
                            )
                          ),
                          React.createElement('div', { className: 'notif-item-time' }, timeAgo(req.created_at))
                        ),
                        React.createElement('div', { className: 'notif-item-actions' },
                          React.createElement('button', {
                            className: 'btn btn-primary btn-xs',
                            onClick: () => handleAcceptBuddy(req.id)
                          }, 'Accept'),
                          React.createElement('button', {
                            className: 'btn btn-ghost btn-xs',
                            onClick: () => handleDeclineBuddy(req.id)
                          }, 'Decline')
                        )
                      )
                    )
                  ),
                  acceptedBuddies.length > 0 && React.createElement('div', { className: 'notif-section' },
                    React.createElement('div', { className: 'notif-section-title' }, 'Recent Activity'),
                    acceptedBuddies.map(ab =>
                      React.createElement('div', { key: `ab-${ab.id}`, className: 'notif-item notif-item-info' },
                        React.createElement('div', { className: 'notif-item-content' },
                          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                            React.createElement(Avatar, { src: ab.avatar, username: ab.username, size: 24 }),
                            React.createElement('div', { className: 'notif-item-text' },
                              React.createElement('strong', null, displayName(ab)),
                              ' accepted your request'
                            )
                          ),
                          React.createElement('div', { className: 'notif-item-time' }, timeAgo(ab.responded_at))
                        )
                      )
                    )
                  ),
                  swapSuggestions.length > 0 && React.createElement('div', { className: 'notif-section' },
                    React.createElement('div', { className: 'notif-section-title' }, 'Swap Offers'),
                    swapSuggestions.map(ss =>
                      React.createElement('div', { key: `ss-${ss.id}`, className: 'notif-item' },
                        React.createElement('div', { className: 'notif-item-content' },
                          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                            React.createElement(Avatar, { src: ss.from_avatar, username: ss.from_username, size: 24 }),
                            React.createElement('div', { className: 'notif-item-text' },
                              React.createElement('strong', null, ss.from_real_name || ss.from_username),
                              ` wants a ${ss.type} — ${ss.my_pct}%/${ss.their_pct}%`,
                              React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: 2 } },
                                `${ss.event_name} · ${ss.date}`
                              )
                            )
                          ),
                          React.createElement('div', { className: 'notif-item-time' }, timeAgo(ss.created_at))
                        ),
                        React.createElement('div', { className: 'notif-item-actions' },
                          React.createElement('button', {
                            className: 'btn btn-primary btn-xs',
                            onClick: () => handleSwapRespond(ss.id, 'accepted')
                          }, 'Accept'),
                          React.createElement('button', {
                            className: 'btn btn-ghost btn-xs',
                            onClick: () => handleSwapRespond(ss.id, 'declined')
                          }, 'Decline')
                        )
                      )
                    )
                  )
                )
          )
        ),
        document.body
      );
    }


    // ── Admin View ─────────────────────────────────────────────
    function AdminView({ token, onNavigate }) {
      const [users, setUsers] = useState([]);
      const [loading, setLoading] = useState(true);
      const [filter, setFilter] = useState('');
      const [sortField, setSortField] = useState('created_at');
      const [sortAsc, setSortAsc] = useState(false);

      useEffect(() => {
        (async () => {
          try {
            const res = await fetch(`${API_URL}/admin/users-list`, {
              headers: { Authorization: 'Bearer ' + token }
            });
            if (res.ok) setUsers(await res.json());
          } catch {}
          setLoading(false);
        })();
      }, [token]);

      const timeAgo = (dateStr) => {
        if (!dateStr) return '—';
        const now = new Date();
        const d = new Date(dateStr);
        const diff = Math.floor((now - d) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      };

      const filtered = users.filter(u => {
        if (!filter) return true;
        const q = filter.toLowerCase();
        return (u.username || '').toLowerCase().includes(q) ||
               (u.real_name || '').toLowerCase().includes(q) ||
               (u.email || '').toLowerCase().includes(q);
      });

      const sorted = [...filtered].sort((a, b) => {
        let av = a[sortField] || '', bv = b[sortField] || '';
        if (sortField === 'created_at') { av = new Date(av); bv = new Date(bv); }
        else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
        if (av < bv) return sortAsc ? -1 : 1;
        if (av > bv) return sortAsc ? 1 : -1;
        return 0;
      });

      const handleSort = (field) => {
        if (sortField === field) setSortAsc(!sortAsc);
        else { setSortField(field); setSortAsc(field !== 'created_at'); }
      };

      const sortArrow = (field) => sortField === field ? (sortAsc ? ' ▲' : ' ▼') : '';

      const toggleReplayerAccess = async (userId, enabled) => {
        try {
          await fetch(`${API_URL}/admin/users/${userId}/replayer-access`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ enabled })
          });
          setUsers(prev => prev.map(u => u.id === userId ? { ...u, hand_replayer_access: enabled ? 1 : 0 } : u));
        } catch (e) {
          console.error('Toggle replayer access error:', e);
        }
      };

      if (loading) return React.createElement('div', { style: { padding: '40px', textAlign: 'center', color: 'var(--text-muted)' } }, 'Loading...');

      return (
        <div style={{padding:'16px',maxWidth:'100%'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
            <h2 style={{fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:700,fontSize:'1.2rem',color:'var(--text)',margin:0}}>
              ADMIN — {users.length} Users
            </h2>
            {onNavigate && (
              <button onClick={() => onNavigate('hands')} style={{padding:'6px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:'0.78rem',fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:600,cursor:'pointer'}}>
                Hand Replayer
              </button>
            )}
          </div>
          <input
            type="text"
            placeholder="Filter by username, name, or email..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{width:'100%',padding:'8px 12px',marginBottom:'12px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',color:'var(--text)',fontSize:'0.85rem',boxSizing:'border-box'}}
          />
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
              <thead>
                <tr style={{borderBottom:'2px solid var(--border)'}}>
                  <th style={{padding:'6px 8px',textAlign:'left',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:600,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:'0.05em',cursor:'pointer',whiteSpace:'nowrap'}} onClick={() => handleSort('username')}>Username{sortArrow('username')}</th>
                  <th style={{padding:'6px 8px',textAlign:'left',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:600,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:'0.05em',cursor:'pointer',whiteSpace:'nowrap'}} onClick={() => handleSort('real_name')}>Name{sortArrow('real_name')}</th>
                  <th style={{padding:'6px 8px',textAlign:'left',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:600,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:'0.05em',cursor:'pointer',whiteSpace:'nowrap'}} onClick={() => handleSort('email')}>Email{sortArrow('email')}</th>
                  <th style={{padding:'6px 8px',textAlign:'center',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:600,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>Replayer</th>
                  <th style={{padding:'6px 8px',textAlign:'right',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:600,fontSize:'0.7rem',textTransform:'uppercase',letterSpacing:'0.05em',cursor:'pointer',whiteSpace:'nowrap'}} onClick={() => handleSort('created_at')}>Joined{sortArrow('created_at')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(u => (
                  <tr key={u.id} style={{borderBottom:'1px solid var(--border)'}}>
                    <td style={{padding:'8px',display:'flex',alignItems:'center',gap:'8px'}}>
                      {u.avatar ? (
                        <img src={u.avatar} style={{width:24,height:24,borderRadius:'50%',objectFit:'cover'}} />
                      ) : (
                        <div style={{width:24,height:24,borderRadius:'50%',background:'var(--accent)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.65rem',fontWeight:700,color:'var(--bg)'}}>
                          {(u.username || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <span style={{fontWeight:600,color:'var(--text)'}}>{u.username}</span>
                    </td>
                    <td style={{padding:'8px',color:'var(--text-muted)'}}>{u.real_name || '—'}</td>
                    <td style={{padding:'8px',color:'var(--text-muted)',fontSize:'0.75rem'}}>{u.email}</td>
                    <td style={{padding:'8px',textAlign:'center'}}>
                      <button onClick={() => toggleReplayerAccess(u.id, !u.hand_replayer_access)}
                        style={{background:'none',border:'none',cursor:'pointer',fontSize:'1.1rem',padding:0}}>
                        {u.hand_replayer_access ? '\u2705' : '\u274C'}
                      </button>
                    </td>
                    <td style={{padding:'8px',color:'var(--text-muted)',textAlign:'right',whiteSpace:'nowrap'}} title={u.created_at}>{timeAgo(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {sorted.length === 0 && <div style={{padding:'20px',textAlign:'center',color:'var(--text-muted)'}}>No users found</div>}
        </div>
      );
    }

    // ── More View (settings, tracking, etc.) ─────────────────────
    function MoreView({ onNavigate, onExport, hasSchedule, isAdmin, handReplayerAccess }) {
      return (
        <div className="more-menu">
          <button className="more-menu-item" onClick={() => onNavigate('schedule')}>
            <Icon.user />
            <div>
              My Schedule
              <div className="menu-item-desc">View your saved events</div>
            </div>
          </button>
          <button className="more-menu-item" onClick={() => onNavigate('tracking')}>
            <Icon.tracking />
            <div>
              Results & Tracking
              <div className="menu-item-desc">Log buy-ins, cashes, and track your P&L</div>
            </div>
          </button>
          <button className="more-menu-item" onClick={() => onNavigate('calendar')}>
            <Icon.calendar />
            <div>
              Calendar View
              <div className="menu-item-desc">See your schedule day by day</div>
            </div>
          </button>
          {(handReplayerAccess || isAdmin) && (
          <button className="more-menu-item" onClick={() => onNavigate('hands')}>
            <Icon.cards />
            <div>
              Hand Replayer
              <div className="menu-item-desc">Record and replay poker hands</div>
            </div>
          </button>
          )}
          <button className="more-menu-item" onClick={onExport} disabled={!hasSchedule} style={!hasSchedule ? {opacity:0.4, cursor:'default'} : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <div>
              Export Schedule
              <div className="menu-item-desc">{hasSchedule ? 'Download PDF or share images of your schedule' : 'Save events to your schedule first'}</div>
            </div>
          </button>
          <button className="more-menu-item" onClick={() => onNavigate('settings')}>
            <Icon.gear />
            <div>
              Settings
              <div className="menu-item-desc">Account, sharing, appearance, imports</div>
            </div>
          </button>
          {isAdmin && (
            <button className="more-menu-item" onClick={() => onNavigate('admin')}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 15a3 3 0 100-6 3 3 0 000 6z"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
              </svg>
              <div>
                Admin
                <div className="menu-item-desc">User accounts & management</div>
              </div>
            </button>
          )}
        </div>
      );
    }

    // ── Bottom Nav ─────────────────────────────────────────────

    function BottomNav({ current, onChange, scheduleCount, newShareCount }) {
      const tabs = [
        { id: 'tournaments', label: 'Schedule', icon: Icon.calendar },
        { id: 'social', label: 'Social', icon: Icon.people },
        { id: 'dashboard', label: 'Dashboard', icon: Icon.home, center: true },
        { id: 'staking', label: 'Staking', icon: Icon.handshake },
        { id: 'more', label: 'More', icon: Icon.dots },
      ];

      return (
        <nav className="bottom-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-tab ${current === tab.id ? 'active' : ''}${tab.center ? ' nav-tab-center' : ''}`}
              onClick={() => { haptic(10); onChange(tab.id); }}
              style={{position:'relative'}}
            >
              <tab.icon />
              {tab.label}
              {tab.badge > 0 && (
                <span style={{
                  position:'absolute', top:'4px', right:'50%', marginRight:'-16px',
                  background:'#ef4444', color:'#fff', fontSize:'0.55rem', fontWeight:700,
                  width:'14px', height:'14px', borderRadius:'50%',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  lineHeight:1
                }}>{tab.badge}</span>
              )}
            </button>
          ))}
        </nav>
      );
    }

    // ── Settings View ──────────────────────────────────────────

    function SettingsView({ username, avatar, realName, nameMode, onToggleNameMode, onAvatarUpload, onAvatarRemove, theme, toggleTheme, contrast, toggleContrast, cardSplay, toggleCardSplay, serifFont, toggleSerifFont, onLogout, onDebugTimeChange, onUpload, uploadError, uploadSuccess, uploadVenue, onUploadVenueChange, shareToken, onGenerateShareToken, onRevokeShareToken, onSendShareRequest, pendingOutgoing, onCancelRequest, shareBuddies, onRemoveBuddy, shareError, shareSuccess, token, onRefreshTournaments }) {
      const toast = useToast();
      const displayName = useDisplayName();
      const [debugInput, setDebugInput] = useState(_debugNow);

      const applyDebugTime = (val) => {
        setDebugInput(val);
        setDebugNow(val);
        if (onDebugTimeChange) onDebugTimeChange(val);
      };

      // Vision-based schedule upload state
      const [visionFile, setVisionFile] = useState(null);
      const [visionVenue, setVisionVenue] = useState('');
      const [visionUrl, setVisionUrl] = useState('');
      const [visionParsing, setVisionParsing] = useState(false);
      const [visionResults, setVisionResults] = useState(null);
      const [visionError, setVisionError] = useState('');
      const [visionImporting, setVisionImporting] = useState(false);
      const [visionEditIdx, setVisionEditIdx] = useState(-1);
      const [visionProgress, setVisionProgress] = useState(0);
      const [visionStage, setVisionStage] = useState('');
      const visionProgressRef = useRef(null);

      const handleVisionUpload = async (e) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        setVisionFile(files.length === 1 ? files[0] : { name: `${files.length} files` });
        setVisionError('');
        setVisionResults(null);
        setVisionParsing(true);
        setVisionProgress(0);
        setVisionStage('Uploading...');

        // Animated progress stages (two-pass: transcribe then structure)
        const hasPdf = files.some(f => f.name.toLowerCase().endsWith('.pdf'));
        const stages = [
          { at: 5,  label: `Uploading ${files.length > 1 ? files.length + ' files' : 'file'}...` },
          { at: 10, label: hasPdf ? 'Reading PDF pages...' : `Processing ${files.length > 1 ? files.length + ' images' : 'image'}...` },
          { at: 20, label: 'Pass 1: Transcribing schedule...' },
          { at: 40, label: 'Pass 1: Reading event details...' },
          { at: 55, label: 'Pass 2: Structuring events...' },
          { at: 70, label: 'Pass 2: Mapping variants...' },
          { at: 82, label: 'Validating data...' },
          { at: 92, label: 'Finalizing...' },
        ];
        let stageIdx = 0;
        const startTime = Date.now();
        // More files = longer estimate
        const estDuration = hasPdf ? 60000 : Math.max(30000, files.length * 15000);

        visionProgressRef.current = setInterval(() => {
          const elapsed = Date.now() - startTime;
          // Asymptotic progress: approaches 95% but never reaches it
          const raw = 95 * (1 - Math.exp(-2.5 * elapsed / estDuration));
          const pct = Math.min(95, Math.round(raw));
          setVisionProgress(pct);
          while (stageIdx < stages.length && pct >= stages[stageIdx].at) {
            setVisionStage(stages[stageIdx].label);
            stageIdx++;
          }
        }, 200);

        const fd = new FormData();
        for (const file of files) {
          fd.append('file', file);
        }
        if (visionVenue) fd.append('venue', visionVenue);

        try {
          const res = await fetch(`${API_URL}/parse-schedule`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
            body: fd
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Parse failed');
          clearInterval(visionProgressRef.current);
          setVisionProgress(100);
          setVisionStage(data.eventCount > 0 ? `Found ${data.eventCount} events` : 'No events found');
          // Brief pause at 100% before showing results
          await new Promise(r => setTimeout(r, 400));
          setVisionResults(data);
          if (data.detectedVenue && !visionVenue) setVisionVenue(data.detectedVenue);
        } catch (err) {
          clearInterval(visionProgressRef.current);
          setVisionProgress(0);
          setVisionStage('');
          setVisionError(err.message || 'Failed to parse schedule');
        } finally {
          clearInterval(visionProgressRef.current);
          setVisionParsing(false);
          e.target.value = '';
        }
      };

      const handleVisionUrl = async () => {
        if (!visionUrl.trim()) return;
        setVisionError('');
        setVisionResults(null);
        setVisionParsing(true);
        setVisionProgress(0);
        setVisionStage('Fetching URL...');

        const isUrlPdf = visionUrl.toLowerCase().endsWith('.pdf');
        const stages = [
          { at: 5,  label: 'Fetching URL...' },
          { at: 12, label: isUrlPdf ? 'Reading PDF...' : 'Extracting page content...' },
          { at: 20, label: 'Analyzing schedule...' },
          { at: 35, label: 'Reading event details...' },
          { at: 50, label: 'Structuring events...' },
          { at: 65, label: 'Processing events...' },
          { at: 78, label: 'Mapping variants...' },
          { at: 88, label: 'Validating data...' },
          { at: 94, label: 'Finalizing...' },
        ];
        let stageIdx = 0;
        const startTime = Date.now();
        const estDuration = isUrlPdf ? 90000 : 45000; // Haiku + parallel chunks makes HTML fast

        visionProgressRef.current = setInterval(() => {
          const elapsed = Date.now() - startTime;
          const raw = 95 * (1 - Math.exp(-2.0 * elapsed / estDuration));
          const pct = Math.min(95, Math.round(raw));
          setVisionProgress(pct);
          while (stageIdx < stages.length && pct >= stages[stageIdx].at) {
            setVisionStage(stages[stageIdx].label);
            stageIdx++;
          }
        }, 200);

        try {
          const res = await fetch(`${API_URL}/parse-schedule-url`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: visionUrl.trim(), venue: visionVenue })
          });
          const rawText = await res.text();
          let data;
          try { data = JSON.parse(rawText); } catch { throw new Error('Server error — please try again'); }
          if (!res.ok) throw new Error(data.error || 'Parse failed');
          clearInterval(visionProgressRef.current);
          setVisionProgress(100);
          setVisionStage(data.eventCount > 0 ? `Found ${data.eventCount} events` : 'No events found');
          await new Promise(r => setTimeout(r, 400));
          setVisionResults(data);
          if (data.detectedVenue && !visionVenue) setVisionVenue(data.detectedVenue);
        } catch (err) {
          clearInterval(visionProgressRef.current);
          setVisionProgress(0);
          setVisionStage('');
          setVisionError(err.message || 'Failed to parse URL');
        } finally {
          clearInterval(visionProgressRef.current);
          setVisionParsing(false);
        }
      };

      const removeVisionEvent = (idx) => {
        if (!visionResults) return;
        const newEvents = visionResults.events.filter((_, i) => i !== idx);
        setVisionResults({ ...visionResults, events: newEvents, eventCount: newEvents.length });
      };

      const updateVisionEvent = (idx, field, value) => {
        if (!visionResults) return;
        const newEvents = [...visionResults.events];
        newEvents[idx] = { ...newEvents[idx], [field]: value };
        setVisionResults({ ...visionResults, events: newEvents });
      };

      const handleVisionImport = async () => {
        if (!visionResults || !visionResults.events.length) return;
        setVisionImporting(true);
        setVisionError('');

        try {
          // Check for duplicates first
          const checkRes = await fetch(`${API_URL}/check-schedule-duplicates`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: visionResults.events })
          });
          const dupCheck = await checkRes.json();

          if (dupCheck.existing > 0 && dupCheck.new === 0) {
            const proceed = window.confirm(
              `All ${dupCheck.existing} events already exist in the schedule (${dupCheck.existingVenues?.join(', ') || 'unknown venue'}). Importing will update them with the new data.\n\nContinue?`
            );
            if (!proceed) { setVisionImporting(false); return; }
          } else if (dupCheck.existing > 0) {
            const proceed = window.confirm(
              `${dupCheck.existing} of ${dupCheck.total} events already exist in the schedule. ${dupCheck.new} are new.\n\nImporting will add new events and update existing ones. Continue?`
            );
            if (!proceed) { setVisionImporting(false); return; }
          }

          const res = await fetch(`${API_URL}/import-parsed-schedule`, {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              events: visionResults.events,
              sourceFile: visionResults.sourceFile || 'Vision Upload'
            })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Import failed');
          const parts = [];
          if (data.inserted) parts.push(`${data.inserted} new`);
          if (data.updated) parts.push(`${data.updated} updated`);
          if (data.skipped) parts.push(`${data.skipped} skipped`);
          toast.success(`Import complete: ${parts.join(', ')}`);
          setVisionResults(null);
          setVisionFile(null);
          setVisionVenue('');
          if (onRefreshTournaments) onRefreshTournaments();
        } catch (err) {
          setVisionError(err.message || 'Failed to import events');
        } finally {
          setVisionImporting(false);
        }
      };

      return (
        <div className="settings-view">

          <div className="settings-section">
            <div className="settings-section-label">Account</div>
            <div className="settings-card">
              <div className="settings-row" style={{gap:'12px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'12px',flex:1}}>
                  <Avatar src={avatar} username={username} size={44} />
                  <div>
                    <div style={{fontSize:'0.85rem',fontWeight:600,color:'var(--text)'}}>{realName || username}</div>
                    <div style={{fontSize:'0.7rem',color:'var(--text-muted)',marginTop:'2px'}}>@{username}</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                  <label className="btn btn-ghost btn-sm" style={{cursor:'pointer',fontSize:'0.75rem',padding:'4px 10px'}}>
                    {avatar ? 'Change' : 'Add photo'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onAvatarUpload} style={{display:'none'}} />
                  </label>
                  {avatar && (
                    <button className="btn btn-ghost btn-sm" style={{color:'#b91c1c',fontSize:'0.75rem',padding:'4px 10px'}} onClick={onAvatarRemove}>Remove</button>
                  )}
                </div>
              </div>
              <div className="settings-row" style={{justifyContent:'space-between',alignItems:'center'}}>
                <div>
                  <span className="settings-row-label">Display names</span>
                  <p style={{fontSize:'0.72rem',color:'var(--text-muted)',margin:'2px 0 0'}}>
                    Show {nameMode === 'real' ? 'real names' : 'usernames'} throughout the app
                  </p>
                </div>
                <div style={{display:'flex',gap:'4px',background:'var(--bg)',borderRadius:'6px',padding:'2px'}}>
                  <button onClick={() => onToggleNameMode('real')}
                    style={{padding:'4px 10px',borderRadius:'5px',border:'none',cursor:'pointer',fontSize:'0.72rem',fontWeight:600,
                      background: nameMode === 'real' ? 'var(--accent)' : 'transparent',
                      color: nameMode === 'real' ? '#000' : 'var(--text-muted)'}}>
                    Real
                  </button>
                  <button onClick={() => onToggleNameMode('username')}
                    style={{padding:'4px 10px',borderRadius:'5px',border:'none',cursor:'pointer',fontSize:'0.72rem',fontWeight:600,
                      background: nameMode === 'username' ? 'var(--accent)' : 'transparent',
                      color: nameMode === 'username' ? '#000' : 'var(--text-muted)'}}>
                    Username
                  </button>
                </div>
              </div>
              <button className="settings-row-btn danger" onClick={onLogout}>
                Sign out
              </button>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-label">Sharing</div>
            <div className="settings-card">
              <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:'8px'}}>
                <span className="settings-row-label">Share link</span>
                <p style={{fontSize:'0.75rem',color:'var(--text-muted)',lineHeight:1.4}}>
                  Anyone with this link can view your schedule — no account needed.
                </p>
                {shareToken ? (
                  <div style={{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}}>
                    <input
                      className="settings-debug-input"
                      readOnly
                      value={`${window.location.origin}/shared/${shareToken}`}
                      style={{flex:1,fontSize:'0.72rem',minWidth:0}}
                      onClick={e => e.target.select()}
                    />
                    <button className="btn btn-ghost btn-sm" style={{display:'inline-flex',alignItems:'center',gap:'4px'}} onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/shared/${shareToken}`);
                    }}><Icon.copy /> Copy</button>
                    <button className="btn btn-ghost btn-sm" style={{color:'#b91c1c'}} onClick={onRevokeShareToken}>Revoke</button>
                  </div>
                ) : (
                  <button className="btn btn-ghost btn-sm" style={{alignSelf:'flex-start',display:'inline-flex',alignItems:'center',gap:'6px'}} onClick={onGenerateShareToken}>
                    <Icon.link /> Generate Share Link
                  </button>
                )}
              </div>
              <div style={{borderTop:'1px solid var(--border)'}} />
              <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:'8px'}}>
                <span className="settings-row-label">Connect with a user</span>
                <p style={{fontSize:'0.75rem',color:'var(--text-muted)',lineHeight:1.4}}>
                  Send a request — if they accept, you both see each other's schedules.
                </p>
                <form onSubmit={onSendShareRequest} style={{display:'flex',gap:'6px'}}>
                  <input className="settings-debug-input" name="shareUsername" placeholder="Enter username" style={{flex:1}} />
                  <button type="submit" className="btn btn-ghost btn-sm">Send</button>
                </form>
                {pendingOutgoing && pendingOutgoing.length > 0 && (
                  <div style={{marginTop:'4px'}}>
                    <span style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Pending</span>
                    {pendingOutgoing.map(r => (
                      <div key={r.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                        padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:'0.82rem',color:'var(--text)'}}>
                        <span style={{display:'flex',alignItems:'center',gap:'8px',color:'var(--text-muted)'}}>
                          <Avatar src={r.avatar} username={r.username} size={22} />
                          {displayName(r)}
                        </span>
                        <button className="btn btn-ghost btn-sm" style={{color:'#b91c1c',padding:'4px 8px'}} onClick={() => onCancelRequest(r.id)}>Cancel</button>
                      </div>
                    ))}
                  </div>
                )}
                {shareBuddies && shareBuddies.length > 0 && (
                  <div style={{marginTop:'8px'}}>
                    <span style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Connected</span>
                    {shareBuddies.map(b => (
                      <div key={b.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',
                        padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:'0.82rem',color:'var(--text)'}}>
                        <span style={{display:'flex',alignItems:'center',gap:'8px'}}>
                          <Avatar src={b.avatar} username={b.username} size={22} />
                          {displayName(b)}
                        </span>
                        <button className="btn btn-ghost btn-sm" style={{color:'#b91c1c',padding:'4px 8px'}} onClick={() => onRemoveBuddy(b.id)}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-label">Appearance</div>
            <div className="settings-card">
              <div className="settings-row">
                <span className="settings-row-label">Theme</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={toggleTheme}
                  style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'13px',padding:'4px 10px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)'}}
                >
                  {React.createElement(Icon[THEME_ICON[theme]] || Icon.moon, {key: theme})}
                  {THEME_LABEL[theme]}
                </button>
              </div>
              <div className="settings-row">
                <span className="settings-row-label">High contrast</span>
                <button
                  className={`settings-toggle ${contrast === 'high' ? 'on' : ''}`}
                  onClick={toggleContrast}
                />
              </div>
              <div className="settings-row">
                <span className="settings-row-label">Display font</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={toggleSerifFont}
                  style={{display:'flex',alignItems:'center',gap:'6px',fontSize:'13px',padding:'4px 10px',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)', fontFamily: serifFont === 'univers' ? "'Univers', sans-serif" : serifFont === 'helvetica' ? "'Helvetica Neue', Helvetica, sans-serif" : "'Libre Baskerville', Georgia, serif"}}
                >
                  {serifFont === 'univers' ? 'Univers' : serifFont === 'helvetica' ? 'Helvetica' : 'Baskerville'}
                </button>
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-label">Import Schedule</div>
            <div className="settings-card">
              <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:'8px'}}>
                <span className="settings-row-label">Import schedule</span>
                <p style={{fontSize:'0.75rem',color:'var(--text-muted)',lineHeight:1.4}}>
                  Upload a PDF/image or paste a web link. AI extracts event data automatically.
                </p>
                <input
                  type="text"
                  placeholder="Venue (optional — auto-detected from document)"
                  value={visionVenue}
                  onChange={e => setVisionVenue(e.target.value)}
                  style={{padding:'6px 10px',borderRadius:'6px',border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:'0.8rem',width:'100%',boxSizing:'border-box'}}
                />
                <input
                  type="file"
                  id="vision-schedule-upload"
                  className="file-input"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  multiple
                  onChange={handleVisionUpload}
                  disabled={visionParsing}
                />
                <label
                  htmlFor="vision-schedule-upload"
                  className="btn btn-ghost btn-sm"
                  style={{alignSelf:'flex-start',display:'inline-flex',alignItems:'center',gap:'6px',marginTop:'4px',opacity:visionParsing?0.5:1,pointerEvents:visionParsing?'none':'auto'}}
                >
                  <Icon.upload /> {visionParsing ? 'Scanning...' : 'Upload File(s)'}
                </label>
                <div style={{display:'flex',alignItems:'center',gap:'8px',width:'100%'}}>
                  <span style={{fontSize:'0.75rem',color:'var(--text-muted)',fontWeight:600}}>or</span>
                  <input
                    type="text"
                    placeholder="Paste schedule URL..."
                    value={visionUrl}
                    onChange={e => setVisionUrl(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && visionUrl.trim()) handleVisionUrl(); }}
                    disabled={visionParsing}
                    style={{flex:1,padding:'6px 10px',borderRadius:'6px',border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:'0.8rem',opacity:visionParsing?0.5:1}}
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleVisionUrl}
                    disabled={visionParsing || !visionUrl.trim()}
                    style={{whiteSpace:'nowrap',opacity:(visionParsing || !visionUrl.trim())?0.5:1}}
                  >
                    Fetch
                  </button>
                </div>

                {visionParsing && (
                  <div style={{padding:'12px',background:'var(--surface)',borderRadius:'8px',border:'1px solid var(--border)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'6px'}}>
                      <span style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>{visionStage}</span>
                      <span style={{fontSize:'0.75rem',color:'var(--text-muted)',fontVariantNumeric:'tabular-nums'}}>{visionProgress}%</span>
                    </div>
                    <div style={{height:'6px',background:'var(--border)',borderRadius:'3px',overflow:'hidden'}}>
                      <div style={{
                        height:'100%',
                        width: visionProgress + '%',
                        background:'linear-gradient(90deg, var(--accent), var(--accent-hover, var(--accent)))',
                        borderRadius:'3px',
                        transition: visionProgress === 100 ? 'width 0.3s ease' : 'width 0.4s ease-out',
                      }} />
                    </div>
                  </div>
                )}

                {visionError && (
                  <div style={{padding:'8px 12px',background:'rgba(220,38,38,0.1)',border:'1px solid rgba(220,38,38,0.3)',borderRadius:'6px',color:'#ef4444',fontSize:'0.8rem'}}>
                    {visionError}
                  </div>
                )}

                {visionResults && visionResults.events.length > 0 && (
                  <div style={{marginTop:'8px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}}>
                      <div>
                        <span style={{fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:700,fontSize:'0.9rem',color:'var(--text)'}}>
                          {visionResults.eventCount} Events Found
                        </span>
                        {visionResults.detectedVenue && (
                          <span style={{fontSize:'0.75rem',color:'var(--text-muted)',marginLeft:'8px'}}>
                            at {visionResults.detectedVenue}
                          </span>
                        )}
                      </div>
                      <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>
                        {visionResults.pageCount} page{visionResults.pageCount !== 1 ? 's' : ''} scanned
                      </span>
                    </div>

                    {visionResults.warnings.length > 0 && (
                      <div style={{padding:'6px 10px',background:'rgba(234,179,8,0.1)',border:'1px solid rgba(234,179,8,0.3)',borderRadius:'6px',marginBottom:'8px',fontSize:'0.75rem',color:'#eab308'}}>
                        {visionResults.warnings.length} warning{visionResults.warnings.length !== 1 ? 's' : ''}: {visionResults.warnings.slice(0, 3).map(w => w.warnings.join(', ')).join('; ')}
                        {visionResults.warnings.length > 3 && ` (+${visionResults.warnings.length - 3} more)`}
                      </div>
                    )}

                    <div style={{maxHeight:'400px',overflowY:'auto',border:'1px solid var(--border)',borderRadius:'8px'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.75rem'}}>
                        <thead>
                          <tr style={{borderBottom:'2px solid var(--border)',position:'sticky',top:0,background:'var(--bg)'}}>
                            <th style={{padding:'6px 8px',textAlign:'left',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:600,fontSize:'0.65rem',textTransform:'uppercase'}}>Date</th>
                            <th style={{padding:'6px 8px',textAlign:'left',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:600,fontSize:'0.65rem',textTransform:'uppercase'}}>Time</th>
                            <th style={{padding:'6px 8px',textAlign:'left',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:600,fontSize:'0.65rem',textTransform:'uppercase'}}>Event</th>
                            <th style={{padding:'6px 8px',textAlign:'right',color:'var(--text-muted)',fontFamily:'Univers Condensed, Univers, sans-serif',fontWeight:600,fontSize:'0.65rem',textTransform:'uppercase'}}>Buy-in</th>
                            <th style={{padding:'6px 4px',textAlign:'center',width:'30px'}}></th>
                          </tr>
                        </thead>
                        <tbody>
                          {visionResults.events.map((ev, i) => (
                            <React.Fragment key={i}>
                              <tr
                                style={{borderBottom:'1px solid var(--border)',cursor:'pointer',background:visionEditIdx===i?'var(--surface)':'transparent'}}
                                onClick={() => setVisionEditIdx(visionEditIdx === i ? -1 : i)}
                              >
                                <td style={{padding:'6px 8px',whiteSpace:'nowrap',color:'var(--text)',fontSize:'0.73rem'}}>{ev.date ? ev.date.replace(/, \d{4}$/, '') : '?'}</td>
                                <td style={{padding:'6px 8px',whiteSpace:'nowrap',color:'var(--text-muted)',fontSize:'0.73rem'}}>{ev.time || '?'}</td>
                                <td style={{padding:'6px 8px',color:'var(--text)',fontSize:'0.73rem',maxWidth:'220px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                  {ev.is_satellite && <span style={{fontSize:'0.6rem',padding:'1px 4px',borderRadius:'3px',background:'rgba(139,92,246,0.2)',color:'#a78bfa',marginRight:'4px',fontWeight:600}}>SAT</span>}
                                  {ev.is_restart && <span style={{fontSize:'0.6rem',padding:'1px 4px',borderRadius:'3px',background:'rgba(234,179,8,0.2)',color:'#eab308',marginRight:'4px',fontWeight:600}}>Restart</span>}
                                  {ev.event_name || '(unnamed)'}
                                  {ev._warnings && ev._warnings.length > 0 && <span style={{color:'#eab308',marginLeft:'4px'}} title={ev._warnings.join(', ')}>!</span>}
                                </td>
                                <td style={{padding:'6px 8px',textAlign:'right',color:'var(--text)',fontWeight:600,fontSize:'0.73rem'}}>{ev.buyin != null ? `$${ev.buyin.toLocaleString()}` : '—'}</td>
                                <td style={{padding:'6px 4px',textAlign:'center'}}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); removeVisionEvent(i); }}
                                    style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',fontSize:'0.7rem',padding:'2px 4px',lineHeight:1}}
                                    title="Remove event"
                                  >x</button>
                                </td>
                              </tr>
                              {visionEditIdx === i && (
                                <tr style={{borderBottom:'1px solid var(--border)',background:'var(--surface)'}}>
                                  <td colSpan={5} style={{padding:'8px'}}>
                                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'6px',fontSize:'0.75rem'}}>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Event Name</span>
                                        <input type="text" value={ev.event_name || ''} onChange={e => updateVisionEvent(i, 'event_name', e.target.value)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                      </label>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Variant</span>
                                        <input type="text" value={ev.game_variant || ''} onChange={e => updateVisionEvent(i, 'game_variant', e.target.value)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                      </label>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Date</span>
                                        <input type="text" value={ev.date || ''} onChange={e => updateVisionEvent(i, 'date', e.target.value)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                      </label>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Time</span>
                                        <input type="text" value={ev.time || ''} onChange={e => updateVisionEvent(i, 'time', e.target.value)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                      </label>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Buy-in ($)</span>
                                        <input type="number" value={ev.buyin || 0} onChange={e => updateVisionEvent(i, 'buyin', parseInt(e.target.value) || 0)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                      </label>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Venue</span>
                                        <input type="text" value={ev.venue || ''} onChange={e => updateVisionEvent(i, 'venue', e.target.value)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                      </label>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Starting Chips</span>
                                        <input type="number" value={ev.starting_chips || ''} onChange={e => updateVisionEvent(i, 'starting_chips', parseInt(e.target.value) || null)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                      </label>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Guarantee ($)</span>
                                        <input type="number" value={ev.guarantee || ''} onChange={e => updateVisionEvent(i, 'guarantee', parseInt(e.target.value) || null)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                      </label>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Level Duration</span>
                                        <input type="text" value={ev.level_duration || ''} onChange={e => updateVisionEvent(i, 'level_duration', e.target.value)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                      </label>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Re-entry</span>
                                        <input type="text" value={ev.reentry || ''} onChange={e => updateVisionEvent(i, 'reentry', e.target.value)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                      </label>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Event #</span>
                                        <input type="text" value={ev.event_number || ''} onChange={e => updateVisionEvent(i, 'event_number', e.target.value || null)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                      </label>
                                      <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                        <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Category</span>
                                        <select value={ev.category || ''} onChange={e => updateVisionEvent(i, 'category', e.target.value || null)} style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}}>
                                          <option value="">—</option>
                                          <option value="main">Main Event</option>
                                          <option value="side">Side Event</option>
                                        </select>
                                      </label>
                                    </div>
                                    <div style={{display:'flex',flexWrap:'wrap',gap:'12px',marginTop:'8px',fontSize:'0.75rem'}}>
                                      <label style={{display:'flex',alignItems:'center',gap:'4px',cursor:'pointer',color:'var(--text-muted)'}}>
                                        <input type="checkbox" checked={!!ev.is_satellite} onChange={e => {
                                          updateVisionEvent(i, 'is_satellite', e.target.checked);
                                          if (e.target.checked) updateVisionEvent(i, 'is_restart', false);
                                        }} />
                                        Satellite
                                      </label>
                                      <label style={{display:'flex',alignItems:'center',gap:'4px',cursor:'pointer',color:'var(--text-muted)'}}>
                                        <input type="checkbox" checked={!!ev.is_restart} onChange={e => {
                                          updateVisionEvent(i, 'is_restart', e.target.checked);
                                          if (e.target.checked) { updateVisionEvent(i, 'is_satellite', false); updateVisionEvent(i, 'buyin', 0); }
                                        }} />
                                        Restart (Day 2+)
                                      </label>
                                      <label style={{display:'flex',alignItems:'center',gap:'4px',cursor:'pointer',color:'var(--text-muted)'}}>
                                        <input type="checkbox" checked={!!ev.is_multi_flight} onChange={e => updateVisionEvent(i, 'is_multi_flight', e.target.checked)} />
                                        Multi-flight
                                      </label>
                                      {ev.is_satellite && (
                                        <label style={{display:'flex',flexDirection:'column',gap:'2px',flex:1,minWidth:'120px'}}>
                                          <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Target Event</span>
                                          <input type="text" value={ev.target_event || ''} onChange={e => updateVisionEvent(i, 'target_event', e.target.value || null)} placeholder="e.g. Main Event" style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                        </label>
                                      )}
                                      {ev.is_restart && (
                                        <label style={{display:'flex',flexDirection:'column',gap:'2px',flex:1,minWidth:'120px'}}>
                                          <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Parent Event</span>
                                          <input type="text" value={ev.parent_event || ''} onChange={e => updateVisionEvent(i, 'parent_event', e.target.value || null)} placeholder="e.g. Event 1" style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem'}} />
                                        </label>
                                      )}
                                      {ev.is_multi_flight && (
                                        <label style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                                          <span style={{color:'var(--text-muted)',fontSize:'0.65rem',textTransform:'uppercase'}}>Flight</span>
                                          <input type="text" value={ev.flight_letter || ''} onChange={e => updateVisionEvent(i, 'flight_letter', e.target.value || null)} placeholder="A, B, C..." style={{padding:'4px 6px',borderRadius:'4px',border:'1px solid var(--border)',background:'var(--bg)',color:'var(--text)',fontSize:'0.75rem',width:'50px'}} />
                                        </label>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{display:'flex',gap:'8px',marginTop:'12px',justifyContent:'flex-end'}}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setVisionResults(null); setVisionFile(null); }}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={handleVisionImport}
                        disabled={visionImporting || !visionResults.events.length}
                        style={{display:'inline-flex',alignItems:'center',gap:'6px'}}
                      >
                        {visionImporting ? 'Importing...' : `Add ${visionResults.events.length} Events to Database`}
                      </button>
                    </div>
                  </div>
                )}

                {visionResults && visionResults.events.length === 0 && (
                  <div style={{padding:'12px',background:'var(--surface)',borderRadius:'8px',border:'1px solid var(--border)',color:'var(--text-muted)',fontSize:'0.8rem',textAlign:'center'}}>
                    No tournament events found in the uploaded file. Try a different file or check that it contains a tournament schedule.
                    {visionResults.pageErrors && visionResults.pageErrors.length > 0 && (
                      <div style={{marginTop:'8px',fontSize:'0.75rem',color:'var(--accent)',textAlign:'left'}}>
                        {visionResults.pageErrors.map((pe, i) => (
                          <div key={i}>⚠ {pe.error}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-section-label">Debug Tools</div>
            <div className="settings-card">
              <div className="settings-row" style={{flexDirection:'column',alignItems:'stretch',gap:'8px'}}>
                <span className="settings-row-label">Simulated date & time</span>
                <input
                  className="settings-debug-input"
                  type="datetime-local"
                  value={debugInput ? debugInput.slice(0,16) : ''}
                  onChange={e => {
                    const v = e.target.value ? e.target.value + ':00' : '';
                    applyDebugTime(v);
                  }}
                />
                {debugInput && (
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{alignSelf:'flex-start',marginTop:'4px'}}
                    onClick={() => applyDebugTime('')}
                  >Reset to real time</button>
                )}
              </div>
            </div>
          </div>

          <div className="settings-section">
            <div className="settings-about">
              <h3>futurega.me</h3>
              <p>spring/summer 2026 — wsop tournament scheduler</p>
              <p style={{marginTop:'8px',fontSize:'0.7rem',opacity:0.5}}>v0.1.0</p>
            </div>
          </div>

        </div>
      );
    }

    // ── Hand Replayer ─────────────────────────────────────────

    // Street definitions by game category
    const STREET_DEFS = {
      community: { streets: ['Preflop', 'Flop', 'Turn', 'River'], boardCards: [0, 3, 1, 1] },
      draw_triple: { streets: ['Pre-Draw', 'Draw 1', 'Draw 2', 'Draw 3'], boardCards: [0, 0, 0, 0] },
      draw_single: { streets: ['Pre-Draw', 'Draw'], boardCards: [0, 0] },
      stud: { streets: ['3rd Street', '4th Street', '5th Street', '6th Street', '7th Street'], boardCards: [0, 0, 0, 0, 0] },
    };


    // ── App ────────────────────────────────────────────────────

    function App() {
      const [token, setToken] = useState(localStorage.getItem('token') || sessionStorage.getItem('token'));
      const [username, setUsername] = useState(localStorage.getItem('username') || sessionStorage.getItem('username'));
      const [isGuest, setIsGuest] = useState(localStorage.getItem('isGuest') === 'true');
      const [authView, setAuthView] = useState('login');
      const [currentView, _setCurrentView] = useState('dashboard');
      const [viewKey, setViewKey] = useState(0);
      const [showExportFromMore, setShowExportFromMore] = useState(false);
      const [visitedTabs, setVisitedTabs] = useState(new Set(['dashboard']));
      const scrollPositions = useRef({});
      const setCurrentView = useCallback((v) => {
        _setCurrentView(prev => {
          if (v !== prev) {
            // Save scroll position of outgoing tab
            const container = document.querySelector('.content-area');
            if (container) scrollPositions.current[prev] = container.scrollTop;
            // Mark tab as visited so it stays mounted
            setVisitedTabs(s => { const n = new Set(s); n.add(v); return n; });
            // Restore scroll position after React renders the new tab
            requestAnimationFrame(() => {
              const c = document.querySelector('.content-area');
              if (c && scrollPositions.current[v] != null) {
                c.scrollTop = scrollPositions.current[v];
              } else if (v === 'tournaments' && c) {
                // First visit to Schedule tab — scroll date group to top
                const todayEl = c.querySelector('[data-today-scroll]');
                if (todayEl) {
                  const filters = c.querySelector('.sticky-filters');
                  const filtersH = filters ? filters.getBoundingClientRect().bottom - c.getBoundingClientRect().top : 0;
                  const groupAbsTop = todayEl.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop;
                  c.scrollTop = Math.max(0, groupAbsTop - filtersH);
                }
              }
              // Restart fade animation on the active tab panel
              const panel = c && c.querySelector('.tab-panel.tab-active');
              if (panel) {
                panel.style.animation = 'none';
                panel.offsetHeight; // force reflow
                panel.style.animation = '';
              }
            });
          }
          return v;
        });
      }, []);
      const [tournaments, setTournaments] = useState([]);
      const [mySchedule, setMySchedule] = useState([]);
      const [dataLoaded, setDataLoaded] = useState(false);
      const [gameVariants, setGameVariants] = useState([]);
      const [venues, setVenues] = useState([]);
      const toast = useToast();
      const [error, setError] = useState('');
      const [success, setSuccess] = useState('');
      const [uploadError, setUploadError] = useState('');
      const [uploadSuccess, setUploadSuccess] = useState('');
      const [uploadVenue, setUploadVenue] = useState('');
      const [debugTimeKey, setDebugTimeKey] = useState(0);

      // ── Avatar state ──
      const [avatar, setAvatar] = useState(localStorage.getItem('avatar') || null);

      // ── Hand replayer access ──
      const [handReplayerAccess, setHandReplayerAccess] = useState(localStorage.getItem('handReplayerAccess') === 'true');

      // ── Real name / display name state ──
      const [realName, setRealName] = useState(localStorage.getItem('realName') || null);
      const [showRealNamePrompt, setShowRealNamePrompt] = useState(false);
      const [nameMode, setNameMode] = useState(localStorage.getItem('displayNameMode') || 'real');
      const displayName = useCallback((user) => {
        if (nameMode === 'username') return user.username;
        return user.real_name || user.username;
      }, [nameMode]);

      // ── Sharing state ──
      const [shareToken, setShareToken] = useState(null);
      const [shareBuddies, setShareBuddies] = useState([]);
      const [pendingIncoming, setPendingIncoming] = useState([]);
      const [pendingOutgoing, setPendingOutgoing] = useState([]);
      const [lastSeenShares, setLastSeenShares] = useState(null);
      const [buddyEvents, setBuddyEvents] = useState({});
      const [swapModalData, setSwapModalData] = useState(null); // { buddy, tournament }
      const onBuddySwap = useCallback((buddy, tournament) => setSwapModalData({ buddy, tournament }), []);
      const [newShareCount, setNewShareCount] = useState(0);
      const [shareError, setShareError] = useState('');
      const [shareSuccess, setShareSuccess] = useState('');

      // ── Tracking state ──
      const [trackingData, setTrackingData] = useState([]);

      // ── Live Update state ──
      const [myActiveUpdates, setMyActiveUpdates] = useState([]);
      const [buddyLiveUpdates, setBuddyLiveUpdates] = useState({});

      // ── Groups state ──
      const [myGroups, setMyGroups] = useState([]);
      const [activeGroupId, setActiveGroupId] = useState(null);
      const [groupFeed, setGroupFeed] = useState([]);
      const [groupSchedule, setGroupSchedule] = useState([]);

      // ── Notifications ──
      const [notifications, setNotifications] = useState({ groupInvites: [], buddyRequests: [], acceptedBuddies: [] });
      const [showNotifications, setShowNotifications] = useState(false);
      const [showUserMenu, setShowUserMenu] = useState(false);

      // ── Milestones ──
      const [activeMilestone, setActiveMilestone] = useState(null);

      // ── Theme ──
      const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
      const [contrast, setContrast] = useState(localStorage.getItem('contrast') || 'normal');
      const [cardSplay, setCardSplay] = useState(localStorage.getItem('cardSplay') !== 'off');
      const [serifFont, setSerifFont] = useState(localStorage.getItem('serifFont') || 'baskerville');

      useEffect(() => {
        document.documentElement.dataset.theme = theme;
        localStorage.setItem('theme', theme);
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', THEME_META[theme] || '#111111');
      }, [theme]);

      useEffect(() => {
        document.documentElement.dataset.contrast = contrast;
        localStorage.setItem('contrast', contrast);
      }, [contrast]);

      useEffect(() => {
        document.documentElement.dataset.serif = serifFont === 'baskerville' ? '' : serifFont;
        localStorage.setItem('serifFont', serifFont);
      }, [serifFont]);

      const toggleTheme = () => setTheme(t => {
        const i = THEME_ORDER.indexOf(t);
        return THEME_ORDER[(i + 1) % THEME_ORDER.length];
      });
      const nextThemeLabel = THEME_LABEL[THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]];
      const toggleContrast = () => setContrast(c => c === 'normal' ? 'high' : 'normal');

      // ── Pull-to-refresh ──
      const contentAreaRef = useRef(null);
      const refreshAll = useCallback(async () => {
        if (!token) return;
        await Promise.all([
          fetchTournaments(), fetchMySchedule(), fetchTracking(),
          fetchMyLiveUpdate(), fetchShareBuddies(), fetchNotifications()
        ]);
      }, [token]);
      const { ptrProps, ptrIndicator, refreshing } = usePullToRefresh(contentAreaRef, refreshAll);

      useEffect(() => {
        if (token) {
          Promise.all([
            fetchTournaments(), fetchMySchedule(), fetchGameVariants(),
            fetchVenues(), fetchShareToken(), fetchShareBuddies(),
            fetchMyGroups(), fetchNotifications(), fetchTracking(), fetchMyLiveUpdate()
          ]).finally(() => setDataLoaded(true));
        }
      }, [token]);

      // ── SSE: real-time buddy updates ──
      useEffect(() => {
        if (!token) return;
        const es = new EventSource(`${API_URL}/events?token=${token}`);

        es.addEventListener('buddy-live-update', (e) => {
          try {
            const d = JSON.parse(e.data);
            if (d.cleared) {
              setBuddyLiveUpdates(prev => {
                const next = { ...prev };
                delete next[d.buddyId];
                return next;
              });
            } else {
              setBuddyLiveUpdates(prev => ({ ...prev, [d.buddyId]: {
                tournamentId: d.tournamentId, eventName: d.eventName, venue: d.venue,
                stack: d.stack, sb: d.sb, bb: d.bb, bbAnte: d.bbAnte,
                isItm: d.isItm, isRegClosed: d.isRegClosed, bubble: d.bubble,
                lockedAmount: d.lockedAmount, isFinalTable: d.isFinalTable,
                placesLeft: d.placesLeft, firstPlacePrize: d.firstPlacePrize,
                isDeal: d.isDeal, dealPlace: d.dealPlace, dealPayout: d.dealPayout,
                isBusted: d.isBusted, totalEntries: d.totalEntries,
                isBagged: d.isBagged, bagDay: d.bagDay,
                playStartedAt: d.playStartedAt, updatedAt: d.updatedAt
              }}));
            }
          } catch (err) { console.error('SSE buddy-live-update error:', err); }
        });

        es.addEventListener('buddy-schedule-change', () => fetchShareBuddies());
        es.addEventListener('buddy-request', () => { fetchShareBuddies(); fetchNotifications(); });
        es.addEventListener('buddy-tracking', () => {}); // future use

        // Group SSE events
        es.addEventListener('group-message', (e) => {
          try {
            const d = JSON.parse(e.data);
            setGroupFeed(prev => [...prev, {
              id: Date.now(),
              type: 'message',
              user_id: d.userId,
              username: d.username,
              avatar: d.avatar,
              content: d.message,
              created_at: d.createdAt
            }]);
            // Refresh group list for last-message preview
            fetchMyGroups();
          } catch (err) { console.error('SSE group-message error:', err); }
        });
        es.addEventListener('group-updated', () => fetchMyGroups());
        es.addEventListener('group-deleted', (e) => {
          try {
            const d = JSON.parse(e.data);
            fetchMyGroups();
            setActiveGroupId(prev => prev === d.groupId ? null : prev);
          } catch (e) { console.error('SSE group-removed:', e); }
        });
        es.addEventListener('group-live-update', (e) => {
          try {
            const d = JSON.parse(e.data);
            if (!d.cleared) {
              setGroupFeed(prev => [...prev, {
                id: Date.now(),
                type: 'live-update',
                user_id: d.userId,
                username: d.username,
                content: null,
                liveData: d,
                created_at: d.updatedAt
              }]);
            }
          } catch (err) { console.error('SSE group-live-update error:', err); }
        });
        es.addEventListener('group-invite', () => fetchNotifications());
        es.addEventListener('group-invite-response', () => { fetchNotifications(); fetchMyGroups(); });

        es.onerror = () => console.warn('SSE connection error, will auto-reconnect');

        return () => es.close();
      }, [token]);

      // ── Push notifications (admin only) ──
      useEffect(() => {
        if (window.Capacitor && window.Capacitor.isNativePlatform()) return;
        if (!token || isGuest || !['ham', 'ham5'].includes((username || '').toLowerCase())) return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

        (async () => {
          try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            const existing = await reg.pushManager.getSubscription();
            if (existing) {
              await fetch(`${API_URL}/push-subscribe`, {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: existing })
              });
              return;
            }
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return;
            const keyRes = await fetch(`${API_URL}/push/vapid-key`);
            const { key } = await keyRes.json();
            if (!key) return;
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: key
            });
            await fetch(`${API_URL}/push-subscribe`, {
              method: 'POST',
              headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
              body: JSON.stringify({ subscription: sub })
            });
          } catch (err) {
            // Push setup failed silently
          }
        })();
      }, [token, username, isGuest]);

      // Auto-logout on 401/403 (expired/invalid token)
      const guardedFetch = async (url, opts) => {
        const res = await fetch(url, opts);
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('username');
          setToken(null);
          setUsername('');
          return null;
        }
        return res;
      };

      const fetchTournaments = async () => {
        try {
          const res = await guardedFetch(`${API_URL}/tournaments`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res) return;
          const data = await res.json();
          setTournaments(Array.isArray(data) ? data : []);
        } catch (e) { console.error('Fetch tournaments:', e); toast.error('Failed to load tournaments'); }
      };

      const fetchMySchedule = async () => {
        try {
          const res = await guardedFetch(`${API_URL}/my-schedule`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res) return;
          const data = await res.json();
          setMySchedule(Array.isArray(data) ? data : []);
        } catch (e) { console.error('Fetch schedule:', e); setMySchedule([]); }
      };

      const fetchGameVariants = async () => {
        try {
          const res = await guardedFetch(`${API_URL}/game-variants`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res) return;
          const data = await res.json();
          setGameVariants(Array.isArray(data) ? data : []);
        } catch (e) { console.error('Fetch game variants:', e); }
      };

      const fetchVenues = async () => {
        try {
          const res = await guardedFetch(`${API_URL}/venues`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res) return;
          const data = await res.json();
          setVenues(Array.isArray(data) ? data : []);
        } catch (e) { console.error('Fetch venues:', e); }
      };

      // ── Tracking functions ──
      const fetchTracking = async () => {
        try {
          const res = await fetch(`${API_URL}/tracking`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          setTrackingData(Array.isArray(data) ? data : []);
        } catch (e) { console.error('Fetch tracking:', e); toast.error('Failed to load tracking data'); }
      };

      const fetchMyLiveUpdate = async () => {
        try {
          const res = await guardedFetch(`${API_URL}/live-updates/active`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res) return;
          const data = await res.json();
          setMyActiveUpdates(Array.isArray(data) ? data : []);
        } catch (e) { console.error('Fetch live updates:', e); }
      };

      const postLiveUpdate = async (data) => {
        haptic();
        try {
          const res = await fetch(`${API_URL}/live-update`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          if (res.ok) fetchMyLiveUpdate();
        } catch (e) { console.error('Post live update:', e); }
      };

      const deleteLiveUpdate = async (updateId) => {
        try {
          const res = await fetch(`${API_URL}/live-update/${updateId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (res.ok) fetchMyLiveUpdate();
        } catch {}
      };

      const saveFieldSize = async (tournamentId, totalFieldSize) => {
        if (!totalFieldSize || !tournamentId) return;
        try {
          await fetch(`${API_URL}/tournaments/${tournamentId}/total-entries`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ totalEntries: totalFieldSize })
          });
          fetchTournaments();
        } catch {}
      };

      const addTracking = async (data) => {
        try {
          // Detect milestones before saving (uses current trackingData state)
          const matchedTournament = tournaments.find(tr => tr.id === data.tournamentId);
          const entryForMilestone = {
            ...data,
            buyin: matchedTournament ? matchedTournament.buyin : 0,
            event_name: matchedTournament ? matchedTournament.event_name : '',
            game_variant: matchedTournament ? matchedTournament.game_variant : 'NLH'
          };
          const milestones = detectMilestones(trackingData, entryForMilestone);

          const { totalFieldSize, ...trackingPayload } = data;
          const res = await fetch(`${API_URL}/tracking`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(trackingPayload)
          });
          if (!res.ok) {
            const err = await res.json();
            setError(err.error || 'Failed to add tracking entry');
            return;
          }
          if (totalFieldSize) await saveFieldSize(data.tournamentId, totalFieldSize);
          fetchTracking();

          // Show first milestone if any were detected
          if (milestones.length > 0) {
            setActiveMilestone(milestones[0]);
          }
        } catch { setError('Failed to add tracking entry'); }
      };

      const updateTracking = async (entryId, data) => {
        try {
          const { totalFieldSize, tournamentId, ...trackingData } = data;
          const res = await fetch(`${API_URL}/tracking/${entryId}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(trackingData)
          });
          if (!res.ok) {
            const err = await res.json();
            setError(err.error || 'Failed to update tracking entry');
            return;
          }
          if (totalFieldSize && tournamentId) await saveFieldSize(tournamentId, totalFieldSize);
          fetchTracking();
        } catch { setError('Failed to update tracking entry'); }
      };

      const deleteTracking = async (entryId) => {
        try {
          await fetch(`${API_URL}/tracking/${entryId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          fetchTracking();
        } catch { setError('Failed to delete tracking entry'); }
      };

      // ── Sharing functions ──
      const fetchShareToken = async () => {
        try {
          const res = await fetch(`${API_URL}/share-token`, { headers: { Authorization: `Bearer ${token}` } });
          const data = await res.json();
          setShareToken(data.token);
        } catch {}
      };
      const fetchShareBuddies = async () => {
        try {
          const res = await fetch(`${API_URL}/share-buddies`, { headers: { Authorization: `Bearer ${token}` } });
          const data = await res.json();
          setShareBuddies(data.buddies || []);
          setPendingIncoming(data.pendingIncoming || []);
          setPendingOutgoing(data.pendingOutgoing || []);
          setBuddyEvents(data.buddyEvents || {});
          setBuddyLiveUpdates(data.buddyLiveUpdates || {});
          const lss = data.lastSeenShares || null;
          setLastSeenShares(lss);
          // Unseen = new buddies since last seen + pending incoming
          const newBuddies = (data.buddies || []).filter(b => !lss || b.since > lss).length;
          setNewShareCount(newBuddies + (data.pendingIncoming || []).length);
        } catch {}
      };

      // ── Groups fetch functions ──
      const fetchMyGroups = async () => {
        try {
          const res = await fetch(`${API_URL}/groups`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            setMyGroups(Array.isArray(data) ? data : []);
          }
        } catch {}
      };
      const fetchGroupFeed = async (groupId) => {
        try {
          const res = await fetch(`${API_URL}/groups/${groupId}/feed`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            setGroupFeed(Array.isArray(data) ? data : []);
          }
        } catch {}
      };
      const fetchGroupSchedule = async (groupId) => {
        try {
          const res = await fetch(`${API_URL}/groups/${groupId}/schedule`, { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            setGroupSchedule(Array.isArray(data) ? data : []);
          }
        } catch {}
      };

      const fetchNotifications = async () => {
        try {
          const res = await fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } });
          if (res.ok) {
            const data = await res.json();
            setNotifications({
              groupInvites: data.groupInvites || [],
              buddyRequests: data.buddyRequests || [],
              acceptedBuddies: data.acceptedBuddies || [],
              swapSuggestions: data.swapSuggestions || []
            });
          }
        } catch {}
      };

      const markNotificationsSeen = async () => {
        try {
          await fetch('/api/seen-notifications', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch {}
      };

      const notifCount = notifications.groupInvites.length + notifications.buddyRequests.length + notifications.acceptedBuddies.length;

      const handleGenerateShareToken = async () => {
        try {
          const res = await fetch(`${API_URL}/share-token`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
          const data = await res.json();
          setShareToken(data.token);
        } catch {}
      };
      const handleRevokeShareToken = async () => {
        try {
          await fetch(`${API_URL}/share-token`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
          setShareToken(null);
        } catch {}
      };
      const handleSendShareRequest = async (e) => {
        e.preventDefault();
        const username = new FormData(e.target).get('shareUsername');
        if (!username) return;
        try {
          const res = await fetch(`${API_URL}/share-request`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
          });
          const data = await res.json();
          if (!res.ok) { toast.error(data.error); return; }
          toast.success(data.message);
          e.target.reset();
          fetchShareBuddies();
        } catch { toast.error('Failed to send request'); }
      };
      const handleAcceptRequest = async (id) => {
        try {
          await fetch(`${API_URL}/share-request/${id}/accept`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
          fetchShareBuddies();
        } catch {}
      };
      const handleRejectRequest = async (id) => {
        try {
          await fetch(`${API_URL}/share-request/${id}/reject`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
          fetchShareBuddies();
        } catch {}
      };
      const handleCancelRequest = async (id) => {
        try {
          await fetch(`${API_URL}/share-request/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
          fetchShareBuddies();
        } catch {}
      };
      const handleRemoveBuddy = async (userId) => {
        try {
          await fetch(`${API_URL}/share-buddy/${userId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
          fetchShareBuddies();
        } catch {}
      };

      const handleLogin = async (e, isRegister = false, keepSignedIn = true) => {
        e.preventDefault();
        setError(''); setSuccess('');
        const fd = new FormData(e.target);
        const email = fd.get('email');
        const password = fd.get('password');
        const usernameInput = fd.get('username');
        const realNameInput = fd.get('realName');

        try {
          const endpoint = isRegister ? '/register' : '/login';
          const body = isRegister
            ? { username: usernameInput, email, password, realName: realNameInput }
            : { email, password };

          const res = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          const data = await res.json();
          if (!res.ok) { setError(data.error || 'Authentication failed'); return; }

          if (isRegister) {
            setSuccess('Account created! Please sign in.');
          } else {
            const store = keepSignedIn ? localStorage : sessionStorage;
            store.setItem('token', data.token);
            store.setItem('username', data.username);
            if (data.avatar) store.setItem('avatar', data.avatar);
            else store.removeItem('avatar');
            if (data.realName) store.setItem('realName', data.realName);
            else store.removeItem('realName');
            store.setItem('handReplayerAccess', data.handReplayerAccess ? 'true' : 'false');
            if (!keepSignedIn) localStorage.setItem('sessionOnly', 'true');
            setToken(data.token);
            setUsername(data.username);
            setAvatar(data.avatar || null);
            setRealName(data.realName || null);
            setHandReplayerAccess(!!data.handReplayerAccess);
            if (!data.realName) setShowRealNamePrompt(true);
          }
        } catch { setError('Network error. Please try again.'); }
      };

      const handleGuestLogin = async () => {
        setError(''); setSuccess('');
        try {
          const res = await fetch(`${API_URL}/guest-login`, { method: 'POST' });
          const data = await res.json();
          if (!res.ok) { setError(data.error || 'Guest login failed'); return; }
          localStorage.setItem('token', data.token);
          localStorage.setItem('username', data.username);
          localStorage.setItem('isGuest', 'true');
          localStorage.removeItem('avatar');
          setToken(data.token);
          setUsername(data.username);
          setIsGuest(true);
          setAvatar(null);
        } catch { setError('Network error. Please try again.'); }
      };

      const handleLogout = () => {
        ['token','username','avatar','isGuest','realName','sessionOnly'].forEach(k => {
          localStorage.removeItem(k);
          sessionStorage.removeItem(k);
        });
        setToken(null);
        setUsername(null);
        setIsGuest(false);
        setAvatar(null);
        setRealName(null);
        setShowRealNamePrompt(false);
        setCurrentView('dashboard');
        setTournaments([]);
        setMySchedule([]);
        setShareToken(null);
        setShareBuddies([]);
        setPendingIncoming([]);
        setPendingOutgoing([]);
        setLastSeenShares(null);
        setNewShareCount(0);
        setNotifications({ groupInvites: [], buddyRequests: [], acceptedBuddies: [] });
        setShowNotifications(false);
        setShareError('');
        setShareSuccess('');
        setTrackingData([]);
        setBuddyEvents({});
      };

      const handleAvatarUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('avatar', file);
        try {
          const res = await fetch(`${API_URL}/avatar`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}` },
            body: fd
          });
          const data = await res.json();
          if (res.ok) {
            setAvatar(data.avatar);
            localStorage.setItem('avatar', data.avatar);
          }
        } catch {}
        e.target.value = '';
      };

      const handleAvatarRemove = async () => {
        try {
          await fetch(`${API_URL}/avatar`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          setAvatar(null);
          localStorage.removeItem('avatar');
        } catch {}
      };

      const adminEditTournament = async (tournamentId, fields) => {
        const res = await fetch(`/api/tournaments/${tournamentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(fields),
        });
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to save'); }
        const updated = await res.json();
        // Update local tournaments state
        setTournaments(prev => prev.map(t => t.id === tournamentId ? { ...t, ...updated } : t));
        // Also update mySchedule if this event is in user's schedule
        setMySchedule(prev => prev.map(t => t.id === tournamentId ? { ...t, ...updated } : t));
        toast.success('Event updated');
      };

      const toggleTournament = async (tournamentId) => {
        haptic();
        const existing = mySchedule.find(t => t.id === tournamentId);
        const isIn = !!existing;
        try {
          if (isIn) {
            if (existing.venue === 'Personal') {
              await fetch(`${API_URL}/personal-event/${tournamentId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
              });
            } else {
              await fetch(`${API_URL}/schedule/${tournamentId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
              });
            }
          } else {
            await fetch(`${API_URL}/schedule`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ tournamentId })
            });
          }
          fetchMySchedule();
        } catch { setError('Failed to update schedule'); }
      };

      const addPersonalEvent = async (date, type, notes) => {
        try {
          const res = await fetch(`${API_URL}/personal-event`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ date, type, notes: notes || '' })
          });
          if (!res.ok) {
            const data = await res.json();
            setError(data.error || 'Failed to create personal event');
            return;
          }
          fetchMySchedule();
        } catch { setError('Failed to create personal event'); }
      };

      const updatePersonalEvent = async (tournamentId, notes) => {
        try {
          await fetch(`${API_URL}/personal-event/${tournamentId}`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ notes })
          });
          fetchMySchedule();
        } catch { setError('Failed to update personal event'); }
      };

      const setCondition = async (tournamentId, conditions, isPublic) => {
        try {
          await fetch(`${API_URL}/schedule/${tournamentId}/condition`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ conditions, isPublic })
          });
          fetchMySchedule();
        } catch { setError('Failed to set condition'); }
      };

      const removeCondition = async (tournamentId) => {
        try {
          await fetch(`${API_URL}/schedule/${tournamentId}/condition`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
          });
          fetchMySchedule();
        } catch { setError('Failed to remove condition'); }
      };

      const toggleAnchor = async (tournamentId, isAnchor) => {
        try {
          await fetch(`${API_URL}/schedule/${tournamentId}/anchor`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ isAnchor })
          });
          fetchMySchedule();
        } catch { setError('Failed to update anchor status'); }
      };

      const setPlannedEntries = async (tournamentId, plannedEntries) => {
        try {
          await fetch(`${API_URL}/schedule/${tournamentId}/entries`, {
            method: 'PUT',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ plannedEntries })
          });
          fetchMySchedule();
        } catch { setError('Failed to update planned entries'); }
      };

      const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('pdf', file);
        if (uploadVenue) fd.append('venue', uploadVenue);
        try {
          toast.info('Uploading and parsing PDF…');
          const res = await fetch(`${API_URL}/upload-schedule`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: fd
          });
          const data = await res.json();
          toast.success(`Imported ${data.tournamentsCount} tournaments from ${data.format === 'wsop' ? 'WSOP' : 'generic'} format!`);
          setUploadVenue('');
          fetchTournaments();
        } catch { toast.error('Failed to upload schedule'); }
      };

      if (!token) {
        if (authView === 'forgot') {
          return <ForgotPasswordForm
            onBack={() => setAuthView('login')}
            theme={theme}
            toggleTheme={toggleTheme}
          />;
        }
        return <AuthScreen
          onSubmit={handleLogin}
          error={error}
          success={success}
          theme={theme}
          toggleTheme={toggleTheme}
          onForgotPassword={() => { setError(''); setSuccess(''); setAuthView('forgot'); }}
          onGuestLogin={handleGuestLogin}
          initialRegister={authView === 'register'}
        />;
      }

      return (
        <DisplayNameContext.Provider value={displayName}>
        <div className="app-shell">
          <header className="top-bar">
            <div className="top-bar-title">
              <h1>futurega.me</h1>
              <small>spring/summer 2026</small>
            </div>
            <div className="top-bar-actions">
              <button
                className="notif-btn btn btn-ghost btn-icon"
                onClick={() => {
                  setShowNotifications(prev => {
                    if (!prev) markNotificationsSeen();
                    return !prev;
                  });
                }}
                title="Notifications"
              >
                <Icon.bell />
                {notifCount > 0 && <span className="notif-badge">{notifCount}</span>}
              </button>
              <LiveUpdateButton
                mySchedule={mySchedule}
                myActiveUpdates={myActiveUpdates}
                onPost={postLiveUpdate}
                onAddTracking={addTracking}
              />
              <button className="btn btn-ghost btn-icon" onClick={toggleTheme} title={`Switch to ${nextThemeLabel} mode`}>
                {React.createElement(Icon[THEME_ICON[theme]] || Icon.moon)}
              </button>
              <div style={{position:'relative',minWidth:0,flexShrink:1}}>
                <button className="username-chip" onClick={() => setShowUserMenu(m => !m)} style={{display:'flex',alignItems:'center',gap:'6px',marginLeft:'2px',background:'none',border:'none',padding:0,cursor:'pointer',maxWidth:'100%',overflow:'hidden'}}>
                  <Avatar src={avatar} username={username} size={22} style={{flexShrink:0}} />
                  <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{nameMode === 'username' ? username : (realName || username)}</span>
                </button>
                {showUserMenu && ReactDOM.createPortal(
                  <>
                    <div style={{position:'fixed',inset:0,zIndex:9998}} onClick={() => setShowUserMenu(false)} />
                    <div style={{position:'fixed',top:'52px',right:'12px',zIndex:9999,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'8px',padding:'4px 0',minWidth:'160px',boxShadow:'0 8px 24px rgba(0,0,0,0.4)',fontFamily:'Univers Condensed, Univers, sans-serif'}}>
                      <button onClick={() => { setShowUserMenu(false); setCurrentView('schedule'); }}
                        style={{display:'block',width:'100%',textAlign:'left',padding:'10px 16px',background:'none',border:'none',color:'var(--text)',cursor:'pointer',fontSize:'0.85rem'}}>
                        My Schedule
                      </button>
                      <div style={{height:'1px',background:'var(--border)',margin:'2px 0'}} />
                      <button onClick={() => { setShowUserMenu(false); handleLogout(); }}
                        style={{display:'block',width:'100%',textAlign:'left',padding:'10px 16px',background:'none',border:'none',color:'var(--text-muted)',cursor:'pointer',fontSize:'0.85rem'}}>
                        Sign Out
                      </button>
                    </div>
                  </>,
                  document.body
                )}
              </div>
            </div>
          </header>

          {isGuest && (
            <div style={{background:'var(--accent)',color:'#000',padding:'8px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:'0.8rem',fontFamily:'Univers Condensed, Univers, sans-serif'}}>
              <span>Guest mode — your schedule won't be saved. Register to keep it!</span>
              <button onClick={() => { handleLogout(); setAuthView('register'); }}
                style={{background:'rgba(0,0,0,0.2)',color:'#000',border:'none',borderRadius:'4px',padding:'4px 12px',cursor:'pointer',fontSize:'0.75rem',fontWeight:600,fontFamily:'Univers Condensed, Univers, sans-serif'}}>
                Register
              </button>
            </div>
          )}

          {showRealNamePrompt && (
            <RealNamePrompt
              onSave={(name) => { setRealName(name); localStorage.setItem('realName', name); setShowRealNamePrompt(false); }}
              onDismiss={() => setShowRealNamePrompt(false)}
            />
          )}

          {showNotifications && (
            <NotificationsPanel
              notifications={notifications}
              token={token}
              onClose={() => setShowNotifications(false)}
              fetchNotifications={fetchNotifications}
              fetchShareBuddies={fetchShareBuddies}
              fetchMyGroups={fetchMyGroups}
            />
          )}

          <main className="content-area ptr-container" ref={contentAreaRef} {...ptrProps}>
            <div className={'ptr-indicator' + (refreshing ? ' visible' : '')} ref={ptrIndicator}>
              <div className={'ptr-spinner' + (refreshing ? ' spinning' : '')} />
            </div>
            {/* ── Tab panels: visited tabs stay mounted, only active is visible ── */}
            <div className={'tab-panel' + (currentView === 'dashboard' ? ' tab-active' : '')} data-tab="dashboard" style={{display: currentView === 'dashboard' ? undefined : 'none', height: currentView === 'dashboard' ? '100%' : undefined}}>
            {visitedTabs.has('dashboard') && (!dataLoaded ? <SkeletonDashboard /> :
              <DashboardView
                key={debugTimeKey}
                mySchedule={mySchedule}
                myActiveUpdates={myActiveUpdates}
                trackingData={trackingData}
                shareBuddies={shareBuddies}
                buddyLiveUpdates={buddyLiveUpdates}
                displayName={displayName}
                buddyEvents={buddyEvents}
                onPost={postLiveUpdate}
                onDeleteUpdate={deleteLiveUpdate}
                onAddTracking={addTracking}
                tournaments={tournaments}
                onToggle={toggleTournament}
                onNavigate={(v) => {
                  if (v === '_liveUpdate') {
                    const btn = document.querySelector('.live-update-btn');
                    if (btn) btn.click();
                    return;
                  }
                  if (v === '_share') {
                    setCurrentView('settings');
                    return;
                  }
                  setCurrentView(v);
                }}
              />
            )}
            </div>

            <div className={'tab-panel' + (currentView === 'tournaments' ? ' tab-active' : '')} data-tab="tournaments" style={{display: currentView === 'tournaments' ? undefined : 'none', height: currentView === 'tournaments' ? '100%' : undefined}}>
            {visitedTabs.has('tournaments') && (!dataLoaded ? <SkeletonSchedule /> :
              <TournamentsView
                key={debugTimeKey}
                tournaments={tournaments}
                mySchedule={mySchedule}
                onToggle={toggleTournament}
                gameVariants={gameVariants}
                venues={venues}
                onSetCondition={setCondition}
                onRemoveCondition={removeCondition}
                onToggleAnchor={toggleAnchor}
                onSetPlannedEntries={setPlannedEntries}
                buddyEvents={buddyEvents}
                buddyLiveUpdates={buddyLiveUpdates}
                onBuddySwap={onBuddySwap}
                onImport={() => setCurrentView('settings')}
                isAdmin={['ham', 'ham5'].includes((username || '').toLowerCase())}
                onAdminEdit={adminEditTournament}
              />
            )}
            </div>

            <div className={'tab-panel' + (currentView === 'schedule' ? ' tab-active' : '')} data-tab="schedule" style={{display: currentView === 'schedule' ? undefined : 'none', height: currentView === 'schedule' ? '100%' : undefined}}>
            {visitedTabs.has('schedule') && (!dataLoaded ? <SkeletonSchedule /> :
              <ScheduleView key={debugTimeKey} mySchedule={mySchedule} onToggle={toggleTournament} shareBuddies={shareBuddies} pendingIncoming={pendingIncoming} lastSeenShares={lastSeenShares} onAcceptRequest={handleAcceptRequest} onRejectRequest={handleRejectRequest} token={token} onSetCondition={setCondition} onRemoveCondition={removeCondition} allTournaments={tournaments} onToggleAnchor={toggleAnchor} onSetPlannedEntries={setPlannedEntries} onAddPersonalEvent={addPersonalEvent} onUpdatePersonalEvent={updatePersonalEvent} buddyEvents={buddyEvents} buddyLiveUpdates={buddyLiveUpdates} onBuddySwap={onBuddySwap} isAdmin={['ham', 'ham5'].includes((username || '').toLowerCase())} onAdminEdit={adminEditTournament} />
            )}
            </div>

            <div className={'tab-panel' + (currentView === 'calendar' ? ' tab-active' : '')} data-tab="calendar" style={{display: currentView === 'calendar' ? undefined : 'none', height: currentView === 'calendar' ? '100%' : undefined}}>
            {visitedTabs.has('calendar') && (
              <CalendarView key={debugTimeKey} allTournaments={tournaments} mySchedule={mySchedule} onToggle={toggleTournament} gameVariants={gameVariants} venues={venues} onSetCondition={setCondition} onRemoveCondition={removeCondition} onToggleAnchor={toggleAnchor} onSetPlannedEntries={setPlannedEntries} buddyEvents={buddyEvents} buddyLiveUpdates={buddyLiveUpdates} />
            )}
            </div>

            <div className={'tab-panel' + (currentView === 'tracking' ? ' tab-active' : '')} data-tab="tracking" style={{display: currentView === 'tracking' ? undefined : 'none', height: currentView === 'tracking' ? '100%' : undefined}}>
            {visitedTabs.has('tracking') && (
              <TrackingView
                trackingData={trackingData}
                tournaments={tournaments}
                mySchedule={mySchedule}
                onAdd={addTracking}
                onUpdate={updateTracking}
                onDelete={deleteTracking}
                myActiveUpdates={myActiveUpdates}
              />
            )}
            </div>

            <div className={'tab-panel' + (currentView === 'hands' ? ' tab-active' : '')} data-tab="hands" style={{display: currentView === 'hands' ? undefined : 'none', height: currentView === 'hands' ? '100%' : undefined}}>
            {visitedTabs.has('hands') && (
              ['ham', 'ham5'].includes((username || '').toLowerCase())
                ? <HandReplayerView token={token} heroName={realName || username || 'Hero'} cardSplay={cardSplay} />
                : <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',textAlign:'center'}}>
                    <div style={{fontSize:'2.5rem',marginBottom:'12px'}}>🃏</div>
                    <h2 style={{fontFamily:"'Univers Condensed', 'Univers', sans-serif",fontSize:'1.3rem',fontWeight:700,color:'var(--text)',margin:'0 0 8px'}}>Hand Replayer</h2>
                    <p style={{color:'var(--text-muted)',fontSize:'0.9rem',margin:0}}>Coming Soon</p>
                  </div>
            )}
            </div>

            <div className={'tab-panel' + (currentView === 'settings' ? ' tab-active' : '')} data-tab="settings" style={{display: currentView === 'settings' ? undefined : 'none', height: currentView === 'settings' ? '100%' : undefined}}>
            {visitedTabs.has('settings') && (
              <SettingsView
                username={username}
                avatar={avatar}
                realName={realName}
                nameMode={nameMode}
                onToggleNameMode={(mode) => { setNameMode(mode); localStorage.setItem('displayNameMode', mode); }}
                onAvatarUpload={handleAvatarUpload}
                onAvatarRemove={handleAvatarRemove}
                theme={theme}
                toggleTheme={toggleTheme}
                contrast={contrast}
                toggleContrast={toggleContrast}
                cardSplay={cardSplay}
                toggleCardSplay={() => { setCardSplay(s => { var next = !s; localStorage.setItem('cardSplay', next ? 'on' : 'off'); return next; }); }}
                serifFont={serifFont}
                toggleSerifFont={() => setSerifFont(f => { const order = ['baskerville','univers','helvetica']; return order[(order.indexOf(f) + 1) % order.length]; })}
                onLogout={handleLogout}
                onDebugTimeChange={(val) => setDebugTimeKey(k => k + 1)}
                onUpload={handleFileUpload}
                uploadError={uploadError}
                uploadSuccess={uploadSuccess}
                uploadVenue={uploadVenue}
                onUploadVenueChange={setUploadVenue}
                shareToken={shareToken}
                onGenerateShareToken={handleGenerateShareToken}
                onRevokeShareToken={handleRevokeShareToken}
                onSendShareRequest={handleSendShareRequest}
                pendingOutgoing={pendingOutgoing}
                onCancelRequest={handleCancelRequest}
                shareBuddies={shareBuddies}
                onRemoveBuddy={handleRemoveBuddy}
                shareError={shareError}
                shareSuccess={shareSuccess}
                token={token}
                onRefreshTournaments={fetchTournaments}
              />
            )}
            </div>

            <div className={'tab-panel' + (currentView === 'admin' ? ' tab-active' : '')} data-tab="admin" style={{display: currentView === 'admin' ? undefined : 'none', height: currentView === 'admin' ? '100%' : undefined}}>
            {visitedTabs.has('admin') && ['ham', 'ham5'].includes((username || '').toLowerCase()) && (
              <AdminView token={token} onNavigate={(v) => { setCurrentView(v); }} />
            )}
            </div>

            <div className={'tab-panel' + (currentView === 'staking' ? ' tab-active' : '')} data-tab="staking" style={{display: currentView === 'staking' ? undefined : 'none', height: currentView === 'staking' ? '100%' : undefined}}>
            {visitedTabs.has('staking') && (
              <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 20px',textAlign:'center'}}>
                <div style={{fontSize:'2.5rem',marginBottom:'12px'}}>💰</div>
                <h2 style={{fontFamily:"'Univers Condensed', 'Univers', sans-serif",fontSize:'1.3rem',fontWeight:700,color:'var(--text)',margin:'0 0 8px'}}>Staking</h2>
                <p style={{color:'var(--text-muted)',fontSize:'0.9rem',margin:0}}>Coming Soon</p>
              </div>
            )}
            </div>

            <div className={'tab-panel' + (currentView === 'social' ? ' tab-active' : '')} data-tab="social" style={{display: currentView === 'social' ? undefined : 'none', height: currentView === 'social' ? '100%' : undefined}}>
            {visitedTabs.has('social') && (
              <SocialView
                shareBuddies={shareBuddies}
                buddyLiveUpdates={buddyLiveUpdates}
                displayName={displayName}
                myGroups={myGroups}
                activeGroupId={activeGroupId}
                setActiveGroupId={setActiveGroupId}
                groupFeed={groupFeed}
                groupSchedule={groupSchedule}
                fetchGroupFeed={fetchGroupFeed}
                fetchGroupSchedule={fetchGroupSchedule}
                fetchMyGroups={fetchMyGroups}
                token={token}
                onRemoveBuddy={handleRemoveBuddy}
                fetchShareBuddies={fetchShareBuddies}
                onNavigate={(v) => { setCurrentView(v); }}
              />
            )}
            </div>

            <div className={'tab-panel' + (currentView === 'more' ? ' tab-active' : '')} data-tab="more" style={{display: currentView === 'more' ? undefined : 'none', height: currentView === 'more' ? '100%' : undefined}}>
            {visitedTabs.has('more') && (
              <MoreView onNavigate={(v) => { setCurrentView(v); }}
              onExport={() => setShowExportFromMore(true)}
              hasSchedule={mySchedule && mySchedule.length > 0}
              isAdmin={['ham', 'ham5'].includes((username || '').toLowerCase())}
              handReplayerAccess={handReplayerAccess}
              />
            )}
            </div>

            {showExportFromMore && (
              <ScheduleExportModal events={mySchedule} onClose={() => setShowExportFromMore(false)} />
            )}
            {swapModalData && (
              <SwapModal
                buddy={swapModalData.buddy}
                tournament={swapModalData.tournament}
                token={token}
                onClose={() => setSwapModalData(null)}
              />
            )}
          </main>

          <BottomNav
            current={['tracking', 'calendar', 'settings', 'schedule'].includes(currentView) ? 'more' : currentView}
            onChange={v => {
              if (v === currentView && v === 'tournaments') {
                // Re-tap Schedule tab: scroll to today's events
                const todayEl = document.querySelector('[data-today-scroll]');
                const container = document.querySelector('.content-area');
                if (todayEl && container) {
                  const caTop = container.getBoundingClientRect().top;
                  const sticky = container.querySelector('.sticky-filters');
                  const stickyH = sticky ? sticky.getBoundingClientRect().bottom - caTop : 0;
                  const elTop = todayEl.getBoundingClientRect().top - caTop + container.scrollTop;
                  container.scrollTo({ top: Math.max(0, elTop - stickyH), behavior: 'smooth' });
                  // Post-scroll correction after smooth scroll settles
                  setTimeout(() => {
                    const firstCard = todayEl.querySelector('.cal-event-row');
                    if (!firstCard) return;
                    const stickyBottom = measureStickyStack(container);
                    const cardVisualTop = firstCard.getBoundingClientRect().top - container.getBoundingClientRect().top;
                    if (cardVisualTop < stickyBottom + 2) {
                      container.scrollBy({ top: -(stickyBottom + 2 - cardVisualTop), behavior: 'smooth' });
                    }
                  }, 350);
                }
                return;
              }
              setCurrentView(v);
            }}
            scheduleCount={mySchedule.filter(t => !t.is_restart).length}
            newShareCount={newShareCount}
          />

          {activeMilestone && (
            <MilestoneCelebration
              milestone={activeMilestone}
              onShare={() => setActiveMilestone(null)}
              onDismiss={() => setActiveMilestone(null)}
            />
          )}
        </div>
        </DisplayNameContext.Provider>
      );
    }

    if (SHARED_TOKEN) {
      ReactDOM.render(<SharedScheduleView shareToken={SHARED_TOKEN} />, document.getElementById('root'));
    } else if (RESET_TOKEN) {
      function ResetPage() {
        const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark');
        const nextThemeLabel = THEME_LABEL[THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length]];
        useEffect(() => {
          document.documentElement.dataset.theme = theme;
          localStorage.setItem('theme', theme);
          const meta = document.querySelector('meta[name="theme-color"]');
          if (meta) meta.setAttribute('content', THEME_META[theme] || '#111111');
        }, [theme]);
        const toggleTheme = () => setTheme(t => {
          const i = THEME_ORDER.indexOf(t);
          return THEME_ORDER[(i + 1) % THEME_ORDER.length];
        });
        return <ResetPasswordForm resetToken={RESET_TOKEN} theme={theme} toggleTheme={toggleTheme} />;
      }
      ReactDOM.render(<ResetPage />, document.getElementById('root'));
    } else {
      ReactDOM.render(<ToastProvider><App /></ToastProvider>, document.getElementById('root'));
    }
  