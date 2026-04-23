import React, { createContext, useContext } from 'react';

const DisplayNameContext = createContext(u => u.username);

export function useDisplayName() {
  return useContext(DisplayNameContext);
}

export function DisplayNameProvider({ value, children }) {
  return (
    <DisplayNameContext.Provider value={value}>
      {children}
    </DisplayNameContext.Provider>
  );
}

export { DisplayNameContext };
export default DisplayNameContext;
