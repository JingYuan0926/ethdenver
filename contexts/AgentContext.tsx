import { createContext, useContext, useState, useCallback, ReactNode } from "react";

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

  // Reputation
  upvotes: number;
  downvotes: number;
  netReputation: number;

  // Activity
  botMessageCount: number;
  registeredAt: string;
}

const STORAGE_KEY = "spark_private_key";

interface AgentContextValue {
  agent: AgentData | null;
  setAgent: (agent: AgentData | null) => void;
  privateKey: string;
  setPrivateKey: (key: string) => void;
  savedKey: string | null;
  signOut: () => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

function getSavedKey(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function AgentProvider({ children }: { children: ReactNode }) {
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [privateKey, _setPrivateKey] = useState("");

  const setPrivateKey = useCallback((key: string) => {
    _setPrivateKey(key);
    if (key) {
      localStorage.setItem(STORAGE_KEY, key);
    }
  }, []);

  const signOut = useCallback(() => {
    setAgent(null);
    _setPrivateKey("");
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const savedKey = getSavedKey();

  return (
    <AgentContext.Provider value={{ agent, setAgent, privateKey, setPrivateKey, savedKey, signOut }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error("useAgent must be used within AgentProvider");
  return ctx;
}
