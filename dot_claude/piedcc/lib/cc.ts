// Shape of the JSON Claude Code pipes to a statusline command on stdin.
// https://code.claude.com/docs/en/statusline (Available data).

export type CCStatusInput = {
  session_id: string;
  session_name?: string;
  transcript_path: string;
  model: { id: string; display_name: string };
  workspace: {
    current_dir: string;
    project_dir: string;
    git_worktree?: string;
  };
  cost?: { total_cost_usd: number };
  context_window?: {
    total_input_tokens: number;
    total_output_tokens: number;
    context_window_size: number;
    used_percentage: number;
    remaining_percentage: number;
    current_usage?: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens: number;
      cache_read_input_tokens: number;
    } | null;
  };
  effort?: { level: "low" | "medium" | "high" | "xhigh" | "max" };
  rate_limits?: {
    five_hour?: { used_percentage: number; resets_at?: number };
    seven_day?: { used_percentage: number; resets_at?: number };
  };
};
