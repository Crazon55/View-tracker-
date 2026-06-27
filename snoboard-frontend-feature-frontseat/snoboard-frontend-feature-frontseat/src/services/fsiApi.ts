/**
 * FSI Canvas API — isolated from shared tracker/playbook api.ts.
 * Dual-writes to Supabase (canonical) + backend mirror. Does not affect other site APIs.
 */
import { supabase as _sb } from "@/lib/supabase";
import { fetchApi, getAccessToken } from "./api";

const FSI_API_BASE = import.meta.env.VITE_API_URL || "";

const FSI_BACKEND_BASE = "/api/v1/fsi";
const FSI_BACKEND_RETRY_KEY = "fsi-backend-sync-queue";

export type FsiCloudinarySignedUpload = {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  upload_url: string;
  folder: string;
  tags: string;
  context: string;
  expires_at: string;
};

type FsiBackendRetry = { path: string; method: string; body?: unknown; at: number };

function fsiNewId(): string {
  return crypto.randomUUID();
}

async function fsiWithRetry<T>(op: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await op();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * (i + 1)));
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("FSI write failed");
}

function enqueueFsiBackendRetry(path: string, method: string, body?: unknown) {
  try {
    const q: FsiBackendRetry[] = JSON.parse(localStorage.getItem(FSI_BACKEND_RETRY_KEY) || "[]");
    q.push({ path, method, body, at: Date.now() });
    localStorage.setItem(FSI_BACKEND_RETRY_KEY, JSON.stringify(q.slice(-200)));
  } catch {
    /* ignore quota errors */
  }
}

async function fsiBackendRequest(path: string, method: string, body?: unknown): Promise<void> {
  if (!getAccessToken()) {
    throw new Error("Missing auth token — sign in again");
  }
  await fetchApi(path, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

async function fsiBackendRequestImmediate(path: string, method: string, body?: unknown): Promise<void> {
  await fsiWithRetry(() => fsiBackendRequest(path, method, body), 3);
}

/** Drain queued backend mirrors (runs on FSI page load only). */
export async function flushFsiBackendSyncQueue(): Promise<void> {
  if (!getAccessToken()) return;
  let q: FsiBackendRetry[] = [];
  try {
    q = JSON.parse(localStorage.getItem(FSI_BACKEND_RETRY_KEY) || "[]");
  } catch {
    return;
  }
  if (!q.length) return;

  const remaining: FsiBackendRetry[] = [];
  for (const item of q) {
    try {
      await fsiBackendRequest(item.path, item.method, item.body);
    } catch {
      remaining.push(item);
    }
  }
  try {
    localStorage.setItem(FSI_BACKEND_RETRY_KEY, JSON.stringify(remaining));
  } catch {
    /* ignore */
  }
}

async function fsiDualMutate<T>(opts: {
  supabase: () => Promise<T>;
  backend: { path: string; method: string; body?: unknown };
}): Promise<T> {
  const sbResult = await fsiWithRetry(opts.supabase);

  void fsiBackendRequestImmediate(opts.backend.path, opts.backend.method, opts.backend.body).catch(
    (err) => {
      const message = err instanceof Error ? err.message : "Backend save failed";
      enqueueFsiBackendRetry(opts.backend.path, opts.backend.method, opts.backend.body);
      console.warn("[fsiApi] Backend mirror failed (queued for retry):", message);
    },
  );

  return sbResult;
}

async function fsiActorEmail(): Promise<string> {
  const { data: { user }, error } = await _sb.auth.getUser();
  if (error || !user?.email) throw new Error("Not signed in");
  return user.email;
}

export type FsiApi = ReturnType<typeof createFsiApi>;

export function createFsiApi() {
  return {
    listStudies: async (status?: string) => {
      let q = _sb.from("studies").select("*").order("updated_at", { ascending: false });
      if (status) q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    createStudy: async (data: {
      title: string;
      study_type: string;
      target_account: string;
      niche_vertical: string;
      owner_id?: string;
      execution_date?: string;
      meta_notes?: string;
    }) => {
      const id = fsiNewId();
      const email = (data.owner_id || (await fsiActorEmail())).trim();
      const row = {
        id,
        title: data.title.trim(),
        study_type: data.study_type,
        target_account: data.target_account.trim(),
        niche_vertical: data.niche_vertical.trim(),
        owner_id: email,
        execution_date: data.execution_date || new Date().toISOString().slice(0, 10),
        meta_notes: data.meta_notes ?? null,
        status: "Draft",
      };
      const backendBody = {
        id,
        title: row.title,
        study_type: row.study_type,
        target_account: row.target_account,
        niche_vertical: row.niche_vertical,
        owner_id: row.owner_id,
        execution_date: row.execution_date,
        meta_notes: row.meta_notes ?? undefined,
      };
      return fsiDualMutate({
        supabase: async () => {
          const { data: created, error } = await _sb.from("studies").insert(row).select().single();
          if (error) throw new Error(error.message);
          return created;
        },
        backend: { path: `${FSI_BACKEND_BASE}/studies`, method: "POST", body: backendBody },
      });
    },
    getStudyGraph: async (studyId: string) => {
      const [studyRes, nodesRes, connRes] = await Promise.all([
        _sb.from("studies").select("*").eq("id", studyId).single(),
        _sb.from("nodes").select("*").eq("study_id", studyId),
        _sb.from("connections").select("*").eq("study_id", studyId),
      ]);
      if (studyRes.error) throw new Error(studyRes.error.message);
      if (nodesRes.error) throw new Error(nodesRes.error.message);
      if (connRes.error) throw new Error(connRes.error.message);
      return {
        study: studyRes.data,
        nodes: nodesRes.data ?? [],
        connections: connRes.data ?? [],
      };
    },
    updateStudy: async (studyId: string, data: Record<string, unknown>) => {
      const patch = { ...data, updated_at: new Date().toISOString() };
      return fsiDualMutate({
        supabase: async () => {
          const { data: updated, error } = await _sb
            .from("studies")
            .update(patch)
            .eq("id", studyId)
            .select()
            .single();
          if (error) throw new Error(error.message);
          return updated;
        },
        backend: { path: `${FSI_BACKEND_BASE}/studies/${studyId}`, method: "PATCH", body: data },
      });
    },
    deleteStudy: async (studyId: string) => {
      await fsiDualMutate({
        supabase: async () => {
          const { error } = await _sb.from("studies").delete().eq("id", studyId);
          if (error) throw new Error(error.message);
          return { id: studyId };
        },
        backend: { path: `${FSI_BACKEND_BASE}/studies/${studyId}`, method: "DELETE" },
      });
      return { id: studyId };
    },
    clearStudyGraph: async (studyId: string) => {
      await fsiDualMutate({
        supabase: async () => {
          const { error: connErr } = await _sb.from("connections").delete().eq("study_id", studyId);
          if (connErr) throw new Error(connErr.message);
          const { error: nodeErr } = await _sb.from("nodes").delete().eq("study_id", studyId);
          if (nodeErr) throw new Error(nodeErr.message);
          await _sb.from("studies").update({ updated_at: new Date().toISOString() }).eq("id", studyId);
          return { id: studyId };
        },
        backend: { path: `${FSI_BACKEND_BASE}/studies/${studyId}/graph`, method: "DELETE" },
      });
      return { id: studyId };
    },
    createNode: async (studyId: string, data: Record<string, unknown>) => {
      const id = fsiNewId();
      const email = await fsiActorEmail();
      const row = {
        id,
        study_id: studyId,
        node_type: data.node_type,
        display_title: String(data.display_title || "").trim(),
        canvas_x: data.canvas_x,
        canvas_y: data.canvas_y,
        structured_payload: data.structured_payload ?? {},
        raw_body_text: data.raw_body_text ?? null,
        tags: data.tags ?? [],
        created_by: email,
        ...(data.parent_node_id ? { parent_node_id: data.parent_node_id } : {}),
      };
      const backendBody = {
        id,
        node_type: row.node_type,
        display_title: row.display_title,
        canvas_x: row.canvas_x,
        canvas_y: row.canvas_y,
        structured_payload: row.structured_payload,
        raw_body_text: row.raw_body_text ?? undefined,
        tags: row.tags,
        ...(data.parent_node_id ? { parent_node_id: data.parent_node_id } : {}),
      };
      return fsiDualMutate({
        supabase: async () => {
          const { data: created, error } = await _sb.from("nodes").insert(row).select().single();
          if (error) throw new Error(error.message);
          await _sb.from("studies").update({ updated_at: new Date().toISOString() }).eq("id", studyId);
          return created;
        },
        backend: {
          path: `${FSI_BACKEND_BASE}/studies/${studyId}/nodes`,
          method: "POST",
          body: backendBody,
        },
      });
    },
    updateNode: async (nodeId: string, data: Record<string, unknown>) => {
      const patch = { ...data, updated_at: new Date().toISOString() };
      return fsiDualMutate({
        supabase: async () => {
          const { error: updateErr } = await _sb.from("nodes").update(patch).eq("id", nodeId);
          if (updateErr) throw new Error(updateErr.message);
          const { data: updated, error: fetchErr } = await _sb
            .from("nodes")
            .select("*")
            .eq("id", nodeId)
            .maybeSingle();
          if (fetchErr) throw new Error(fetchErr.message);
          if (updated?.study_id) {
            await _sb.from("studies").update({ updated_at: new Date().toISOString() }).eq("id", updated.study_id);
          }
          return updated ?? { id: nodeId, ...patch };
        },
        backend: { path: `${FSI_BACKEND_BASE}/nodes/${nodeId}`, method: "PATCH", body: data },
      });
    },
    deleteNode: async (nodeId: string, studyId?: string) => {
      await fsiDualMutate({
        supabase: async () => {
          const { data: existing } = await _sb
            .from("nodes")
            .select("study_id")
            .eq("id", nodeId)
            .maybeSingle();

          await _sb.from("connections").delete().or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`);

          const { error } = await _sb.from("nodes").delete().eq("id", nodeId);
          if (error) throw new Error(error.message);

          const sid = existing?.study_id ?? studyId;
          if (sid) {
            await _sb.from("studies").update({ updated_at: new Date().toISOString() }).eq("id", sid);
          }
          return { id: nodeId };
        },
        backend: { path: `${FSI_BACKEND_BASE}/nodes/${nodeId}`, method: "DELETE" },
      });
      return { id: nodeId };
    },
    createConnection: async (studyId: string, data: {
      source_node_id: string;
      target_node_id: string;
      edge_label_note?: string;
      source_handle?: string;
      target_handle?: string;
    }) => {
      if (data.source_node_id === data.target_node_id) {
        throw new Error("Self-loops are not allowed");
      }
      const id = fsiNewId();
      const email = await fsiActorEmail();
      const row = {
        id,
        study_id: studyId,
        source_node_id: data.source_node_id,
        target_node_id: data.target_node_id,
        edge_label_note: data.edge_label_note ?? null,
        source_handle: data.source_handle ?? null,
        target_handle: data.target_handle ?? null,
        created_by: email,
      };
      const backendBody: Record<string, unknown> = {
        id,
        source_node_id: row.source_node_id,
        target_node_id: row.target_node_id,
        edge_label_note: row.edge_label_note ?? undefined,
      };
      if (data.source_handle) backendBody.source_handle = data.source_handle;
      if (data.target_handle) backendBody.target_handle = data.target_handle;
      return fsiDualMutate({
        supabase: async () => {
          const { data: created, error } = await _sb.from("connections").insert(row).select().single();
          if (error) throw new Error(error.message);
          await _sb.from("studies").update({ updated_at: new Date().toISOString() }).eq("id", studyId);
          return created;
        },
        backend: {
          path: `${FSI_BACKEND_BASE}/studies/${studyId}/connections`,
          method: "POST",
          body: backendBody,
        },
      });
    },
    updateConnection: async (connectionId: string, data: { edge_label_note?: string | null }) => {
      const patch: Record<string, unknown> = {};
      if ("edge_label_note" in data) {
        patch.edge_label_note = data.edge_label_note ?? null;
      }
      return fsiDualMutate({
        supabase: async () => {
          const { data: updated, error } = await _sb
            .from("connections")
            .update(patch)
            .eq("id", connectionId)
            .select()
            .single();
          if (error) throw new Error(error.message);
          if (updated?.study_id) {
            await _sb
              .from("studies")
              .update({ updated_at: new Date().toISOString() })
              .eq("id", updated.study_id);
          }
          return updated;
        },
        backend: {
          path: `${FSI_BACKEND_BASE}/connections/${connectionId}`,
          method: "PATCH",
          body: patch,
        },
      });
    },
    deleteConnection: async (connectionId: string, studyId?: string) => {
      if (connectionId.startsWith("opt-")) {
        return { id: connectionId };
      }
      await fsiDualMutate({
        supabase: async () => {
          const { data: existing } = await _sb
            .from("connections")
            .select("study_id")
            .eq("id", connectionId)
            .maybeSingle();
          const { error } = await _sb.from("connections").delete().eq("id", connectionId);
          if (error) throw new Error(error.message);
          const sid = existing?.study_id ?? studyId;
          if (sid) {
            await _sb.from("studies").update({ updated_at: new Date().toISOString() }).eq("id", sid);
          }
          return { id: connectionId };
        },
        backend: { path: `${FSI_BACKEND_BASE}/connections/${connectionId}`, method: "DELETE" },
      });
      return { id: connectionId };
    },
    signNodeCloudinaryUpload: async (studyId: string, nodeId: string, uploader?: string) => {
      const actor = (uploader ?? (await fsiActorEmail())).trim();
      return fetchApi<FsiCloudinarySignedUpload>(
        `${FSI_BACKEND_BASE}/studies/${studyId}/nodes/${nodeId}/cloudinary-sign`,
        { method: "POST", body: JSON.stringify({ uploader: actor || undefined }) },
      );
    },
    uploadNodeScreenshotFiles: async (
      studyId: string,
      nodeId: string,
      files: File[],
      uploader?: string,
    ) => {
      if (!files.length) return [] as string[];
      const signed = await fetchApi<FsiCloudinarySignedUpload>(
        `${FSI_BACKEND_BASE}/studies/${studyId}/nodes/${nodeId}/cloudinary-sign`,
        {
          method: "POST",
          body: JSON.stringify({ uploader: (uploader ?? (await fsiActorEmail())).trim() || undefined }),
        },
      );
      const urls: string[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        const fd = new FormData();
        fd.append("file", file);
        fd.append("api_key", String(signed.api_key));
        fd.append("timestamp", String(signed.timestamp));
        fd.append("signature", String(signed.signature));
        fd.append("folder", String(signed.folder));
        if (signed.tags) fd.append("tags", String(signed.tags));
        if (signed.context) fd.append("context", String(signed.context));
        const res = await fetch(String(signed.upload_url), { method: "POST", body: fd });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Cloudinary upload failed (${res.status})`);
        }
        const js = (await res.json()) as { secure_url?: string; url?: string };
        const url = js.secure_url || js.url;
        if (!url) throw new Error("Cloudinary upload returned no URL");
        urls.push(url);
      }
      return urls;
    },
    generateStudySummary: async (studyId: string) => {
      return fetchApi<Record<string, string | string[]>>(
        `${FSI_BACKEND_BASE}/studies/${studyId}/generate-summary`,
        { method: "POST" },
      );
    },
    getLatestStudySummary: async (studyId: string) => {
      const res = await fetch(`${FSI_API_BASE}${FSI_BACKEND_BASE}/studies/${studyId}/summary`, {
        headers: {
          "Content-Type": "application/json",
          ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
        },
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: Record<string, string | string[]> | null };
      return json.data ?? null;
    },
  };
}

export const fsiApi = createFsiApi();
