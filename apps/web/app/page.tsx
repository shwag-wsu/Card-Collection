const analyzerUrl = process.env.ANALYZER_URL || "http://analyzer:8000";

export default function HomePage() {
  return (
    <main>
      <h1>Card Collection MVP</h1>
      <p>This is the initial scaffold for the self-hosted trading card collection app.</p>
      <ul>
        <li>Next.js + TypeScript web app</li>
        <li>FastAPI analyzer service</li>
        <li>PostgreSQL database</li>
        <li>Local filesystem image storage</li>
      </ul>
      <p>
        Analyzer service URL: <code>{analyzerUrl}</code>
      </p>
    </main>
  );
}
