import { useState, useEffect, useCallback } from "react";
import { useAgent } from "@/contexts/AgentContext";

interface InftFileEntry {
  content: string;
  label: string;
  type: "memory" | "skills" | "heartbeat" | "personality";
}

interface DataEntry {
  dataDescription: string;
  dataHash: string;
}

const TYPE_COLORS: Record<string, string> = {
  storage: "#475569",
  memory: "#7c3aed",
  skills: "#16a34a",
  heartbeat: "#dc2626",
  personality: "#2563eb",
  knowledge: "#ca8a04",
};

function parseDataEntry(desc: string) {
  const match = desc.match(/0g:\/\/(\w+)\//);
  const dataType = match ? match[1] : "unknown";
  const rootHashMatch = desc.match(/0g:\/\/\w+\/(.+)/);
  const rootHash = rootHashMatch ? rootHashMatch[1] : null;
  return { dataType, rootHash };
}

export function InftDataEditor({ onClose }: { onClose: () => void }) {
  const { agent } = useAgent();

  // Existing data
  const [existingData, setExistingData] = useState<DataEntry[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // View content
  const [viewContent, setViewContent] = useState<unknown>(null);
  const [viewLoading, setViewLoading] = useState<string | null>(null);
  const [viewError, setViewError] = useState<string | null>(null);

  // Upload files
  const [files, setFiles] = useState<InftFileEntry[]>([
    { content: "", label: "", type: "memory" },
  ]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    error?: string;
    totalEntries?: number;
    updateDataTxHash?: string;
    uploadedEntries?: { dataDescription: string }[];
  } | null>(null);

  // Profile editing
  const [profileDomainTags, setProfileDomainTags] = useState(
    agent?.agentProfile?.domainTags || ""
  );
  const [profileServiceOfferings, setProfileServiceOfferings] = useState(
    agent?.agentProfile?.serviceOfferings || ""
  );
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileResult, setProfileResult] = useState<{
    success: boolean;
    error?: string;
    txHash?: string;
    domainTags?: string;
    serviceOfferings?: string;
  } | null>(null);

  // Fetch existing intelligent data on mount
  useEffect(() => {
    if (!agent?.iNftTokenId) {
      setLoadingData(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/spark/view-inft-data", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenId: agent.iNftTokenId }),
        });
        const data = await res.json();
        if (data.success && data.entries) {
          setExistingData(data.entries);
        } else if (agent.intelligentData?.length > 0) {
          setExistingData(agent.intelligentData);
        }
      } catch {
        if (agent.intelligentData?.length > 0) {
          setExistingData(agent.intelligentData);
        }
      }
      setLoadingData(false);
    })();
  }, [agent]);

  // View data content
  const handleViewData = useCallback(async (rootHash: string) => {
    setViewLoading(rootHash);
    setViewContent(null);
    setViewError(null);
    try {
      const res = await fetch("/api/spark/view-inft-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootHash }),
      });
      const result = await res.json();
      if (result.success) {
        setViewContent(result.content);
      } else {
        setViewError(result.error);
      }
    } catch (err) {
      setViewError(String(err));
    }
    setViewLoading(null);
  }, []);

  // Upload files
  async function handleUpload() {
    if (!agent?.iNftTokenId) return;
    const validFiles = files.filter((f) => f.content.trim());
    if (validFiles.length === 0) {
      setUploadResult({ success: false, error: "At least one file with content is required" });
      return;
    }
    setUploading(true);
    setUploadResult(null);
    try {
      const res = await fetch("/api/spark/update-inft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tokenId: agent.iNftTokenId, files: validFiles }),
      });
      const result = await res.json();
      setUploadResult(result);
      if (result.success && result.uploadedEntries) {
        setExistingData((prev) => [
          ...prev,
          ...(result.uploadedEntries as DataEntry[]),
        ]);
        setFiles([{ content: "", label: "", type: "memory" }]);
      }
    } catch (err) {
      setUploadResult({ success: false, error: String(err) });
    }
    setUploading(false);
  }

  // Update profile
  async function handleUpdateProfile() {
    if (!agent?.iNftTokenId) return;
    if (!profileDomainTags.trim() && !profileServiceOfferings.trim()) {
      setProfileResult({ success: false, error: "Provide at least one field" });
      return;
    }
    setProfileLoading(true);
    setProfileResult(null);
    try {
      const res = await fetch("/api/spark/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenId: agent.iNftTokenId,
          domainTags: profileDomainTags.trim() || undefined,
          serviceOfferings: profileServiceOfferings.trim() || undefined,
        }),
      });
      const result = await res.json();
      setProfileResult(result);
    } catch (err) {
      setProfileResult({ success: false, error: String(err) });
    }
    setProfileLoading(false);
  }

  // File management
  function handleAddFile() {
    setFiles((prev) => [...prev, { content: "", label: "", type: "memory" }]);
  }

  function handleRemoveFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function handleUpdateFile(index: number, field: keyof InftFileEntry, value: string) {
    setFiles((prev) =>
      prev.map((f, i) => (i === index ? { ...f, [field]: value } : f))
    );
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files;
    if (!selected || selected.length === 0) return;
    Array.from(selected).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const name = file.name.toLowerCase();
        let fileType: InftFileEntry["type"] = "memory";
        if (name.includes("skill")) fileType = "skills";
        else if (name.includes("heartbeat")) fileType = "heartbeat";
        else if (name.includes("personality")) fileType = "personality";
        setFiles((prev) => [...prev, { content: text, label: file.name, type: fileType }]);
      };
      reader.readAsText(file);
    });
    e.target.value = "";
  }

  if (!agent) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-full max-w-[900px] overflow-y-auto rounded-2xl bg-[#483519]/50 p-8 backdrop-blur-md"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 transition hover:text-white"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>

        <h2 className="text-lg font-bold text-white">
          iNFT Data Editor — Token #{agent.iNftTokenId}
        </h2>
        <p className="mt-1 text-xs text-white/50">
          Upload files to 0G Storage and manage intelligent data on your iNFT
        </p>

        <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 text-sm text-white/90">
          {/* Left column — Existing Data */}
          <div className="space-y-5">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#DD6E42]">
                Current Intelligent Data ({existingData.length} entries)
              </h4>
              {loadingData ? (
                <p className="mt-2 text-xs text-white/40">Loading...</p>
              ) : existingData.length === 0 ? (
                <p className="mt-2 text-xs text-white/40 italic">No intelligent data yet</p>
              ) : (
                <div className="mt-2 max-h-[300px] space-y-1.5 overflow-y-auto">
                  {existingData.map((d, i) => {
                    const { dataType, rootHash } = parseDataEntry(d.dataDescription);
                    const color = TYPE_COLORS[dataType] || "#475569";
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span
                          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white"
                          style={{ background: color, minWidth: 60, textAlign: "center" }}
                        >
                          {dataType}
                        </span>
                        <span className="flex-1 truncate font-mono text-white/60">
                          {d.dataDescription.length > 45
                            ? d.dataDescription.slice(0, 22) + "..." + d.dataDescription.slice(-16)
                            : d.dataDescription}
                        </span>
                        {rootHash && (
                          <button
                            onClick={() => handleViewData(rootHash)}
                            disabled={viewLoading === rootHash}
                            className="shrink-0 rounded bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300 transition hover:bg-blue-500/30 disabled:opacity-50"
                          >
                            {viewLoading === rootHash ? "..." : "View"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* View content panel */}
              {viewContent && (
                <div className="mt-3 rounded-lg bg-white/10 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase text-blue-300">Downloaded Content</span>
                    <button
                      onClick={() => setViewContent(null)}
                      className="text-[10px] text-white/40 hover:text-white/70"
                    >
                      Close
                    </button>
                  </div>
                  <pre className="mt-2 max-h-[200px] overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-2 font-mono text-[11px] text-white/80">
                    {typeof viewContent === "string" ? viewContent : JSON.stringify(viewContent as object, null, 2)}
                  </pre>
                </div>
              )}
              {viewError && (
                <p className="mt-2 text-[11px] text-red-400">Error: {viewError}</p>
              )}
            </div>

            {/* Update Profile */}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#DD6E42]">
                Update Agent Profile
              </h4>
              <p className="mt-1 text-[10px] text-white/40">
                Update domainTags and serviceOfferings on-chain (0G Galileo)
              </p>
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  value={profileDomainTags}
                  onChange={(e) => setProfileDomainTags(e.target.value)}
                  placeholder="Domain Tags (e.g. defi,nft,analytics)"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#DD6E42]/50"
                />
                <input
                  type="text"
                  value={profileServiceOfferings}
                  onChange={(e) => setProfileServiceOfferings(e.target.value)}
                  placeholder="Service Offerings (e.g. scraping,analysis)"
                  className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 font-mono text-xs text-white outline-none focus:border-[#DD6E42]/50"
                />
                <button
                  onClick={handleUpdateProfile}
                  disabled={profileLoading}
                  className="rounded-lg bg-[#DD6E42] px-4 py-1.5 text-xs font-bold text-white transition hover:bg-[#c55e38] disabled:opacity-50"
                >
                  {profileLoading ? "Updating..." : "Update Profile"}
                </button>
              </div>
              {profileResult && !profileResult.success && (
                <p className="mt-2 text-[11px] text-red-400">{profileResult.error}</p>
              )}
              {profileResult?.success && (
                <div className="mt-2 rounded-lg bg-[#4B7F52]/20 p-2 text-[11px] text-[#4B7F52]">
                  Profile updated!{" "}
                  {profileResult.txHash && (
                    <a
                      href={`https://chainscan-galileo.0g.ai/tx/${profileResult.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-300 underline"
                    >
                      View Tx
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right column — Upload New Data */}
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#DD6E42]">
                Upload New Data
              </h4>
              <p className="mt-1 text-[10px] text-white/40">
                Files are uploaded to 0G Storage and appended to iNFT intelligent data
              </p>
            </div>

            {files.map((file, i) => (
              <div key={i} className="rounded-lg bg-white/5 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-white/50">File #{i + 1}</span>
                  {files.length > 1 && (
                    <button
                      onClick={() => handleRemoveFile(i)}
                      className="text-[10px] text-red-400 hover:text-red-300"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <select
                    value={file.type}
                    onChange={(e) => handleUpdateFile(i, "type", e.target.value)}
                    className="rounded border border-white/10 bg-white/5 px-2 py-1 text-xs text-white"
                  >
                    <option value="memory">Memory</option>
                    <option value="skills">Skills</option>
                    <option value="heartbeat">Heartbeat</option>
                    <option value="personality">Personality</option>
                  </select>
                  <input
                    type="text"
                    value={file.label}
                    onChange={(e) => handleUpdateFile(i, "label", e.target.value)}
                    placeholder="Label (optional)"
                    className="flex-1 rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-white outline-none"
                  />
                </div>
                <textarea
                  value={file.content}
                  onChange={(e) => handleUpdateFile(i, "content", e.target.value)}
                  rows={3}
                  placeholder="Content (JSON or text)..."
                  className="mt-2 w-full rounded border border-white/10 bg-white/5 px-2 py-1 font-mono text-xs text-white outline-none"
                />
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-lg bg-blue-500/20 px-3 py-1.5 text-xs font-bold text-blue-300 transition hover:bg-blue-500/30">
                Select Files
                <input
                  type="file"
                  multiple
                  onChange={handleFileInput}
                  className="hidden"
                  accept=".txt,.json,.md,.csv,.xml,.yaml,.yml,.toml"
                />
              </label>
              <button
                onClick={handleAddFile}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs text-white/60 transition hover:bg-white/15"
              >
                + Add Manually
              </button>
            </div>

            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full rounded-lg bg-[#4B7F52] py-2 text-sm font-bold text-white transition hover:bg-[#3d6943] disabled:opacity-50"
            >
              {uploading ? "Uploading to 0G + updating iNFT..." : "Upload to iNFT"}
            </button>

            {uploadResult && !uploadResult.success && (
              <p className="text-[11px] text-red-400">{uploadResult.error}</p>
            )}
            {uploadResult?.success && (
              <div className="rounded-lg bg-[#4B7F52]/20 p-3 text-[11px] text-[#4B7F52]">
                <p className="font-bold">iNFT Updated Successfully</p>
                <p className="mt-1">Total Entries: {uploadResult.totalEntries}</p>
                {uploadResult.updateDataTxHash && (
                  <p className="mt-1">
                    Tx:{" "}
                    <a
                      href={`https://chainscan-galileo.0g.ai/tx/${uploadResult.updateDataTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-300 underline"
                    >
                      {uploadResult.updateDataTxHash.slice(0, 18)}...
                    </a>
                  </p>
                )}
                {uploadResult.uploadedEntries?.map((entry, i) => (
                  <p key={i} className="mt-0.5 text-white/60">
                    Uploaded: {entry.dataDescription}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
