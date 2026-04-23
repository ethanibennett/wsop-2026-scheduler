import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false);

  const login = useCallback((jwt, userData) => {
    localStorage.setItem('token', jwt);
    setToken(jwt);
    setUser(userData);
    setIsGuest(false);
  }, []);

  const guestLogin = useCallback((jwt) => {
    localStorage.setItem('token', jwt);
    setToken(jwt);
    setIsGuest(true);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setIsGuest(false);
  }, []);

  const value = useMemo(() => ({ token, user, setUser, isGuest, login, guestLogin, logout }), [token, user, isGuest, login, guestLogin, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
