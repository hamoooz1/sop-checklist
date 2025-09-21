import React, { useMemo, useState, useEffect } from "react";
import "./responsive.css";

/**
 * SOP Checklist App — Responsive + Theme (JS only)
 */

// ---------------------- Inline Styles (kept minimal) ----------------------
const S = {
  page: { fontFamily: "Inter, system-ui, Arial" },
  h1: { fontSize: 22, fontWeight: 600, margin: "16px 0" },
  h2: { fontSize: 18, fontWeight: 600, margin: "8px 0" },
  card: { borderRadius: 16, padding: 16 },
  input: {},
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", borderBottom: "1px solid var(--border)", padding: 6 },
  td: { borderBottom: "1px solid var(--border)", padding: 6, verticalAlign: "top" },
};

// ---------------------- Mock Data ----------------------
const MOCK_COMPANY = { id: "co_001", name: "FreshFork Hospitality", brand: { primary: "#0ea5e9" } };
const MOCK_LOCATIONS = [
  { id: "loc_001", companyId: "co_001", name: "Main St Diner", timezone: "America/Los_Angeles" },
  { id: "loc_002", companyId: "co_001", name: "Harbor Grill", timezone: "America/Los_Angeles" },
];
const TIME_BLOCKS = [
  { id: "open", name: "Open", start: "05:00", end: "10:00" },
  { id: "mid", name: "Mid-Shift", start: "11:00", end: "16:00" },
  { id: "close", name: "Close", start: "20:00", end: "23:59" },
];
const MOCK_TASKLISTS = [
  {
    id: "tl_001",
    locationId: "loc_001",
    name: "Open — FOH",
    timeBlockId: "open",
    recurrence: [0,1,2,3,4,5,6],
    requiresApproval: true,
    signoffMethod: "PIN",
    tasks: [
      { id: "t_1", title: "Sanitize host stand", category: "Cleaning", inputType: "checkbox", photoRequired: true, noteRequired: false, allowNA: true, priority: 2 },
      { id: "t_2", title: "Temp log: walk-in cooler", category: "Food Safety", inputType: "number", min: 32, max: 40, photoRequired: false, noteRequired: true, allowNA: false, priority: 1 },
      { id: "t_3", title: "Stock napkins & menus", category: "Prep", inputType: "checkbox", photoRequired: false, noteRequired: false, allowNA: true, priority: 3 },
    ],
  },
  {
    id: "tl_002",
    locationId: "loc_001",
    name: "Close — BOH",
    timeBlockId: "close",
    recurrence: [0,1,2,3,4,5,6],
    requiresApproval: true,
    signoffMethod: "PIN",
    tasks: [
      { id: "t_4", title: "Deep clean fryers", category: "Cleaning", inputType: "checkbox", photoRequired: true, noteRequired: true, allowNA: false, priority: 1 },
      { id: "t_5", title: "Label/date all prep", category: "Food Safety", inputType: "checkbox", photoRequired: false, noteRequired: true, allowNA: false, priority: 2 },
    ],
  },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

// ---------------------- Utils ----------------------
function getTimeBlockLabel(id) {
  const tb = TIME_BLOCKS.find((t) => t.id === id);
  return tb ? `${tb.name} (${tb.start}–${tb.end})` : id;
}
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }
function canTaskBeCompleted(task, state) {
  if (!state) return false;
  if (state.na) return true;
  if (task.photoRequired && (!state.photos || state.photos.length === 0)) return false;
  if (task.noteRequired && (!state.note || state.note.trim() === "")) return false;
  if (task.inputType === "number") {
    const v = state.value;
    const isNum = typeof v === "number" && !Number.isNaN(v);
    if (!isNum) return false;
    if (typeof task.min === "number" && v < task.min) return false;
    if (typeof task.max === "number" && v > task.max) return false;
  }
  return true;
}
function getTasklistById(id) { return MOCK_TASKLISTS.find(tl => tl.id === id); }
function getTaskMeta(tasklistId, taskId) {
  const tl = getTasklistById(tasklistId);
  const t = tl?.tasks.find(x => x.id === taskId);
  return t || { title: taskId, inputType: "checkbox" };
}

// ---------------------- Main App ----------------------
export default function App() {
  const [mode, setMode] = useState("employee");
  const [activeLocationId, setActiveLocationId] = useState("loc_001");

  // Theme (auto detect + toggle + persist)
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("theme");
    if (saved) return saved;
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "dark" : "light";
  });
  useEffect(() => {
    localStorage.setItem("theme", theme);
    document.documentElement.classList.toggle("theme-dark", theme === "dark");
    document.documentElement.classList.toggle("theme-light", theme === "light");
  }, [theme]);
  const themeClass = theme === "dark" ? "theme-dark" : "theme-light";

  // Today’s tasklists
  const tasklistsToday = useMemo(() => {
    const dow = new Date().getDay();
    return MOCK_TASKLISTS.filter((tl) => tl.locationId === activeLocationId && tl.recurrence.includes(dow));
  }, [activeLocationId]);

  // Working state
  const [working, setWorking] = useState(() =>
    tasklistsToday.reduce((acc, tl) => {
      acc[tl.id] = tl.tasks.map((t) => ({
        taskId: t.id, status: "Incomplete", value: null, note: "", photos: [], na: false,
        reviewStatus: "Pending"
      }));
      return acc;
    }, {})
  );

  // Submissions
  const [submissions, setSubmissions] = useState([]);

  // PIN modal
  const [pinModal, setPinModal] = useState({ open: false, onConfirm: null });

  // Ensure working state exists for visible lists
  useEffect(() => {
    setWorking((prev) => {
      const next = { ...prev };
      tasklistsToday.forEach((tl) => {
        if (!next[tl.id]) {
          next[tl.id] = tl.tasks.map((t) => ({ taskId: t.id, status: "Incomplete", value: null, note: "", photos: [], na: false, reviewStatus: "Pending" }));
        }
      });
      Object.keys(next).forEach((k) => {
        if (!tasklistsToday.find(tl => tl.id === k)) delete next[k];
      });
      return next;
    });
  }, [tasklistsToday]);

  function updateTaskState(tlId, taskId, patch) {
    setWorking((prev) => {
      const next = { ...prev };
      next[tlId] = next[tlId].map((ti) => (ti.taskId === taskId ? { ...ti, ...(typeof patch === "function" ? patch(ti) : patch) } : ti));
      return next;
    });
  }

  function handleComplete(tl, task) {
    const state = working[tl.id].find((s) => s.taskId === task.id);
    if (!canTaskBeCompleted(task, state)) {
      alert("Finish required inputs first (photo/note/number in range).");
      return;
    }
    updateTaskState(tl.id, task.id, { status: "Complete", value: state.value ?? true });
  }

  function handleUpload(tl, task, file) {
    updateTaskState(tl.id, task.id, (ti) => ({ photos: [...(ti.photos || []), file.name] }));
  }

  function canSubmitTasklist(tl) {
    const states = working[tl.id];
    for (const t of tl.tasks) {
      const st = states.find((s) => s.taskId === t.id);
      const ok = (st.status === "Complete" || st.na) && canTaskBeCompleted(t, st);
      if (!ok) return false;
    }
    return true;
  }

  function signoff(tl) {
    if (!canSubmitTasklist(tl)) {
      alert("Please complete all required tasks first.");
      return;
    }
    setPinModal({
      open: true,
      onConfirm: (pin) => {
        const payload = working[tl.id].map(t => ({ ...t, reviewStatus: "Pending" }));
        const submission = {
          id: `ci_${Date.now()}`,
          tasklistId: tl.id,
          tasklistName: tl.name,
          locationId: tl.locationId,
          date: todayISO(),
          status: "Pending",
          signedBy: `PIN-${pin}`,
          signedAt: new Date().toISOString(),
          tasks: payload,
        };
        setSubmissions((prev) => [submission, ...prev]);
        setWorking((prev) => ({
          ...prev,
          [tl.id]: prev[tl.id].map(t => ({ ...t, reviewStatus: "Pending" })),
        }));
        setPinModal({ open: false, onConfirm: null });
        alert("Submitted for manager review.");
      },
    });
  }

  return (
    <div className={`app-page ${themeClass}`} style={S.page}>
      {/* Header */}
      <div className="app-header">
        <div className="app-header-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="brand-dot" />
            <div style={{ fontWeight: 600 }}>{MOCK_COMPANY.name}</div>
          </div>

          <div className="app-header-actions">
            {["employee", "manager", "admin"].map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`u-btn ${mode === m ? "is-active" : ""}`} style={{ borderColor: mode === m ? "var(--text)" : undefined }}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}

            <select className="u-input" value={activeLocationId} onChange={(e) => setActiveLocationId(e.target.value)}>
              {MOCK_LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>

            <button
              className="u-btn"
              aria-label="Toggle theme"
              title="Toggle theme"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? "🌞 Light" : "🌙 Dark"}
            </button>
          </div>
        </div>
      </div>

      {/* Main */}
      <main className="app-container">
        {mode === "employee" && (
          <EmployeeView
            tasklists={tasklistsToday}
            working={working}
            updateTaskState={updateTaskState}
            handleComplete={handleComplete}
            handleUpload={handleUpload}
            signoff={signoff}
            submissions={submissions}
            setSubmissions={setSubmissions}
            setWorking={setWorking}
          />
        )}

        {mode === "manager" && (
          <ManagerView
            submissions={submissions}
            setSubmissions={setSubmissions}
            setWorking={setWorking}
          />
        )}

        {mode === "admin" && <AdminView tasklists={MOCK_TASKLISTS} submissions={submissions} />}
      </main>

      {pinModal.open && <PinDialog onClose={() => setPinModal({ open: false, onConfirm: null })} onConfirm={pinModal.onConfirm} />}
    </div>
  );
}

// ---------------------- Employee ----------------------
function EmployeeView({ tasklists, working, updateTaskState, handleComplete, handleUpload, signoff, submissions, setSubmissions, setWorking }) {
  function mirrorReworkPendingToWorking(submissionId) {
    const sub = submissions.find(x => x.id === submissionId);
    if (!sub) return;
    setWorking((prevW) => {
      const list = prevW[sub.tasklistId];
      if (!list) return prevW;
      const pendingIds = sub.tasks.filter(t => t.reviewStatus === "Pending").map(t => t.taskId);
      const nextList = list.map(wt => pendingIds.includes(wt.taskId) ? { ...wt, reviewStatus: "Pending" } : wt);
      return { ...prevW, [sub.tasklistId]: nextList };
    });
  }

  return (
    <div className="r-grid" style={{ gap: 16 }}>
      <h1 style={S.h1}>Today</h1>

      {tasklists.map((tl) => {
        const states = working[tl.id];
        const total = tl.tasks.length;
        const done = states.filter((t) => t.status === "Complete" || t.na).length;
        const canSubmit = tl.tasks.every((t) => {
          const st = states.find(s => s.taskId === t.id);
          return (st.status === "Complete" || st.na) && canTaskBeCompleted(t, st);
        });

        return (
          <div key={tl.id} className="u-card elevated card-pad-tight" style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{tl.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{getTimeBlockLabel(tl.timeBlockId)}</div>
                <div style={{ marginTop: 6 }}>
                  <span className="tag">Progress: {done}/{total} ({pct(done, total)}%)</span>
                </div>
              </div>
              <button className="u-btnPrimary" style={{ opacity: canSubmit ? 1 : 0.5 }} onClick={() => signoff(tl)} disabled={!canSubmit}>
                Sign & Submit
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {tl.tasks.map((task) => {
                const state = states.find((s) => s.taskId === task.id);
                const isComplete = state.status === "Complete";
                const canComplete = canTaskBeCompleted(task, state);

                return (
                  <div
                    key={task.id}
                    className="u-card card-pad-tight"
                    style={{
                      ...S.card,
                      borderRadius: 12,
                      borderColor: isComplete ? "var(--ok)" : "var(--border)",
                      background: isComplete ? "color-mix(in oklab, var(--ok) 10%, var(--surface))" : "var(--surface)"
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span aria-hidden style={{
                          width: 22, height: 22, borderRadius: 999, display: "inline-flex", alignItems: "center",
                          justifyContent: "center", fontSize: 14, fontWeight: 700,
                          color: isComplete ? "#065f46" : "var(--muted)",
                          background: isComplete ? "color-mix(in oklab, var(--ok) 35%, var(--surface))" : "var(--surface-soft)",
                          border: `1px solid ${isComplete ? "var(--ok)" : "var(--border)"}`
                        }}>{isComplete ? "✓" : "•"}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: isComplete ? "#065f46" : "var(--text)" }}>{task.title}</div>
                          <div style={{ fontSize: 12, color: isComplete ? "#065f46" : "var(--muted)" }}>
                            {task.category} • {task.inputType}{task.photoRequired ? " • Photo required" : ""}{task.noteRequired ? " • Note required" : ""}
                          </div>

                          {state.reviewStatus && (
                            <div style={{ marginTop: 6 }}>
                              <span
                                className={`tag ${state.reviewStatus === "Approved" ? "ok" : state.reviewStatus === "Rework" ? "warn" : ""}`}
                                title="Manager review status"
                              >
                                {state.reviewStatus}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="r-actions">
                        {task.inputType === "number" && (
                          <input
                            type="number"
                            className="u-input"
                            placeholder={`${task.min ?? ""}-${task.max ?? ""}`}
                            style={{ minWidth: 80, maxWidth: 140, background: isComplete ? "color-mix(in oklab, var(--ok) 12%, var(--surface))" : "var(--surface)" }}
                            value={state.value ?? ""}
                            onChange={(e) => updateTaskState(tl.id, task.id, { value: Number(e.target.value) })}
                            disabled={isComplete}
                          />
                        )}

                        <button
                          className="u-btn"
                          style={{
                            borderColor: isComplete ? "var(--ok)" : canComplete ? "var(--text)" : "var(--border)",
                            background: isComplete ? "color-mix(in oklab, var(--ok) 10%, var(--surface))" : "var(--surface)",
                            color: isComplete ? "#065f46" : canComplete ? "var(--text)" : "var(--muted)",
                            fontWeight: isComplete ? 600 : 500,
                            opacity: isComplete ? 1 : canComplete ? 1 : 0.6,
                            cursor: isComplete ? "default" : canComplete ? "pointer" : "not-allowed",
                          }}
                          onClick={() => handleComplete(tl, task)}
                          disabled={!canComplete || isComplete}
                          title={isComplete ? "Already completed" : (canComplete ? "Complete task" : "Finish required items first")}
                        >
                          {isComplete ? "Completed ✓" : "Mark Complete"}
                        </button>

                        <label className="u-btn" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          Upload Photo
                          <input
                            type="file"
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const f = e.target.files && e.target.files[0];
                              if (f) handleUpload(tl, task, f);
                            }}
                            disabled={isComplete}
                          />
                        </label>

                        <input
                          className="u-input"
                          placeholder="Add note"
                          style={{ background: isComplete ? "color-mix(in oklab, var(--ok) 12%, var(--surface))" : "var(--surface)" }}
                          value={state.note}
                          onChange={(e) => updateTaskState(tl.id, task.id, { note: e.target.value })}
                          disabled={isComplete && !task.noteRequired}
                        />

                        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, opacity: isComplete ? 0.7 : 1 }}>
                          <input type="checkbox" checked={!!state.na} onChange={(e) => updateTaskState(tl.id, task.id, { na: e.target.checked })} disabled={isComplete} /> N/A
                        </label>
                      </div>
                    </div>
                    <EvidenceRow state={state} />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Review Queue */}
      <div className="u-card card-pad-tight" style={S.card}>
        <div style={S.h2}>Review Queue (Rework Needed)</div>
        {submissions.filter(s => s.status === "Rework").length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--muted)" }}>No rework requested.</div>
        ) : (
          submissions.filter(s => s.status === "Rework").map((s) => (
            <div key={s.id} className="u-card card-pad-tight" style={{ ...S.card, borderRadius: 14, marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.tasklistName}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{s.date} • Signed: {s.signedBy}</div>
                </div>
                <span className="tag warn">Rework</span>
              </div>

              <div className="table-scroll" style={{ marginTop: 8 }}>
                <table style={S.table}>
                  <thead>
                    <tr>
                      <th style={S.th}>Task</th>
                      <th style={S.th}>Value/Note</th>
                      <th className="hide-sm" style={S.th}>Photos</th>
                      <th style={S.th}>Fix</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.tasks.filter(t => t.reviewStatus === "Rework").map((t, i) => {
                      const meta = getTaskMeta(s.tasklistId, t.taskId);
                      const isComplete = t.status === "Complete";
                      const canComplete = canTaskBeCompleted(meta, t);
                      return (
                        <tr key={i}>
                          <td style={S.td}><b>{meta.title}</b></td>
                          <td style={S.td}>
                            {meta.inputType === "number" && (
                              <input
                                type="number"
                                className="u-input"
                                placeholder={`${meta.min ?? ""}-${meta.max ?? ""}`}
                                style={{ width: 100, marginRight: 6 }}
                                value={t.value ?? ""}
                                onChange={(e) => updateSubmissionTask(s.id, t.taskId, { value: Number(e.target.value) })}
                              />
                            )}
                            <input
                              className="u-input"
                              placeholder="Add note"
                              value={t.note ?? ""}
                              onChange={(e) => updateSubmissionTask(s.id, t.taskId, { note: e.target.value })}
                            />
                          </td>
                          <td className="hide-sm" style={S.td}>
                            <label className="u-btn">
                              Upload
                              <input
                                type="file"
                                style={{ display: "none" }}
                                onChange={(e) => {
                                  const f = e.target.files && e.target.files[0];
                                  if (f) updateSubmissionTask(s.id, t.taskId, (prev) => ({ photos: [...(prev.photos || []), f.name] }));
                                }}
                              />
                            </label>
                            <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                              {(t.photos || []).map((p, j) => <span key={j} className="tag">{p}</span>)}
                            </div>
                          </td>
                          <td style={S.td}>
                            <button
                              className="u-btn"
                              style={{
                                borderColor: isComplete ? "var(--ok)" : canComplete ? "var(--text)" : "var(--border)",
                                color: isComplete ? "#065f46" : canComplete ? "var(--text)" : "var(--muted)",
                                background: isComplete ? "color-mix(in oklab, var(--ok) 10%, var(--surface))" : "var(--surface)"
                              }}
                              disabled={isComplete || !canComplete}
                              onClick={() => updateSubmissionTask(s.id, t.taskId, { status: "Complete" })}
                            >
                              {isComplete ? "Completed ✓" : "Mark Complete"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button
                  className="u-btnPrimary"
                  onClick={() => {
                    batchUpdateSubmissionTasks(s.id, (task, meta) => {
                      if (task.reviewStatus === "Rework" && task.status === "Complete" && canTaskBeCompleted(meta, task)) {
                        return { reviewStatus: "Pending" };
                      }
                      return null;
                    });
                    mirrorReworkPendingToWorking(s.id);
                    recomputeSubmissionStatus(s.id);
                    alert("Resubmitted fixes for review.");
                  }}
                >
                  Resubmit for Review
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  // ---- Helpers (Review Queue) ----
  function updateSubmissionTask(submissionId, taskId, patch) {
    setSubmissions((prev) =>
      prev.map((s) => {
        if (s.id !== submissionId) return s;
        const tasks = s.tasks.map((t) => {
          if (t.taskId !== taskId) return t;
          const p = typeof patch === "function" ? patch(t) : patch;
          return { ...t, ...p };
        });
        return { ...s, tasks };
      })
    );
  }
  function batchUpdateSubmissionTasks(submissionId, decidePatch) {
    setSubmissions((prev) =>
      prev.map((s) => {
        if (s.id !== submissionId) return s;
        const tl = getTasklistById(s.tasklistId);
        const tasks = s.tasks.map((t) => {
          const meta = tl.tasks.find(x => x.id === t.taskId) || {};
          const p = decidePatch(t, meta);
          return p ? { ...t, ...p } : t;
        });
        return { ...s, tasks };
      })
    );
  }
  function recomputeSubmissionStatus(submissionId) {
    setSubmissions((prev) =>
      prev.map((s) => {
        if (s.id !== submissionId) return s;
        const statuses = s.tasks.map(t => t.reviewStatus);
        const hasRework = statuses.includes("Rework");
        const allApproved = s.tasks.length > 0 && s.tasks.every(t => t.reviewStatus === "Approved");
        const status = hasRework ? "Rework" : (allApproved ? "Approved" : "Pending");
        return { ...s, status };
      })
    );
  }
}

function EvidenceRow({ state }) {
  if (!state) return null;
  return (
    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
      {state.photos?.map((p, i) => (<span key={i} className="tag">{p}</span>))}
      {state.note && <span className="tag">Note: {state.note}</span>}
      {state.value !== null && state.value !== undefined && <span className="tag">Value: {state.value}</span>}
      {state.na && <span className="tag">N/A</span>}
    </div>
  );
}

function PinDialog({ onClose, onConfirm }) {
  const [pin, setPin] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div className="u-card elevated" style={{ padding: 20, width: 360 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Enter PIN</div>
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" className="u-input" style={{ width: "100%", marginBottom: 12 }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button className="u-btn" onClick={onClose}>Cancel</button>
          <button className="u-btnPrimary" onClick={() => { if (pin && typeof onConfirm === "function") onConfirm(pin); }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------- Manager ----------------------
function ManagerView({ submissions, setSubmissions, setWorking }) {
  const [selection, setSelection] = useState({}); // { [submissionId]: Set(taskId) }

  function toggle(subId, taskId) {
    setSelection((prev) => {
      const cur = new Set(prev[subId] || []);
      if (cur.has(taskId)) cur.delete(taskId); else cur.add(taskId);
      return { ...prev, [subId]: cur };
    });
  }

  function applyReview(subId, review) {
    setSubmissions((prev) =>
      prev.map((s) => {
        if (s.id !== subId) return s;
        const sel = selection[subId] || new Set();

        const tasks = s.tasks.map((t) => (sel.has(t.taskId) ? { ...t, reviewStatus: review } : t));
        const hasRework = tasks.some((t) => t.reviewStatus === "Rework");
        const allApproved = tasks.length > 0 && tasks.every((t) => t.reviewStatus === "Approved");
        const status = hasRework ? "Rework" : (allApproved ? "Approved" : "Pending");

        setWorking((prevW) => {
          const list = prevW[s.tasklistId];
          if (!list) return prevW;
          const nextList = list.map((wt) => {
            if (!sel.has(wt.taskId)) return wt;
            if (review === "Approved") return { ...wt, status: "Complete", reviewStatus: "Approved" };
            if (review === "Rework")   return { ...wt, status: "Incomplete", reviewStatus: "Rework" };
            return { ...wt, reviewStatus: review };
          });
          return { ...prevW, [s.tasklistId]: nextList };
        });

        return { ...s, tasks, status };
      })
    );
    setSelection((prev) => ({ ...prev, [subId]: new Set() }));
  }

  return (
    <div className="r-grid" style={{ gap: 16 }}>
      <h1 style={S.h1}>Manager Review</h1>
      {submissions.length === 0 ? <div style={{ fontSize: 14, color: "var(--muted)" }}>No submissions yet.</div> : null}

      {submissions.map((s) => (
        <div key={s.id} className="u-card elevated card-pad-tight" style={{ ...S.card, borderRadius: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{s.tasklistName}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{s.date} • Signed: {s.signedBy}</div>
            </div>
            <span className={`tag ${s.status === "Approved" ? "ok" : s.status === "Rework" ? "warn" : ""}`}>{s.status}</span>
          </div>

          <div className="table-scroll" style={{ marginTop: 8 }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={S.th}>
                    <input
                      type="checkbox"
                      checked={(selection[s.id]?.size || 0) === s.tasks.length}
                      onChange={(e) => {
                        const all = new Set(e.target.checked ? s.tasks.map(t => t.taskId) : []);
                        setSelection((prev) => ({ ...prev, [s.id]: all }));
                      }}
                    />
                  </th>
                  <th style={S.th}>Task</th>
                  <th className="hide-sm" style={S.th}>Value</th>
                  <th className="hide-sm" style={S.th}>Note</th>
                  <th className="hide-sm" style={S.th}>Photos</th>
                  <th style={S.th}>Emp Status</th>
                  <th style={S.th}>Review</th>
                </tr>
              </thead>
              <tbody>
                {s.tasks.map((t, i) => {
                  const meta = getTaskMeta(s.tasklistId, t.taskId);
                  return (
                    <tr key={i}>
                      <td style={S.td}>
                        <input
                          type="checkbox"
                          checked={selection[s.id]?.has(t.taskId) || false}
                          onChange={() => toggle(s.id, t.taskId)}
                        />
                      </td>
                      <td style={S.td}><b>{meta.title}</b></td>
                      <td className="hide-sm" style={S.td}>{t.value !== null && t.value !== undefined ? String(t.value) : "-"}</td>
                      <td className="hide-sm" style={S.td}>{t.note || "-"}</td>
                      <td className="hide-sm" style={S.td}>
                        {(t.photos || []).length ? (t.photos || []).map((p, j) => <span key={j} className="tag">{p}</span>) : "-"}
                      </td>
                      <td style={S.td}>
                        <span className={`tag ${t.status === "Complete" ? "ok" : ""}`}>
                          {t.na ? "N/A" : t.status}
                        </span>
                      </td>
                      <td style={S.td}>
                        <span className={`tag ${t.reviewStatus === "Approved" ? "ok" : t.reviewStatus === "Rework" ? "warn" : ""}`}>
                          {t.reviewStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sticky-actions">
            <button className="u-btn" onClick={() => applyReview(s.id, "Rework")}>Rework Selected</button>
            <button className="u-btnPrimary" onClick={() => applyReview(s.id, "Approved")}>Approve Selected</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------- Admin ----------------------
function AdminView({ tasklists, submissions }) {
  const byBlock = useMemo(() => {
    const acc = {};
    tasklists.forEach((tl) => {
      const k = tl.timeBlockId;
      if (!acc[k]) acc[k] = { name: getTimeBlockLabel(k), total: 0, approved: 0 };
      const totalSubs = submissions.filter((s) => s.tasklistId === tl.id);
      acc[k].total += totalSubs.length;
      acc[k].approved += totalSubs.filter((s) => s.status === "Approved").length;
    });
    return Object.values(acc).map((r) => ({ name: r.name, completion: (r.total ? Math.round((r.approved / r.total) * 100) : 0) }));
  }, [tasklists, submissions]);

  return (
    <div className="r-grid r-grid-2" style={{ gap: 12 }}>
      <div className="u-card elevated card-pad-tight" style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Completion by Time Block</div>
        <div className="table-scroll">
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Time Block</th>
                <th style={S.th}>Completion</th>
              </tr>
            </thead>
            <tbody>
              {byBlock.map((r, i) => (
                <tr key={i}>
                  <td style={S.td}>{r.name}</td>
                  <td style={S.td}>{r.completion}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="u-card elevated card-pad-tight" style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Tasklists</div>
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {tasklists.map((tl) => (
            <li key={tl.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontWeight: 500 }}>{tl.name}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{getTimeBlockLabel(tl.timeBlockId)} • {tl.tasks.length} tasks</div>
            </li>
          ))}
        </ul>
      </div>

      <div className="u-card card-pad-tight" style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Flow Summary</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "var(--muted)" }}>
          <li>Employee completes tasks and <b>Sign & Submit</b> → submission appears for Manager.</li>
          <li>Manager selects rows → <b>Approve Selected</b> or <b>Rework Selected</b>.</li>
          <li>Rework makes the submission status <b>Rework</b> and shows in Employee’s <b>Review Queue</b>.</li>
          <li>Employee fixes rework tasks and <b>Resubmit for Review</b>.</li>
          <li>When all tasks are Approved → submission status becomes <b>Approved</b>.</li>
        </ol>
      </div>
    </div>
  );
}
