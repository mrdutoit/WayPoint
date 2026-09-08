import { createContext, useContext, useState } from 'react';

export const ROLES = ['PlatformAdmin', 'TenantAdmin', 'Manager', 'Employee'];

const RoleContext = createContext(null);

export function RoleProvider({ children, initialUser = null }) {
  const [user, setUser] = useState(initialUser);

  const value = {
    user,
    setUser,
    role: user?.role ?? null,
    isPlatformAdmin: user?.role === 'PlatformAdmin',
    isTenantAdmin: user?.role === 'TenantAdmin',
    isManager: user?.role === 'Manager',
    isEmployee: user?.role === 'Employee',
    isAdminOrAbove: user?.role === 'PlatformAdmin' || user?.role === 'TenantAdmin',
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within a RoleProvider');
  return ctx;
}
