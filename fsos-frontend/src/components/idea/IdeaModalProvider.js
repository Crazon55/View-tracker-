import React, { createContext, useContext, useState, useCallback } from "react";
import IdeaCard from "./IdeaCard";
import CreateIdeaDialog from "./CreateIdeaDialog";

const UIContext = createContext(null);

export function UIProvider({ children }) {
  const [openIdeaId, setOpenIdeaId] = useState(null);
  const [ideaMode, setIdeaMode] = useState(null);
  const [ideaTab, setIdeaTab] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createStream, setCreateStream] = useState("BO");
  const [createPrefill, setCreatePrefill] = useState(null);
  const [streamFilter, setStreamFilter] = useState("All");

  const openIdea = useCallback((id, opts) => {
    setOpenIdeaId(id);
    setIdeaMode(opts?.mode || null);
    setIdeaTab(opts?.tab || null);
  }, []);
  const closeIdea = useCallback(() => { setOpenIdeaId(null); setIdeaMode(null); setIdeaTab(null); }, []);
  // prefill: optional { title, sourceUrl } — e.g. starting an HPN idea from a News Feed story
  const openCreate = useCallback((stream = "BO", prefill = null) => { setCreateStream(stream); setCreatePrefill(prefill); setCreateOpen(true); }, []);

  return (
    <UIContext.Provider value={{ openIdea, closeIdea, openIdeaId, openCreate, streamFilter, setStreamFilter }}>
      {children}
      <IdeaCard ideaId={openIdeaId} mode={ideaMode} initialTab={ideaTab} onClose={closeIdea} onOpenIdea={openIdea} />
      <CreateIdeaDialog open={createOpen} onOpenChange={setCreateOpen} stream={createStream} prefill={createPrefill} onCreated={(id) => { setCreateOpen(false); setIdeaMode(null); setOpenIdeaId(id); }} />
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error("useUI must be used within UIProvider");
  return ctx;
}
