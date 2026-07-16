// Surfaces opencode run state in tmux via ~/.local/bin/harness-status.
export const HarnessStatusPlugin = async ({ $ }) => {
  const bin = `${process.env.HOME}/.local/bin/harness-status`
  const report = async (state) => {
    try {
      await $`${bin} opencode ${state}`.quiet()
    } catch {}
  }
  await report("idle")
  return {
    "chat.message": async () => {
      await report("working")
    },
    "permission.ask": async () => {
      await report("waiting")
    },
    event: async ({ event }) => {
      if (event.type === "session.idle") await report("done")
      if (event.type === "session.error") await report("waiting")
    },
  }
}
