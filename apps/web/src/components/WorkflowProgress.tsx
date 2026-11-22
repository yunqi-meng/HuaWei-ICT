import Icon from "./Icon";
type ProgressState = "upcoming" | "current" | "done";
export default function WorkflowProgress({steps,label}:{steps:{label:string;state:ProgressState}[];label:string}) {
  return <ol className="workflow-progress" aria-label={label}>{steps.map((step,index)=><li key={step.label} className={`is-${step.state}`} aria-current={step.state==="current"?"step":undefined}><span>{step.state==="done"?<Icon name="check" size={13}/>:index+1}</span>{step.label}</li>)}</ol>;
}
