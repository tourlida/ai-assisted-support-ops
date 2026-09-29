import { LogOut, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

export function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    try {
      await logout();
    } catch {
      return;
    } finally {
      navigate("/login", { replace: true });
    }
  }

  return (
    <header className="topbar">
      <a className="brand" href="/dashboard" aria-label="SupportOps home">
        <span className="brand-mark"><ShieldCheck size={18} aria-hidden="true" /></span>
        <span>SupportOps <b>AI</b></span>
      </a>
      <div className="topbar-user">
        <span className="greeting">Hi, {user?.name}</span>
        <button className="icon-button" onClick={() => void handleLogout()} aria-label="Logout" title="Logout">
          <LogOut size={18} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
