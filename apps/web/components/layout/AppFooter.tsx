import { getLocalBuildInfo } from "../../lib/build-info";

function formatBuildTime(buildTime: string) {
  if (!buildTime || buildTime === "unknown") return "unknown";

  const date = new Date(buildTime);
  if (Number.isNaN(date.getTime())) return buildTime;

  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
    timeZoneName: "short"
  }).format(date);
}

export function AppFooter() {
  const buildInfo = getLocalBuildInfo();
  const meta = [
    { label: "Version", value: buildInfo.version },
    { label: "Git", value: buildInfo.gitSha },
    { label: "Built", value: formatBuildTime(buildInfo.buildTime) }
  ];

  return (
    <footer className="mt-10 border-t border-slate-200/80 py-6 text-sm text-slate-500">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-semibold text-slate-700">Card Collection AI</p>
          <p className="mt-1 text-xs text-slate-400">Build metadata for this running application.</p>
        </div>

        <dl className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3 sm:text-right">
          {meta.map((item) => (
            <div key={item.label} className="min-w-0">
              <dt className="font-medium uppercase tracking-wide text-slate-400">{item.label}</dt>
              <dd className="mt-0.5 truncate font-mono text-slate-600" title={item.value}>
                {item.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </footer>
  );
}
