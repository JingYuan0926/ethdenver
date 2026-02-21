import { Navbar } from "@/components/Navbar";
import { AgentStatus } from "@/components/dashboard/AgentStatus";
import { AgentSession } from "@/components/dashboard/AgentSession";
import { KnowledgeLayer } from "@/components/dashboard/KnowledgeLayer";
import { AgentAccount } from "@/components/dashboard/AgentAccount";

export default function Dashboard() {
  return (
    <div className="flex h-screen flex-col bg-[#f5f0e8]">
      <Navbar />

      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-2 gap-4 px-[2.5%] pt-[3vh] pb-[3vh]">
        <AgentStatus />
        <AgentSession />
        <KnowledgeLayer />
        <AgentAccount />
      </div>
    </div>
  );
}
