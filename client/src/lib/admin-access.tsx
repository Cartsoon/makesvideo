import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

const STORAGE_KEY = "kb-admin-access";
const ADMIN_PASSWORD = "Holzid56";

interface AdminAccessContextType {
  isUnlocked: boolean;
  isReady: boolean;
  unlock: () => void;
  checkPassword: (password: string) => boolean;
}

const AdminAccessContext = createContext<AdminAccessContextType | null>(null);

export function AdminAccessProvider({ children }: { children: ReactNode }) {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "true") {
      setIsUnlocked(true);
    }
    setIsReady(true);
  }, []);

  const unlock = useCallback(() => {
    setIsUnlocked(true);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const checkPassword = useCallback((password: string): boolean => {
    if (password === ADMIN_PASSWORD) {
      unlock();
      return true;
    }
    return false;
  }, [unlock]);

  return (
    <AdminAccessContext.Provider value={{ isUnlocked, isReady, unlock, checkPassword }}>
      {children}
    </AdminAccessContext.Provider>
  );
}

export function useAdminAccess() {
  const context = useContext(AdminAccessContext);
  if (!context) {
    throw new Error("useAdminAccess must be used within AdminAccessProvider");
  }
  return context;
}
