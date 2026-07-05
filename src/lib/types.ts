export type Persona = {
  id: string;
  handle: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  bio: string;
  karma: number;
  status: "active" | "retired";
  created_at: string;
};

export type Room = {
  id: string;
  slug: string;
  name: string;
  description: string;
  constitution: string;
  avatar_url: string | null;
  agent_config: { quorum?: number; vote_window_minutes?: number };
  created_by_persona_id: string | null;
  created_by_root?: string;
  created_at: string;
};

export type Post = {
  id: string;
  room_id: string;
  author_persona_id: string;
  title: string;
  body: string;
  image_url: string | null;
  crossposted_from_post_id: string | null;
  score: number;
  comment_count: number;
  status: string;
  created_at: string;
};

export type Comment = {
  id: string;
  post_id: string;
  room_id: string;
  parent_comment_id: string | null;
  author_persona_id: string;
  body: string;
  score: number;
  collapsed: boolean;
  collapse_reason: string | null;
  status: string;
  created_at: string;
};

export type AgentAction = {
  id: string;
  room_id: string;
  post_id: string | null;
  action_type: "nudge" | "collapse" | "flag";
  trigger_param:
    | "heat_nudge"
    | "heat_collapse"
    | "heat_flag"
    | "drift_nudge"
    | "dogpile_count";
  target_type: "post" | "comment" | "thread";
  target_id: string | null;
  reason: string;
  metrics: Record<string, unknown>;
  status: "pending" | "upheld" | "overridden";
  review_status: "open" | "reviewed" | "dismissed" | null;
  votes_uphold: number;
  votes_override: number;
  created_at: string;
  resolved_at: string | null;
};

export type PlatformBanRow = {
  root_user_id: string;
  email: string;
  reason: string;
  created_at: string;
};

export type RoomBanRow = {
  room_id: string;
  room_slug: string;
  root_user_id: string;
  root_email: string;
  banned_persona_id: string;
  banned_handle: string | null;
  reason: string;
  created_at: string;
};

export type AdminRow = {
  root_user_id: string;
  email: string;
  granted_by: string | null;
  created_at: string;
};

export type AdminStats = {
  roots: number;
  personas_active: number;
  personas_retired: number;
  rooms: number;
  posts: number;
  comments: number;
  open_flags: number;
  open_reports: number;
  pending_votes: number;
  room_bans: number;
  platform_bans: number;
};

export type Calibration = {
  room_id: string;
  heat_nudge: number;
  heat_collapse: number;
  heat_flag: number;
  drift_nudge: number;
  dogpile_count: number;
  learning_rate: number;
  history: Array<{
    at: string;
    action_id: string;
    param: string;
    outcome: "upheld" | "overridden";
    new_value: number;
  }>;
  updated_at: string;
};

export type Report = {
  id: string;
  room_id: string;
  room_slug: string;
  reporter_handle: string;
  reporter_persona_id: string;
  target_type: "post" | "comment";
  target_id: string;
  category: "harassment" | "spam" | "off_topic" | "illegal" | "other";
  reason: string;
  status: "open" | "reviewed" | "dismissed";
  created_at: string;
};

export type Notification = {
  id: string;
  root_user_id: string;
  type: "reply" | "collapse" | "agent_flag" | "ban" | "report_resolved";
  actor_persona_id: string | null;
  room_id: string | null;
  post_id: string | null;
  comment_id: string | null;
  payload: Record<string, unknown>;
  read: boolean;
  created_at: string;
};

export type RoomWithMeta = Room & { removed_at: string | null };
