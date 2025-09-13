import React, { useMemo, useState } from "react";

/**
 * SOP Checklist App — Zero-dependency React demo (JavaScript only)
 * Works in CRA or Vite without Tailwind, shadcn, framer, or chart libs.
 * Styling is plain CSS-in-JS for portability.
 *
 * HOW TO RUN (Vite example):
 * 1) npm create vite@latest sop-checklist -- --template react
 * 2) cd sop-checklist && npm i && npm run dev
 * 3) Replace src/App.jsx with this file's contents.
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
  card: { background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
  btn: { padding: "8px 12px", borderRadius: 10, border: "1px solid #cbd5e1", background: "white", cursor: "pointer" },
  btnPrimary: { padding: "8px 12px", borderRadius: 10, border: "1px solid #0f172a", background: "#0f172a", color: "white", cursor: "pointer" },
  grid2: { display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" },
  input: { border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 8px" },
  tag: { fontSize: 12, padding: "2px 8px", border: "1px solid #cbd5e1", borderRadius: 999, background: "#f1f5f9", marginRight: 6 },
  row: { display: "flex", alignItems: "center", gap: 8 },
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
const INITIAL_SUBMISSIONS = [
  {
    id: "ci_1001",
    tasklistId: "tl_001",
    date: todayISO(),
    locationId: "loc_001",
    status: "Pending",
    signedBy: "Alex",
    signedAt: new Date().toISOString(),
    tasks: [
      { taskId: "t_1", status: "Complete", value: true, note: "", photos: ["photo1.jpg"] },
      { taskId: "t_2", status: "Complete", value: 38, note: "Thermometer A", photos: [] },
      { taskId: "t_3", status: "Complete", value: true, note: "", photos: [] },
    ],
  },
];

// ---------------------- Utils ----------------------
function getTimeBlockLabel(id) {
  const tb = TIME_BLOCKS.find((t) => t.id === id);
  return tb ? `${tb.name} (${tb.start}–${tb.end})` : id;
}
function pct(n, d) { return d ? Math.round((n / d) * 100) : 0; }

// ---------------------- Main App ----------------------
export default function App() {
  const [mode, setMode] = useState("employee");
  const [activeLocationId, setActiveLocationId] = useState("loc_001");
  const [submissions, setSubmissions] = useState(INITIAL_SUBMISSIONS);
  const [pinModal, setPinModal] = useState({ open: false, onConfirm: null });

  const tasklistsToday = useMemo(() => {
    const dow = new Date().getDay();
    return MOCK_TASKLISTS.filter((tl) => tl.locationId === activeLocationId && tl.recurrence.includes(dow));
  }, [activeLocationId]);

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
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <main style={S.container}>
        {mode === "employee" && (
          <EmployeeView
            tasklists={tasklistsToday}
            onSubmit={(submission) =>
              setSubmissions((prev) => [{ ...submission, id: `ci_${prev.length + 1002}`, status: "Pending", locationId: activeLocationId }, ...prev])
            }
            pinModal={pinModal}
            setPinModal={setPinModal}
          />
        )}
        {mode === "manager" && <ManagerView submissions={submissions} setSubmissions={setSubmissions} />}
        {mode === "admin" && <AdminView tasklists={MOCK_TASKLISTS} submissions={submissions} />}
      </main>
    </div>
  );
}

// ---------------------- Employee ----------------------
function EmployeeView({ tasklists, onSubmit, pinModal, setPinModal }) {
  const [working, setWorking] = useState(() =>
    tasklists.reduce((acc, tl) => {
      acc[tl.id] = tl.tasks.map((t) => ({ taskId: t.id, status: "Incomplete", value: null, note: "", photos: [], na: false }));
      return acc;
    }, {})
  );

  function updateTaskState(tlId, taskId, patch) {
    setWorking((prev) => {
      const next = { ...prev };
      next[tlId] = next[tlId].map((ti) => (ti.taskId === taskId ? { ...ti, ...patch } : ti));
      return next;
    });
  }

  function handleComplete(tl, task, value) {
    updateTaskState(tl.id, task.id, { status: "Complete", value: value ?? true });
  }

  function handleUpload(tl, task, file) {
    setWorking((prev) => {
      const next = { ...prev };
      next[tl.id] = next[tl.id].map((ti) => (ti.taskId === task.id ? { ...ti, photos: [...ti.photos, file.name] } : ti));
      return next;
    });
  }

  function handleSignoff(tl) {
    // Validate requirements
    const taskStates = working[tl.id];
    for (const t of tl.tasks) {
      const st = taskStates.find((s) => s.taskId === t.id);
      const completed = st.status === "Complete" || st.na;
      const hasPhoto = !t.photoRequired || (st.photos && st.photos.length);
      const hasNote = !t.noteRequired || (st.note && st.note.trim() !== "");
      const numOK =
        t.inputType !== "number" ||
        (typeof st.value === "number" && (t.min === undefined || st.value >= t.min) && (t.max === undefined || st.value <= t.max));
      if (!(completed && hasPhoto && hasNote && numOK)) {
        alert(`Task "${t.title}" is missing required evidence/inputs.`);
        return;
      }
    }

    setPinModal({
      open: true,
      onConfirm: (pin) => {
        const submission = {
          tasklistId: tl.id,
          date: todayISO(),
          signedBy: `PIN-${pin}`,
          signedAt: new Date().toISOString(),
          tasks: working[tl.id],
        };
        onSubmit(submission);
        // reset
        setWorking((prev) => ({
          ...prev,
          [tl.id]: tl.tasks.map((t) => ({ taskId: t.id, status: "Incomplete", value: null, note: "", photos: [], na: false })),
        }));
        setPinModal({ open: false, onConfirm: null });
        alert("Submitted for approval.");
      },
    });
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={S.h1}>Today</h1>
      {tasklists.map((tl) => (
        <div key={tl.id} style={S.card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600 }}>{tl.name}</div>
              <div style={{ fontSize: 12, color: "#475569" }}>{getTimeBlockLabel(tl.timeBlockId)}</div>
            </div>
            <button style={S.btnPrimary} onClick={() => handleSignoff(tl)}>
              Sign & Submit
            </button>
          </div>
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            {tl.tasks.map((task) => {
              const state = working[tl.id].find((s) => s.taskId === task.id);
              return (
                <div key={task.id} style={{ ...S.card, borderRadius: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{task.title}</div>
                      <div style={{ fontSize: 12, color: "#475569" }}>
                        {task.category} • {task.inputType}
                        {task.photoRequired ? " • Photo required" : ""}
                        {task.noteRequired ? " • Note required" : ""}
                      </div>
                    </div>
                    <div style={S.row}>
                      {task.inputType === "number" && (
                        <input
                          type="number"
                          placeholder={`${task.min ?? ""}-${task.max ?? ""}`}
                          style={{ ...S.input, width: 80 }}
                          onChange={(e) => updateTaskState(tl.id, task.id, { value: Number(e.target.value) })}
                        />
                      )}
                      <button style={S.btn} onClick={() => handleComplete(tl, task)}>
                        Mark Complete
                      </button>
                      <label style={S.btn}>
                        Upload Photo
                        <input
                          type="file"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const f = e.target.files && e.target.files[0];
                            if (f) handleUpload(tl, task, f);
                          }}
                        />
                      </label>
                      <input
                        placeholder="Add note"
                        style={S.input}
                        onChange={(e) => updateTaskState(tl.id, task.id, { note: e.target.value })}
                      />
                      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
                        <input type="checkbox" onChange={(e) => updateTaskState(tl.id, task.id, { na: e.target.checked })} /> N/A
                      </label>
                    </div>
                  </div>
                  <EvidenceRow state={state} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {pinModal.open && <PinDialog onClose={() => setPinModal({ open: false, onConfirm: null })} onConfirm={pinModal.onConfirm} />}
    </div>
  );
}

function EvidenceRow({ state }) {
  if (!state) return null;
  return (
    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12, color: "#334155" }}>
      {state.photos?.map((p, i) => (
        <span key={i} style={S.tag}>
          {p}
        </span>
      ))}
      {state.note && <span style={S.tag}>Note: {state.note}</span>}
      {state.value !== null && state.value !== undefined && <span style={S.tag}>Value: {state.value}</span>}
      {state.na && <span style={S.tag}>N/A</span>}
    </div>
  );
}

function PinDialog({ onClose, onConfirm }) {
  const [pin, setPin] = useState("");
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div style={{ ...S.card, padding: 20, width: 360 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Enter PIN</div>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          placeholder="••••"
          style={{ ...S.input, width: "100%", marginBottom: 12 }}
        />
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button style={S.btn} onClick={onClose}>
            Cancel
          </button>
          <button
            style={S.btnPrimary}
            onClick={() => {
              if (pin) {
                onConfirm && onConfirm(pin);
              }
            }}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------- Manager ----------------------
function ManagerView({ submissions, setSubmissions }) {
  function setStatus(id, status) {
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <h1 style={S.h1}>Manager Inbox</h1>
      <div style={S.grid2}>
        {submissions.map((s) => (
          <div key={s.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 600 }}>Checklist: {s.tasklistId}</div>
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
            <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
              {s.tasks.map((t, i) => (
                <div key={i} style={{ ...S.card, borderRadius: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div>
                      Task {t.taskId} — <span style={{ fontWeight: 600 }}>{t.status}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "#475569" }}>{t.photos?.length || 0} photo(s)</div>
                  </div>
                  {t.note && <div style={{ fontSize: 12, color: "#334155", marginTop: 4 }}>Note: {t.note}</div>}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button style={S.btn} onClick={() => setStatus(s.id, "Rework")}>
                Request Rework
              </button>
              <button style={S.btnPrimary} onClick={() => setStatus(s.id, "Approved")}>
                Approve
              </button>
            </div>
          </div>
        ))}
      </div>
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
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 6 }}>Time Block</th>
                <th style={{ textAlign: "left", borderBottom: "1px solid #e2e8f0", padding: 6 }}>Completion</th>
              </tr>
            </thead>
            <tbody>
              {byBlock.map((r, i) => (
                <tr key={i}>
                  <td style={{ padding: 6, borderBottom: "1px solid #f1f5f9" }}>{r.name}</td>
                  <td style={{ padding: 6, borderBottom: "1px solid #f1f5f9" }}>{r.completion}%</td>
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
                <div style={{ fontSize: 12, color: "#475569" }}>
                  {getTimeBlockLabel(tl.timeBlockId)} • {tl.tasks.length} tasks
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Seed Data / Tips</div>
        <ol style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: "#334155" }}>
          <li>
            Switch to <b>Employee</b> to submit a checklist with mock PIN; it appears in the <b>Manager</b> inbox.
          </li>
          <li>
            Manager can mark <b>Approved</b> or <b>Rework</b>; completion table updates here.
          </li>
          <li>
            Add your own mock tasklists by extending <code>MOCK_TASKLISTS</code>.
          </li>
        </ol>
      </div>
    </div>
  );
}
