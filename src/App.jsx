import React, { useMemo, useState } from "react";

/**
 * SOP Checklist App — Submissions + Manager per-task review
 * - JavaScript only, no extra deps
 * - Employee: Today (do work) + Review Queue (fix rework)
 * - Manager: Per-task selection (approve / rework), shows photos/notes/values
 */

// ---------------------- Inline Styles ----------------------
const S = {
  page: { fontFamily: "Inter, system-ui, Arial", color: "#0f172a", background: "#f8fafc", minHeight: "100vh" },
  container: { maxWidth: 1080, margin: "0 auto", padding: 16 },
  header: { position: "sticky", top: 0, zIndex: 10, background: "rgba(255,255,255,0.9)", backdropFilter: "saturate(1.2) blur(6px)", borderBottom: "1px solid #e2e8f0" },
  headerInner: { maxWidth: 1080, margin: "0 auto", padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 },
  badge: (active) => ({ padding: "6px 12px", borderRadius: 999, border: "1px solid #cbd5e1", background: active ? "#0f172a" : "white", color: active ? "white" : "#0f172a", cursor: "pointer" }),
  select: { marginLeft: 8, border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px" },
  h1: { fontSize: 22, fontWeight: 600, margin: "16px 0" },
  h2: { fontSize: 18, fontWeight: 600, margin: "8px 0" },
  card: { background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  btn: { padding: "8px 12px", borderRadius: 10, border: "1px solid #cbd5e1", background: "white", cursor: "pointer" },
  btnPrimary: { padding: "8px 12px", borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "white", cursor: "pointer" },
  grid2: { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" },
  input: { border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px" },
  tag: { fontSize: 12, padding: "2px 8px", border: "1px solid #cbd5e1", borderRadius: 999, background: "#f1f5f9", marginRight: 6 },
  row: { display: "flex", alignItems: "center", gap: 8 },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 14 },
  th: { textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 6 },
  td: { borderBottom: "1px solid #f1f5f9", padding: 6, verticalAlign: "top" },
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
    recurrence: [0, 1, 2, 3, 4, 5, 6],
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
    recurrence: [0, 1, 2, 3, 4, 5, 6],
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

function mirrorReworkPendingToWorking(submissionId) {
  // Find the submission we just updated
  const sub = submissions.find(x => x.id === submissionId);
  if (!sub) return;
  setSubmissions((prev) => prev); // no-op, just to keep the pattern

  // For any task whose reviewStatus is now Pending (was Rework), copy that status into working
  setWorking((prevW) => {
    const list = prevW[sub.tasklistId];
    if (!list) return prevW;
    const pendingIds = sub.tasks.filter(t => t.reviewStatus === "Pending").map(t => t.taskId);
    const nextList = list.map(wt => pendingIds.includes(wt.taskId) ? { ...wt, reviewStatus: "Pending" } : wt);
    return { ...prevW, [sub.tasklistId]: nextList };
  });
}


// ---------------------- Main App ----------------------
export default function App() {
  const [mode, setMode] = useState("employee");
  const [activeLocationId, setActiveLocationId] = useState("loc_001");

  // Today’s tasklists
  const tasklistsToday = useMemo(() => {
    const dow = new Date().getDay();
    return MOCK_TASKLISTS.filter((tl) => tl.locationId === activeLocationId && tl.recurrence.includes(dow));
  }, [activeLocationId]);

  // Employee working state per tasklist (not yet submitted)
  const [working, setWorking] = useState(() =>
    tasklistsToday.reduce((acc, tl) => {
      acc[tl.id] = tl.tasks.map((t) => ({
        taskId: t.id, status: "Incomplete", value: null, note: "", photos: [], na: false,
        reviewStatus: "Pending" // review status is for submissions; keep default here
      }));
      return acc;
    }, {})
  );

  // Submissions list (what managers review)
  const [submissions, setSubmissions] = useState([]);

  // PIN modal for signoff
  const [pinModal, setPinModal] = useState({ open: false, onConfirm: null });

  // Ensure working state exists for new location/day
  React.useEffect(() => {
    setWorking((prev) => {
      const next = { ...prev };
      tasklistsToday.forEach((tl) => {
        if (!next[tl.id]) {
          next[tl.id] = tl.tasks.map((t) => ({ taskId: t.id, status: "Incomplete", value: null, note: "", photos: [], na: false, reviewStatus: "Pending" }));
        }
      });
      // remove non-visible lists
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
        const payload = working[tl.id].map(t => ({ ...t, reviewStatus: "Pending" })); // keep employee progress
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

        // Update working to reflect that tasks are now pending review (but DO NOT reset statuses/values/photos).
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
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.headerInner}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: MOCK_COMPANY.brand.primary }} />
            <div style={{ fontWeight: 600 }}>{MOCK_COMPANY.name}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {["employee", "manager", "admin"].map((m) => (
              <button key={m} onClick={() => setMode(m)} style={S.badge(mode === m)}>
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
            <select style={S.select} value={activeLocationId} onChange={(e) => setActiveLocationId(e.target.value)}>
              {MOCK_LOCATIONS.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <main style={S.container}>
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
  return (
    <div style={{ display: "grid", gap: 16 }}>
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
          <div key={tl.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{tl.name}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{getTimeBlockLabel(tl.timeBlockId)}</div>
                <div style={{ marginTop: 6 }}><span style={S.tag}>Progress: {done}/{total} ({pct(done, total)}%)</span></div>
              </div>
              <button style={{ ...S.btnPrimary, opacity: canSubmit ? 1 : 0.5 }} onClick={() => signoff(tl)} disabled={!canSubmit}>
                Sign & Submit
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              {tl.tasks.map((task) => {
                const state = states.find((s) => s.taskId === task.id);
                const isComplete = state.status === "Complete";
                const canComplete = canTaskBeCompleted(task, state);

                return (
                  <div key={task.id} style={{ ...S.card, borderRadius: 12, borderColor: isComplete ? "#10b981" : "#e2e8f0", background: isComplete ? "#ecfdf5" : "white" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span aria-hidden style={{
                          width: 22, height: 22, borderRadius: 999, display: "inline-flex", alignItems: "center",
                          justifyContent: "center", fontSize: 14, fontWeight: 700, color: isComplete ? "#065f46" : "#94a3b8",
                          background: isComplete ? "#a7f3d0" : "#f1f5f9", border: `1px solid ${isComplete ? "#10b981" : "#e2e8f0"}`
                        }}>{isComplete ? "✓" : "•"}</span>
                        <div>
                          <div style={{ fontWeight: 600, color: isComplete ? "#065f46" : "#0f172a" }}>{task.title}</div>
                          <div style={{ fontSize: 12, color: isComplete ? "#065f46" : "#475569" }}>
                            {task.category} • {task.inputType}{task.photoRequired ? " • Photo required" : ""}{task.noteRequired ? " • Note required" : ""}
                            {/* Manager review badge */}
                            {state.reviewStatus && (
                              <div style={{ marginTop: 6 }}>
                                <span
                                  style={{
                                    ...S.tag,
                                    borderColor:
                                      state.reviewStatus === "Approved" ? "#10b981" :
                                        state.reviewStatus === "Rework" ? "#f59e0b" : "#94a3b8",
                                    color:
                                      state.reviewStatus === "Approved" ? "#065f46" :
                                        state.reviewStatus === "Rework" ? "#8a5a00" : "#475569",
                                  }}
                                  title="Manager review status"
                                >
                                  {state.reviewStatus}
                                </span>
                              </div>
                            )}

                          </div>
                        </div>
                      </div>

                      <div style={S.row}>
                        {task.inputType === "number" && (
                          <input type="number" placeholder={`${task.min ?? ""}-${task.max ?? ""}`} style={{ ...S.input, width: 80, background: isComplete ? "#f0fdf4" : "white" }}
                            value={state.value ?? ""} onChange={(e) => updateTaskState(tl.id, task.id, { value: Number(e.target.value) })} disabled={isComplete} />
                        )}

                        <button
                          style={{
                            ...S.btn,
                            borderColor: isComplete ? "#10b981" : canComplete ? "#0f172a" : "#cbd5e1",
                            background: isComplete ? "#ecfdf5" : "white",
                            color: isComplete ? "#065f46" : canComplete ? "#0f172a" : "#94a3b8",
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

                        <label style={S.btn}>
                          Upload Photo
                          <input type="file" style={{ display: "none" }}
                            onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) handleUpload(tl, task, f); }}
                            disabled={isComplete} />
                        </label>

                        <input placeholder="Add note" style={{ ...S.input, background: isComplete ? "#f0fdf4" : "white" }}
                          value={state.note} onChange={(e) => updateTaskState(tl.id, task.id, { note: e.target.value })}
                          disabled={isComplete && !task.noteRequired} />

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

      {/* Review Queue: show submissions that have tasks marked Rework */}
      <div style={S.card}>
        <div style={S.h2}>Review Queue (Rework Needed)</div>
        {submissions.filter(s => s.status === "Rework").length === 0 ? (
          <div style={{ fontSize: 14, color: "#64748b" }}>No rework requested.</div>
        ) : (
          submissions.filter(s => s.status === "Rework").map((s) => (
            <div key={s.id} style={{ ...S.card, borderRadius: 14, marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{s.tasklistName}</div>
                  <div style={{ fontSize: 12, color: "#475569" }}>{s.date} • Signed: {s.signedBy}</div>
                </div>
                <span style={{ ...S.tag, borderColor: "#f59e0b", color: "#8a5a00" }}>Rework</span>
              </div>

              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Task</th>
                    <th style={S.th}>Value/Note</th>
                    <th style={S.th}>Photos</th>
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
                            <input type="number" placeholder={`${meta.min ?? ""}-${meta.max ?? ""}`} style={{ ...S.input, width: 90, marginRight: 6 }}
                              value={t.value ?? ""} onChange={(e) => updateSubmissionTask(s.id, t.taskId, { value: Number(e.target.value) })} />
                          )}
                          <input placeholder="Add note" style={S.input} value={t.note ?? ""} onChange={(e) => updateSubmissionTask(s.id, t.taskId, { note: e.target.value })} />
                        </td>
                        <td style={S.td}>
                          <label style={S.btn}>
                            Upload
                            <input type="file" style={{ display: "none" }} onChange={(e) => {
                              const f = e.target.files && e.target.files[0];
                              if (f) updateSubmissionTask(s.id, t.taskId, (prev) => ({ photos: [...(prev.photos || []), f.name] }));
                            }} />
                          </label>
                          <div style={{ marginTop: 6 }}>
                            {(t.photos || []).map((p, j) => <span key={j} style={S.tag}>{p}</span>)}
                          </div>
                        </td>
                        <td style={S.td}>
                          <button
                            style={{
                              ...S.btn,
                              borderColor: isComplete ? "#10b981" : canComplete ? "#0f172a" : "#cbd5e1",
                              color: isComplete ? "#065f46" : canComplete ? "#0f172a" : "#94a3b8",
                              background: isComplete ? "#ecfdf5" : "white"
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

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
                <button
                  style={S.btnPrimary}
                  onClick={() => {
                    // 1) In the submission: only tasks that were rework and are now valid/complete -> back to Pending
                    batchUpdateSubmissionTasks(s.id, (task, meta) => {
                      if (task.reviewStatus === "Rework" && task.status === "Complete" && canTaskBeCompleted(meta, task)) {
                        return { reviewStatus: "Pending" };
                      }
                      return null;
                    });
                  
                    // 2) Mirror to working: same tasks back to Pending (keep their completed evidence)
                    setSubmissions((curSubs) => {
                      const cur = curSubs.find(x => x.id === s.id);
                      if (!cur) return curSubs;
                  
                      // We'll figure out which tasks changed to Pending and reflect in working
                      const tlId = cur.tasklistId;
                      const tlMeta = getTasklistById(tlId);
                      // Note: use setWorking from props of EmployeeView's parent; we have access here via closure
                      // So expose setSubmissions to keep state, and use window.setWorkingFallback if needed
                      // BUT easier: lift a helper up — we can access setWorking via props? If not, add it to EmployeeView props.
                      return curSubs; // keep array same; the real working sync happens right after via a dedicated call below
                    });
                  
                    // *** Add this call just after the batchUpdateSubmissionTasks above ***
                    // (We need setWorking here; since EmployeeView already received setSubmissions,
                    // pass setWorking into EmployeeView props like we did for ManagerView OR
                    // put this sync logic in App and call via a callback. For simplicity, add setWorking to EmployeeView props.)
                    // Example call (after you pass setWorking into EmployeeView props):
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

  // ---- Helpers to edit submissions from Employee review queue ----
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
    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12, color: "#334155" }}>
      {state.photos?.map((p, i) => (<span key={i} style={S.tag}>{p}</span>))}
      {state.note && <span style={S.tag}>Note: {state.note}</span>}
      {state.value !== null && state.value !== undefined && <span style={S.tag}>Value: {state.value}</span>}
      {state.na && <span style={S.tag}>N/A</span>}
    </div>
  );
}

function PinDialog({ onClose, onConfirm }) {
  const [pin, setPin] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <div style={{ ...S.card, padding: 20, width: 360 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Enter PIN</div>
        <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="••••" style={{ ...S.input, width: "100%", marginBottom: 12 }} />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={S.btn} onClick={onClose}>Cancel</button>
          <button style={S.btnPrimary} onClick={() => { if (pin && typeof onConfirm === "function") onConfirm(pin); }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------- Manager ----------------------
function ManagerView({ submissions, setSubmissions, setWorking }) {
  // track selection per submission: a Set of taskIds
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
  
        // Update selected tasks' reviewStatus
        const tasks = s.tasks.map((t) => (sel.has(t.taskId) ? { ...t, reviewStatus: review } : t));
  
        // Compute overall status
        const hasRework = tasks.some((t) => t.reviewStatus === "Rework");
        const allApproved = tasks.length > 0 && tasks.every((t) => t.reviewStatus === "Approved");
        const status = hasRework ? "Rework" : (allApproved ? "Approved" : "Pending");
  
        // Also mirror into employee working state:
        setWorking((prevW) => {
          // Only update the same tasklist
          const list = prevW[s.tasklistId];
          if (!list) return prevW;
          const nextList = list.map((wt) => {
            if (!sel.has(wt.taskId)) return wt;
  
            // If manager approved: keep Complete, mark reviewStatus Approved
            if (review === "Approved") {
              return { ...wt, status: "Complete", reviewStatus: "Approved" };
            }
  
            // If manager reworks: set back to Incomplete and mark reviewStatus Rework
            if (review === "Rework") {
              return { ...wt, status: "Incomplete", reviewStatus: "Rework" };
            }
  
            // Fallback (Pending)
            return { ...wt, reviewStatus: review };
          });
          return { ...prevW, [s.tasklistId]: nextList };
        });
  
        return { ...s, tasks, status };
      })
    );
  
    // Clear selection after action
    setSelection((prev) => ({ ...prev, [subId]: new Set() }));
  }
  

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <h1 style={S.h1}>Manager Review</h1>
      {submissions.length === 0 ? <div style={{ fontSize: 14, color: "#64748b" }}>No submissions yet.</div> : null}

      {submissions.map((s) => (
        <div key={s.id} style={{ ...S.card, borderRadius: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontWeight: 600 }}>{s.tasklistName}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>{s.date} • Signed: {s.signedBy}</div>
            </div>
            <span
              style={{
                ...S.tag,
                borderColor: s.status === "Approved" ? "#10b981" : s.status === "Rework" ? "#f59e0b" : "#94a3b8",
                color: s.status === "Approved" ? "#065f46" : s.status === "Rework" ? "#8a5a00" : "#475569",
              }}
            >
              {s.status}
            </span>
          </div>

          <table style={{ ...S.table, marginTop: 8 }}>
            <thead>
              <tr>
                <th style={S.th}><input
                  type="checkbox"
                  checked={(selection[s.id]?.size || 0) === s.tasks.length}
                  onChange={(e) => {
                    const all = new Set(e.target.checked ? s.tasks.map(t => t.taskId) : []);
                    setSelection((prev) => ({ ...prev, [s.id]: all }));
                  }}
                /></th>
                <th style={S.th}>Task</th>
                <th style={S.th}>Value</th>
                <th style={S.th}>Note</th>
                <th style={S.th}>Photos</th>
                <th style={S.th}>Employee Status</th>
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
                    <td style={S.td}>{t.value !== null && t.value !== undefined ? String(t.value) : "-"}</td>
                    <td style={S.td}>{t.note || "-"}</td>
                    <td style={S.td}>
                      {(t.photos || []).length ? (t.photos || []).map((p, j) => <span key={j} style={S.tag}>{p}</span>) : "-"}
                    </td>
                    <td style={S.td}>
                      <span style={{ ...S.tag, borderColor: t.status === "Complete" ? "#10b981" : "#94a3b8" }}>
                        {t.na ? "N/A" : t.status}
                      </span>
                    </td>
                    <td style={S.td}>
                      <span style={{
                        ...S.tag,
                        borderColor:
                          t.reviewStatus === "Approved" ? "#10b981" :
                            t.reviewStatus === "Rework" ? "#f59e0b" : "#94a3b8",
                        color:
                          t.reviewStatus === "Approved" ? "#065f46" :
                            t.reviewStatus === "Rework" ? "#8a5a00" : "#475569"
                      }}>
                        {t.reviewStatus}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
            <button style={S.btn} onClick={() => applyReview(s.id, "Rework")}>Rework Selected</button>
            <button style={S.btnPrimary} onClick={() => applyReview(s.id, "Approved")}>Approve Selected</button>
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
    return Object.values(acc).map((r) => ({ name: r.name, completion: pct(r.approved, r.total) }));
  }, [tasklists, submissions]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={S.h1}>Admin — Reports & Config</h1>
      <div style={S.grid2}>
        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Completion by Time Block</div>
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

        <div style={S.card}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>Tasklists</div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {tasklists.map((tl) => (
              <li key={tl.id} style={{ padding: "8px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div style={{ fontWeight: 500 }}>{tl.name}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{getTimeBlockLabel(tl.timeBlockId)} • {tl.tasks.length} tasks</div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Flow Summary</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "#334155" }}>
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
