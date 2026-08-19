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
        <aside className="hidden w-64 shrink-0 border-r border-slate-800 bg-slate-900/80 p-5 md:block">
          <div className="mb-8">
            <div className="text-xl font-bold">SIA</div>
            <div className="text-xs text-slate-500">AI AGENT</div>
          </div>

          <nav className="space-y-1">
            {navigation.map((item, index) => (
              <div
                key={item}
                className={`rounded-lg px-3 py-2.5 text-sm ${
                  index === 0
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {item}
              </div>
            ))}
          </nav>

          <div className="mt-10 border-t border-slate-800 pt-5">
            <p className="text-xs uppercase tracking-wider text-slate-600">
              System
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm text-slate-400">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Backend Online
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="border-b border-slate-800 bg-slate-950/80 px-6 py-5">
            <div className="mx-auto flex max-w-7xl items-center justify-between">
              <div>
                <p className="text-sm text-blue-400">Workspace</p>
                <h1 className="text-2xl font-bold">Dashboard</h1>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-sm text-slate-400">
                SIA Workspace
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
                  className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
                >
                  <p className="text-sm text-slate-400">{stat.label}</p>
                  <p className="mt-3 text-3xl font-bold">{stat.value}</p>
                  <p className="mt-2 text-xs text-slate-500">{stat.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="font-semibold">Campaign Activity</h3>
                <p className="mt-2 text-sm text-slate-500">
                  Campaign activity will appear here once campaigns are
                  created.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
                <h3 className="font-semibold">Recent Replies</h3>
                <p className="mt-2 text-sm text-slate-500">
                  AI-classified replies will appear here.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
