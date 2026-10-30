/** 与后端 /api/v1 契约对应的前端类型（packages/api-contracts 的 MVP 形态）。 */

export interface Guide {
  id: string;
  title: string;
  category: string;
  version_no: number;
  os_family: string;
  symptom_tags: string[];
  risk_level: string;
  estimated_minutes: number;
  difficulty: string;
  source_url: string;
  reviewed_at: string | null;
  content?: string;
}

export interface StepOption { key: string; label: string }

export interface SourceRef { title: string; url: string; reviewed_at?: string }

export interface SessionView {
  device_id: string | null;
  facts: Record<string,unknown>;
  id: string;
  state: string;
  end_reason: string | null;
  symptom_text: string;
  symptom_category: string;
  risk_flags: string[];
  failed_count: number;
  handoff_reason: string;
  tried_steps: { node: string; title?: string; result?: string; label?: string; at?: string }[];
  version: number;
  current_step: {
    session_id: string;
    state: string;
    flow_version?: string;
    flow_version_id?: string;
    step_id: string;
    node_type: string;
    risk_level: string;
    title: string;
    why: string;
    instruction: string;
    expected_observation: string;
    rollback: string | null;
    stop_conditions: string[];
    options: StepOption[];
    evidence_status: string;
    source_refs: SourceRef[];
    can_handoff: boolean;
  } | null;
  messages: { role: string; content: string }[];
  created_at: string | null;
}

export interface ServiceEvent {
  id: string;
  title: string;
  service_date: string;
  service_scope: string;
  bring_note: string;
  location: { name: string; building_room: string; address_note: string };
}

export interface ServiceSlot {
  id: string;
  start_at: string;
  end_at: string;
  capacity: number;
  remaining: number;
}

export interface Appointment {
  id: string;
  ticket_id: string;
  status: string;
  slot: {
    id: string; start_at: string; end_at: string; event_title: string; service_date: string;
    location: ServiceEvent["location"] | null; bring_note: string;
  };
  hold_expires_at: string | null;
  contact_name: string;
  contact_phone: string;
  checkin_code?: string;
}

export interface HandoffDraft {
  session_id: string;
  device_desc: string;
  user_description: string;
  category: string;
  confirmed_facts: string[];
  tried_steps: { step: string; result: string }[];
  unconfirmed_items: string[];
  hypotheses: string[];
  risk_notes: string[];
  handoff_reason: string;
}

export interface Ticket {
  can_work?: boolean;
  review?: {rating:number;comment:string}|null;
  proposals?: {id:string;reason:string;service_date:string;start_at:string;end_at:string;event_title:string}[];
  can_manage: boolean;
  id: string;
  title: string;
  category: string;
  priority: string;
  status: string;
  outcome: string | null;
  outcome_confirmed_by_user: string;
  assignee_id: string | null;
  session_id: string | null;
  risk_flags: string[];
  version: number;
  created_at: string | null;
  active_appointment?: Appointment;
  handoff?: Omit<HandoffDraft, "session_id">;
  events?: { type: string; from: string; to: string; detail: Record<string, unknown>; at: string }[];
  repair_records?: {
    id: string; check_items: string; cause: string; action_taken: string;
    verification: string; conclusion: string; advice: string;
    is_result_submission: string; at: string;
  }[];
}

export const TICKET_STATUS_LABEL: Record<string, string> = {
  OPEN: "待受理", ACCEPTED: "已受理", IN_SERVICE: "处理中",
  WAITING_USER: "待用户处理", WAITING_EXTERNAL: "待外部条件",
  AWAITING_VERIFICATION: "待验收", CLOSED: "已结单", CANCELLED: "已取消",
};

export const OUTCOME_LABEL: Record<string, string> = {
  fixed: "已修复", partially_fixed: "部分修复", unresolved: "未解决",
  referred: "已转介专业机构", declined: "用户放弃",
};
