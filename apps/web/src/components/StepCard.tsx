/** 排障操作卡：步骤名称、为什么做、操作说明、预期现象、结果选项、风险与回退、来源。 */
import type { SessionView, StepOption } from "../types";

interface Props {
  step: NonNullable<SessionView["current_step"]>;
  busy: boolean;
  onOption: (key: string) => void;
  onHandoff: () => void;
}

const RISK_LABEL: Record<string, { text: string; cls: string }> = {
  observe: { text: "仅观察，无修改", cls: "badge-ok" },
  reversible: { text: "可逆变更，附回退说明", cls: "badge-warn" },
  high: { text: "高风险，需人工处理", cls: "badge-danger" },
};

export default function StepCard({ step, busy, onOption, onHandoff }: Props) {
  const risk = RISK_LABEL[step.risk_level] ?? RISK_LABEL.observe;
  return (
    <div className="card step-card">
      <div className="step-head">
        <h3>{step.title}</h3>
        <span className={`badge ${risk.cls}`}>{risk.text}</span>
      </div>
      {step.why && <p className="muted">为什么做：{step.why}</p>}
      <div className="instruction">
        <strong>操作：</strong>
        <p>{step.instruction}</p>
      </div>
      {step.expected_observation && (
        <p><strong>预期现象：</strong>{step.expected_observation}</p>
      )}
      {step.rollback && <p className="muted">回退方法：{step.rollback}</p>}
      {step.stop_conditions.length > 0 && (
        <div className="alert-warn">
          <strong>出现以下情况请立即停止：</strong>
          <ul>{step.stop_conditions.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
      <div className="option-row">
        {step.options.map((o: StepOption) => (
          <button key={o.key} className="btn btn-primary" disabled={busy}
                  onClick={() => onOption(o.key)}>
            {o.label}
          </button>
        ))}
        {step.can_handoff && (
          <button className="btn btn-ghost" disabled={busy} onClick={onHandoff}>
            转人工义诊
          </button>
        )}
      </div>
      {step.source_refs.length > 0 && (
        <p className="muted small">
          资料来源：{step.source_refs.map((s) => s.title).join("；")}（流程版本 {step.flow_version}）
        </p>
      )}
    </div>
  );
}
