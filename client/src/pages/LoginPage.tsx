import { Link } from "react-router-dom";
import { LoginForm } from "../components/auth/LoginForm";

export function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel">
        <a className="auth-brand" href="/login"><span className="brand-mark">S</span> SupportOps <b>AI</b></a>
        <div className="auth-copy">
          <span className="eyebrow">SUPPORT OPERATIONS</span>
          <h1>Good support starts with a clear view.</h1>
          <p>Sign in to continue to your support workspace.</p>
        </div>
        <LoginForm />
        <p className="auth-switch">New to SupportOps? <Link to="/register">Create an account</Link></p>
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
