export type BuildInfo = {
  version: string;
  gitSha: string;
  buildTime: string;
  analyzerVersion: string;
  gradingModel: string;
};

const UNKNOWN = "unknown";
const DEFAULT_ANALYZER_VERSION = "opencv-rules-v1.0.0";
const DEFAULT_GRADING_MODEL = "gpt-4.1-mini";

export function getLocalBuildInfo(): BuildInfo {
  return {
    version: process.env.APP_VERSION || UNKNOWN,
    gitSha: process.env.GIT_SHA || UNKNOWN,
    buildTime: process.env.BUILD_TIME || UNKNOWN,
    analyzerVersion: process.env.ANALYZER_VERSION || DEFAULT_ANALYZER_VERSION,
    gradingModel: process.env.OPENAI_GRADING_MODEL || DEFAULT_GRADING_MODEL
  };
}

export async function getAnalyzerVersion(): Promise<string> {
  const analyzerUrl = process.env.ANALYZER_URL;
  if (!analyzerUrl) return getLocalBuildInfo().analyzerVersion;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1500);

  try {
    const response = await fetch(`${analyzerUrl}/health`, {
      cache: "no-store",
      signal: controller.signal
    });

    if (!response.ok) return getLocalBuildInfo().analyzerVersion;

    const payload = (await response.json()) as { version?: unknown };
    return typeof payload.version === "string" && payload.version.trim()
      ? payload.version
      : getLocalBuildInfo().analyzerVersion;
  } catch {
    return getLocalBuildInfo().analyzerVersion;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getBuildInfo(): Promise<BuildInfo> {
  return {
    ...getLocalBuildInfo(),
    analyzerVersion: await getAnalyzerVersion()
  };
}
