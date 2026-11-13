import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function RequireAuth() {
  const { state } = useAuth();
  const location = useLocation();
  if (state.status !== 'in')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}
