"use client";
const navigation = [
  "Dashboard",
  "Campaigns",
  "Leads",
  "Inboxes",
  "Templates",
  "Suppression",
  "Settings",
];

const stats = [
  { label: "Total Leads", value: "0", detail: "No leads imported yet" },
  { label: "Active Campaigns", value: "0", detail: "Ready to launch" },
  { label: "Emails Sent", value: "0", detail: "No activity yet" },
  { label: "Replies", value: "0", detail: "No replies yet" },
];

export default function Dashboard() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-white/[0.06] bg-[#0b0c11] lg:flex lg:flex-col">
          <div className="flex h-20 items-center border-b border-white/[0.06] px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold shadow-lg shadow-violet-500/20">
                S
              </div>
              <div>
                <div className="text-lg font-semibold tracking-tight text-white">
                  SIA
                </div>
                <div className="-mt-1 text-[9px] font-semibold tracking-[0.2em] text-slate-500">
                  AI AGENT
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 pt-7">
            <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
              Workspace
            </p>

            <nav className="mt-3 space-y-1">
              {navigation.map((item, index) => (
                <div
                  key={item}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    index === 0
                      ? "bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/10"
                      : "text-slate-500 hover:bg-white/[0.03] hover:text-slate-200"
                  }`}
                >
                  <span className="flex w-5 justify-center text-[10px] text-slate-600">
                    ●
                  </span>
                  <span>{item}</span>
                </div>
              ))}
            </nav>
          </div>

          <div className="mt-auto p-4">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-lg shadow-emerald-400/40" />
                <span className="text-xs font-medium text-slate-300">
                  System operational
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                Core services are ready.
              </p>
            </div>

            <div className="mt-4 flex items-center gap-3 rounded-xl px-2 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/10 text-xs font-semibold text-violet-300 ring-1 ring-violet-400/20">
                U
              </div>
              <div>
                <p className="text-xs font-medium text-slate-300">
                  Workspace Owner
                </p>
                <p className="text-[10px] text-slate-600">
                  Administrator
                </p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="flex h-20 items-center justify-between border-b border-white/[0.06] bg-[#08090d]/90 px-6 backdrop-blur-xl lg:px-10">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                Workspace
              </p>
              <div className="mt-1 flex items-center gap-2">
                <h1 className="text-sm font-semibold text-slate-200">
                  SIA Workspace
                </h1>
                <span className="text-slate-700">/</span>
                <span className="text-sm text-slate-500">Dashboard</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="hidden rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs text-slate-500 transition hover:bg-white/[0.05] hover:text-slate-200 sm:block">
                Search
              </button>

              <button className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.02] text-slate-500 transition hover:bg-white/[0.05] hover:text-white">
                ◌
              </button>

              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-xs font-bold text-white shadow-lg shadow-violet-500/10">
                U
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-7xl px-6 py-8">
            <div className="mb-8">
              <h2 className="text-3xl font-bold">Welcome to SIA</h2>
              <p className="mt-2 text-slate-400">
                Sales Intelligence Automation for managing leads and
                AI-powered outreach.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div
                  key={stat.label}
                  className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 transition duration-300 hover:-translate-y-0.5 hover:border-violet-400/20 hover:bg-white/[0.035]"
                >
                  <div className="flex items-start justify-between">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">
                      {stat.label}
                    </p>
                    <span className="h-2 w-2 rounded-full bg-violet-400/70 shadow-lg shadow-violet-500/20 transition group-hover:bg-violet-300" />
                  </div>
                  <p className="mt-5 text-3xl font-semibold tracking-tight text-white">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-xs text-slate-600">{stat.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      Campaign Activity
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      Recent campaign performance
                    </p>
                  </div>
                  <span className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium text-slate-500">
                    Overview
                  </span>
                </div>

                <div className="mt-8 flex min-h-28 items-center justify-center rounded-xl border border-dashed border-white/[0.06] bg-black/10">
                  <p className="text-xs text-slate-600">
                    Campaign activity will appear here once campaigns are created.
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200">
                      Recent Replies
                    </h3>
                    <p className="mt-1 text-xs text-slate-600">
                      AI-classified conversations
                    </p>
                  </div>
                  <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-400/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    AI ready
                  </span>
                </div>

                <div className="mt-8 flex min-h-28 items-center justify-center rounded-xl border border-dashed border-white/[0.06] bg-black/10">
                  <p className="text-xs text-slate-600">
                    AI-classified replies will appear here.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
