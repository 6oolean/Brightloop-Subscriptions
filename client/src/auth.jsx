import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, tokenStore } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const out = () => setUser(null);
    window.addEventListener('bl-logout', out);
    if (!tokenStore.get()) setReady(true);
    else api.get('/auth/me').then((r) => setUser(r.user)).catch(() => tokenStore.set(null)).finally(() => setReady(true));
    return () => window.removeEventListener('bl-logout', out);
  }, []);

  const accept = useCallback((r) => { tokenStore.set(r.token); setUser(r.user); return r.user; }, []);
  const login = (email, password) => api.post('/auth/login', { email, password }).then(accept);
  const signup = (b) => api.post('/auth/signup', b).then(accept);
  const logout = () => { tokenStore.set(null); setUser(null); };
  return <Ctx.Provider value={{ user, ready, login, signup, logout }}>{children}</Ctx.Provider>;
}