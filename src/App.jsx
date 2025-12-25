// Debt-It (ToolStack) — module-ready MVP (Styled to match Inspect-It master)
// Paste into: src/App.jsx
// Requires: Tailwind v4 configured (same as other ToolStack apps).

import React, { useEffect, useMemo, useRef, useState } from "react";

const APP_ID = "debtit";
const APP_VERSION = "v1";

const KEY = `toolstack.${APP_ID}.${APP_VERSION}`;
const PROFILE_KEY = "toolstack.profile.v1";

// Optional: set later
const HUB_URL = "https://YOUR-WIX-HUB-URL-HERE";

function safeParse(raw, fallback) {
  try {
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

function uid(prefix = "id") {
  return (
    crypto?.randomUUID?.() ||
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function loadProfile() {
  return (
    safeParse(localStorage.getItem(PROFILE_KEY), null) || {
      org: "ToolStack",
      user: "",
      language: "EN",
      logo: "",
    }
  );
}

function defaultState() {
  return {
    meta: {
      appId: APP_ID,
      version: APP_VERSION,
      updatedAt: new Date().toISOString(),
    },
    settings: {
      currency: "EUR",
      strategy: "avalanche", // avalanche | snowball
      extraMonthly: 50,
      startMonth: isoToday().slice(0, 7), // YYYY-MM
    },
    debts: [
      {
        id: uid("d"),
        name: "Example debt",
        balance: 500,
        apr: 12.0, // annual %
        minPayment: 25,
        dueDay: 1,
        notes: "",
      },
    ],
  };
}

function loadState() {
  return safeParse(localStorage.getItem(KEY), null) || defaultState();
}

function saveState(state) {
  const next = {
    ...state,
    meta: { ...state.meta, updatedAt: new Date().toISOString() },
  };
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

function toNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function moneyFmt(n, currency) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "-";
  return `${x.toFixed(2)} ${currency}`;
}

function monthAdd(yyyyMm, add) {
  const [y, m] = yyyyMm.split("-").map((x) => Number(x));
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + add);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

function cmpDebts(strategy) {
  return (a, b) => {
    if (strategy === "snowball") {
      return toNum(a.balance) - toNum(b.balance);
    }
    const aprDiff = toNum(b.apr) - toNum(a.apr);
    if (aprDiff !== 0) return aprDiff;
    return toNum(b.balance) - toNum(a.balance);
  };
}

function clampMin(n, min) {
  return Math.max(min, n);
}

function buildSchedule({
  debts,
  currency,
  strategy,
  extraMonthly,
  startMonth,
  horizonMonths = 240,
}) {
  const active = debts
    .map((d) => ({
      ...d,
      balance: round2(clampMin(toNum(d.balance), 0)),
      apr: clampMin(toNum(d.apr), 0),
      minPayment: round2(clampMin(toNum(d.minPayment), 0)),
    }))
    .filter((d) => d.balance > 0.01);

  const rows = [];
  if (active.length === 0) {
    return { rows, payoffMonth: null, totalInterest: 0, totalPaid: 0, months: 0 };
  }

  let totalInterest = 0;
  let totalPaid = 0;
  let month = startMonth;

  for (let i = 0; i < horizonMonths; i++) {
    // Interest first
    const interestById = {};
    for (const d of active) {
      if (d.balance <= 0.01) continue;
      const r = d.apr / 100 / 12;
      const interest = round2(d.balance * r);
      d.balance = round2(d.balance + interest);
      interestById[d.id] = interest;
      totalInterest = round2(totalInterest + interest);
    }

    // Order for payments
    const order = [...active]
      .filter((d) => d.balance > 0.01)
      .sort(cmpDebts(strategy));

    let extraPool = round2(clampMin(toNum(extraMonthly), 0));
    const paymentById = {};

    // Minimums
    for (const d of order) {
      if (d.balance <= 0.01) continue;
      const pay = round2(Math.min(d.minPayment, d.balance));
      d.balance = round2(d.balance - pay);
      paymentById[d.id] = round2((paymentById[d.id] || 0) + pay);
      totalPaid = round2(totalPaid + pay);
    }

    // Extra to target (cascade)
    let idx = 0;
    while (extraPool > 0.01) {
      const target = order[idx];
      if (!target) break;
      if (target.balance <= 0.01) {
        idx++;
        continue;
      }
      const pay = round2(Math.min(extraPool, target.balance));
      target.balance = round2(target.balance - pay);
      paymentById[target.id] = round2((paymentById[target.id] || 0) + pay);
      totalPaid = round2(totalPaid + pay);
      extraPool = round2(extraPool - pay);
      if (target.balance <= 0.01) idx++;
    }

    const remaining = round2(
      order.reduce((sum, d) => sum + (d.balance > 0.01 ? d.balance : 0), 0)
    );

    rows.push({ month, interestById, paymentById, remaining });

    const anyLeft = order.some((d) => d.balance > 0.01);
    if (!anyLeft) {
      return {
        rows,
        payoffMonth: month,
        totalInterest,
        totalPaid,
        months: i + 1,
      };
    }

    month = monthAdd(month, 1);
  }

  return { rows, payoffMonth: null, totalInterest, totalPaid, months: horizonMonths };
}

// === Inspect-It master styling constants ===
const btnSecondary =
  "px-3 py-2 rounded-xl bg-white border border-neutral-200 shadow-sm hover:bg-neutral-50 active:translate-y-[1px] transition";
const btnPrimary =
  "px-3 py-2 rounded-xl bg-neutral-900 text-white border border-neutral-900 shadow-sm hover:bg-neutral-800 active:translate-y-[1px] transition";
const inputBase =
  "w-full mt-1 px-3 py-2 rounded-xl border border-neutral-200 bg-white focus:outline-none focus:ring-2 focus:ring-lime-400/25 focus:border-neutral-300";

export default function App() {
  const [profile, setProfile] = useState(loadProfile());
  const [state, setState] = useState(loadState());

  const importRef = useRef(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  const currency = state.settings.currency;

  function updateSettings(patch) {
    setState((prev) =>
      saveState({ ...prev, settings: { ...prev.settings, ...patch } })
    );
  }

  function addDebt() {
    const d = {
      id: uid("d"),
      name: "",
      balance: 0,
      apr: 0,
      minPayment: 0,
      dueDay: 1,
      notes: "",
    };
    setState((prev) => saveState({ ...prev, debts: [...prev.debts, d] }));
  }

  function updateDebt(id, patch) {
    setState((prev) =>
      saveState({
        ...prev,
        debts: prev.debts.map((d) => (d.id === id ? { ...d, ...patch } : d)),
      })
    );
  }

  function deleteDebt(id) {
    setState((prev) =>
      saveState({ ...prev, debts: prev.debts.filter((d) => d.id !== id) })
    );
  }

  function exportJSON() {
    const payload = {
      exportedAt: new Date().toISOString(),
      profile,
      data: state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `toolstack-debt-it-${APP_VERSION}-${isoToday()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const incoming = parsed?.data;
        if (!incoming?.settings || !Array.isArray(incoming?.debts)) {
          throw new Error("Invalid import file");
        }
        setProfile(parsed?.profile || profile);
        setState(saveState(incoming));
      } catch (e) {
        alert("Import failed: " + (e?.message || "unknown error"));
      }
    };
    reader.readAsText(file);
  }

  function printPreview() {
    setPreviewOpen(true);
    setTimeout(() => window.print(), 50);
  }

  const schedule = useMemo(() => {
    return buildSchedule({
      debts: state.debts,
      currency,
      strategy: state.settings.strategy,
      extraMonthly: state.settings.extraMonthly,
      startMonth: state.settings.startMonth,
      horizonMonths: 240,
    });
  }, [
    state.debts,
    currency,
    state.settings.strategy,
    state.settings.extraMonthly,
    state.settings.startMonth,
  ]);

  const debtOrder = useMemo(() => {
    return [...state.debts].sort(cmpDebts(state.settings.strategy));
  }, [state.debts, state.settings.strategy]);

  const totalsNow = useMemo(() => {
    const totalBalance = round2(
      state.debts.reduce((s, d) => s + clampMin(toNum(d.balance), 0), 0)
    );
    const totalMin = round2(
      state.debts.reduce((s, d) => s + clampMin(toNum(d.minPayment), 0), 0)
    );
    return { totalBalance, totalMin };
  }, [state.debts]);

  const moduleManifest = useMemo(
    () => ({
      id: APP_ID,
      name: "Debt-It",
      version: APP_VERSION,
      storageKeys: [KEY, PROFILE_KEY],
      exports: ["print", "json"],
    }),
    []
  );

  const activeDebtCount = useMemo(
    () => state.debts.filter((d) => toNum(d.balance) > 0.01).length,
    [state.debts]
  );

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-bold tracking-tight">Debt-It</div>
            <div className="text-sm text-neutral-600">
              Module-ready ({moduleManifest.id}.{moduleManifest.version}) •
              Snowball/Avalanche • Printable plan
            </div>
            <div className="mt-3 h-[2px] w-80 rounded-full bg-gradient-to-r from-lime-400/0 via-lime-400 to-emerald-400/0" />
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <button className={btnSecondary} onClick={() => setPreviewOpen(true)}>
              Preview
            </button>
            <button className={btnSecondary} onClick={printPreview}>
              Print / Save PDF
            </button>
            <button className={btnSecondary} onClick={exportJSON}>
              Export
            </button>
            <button
              className={btnPrimary}
              onClick={() => importRef.current?.click()}
            >
              Import
            </button>
            <input
              ref={importRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importJSON(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>

        {/* Main grid */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Profile */}
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-4">
            <div className="font-semibold">Profile (shared)</div>
            <div className="mt-3 space-y-2">
              <label className="block text-sm">
                <div className="text-neutral-600">Organization</div>
                <input
                  className={inputBase}
                  value={profile.org}
                  onChange={(e) => setProfile({ ...profile, org: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                <div className="text-neutral-600">User</div>
                <input
                  className={inputBase}
                  value={profile.user}
                  onChange={(e) =>
                    setProfile({ ...profile, user: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                <div className="text-neutral-600">Language</div>
                <select
                  className={inputBase}
                  value={profile.language}
                  onChange={(e) =>
                    setProfile({ ...profile, language: e.target.value })
                  }
                >
                  <option value="EN">EN</option>
                  <option value="DE">DE</option>
                </select>
              </label>
              <div className="pt-2 text-xs text-neutral-500">
                Stored at <span className="font-mono">{PROFILE_KEY}</span>
              </div>
            </div>
          </div>

          {/* Settings + Content */}
          <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm p-4 lg:col-span-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="font-semibold">Plan settings</div>
                <div className="text-sm text-neutral-600">
                  Total balance:{" "}
                  <span className="font-semibold">
                    {moneyFmt(totalsNow.totalBalance, currency)}
                  </span>{" "}
                  • Minimum total:{" "}
                  <span className="font-semibold">
                    {moneyFmt(totalsNow.totalMin, currency)}
                  </span>{" "}
                  • Active debts:{" "}
                  <span className="font-semibold">{activeDebtCount}</span>
                </div>
              </div>

              <button className={btnSecondary} onClick={addDebt}>
                + Debt
              </button>
            </div>

            <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-2">
              <label className="text-sm">
                <div className="text-neutral-600">Strategy</div>
                <select
                  className={inputBase}
                  value={state.settings.strategy}
                  onChange={(e) => updateSettings({ strategy: e.target.value })}
                >
                  <option value="avalanche">Avalanche (highest APR)</option>
                  <option value="snowball">Snowball (smallest balance)</option>
                </select>
              </label>

              <label className="text-sm">
                <div className="text-neutral-600">Extra / month</div>
                <input
                  type="number"
                  step="0.01"
                  className={inputBase}
                  value={state.settings.extraMonthly}
                  onChange={(e) =>
                    updateSettings({ extraMonthly: toNum(e.target.value, 0) })
                  }
                />
              </label>

              <label className="text-sm">
                <div className="text-neutral-600">Start month</div>
                <input
                  type="month"
                  className={inputBase}
                  value={state.settings.startMonth}
                  onChange={(e) => updateSettings({ startMonth: e.target.value })}
                />
              </label>

              <label className="text-sm">
                <div className="text-neutral-600">Currency</div>
                <input
                  className={inputBase}
                  value={state.settings.currency}
                  onChange={(e) =>
                    updateSettings({ currency: String(e.target.value || "").toUpperCase() })
                  }
                />
              </label>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Debts */}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="font-semibold">Debts (ordered by strategy)</div>
                <div className="mt-2 space-y-2">
                  {debtOrder.length === 0 ? (
                    <div className="text-sm text-neutral-500">Add your debts.</div>
                  ) : (
                    debtOrder.map((d, idx) => (
                      <div
                        key={d.id}
                        className="rounded-xl bg-white border border-neutral-200 p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-semibold">
                              {d.name || `Debt ${idx + 1}`}
                            </div>
                            <div className="text-sm text-neutral-600">
                              Balance:{" "}
                              <span className="font-semibold">
                                {moneyFmt(toNum(d.balance), currency)}
                              </span>{" "}
                              • APR:{" "}
                              <span className="font-semibold">
                                {toNum(d.apr).toFixed(2)}%
                              </span>
                            </div>
                          </div>

                          <button
                            className="px-3 py-1.5 rounded-xl bg-white border border-neutral-200 hover:bg-neutral-50"
                            onClick={() => deleteDebt(d.id)}
                          >
                            Delete
                          </button>
                        </div>

                        <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                          <label className="text-sm">
                            <div className="text-neutral-600">Name</div>
                            <input
                              className={inputBase}
                              value={d.name}
                              onChange={(e) =>
                                updateDebt(d.id, { name: e.target.value })
                              }
                            />
                          </label>

                          <label className="text-sm">
                            <div className="text-neutral-600">Balance</div>
                            <input
                              type="number"
                              step="0.01"
                              className={inputBase}
                              value={d.balance}
                              onChange={(e) =>
                                updateDebt(d.id, { balance: toNum(e.target.value, 0) })
                              }
                            />
                          </label>

                          <label className="text-sm">
                            <div className="text-neutral-600">APR %</div>
                            <input
                              type="number"
                              step="0.01"
                              className={inputBase}
                              value={d.apr}
                              onChange={(e) =>
                                updateDebt(d.id, { apr: toNum(e.target.value, 0) })
                              }
                            />
                          </label>

                          <label className="text-sm">
                            <div className="text-neutral-600">Minimum payment</div>
                            <input
                              type="number"
                              step="0.01"
                              className={inputBase}
                              value={d.minPayment}
                              onChange={(e) =>
                                updateDebt(d.id, {
                                  minPayment: toNum(e.target.value, 0),
                                })
                              }
                            />
                          </label>

                          <label className="text-sm">
                            <div className="text-neutral-600">Due day</div>
                            <input
                              type="number"
                              min="1"
                              max="31"
                              className={inputBase}
                              value={d.dueDay}
                              onChange={(e) =>
                                updateDebt(d.id, { dueDay: toNum(e.target.value, 1) })
                              }
                            />
                          </label>

                          <label className="text-sm">
                            <div className="text-neutral-600">Notes</div>
                            <input
                              className={inputBase}
                              value={d.notes}
                              onChange={(e) =>
                                updateDebt(d.id, { notes: e.target.value })
                              }
                              placeholder="Ref, creditor, etc."
                            />
                          </label>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
                <div className="font-semibold">Plan summary</div>

                {activeDebtCount === 0 ? (
                  <div className="mt-2 text-sm text-neutral-500">
                    Enter balances to see payoff plan.
                  </div>
                ) : (
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="rounded-xl bg-white border border-neutral-200 p-3">
                      <div className="text-neutral-600">Estimated payoff</div>
                      <div className="text-lg font-bold">
                        {schedule.payoffMonth
                          ? `${schedule.payoffMonth} (${schedule.months} months)`
                          : "Not within 240 months"}
                      </div>
                      <div className="text-neutral-600 mt-1">
                        Total interest:{" "}
                        <span className="font-semibold">
                          {moneyFmt(schedule.totalInterest, currency)}
                        </span>
                      </div>
                      <div className="text-neutral-600">
                        Total paid:{" "}
                        <span className="font-semibold">
                          {moneyFmt(schedule.totalPaid, currency)}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-white border border-neutral-200 p-3">
                      <div className="text-neutral-600">Monthly commitment</div>
                      <div>
                        Minimums:{" "}
                        <span className="font-semibold">
                          {moneyFmt(totalsNow.totalMin, currency)}
                        </span>
                      </div>
                      <div>
                        Extra:{" "}
                        <span className="font-semibold">
                          {moneyFmt(state.settings.extraMonthly, currency)}
                        </span>
                      </div>
                      <div className="mt-2 text-neutral-500">
                        Tip: Increasing “extra” usually cuts payoff time sharply.
                      </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      <button className={btnSecondary} onClick={() => setPreviewOpen(true)}>
                        Preview report
                      </button>
                      <button className={btnSecondary} onClick={printPreview}>
                        Print / Save PDF
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Schedule table */}
            <div className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
              <div className="font-semibold">Payment schedule (first 24 months)</div>
              <div className="text-sm text-neutral-600 mt-1">
                Simple model: interest monthly, then payments. Good for planning.
              </div>

              <div className="mt-2 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-neutral-600">
                    <tr className="border-b">
                      <th className="py-2 pr-2">Month</th>
                      <th className="py-2 pr-2">Remaining</th>
                      <th className="py-2 pr-2">Interest (month)</th>
                      <th className="py-2 pr-2">Paid (month)</th>
                      <th className="py-2 pr-2">Focus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.rows.slice(0, 24).map((r) => {
                      const monthInterest = round2(
                        Object.values(r.interestById || {}).reduce(
                          (s, x) => s + toNum(x),
                          0
                        )
                      );
                      const monthPaid = round2(
                        Object.values(r.paymentById || {}).reduce(
                          (s, x) => s + toNum(x),
                          0
                        )
                      );

                      const paidPairs = Object.entries(r.paymentById || {});
                      paidPairs.sort((a, b) => toNum(b[1]) - toNum(a[1]));
                      const topId = paidPairs[0]?.[0];
                      const topName =
                        state.debts.find((d) => d.id === topId)?.name || "-";

                      return (
                        <tr key={r.month} className="border-b last:border-b-0">
                          <td className="py-2 pr-2 font-medium">{r.month}</td>
                          <td className="py-2 pr-2">
                            {moneyFmt(r.remaining, currency)}
                          </td>
                          <td className="py-2 pr-2">
                            {moneyFmt(monthInterest, currency)}
                          </td>
                          <td className="py-2 pr-2">
                            {moneyFmt(monthPaid, currency)}
                          </td>
                          <td className="py-2 pr-2">{topName}</td>
                        </tr>
                      );
                    })}

                    {schedule.rows.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-3 text-neutral-500">
                          Add debts with balances.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="pt-3 text-xs text-neutral-500">
              Stored at <span className="font-mono">{KEY}</span>
            </div>
          </div>
        </div>

        {/* Preview modal */}
        {previewOpen && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-3 z-50">
            <div className="w-full max-w-5xl bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-hidden">
              <div className="p-3 border-b flex items-center justify-between">
                <div className="font-semibold">Preview — Debt payoff plan</div>
                <div className="flex gap-2">
                  <button className={btnSecondary} onClick={printPreview}>
                    Print / Save PDF
                  </button>
                  <button className={btnPrimary} onClick={() => setPreviewOpen(false)}>
                    Close
                  </button>
                </div>
              </div>

              <div className="p-6 overflow-auto max-h-[80vh]">
                <div className="text-xl font-bold">{profile.org || "ToolStack"}</div>
                <div className="text-sm text-neutral-600">Debt payoff plan</div>
                <div className="mt-2 h-[2px] w-72 rounded-full bg-gradient-to-r from-lime-400/0 via-lime-400 to-emerald-400/0" />

                <div className="mt-3 text-sm">
                  <div>
                    <span className="text-neutral-600">Prepared by:</span>{" "}
                    {profile.user || "-"}
                  </div>
                  <div>
                    <span className="text-neutral-600">Generated:</span>{" "}
                    {new Date().toLocaleString()}
                  </div>
                  <div>
                    <span className="text-neutral-600">Strategy:</span>{" "}
                    {state.settings.strategy}
                  </div>
                  <div>
                    <span className="text-neutral-600">Start month:</span>{" "}
                    {state.settings.startMonth}
                  </div>
                  <div>
                    <span className="text-neutral-600">Extra / month:</span>{" "}
                    {moneyFmt(state.settings.extraMonthly, currency)}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-200 p-3 text-sm">
                  <div className="font-semibold">Summary</div>
                  <div className="mt-1 text-neutral-700">
                    Total balance: {moneyFmt(totalsNow.totalBalance, currency)} •
                    Minimum total: {moneyFmt(totalsNow.totalMin, currency)}
                  </div>
                  <div className="mt-1 text-neutral-700">
                    Estimated payoff:{" "}
                    <span className="font-semibold">
                      {schedule.payoffMonth
                        ? `${schedule.payoffMonth} (${schedule.months} months)`
                        : "Not within 240 months"}
                    </span>
                  </div>
                  <div className="mt-1 text-neutral-700">
                    Total interest (estimate):{" "}
                    <span className="font-semibold">
                      {moneyFmt(schedule.totalInterest, currency)}
                    </span>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-200 p-3 text-sm">
                  <div className="font-semibold">Debts (ordered)</div>
                  <div className="mt-2 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-neutral-600">
                        <tr className="border-b">
                          <th className="py-2 pr-2">Order</th>
                          <th className="py-2 pr-2">Name</th>
                          <th className="py-2 pr-2">Balance</th>
                          <th className="py-2 pr-2">APR</th>
                          <th className="py-2 pr-2">Min</th>
                          <th className="py-2 pr-2">Due day</th>
                        </tr>
                      </thead>
                      <tbody>
                        {debtOrder.map((d, i) => (
                          <tr key={d.id} className="border-b last:border-b-0">
                            <td className="py-2 pr-2">{i + 1}</td>
                            <td className="py-2 pr-2 font-medium">{d.name || "-"}</td>
                            <td className="py-2 pr-2">{moneyFmt(toNum(d.balance), currency)}</td>
                            <td className="py-2 pr-2">{toNum(d.apr).toFixed(2)}%</td>
                            <td className="py-2 pr-2">{moneyFmt(toNum(d.minPayment), currency)}</td>
                            <td className="py-2 pr-2">{d.dueDay || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-200 p-3 text-sm">
                  <div className="font-semibold">Schedule (first 24 months)</div>
                  <div className="mt-2 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-neutral-600">
                        <tr className="border-b">
                          <th className="py-2 pr-2">Month</th>
                          <th className="py-2 pr-2">Remaining</th>
                          <th className="py-2 pr-2">Interest</th>
                          <th className="py-2 pr-2">Paid</th>
                        </tr>
                      </thead>
                      <tbody>
                        {schedule.rows.slice(0, 24).map((r) => {
                          const monthInterest = round2(
                            Object.values(r.interestById || {}).reduce(
                              (s, x) => s + toNum(x),
                              0
                            )
                          );
                          const monthPaid = round2(
                            Object.values(r.paymentById || {}).reduce(
                              (s, x) => s + toNum(x),
                              0
                            )
                          );
                          return (
                            <tr key={r.month} className="border-b last:border-b-0">
                              <td className="py-2 pr-2 font-medium">{r.month}</td>
                              <td className="py-2 pr-2">{moneyFmt(r.remaining, currency)}</td>
                              <td className="py-2 pr-2">{moneyFmt(monthInterest, currency)}</td>
                              <td className="py-2 pr-2">{moneyFmt(monthPaid, currency)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
                  <div>
                    <div className="text-neutral-600">Prepared by</div>
                    <div className="mt-8 border-t pt-2">Signature</div>
                  </div>
                  <div>
                    <div className="text-neutral-600">Reviewed</div>
                    <div className="mt-8 border-t pt-2">Signature</div>
                  </div>
                </div>

                <div className="mt-6 text-xs text-neutral-500">
                  Storage key: <span className="font-mono">{KEY}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer link */}
        <div className="mt-6 text-sm text-neutral-600">
          <a
            className="underline hover:text-neutral-900"
            href={HUB_URL}
            target="_blank"
            rel="noreferrer"
          >
            Return to ToolStack hub
          </a>
        </div>
      </div>
    </div>
  );
}
