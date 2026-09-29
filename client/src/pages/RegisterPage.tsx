import { Link } from "react-router-dom";
import { RegisterForm } from "../components/auth/RegisterForm";

export function RegisterPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <a className="auth-brand" href="/register"><span className="brand-mark">S</span> SupportOps <b>AI</b></a>
        <div className="auth-copy">
          <span className="eyebrow">YOUR SUPPORT WORKSPACE</span>
          <h1>Make room for better conversations.</h1>
          <p>Create an account to enter the SupportOps workspace.</p>
        </div>
        <RegisterForm />
        <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
      </section>
      <aside className="auth-aside" aria-label="SupportOps workspace preview">
        <div className="aside-grid" />
        <span className="aside-index">01 / WORKSPACE</span>
        <div className="aside-message">
          <span className="aside-rule" />
          <p>One workspace for<br />every support question.</p>
          <span className="aside-caption">SUPPORTOPS · INTERNAL</span>
        </div>
        <div className="aside-footer"><span>SECURE ACCESS</span><span>EST. 2026</span></div>
      </aside>
    </main>
  );
}
