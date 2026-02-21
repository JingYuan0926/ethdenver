import { createContext, useContext, useState, ReactNode } from "react";

export interface AgentProfile {
  botId: string;
  domainTags: string;
  serviceOfferings: string;
  reputationScore: number;
  contributionCount: number;
}

export interface IntelligentDataEntry {
  dataDescription: string;
  dataHash: string;
}

export interface AgentData {
  // Identity
  botId: string;
  hederaAccountId: string;
  hederaPublicKey: string;
  evmAddress: string;

  // Balances
  hbarBalance: number;
  tokens: { tokenId: string; balance: number }[];

  // Topics
  masterTopicId: string;
  botTopicId: string;
  voteTopicId: string;

  // iNFT
  iNftTokenId: number;
  isAuthorized: boolean;
  agentProfile: AgentProfile | null;
  intelligentData: IntelligentDataEntry[];

  // 0G Storage
  zgRootHash: string;
  zgUploadTxHash: string;

  // Reputation
  upvotes: number;
  downvotes: number;
  netReputation: number;

  // Activity
  botMessageCount: number;
  registeredAt: string;
}

interface AgentContextValue {
  agent: AgentData | null;
  setAgent: (agent: AgentData | null) => void;
  privateKey: string;
  setPrivateKey: (key: string) => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [privateKey, setPrivateKey] = useState("");

  return (
    <AgentContext.Provider value={{ agent, setAgent, privateKey, setPrivateKey }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used within AgentProvider");
  return ctx;
}
