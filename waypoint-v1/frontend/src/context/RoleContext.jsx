import { createContext, useContext, useState } from 'react';

// PlatformAdmin is always first and is internal staff only — never
// assigned to a customer organisation (FR-003). See Requirements
// document, section 3.1 for the full role descriptions.
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
    // TenantAdmin and above (FR-013 terminology customisation, cascade
    // configuration) — matches "Administrator and above" throughout the
    // Requirements document.
    isAdminOrAbove: user?.role === 'PlatformAdmin' || user?.role === 'TenantAdmin',
  };

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within a RoleProvider');
  return ctx;
}
