import { useEffect, useState } from "react";
import { api } from "../api";
import type { ProviderStatus, ProviderTestResult } from "../api";

const MODE_LABEL: Record<string, string> = {
  live: "Live",
  fallback: "Partial",
  mock: "Mock Only",
};

const MODE_CLASS: Record<string, string> = {
  live: "provider-mode--live",
  fallback: "provider-mode--fallback",
  mock: "provider-mode--mock",
};

function TestResult({ result }: { result?: ProviderTestResult }) {
  if (!result) return null;
  const age = timeSince(result.testedAt);
  return (
    <div className={`test-result ${result.ok ? "test-result--ok" : "test-result--fail"}`}>
      <span className="test-result__icon">{result.ok ? "+" : "x"}</span>
      <span className="test-result__message">{result.message}</span>
      <span className="test-result__time">{age}</span>
    </div>
  );
}

function timeSince(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

interface Props {
  onBack: () => void;
}

export function ProviderSettings({ onBack }: Props) {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testingClaude, setTestingClaude] = useState(false);
  const [testingOpenai, setTestingOpenai] = useState(false);
  const [testingEbay, setTestingEbay] = useState(false);

  useEffect(() => {
    api.getProviderStatus()
      .then(setStatus)
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleTestClaude() {
    setTestingClaude(true);
    try {
      const result = await api.testClaude();
      setStatus(prev => prev ? {
        ...prev,
        claude: { ...prev.claude, lastTest: result },
      } : prev);
    } catch { /* silent */ }
    finally { setTestingClaude(false); }
  }

  async function handleTestOpenAI() {
    setTestingOpenai(true);
    try {
      const result = await api.testOpenAI();
      setStatus(prev => prev ? {
        ...prev,
        openai: { ...prev.openai, lastTest: result },
      } : prev);
    } catch { /* silent */ }
    finally { setTestingOpenai(false); }
  }

  async function handleTestEbay() {
    setTestingEbay(true);
    try {
      const result = await api.testEbay();
      setStatus(prev => prev ? {
        ...prev,
        ebay: { ...prev.ebay, lastTest: result },
      } : prev);
    } catch { /* silent */ }
    finally { setTestingEbay(false); }
  }

  if (loading) {
    return (
      <div>
        <button className="back-btn" onClick={onBack}>← Back</button>
        <p className="loading">Loading provider status...</p>
      </div>
    );
  }

  if (!status) {
    return (
      <div>
        <button className="back-btn" onClick={onBack}>← Back</button>
        <p className="form-error">Could not load provider status.</p>
      </div>
    );
  }

  return (
    <div className="provider-settings">
      <button className="back-btn" onClick={onBack}>← Back</button>

      <h2 className="provider-settings__title">Provider Settings</h2>

      <div className="provider-overall">
        <span className="provider-overall__label">System Mode</span>
        <span className={`provider-mode ${MODE_CLASS[status.overallMode]}`}>
          {MODE_LABEL[status.overallMode]}
        </span>
        <p className="provider-overall__desc">
          {status.overallMode === "live" && "All providers configured — identification, pricing, and comparables use real data."}
          {status.overallMode === "fallback" && "Some providers configured — missing providers use mock estimates."}
          {status.overallMode === "mock" && "No providers configured — all data is estimated. Add API keys to server .env to enable live providers."}
        </p>
      </div>

      <div className="provider-cards">
        <div className={`provider-card ${status.claude.configured ? "provider-card--configured" : "provider-card--unconfigured"}`}>
          <div className="provider-card__header">
            <div className="provider-card__name-row">
              <span className="provider-card__name">Claude AI</span>
              <span className={`provider-card__status ${status.claude.configured ? "provider-card__status--on" : "provider-card__status--off"}`}>
                {status.claude.configured ? "Configured" : "Not configured"}
              </span>
            </div>
            <p className="provider-card__desc">Item identification (Vision) and pricing estimates</p>
          </div>

          <div className="provider-card__details">
            <div className="provider-card__field">
              <span className="provider-card__field-label">API Key</span>
              <code className="provider-card__field-value">
                {status.claude.maskedKey ?? "Not set"}
              </code>
            </div>
            <div className="provider-card__field">
              <span className="provider-card__field-label">Env Variable</span>
              <code className="provider-card__field-value">ANTHROPIC_API_KEY</code>
            </div>
          </div>

          <div className="provider-card__actions">
            <button
              className="btn-action-sm"
              disabled={!status.claude.configured || testingClaude}
              onClick={handleTestClaude}
            >
              {testingClaude ? "Testing..." : "Test Connection"}
            </button>
          </div>

          <TestResult result={status.claude.lastTest} />
        </div>

        <div className={`provider-card ${status.openai.configured ? "provider-card--configured" : "provider-card--unconfigured"}`}>
          <div className="provider-card__header">
            <div className="provider-card__name-row">
              <span className="provider-card__name">OpenAI</span>
              <span className={`provider-card__status ${status.openai.configured ? "provider-card__status--on" : "provider-card__status--off"}`}>
                {status.openai.configured ? "Configured" : "Not configured"}
              </span>
            </div>
            <p className="provider-card__desc">Item identification and pricing estimates (GPT-4o Vision)</p>
          </div>

          <div className="provider-card__details">
            <div className="provider-card__field">
              <span className="provider-card__field-label">API Key</span>
              <code className="provider-card__field-value">
                {status.openai.maskedKey ?? "Not set"}
              </code>
            </div>
            <div className="provider-card__field">
              <span className="provider-card__field-label">Env Variable</span>
              <code className="provider-card__field-value">OPENAI_API_KEY</code>
            </div>
          </div>

          <div className="provider-card__actions">
            <button
              className="btn-action-sm"
              disabled={!status.openai.configured || testingOpenai}
              onClick={handleTestOpenAI}
            >
              {testingOpenai ? "Testing..." : "Test Connection"}
            </button>
          </div>

          <TestResult result={status.openai.lastTest} />
        </div>

        <div className={`provider-card ${status.ebay.configured ? "provider-card--configured" : "provider-card--unconfigured"}`}>
          <div className="provider-card__header">
            <div className="provider-card__name-row">
              <span className="provider-card__name">eBay Browse API</span>
              <span className={`provider-card__status ${status.ebay.configured ? "provider-card__status--on" : "provider-card__status--off"}`}>
                {status.ebay.configured ? "Configured" : "Not configured"}
              </span>
            </div>
            <p className="provider-card__desc">Real-world comparable listings and market data</p>
          </div>

          <div className="provider-card__details">
            <div className="provider-card__field">
              <span className="provider-card__field-label">App ID</span>
              <code className="provider-card__field-value">
                {status.ebay.maskedAppId ?? "Not set"}
              </code>
            </div>
            <div className="provider-card__field">
              <span className="provider-card__field-label">Cert ID</span>
              <code className="provider-card__field-value">
                {status.ebay.hasCertId ? "Set" : "Not set"}
              </code>
            </div>
            <div className="provider-card__field">
              <span className="provider-card__field-label">Env Variables</span>
              <code className="provider-card__field-value">EBAY_APP_ID, EBAY_CERT_ID</code>
            </div>
          </div>

          <div className="provider-card__actions">
            <button
              className="btn-action-sm"
              disabled={!status.ebay.configured || testingEbay}
              onClick={handleTestEbay}
            >
              {testingEbay ? "Testing..." : "Test Connection"}
            </button>
          </div>

          <TestResult result={status.ebay.lastTest} />
        </div>
      </div>

      <div className="provider-help">
        <p className="provider-help__text">
          API keys are managed in the server <code>.env</code> file. See <code>.env.example</code> for configuration details. Restart the server after changing keys.
        </p>
      </div>
    </div>
  );
}
