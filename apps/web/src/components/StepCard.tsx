/** 排障操作卡：步骤名称、为什么做、操作说明、预期现象、结果选项、风险与回退、来源。 */
import type { SessionView, StepOption } from "../types";
import Icon from "./Icon";

interface Props {
  step: NonNullable<SessionView["current_step"]>;
  busy: boolean;
  onOption: (key: string) => void;
  onHandoff: () => void;
}

const RISK_LABEL: Record<string, { text: string; cls: string }> = {
  observe: { text: "仅观察，无修改", cls: "badge-ok" },
  low: { text: "低风险操作，可撤销", cls: "badge-warn" },
  reversible: { text: "可逆变更，附回退说明", cls: "badge-warn" },
  high: { text: "高风险，需人工处理", cls: "badge-danger" },
};

export default function StepCard({ step, busy, onOption, onHandoff }: Props) {
  const risk = RISK_LABEL[step.risk_level] ?? RISK_LABEL.observe;
  const isModel = step.evidence_status === "model_generated";
  return (
    <div className="card step-card" aria-busy={busy}>
      <div className="step-head">
        <h3>{step.title}</h3>
        <span className={`badge ${risk.cls}`}>{risk.text}</span>
        {isModel && <span className="badge badge-warn">AI 生成·待核对</span>}
      </div>
      {isModel && (
        <p className="muted small">
          本步骤由云端模型依据已发布知识生成，未经人工审核；与实际情况不符时可随时转人工。
        </p>
      )}
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
      <div className="step-feedback-label">选择你观察到的情况</div>
      <div className="step-feedback-grid" role="group" aria-label="本步骤反馈">
        {step.options.map((o: StepOption) => (
          <button key={o.key} className="btn step-option" disabled={busy}
                  onClick={() => onOption(o.key)}>
            <span>{o.label}</span><Icon name="arrow" size={16}/>
          </button>
        ))}
      </div>
      <div className="option-row step-handoff">
        {step.can_handoff && (
          <button className="btn btn-ghost" disabled={busy} onClick={onHandoff}>
            转人工义诊
          </button>
        )}
      </div>
      {step.source_refs.length > 0 && (
        <p className="muted small">
          资料来源：
          {step.source_refs.map((s, i) => (
            <span key={i}>
              {i > 0 ? "；" : ""}
              {s.url ? (
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.title}
                </a>
              ) : (
                s.title
              )}
            </span>
          ))}
          {step.flow_version ? `（${step.flow_version}）` : ""}
        </p>
      )}
    </div>
  );
}
