import { Navbar } from "../components/layout/Navbar";
import { ChatContainer } from "../components/chat/ChatContainer";

export function DashboardPage() {
  return (
    <div className="dashboard-page">
      <Navbar />
      <main className="dashboard-main">
        <div className="dashboard-title-row">
          <div>
            <span className="eyebrow">SUPPORT WORKSPACE</span>
            <h1>Support, in one place.</h1>
          </div>
          <span className="environment-label"><i /> Workspace online</span>
        </div>
        <ChatContainer />
      </main>
      <footer className="dashboard-footer"><span>SUPPORTOPS AI</span><span>MOCK ASSISTANT · PHASE 1</span></footer>
    </div>
  );
}
