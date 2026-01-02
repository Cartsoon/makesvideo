import { createContext, useContext, useState, type ReactNode } from "react";

export interface AuthUser {
  id: string;
  personalNumber: number;
  nickname: string | null;
  language: string;
  theme: string;
  subscriptionExpiresAt: string;
  createdAt: string;
}

interface AuthContextType {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

interface AuthProviderProps {
  children: ReactNode;
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

export function AuthProvider({ children, user, setUser, logout }: AuthProviderProps) {
  return (
    <AuthContext.Provider value={{ user, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
