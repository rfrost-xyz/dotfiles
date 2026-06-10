local function trim(s) return (vim.trim or function(x) return (x or ""):gsub("^%s+", ""):gsub("%s+$", "") end)(s) end

local function notify_ok(msg) vim.notify("chezmoi: " .. msg) end
local function notify_err(msg) vim.notify("chezmoi failed: " .. msg, vim.log.levels.ERROR) end
local function notify_warn(msg) vim.notify("chezmoi: " .. msg, vim.log.levels.WARN) end

local function run(cmd_args, ok_msg)
  local out = vim.fn.system(cmd_args)
  if vim.v.shell_error == 0 then notify_ok(ok_msg) else notify_err(out) end
end

local function term_tab(cmd) vim.cmd("tabnew | terminal " .. cmd) end

local function source_dir()
  local dir = trim(vim.fn.system({ "chezmoi", "source-path" }))
  if vim.v.shell_error ~= 0 then return nil end
  return dir
end

local function managed_map()
  local targets = vim.fn.systemlist({ "chezmoi", "managed", "-i", "files", "--path-style", "absolute" })
  if vim.v.shell_error ~= 0 then return {} end
  local sources = vim.fn.systemlist({ "chezmoi", "managed", "-i", "files", "--path-style", "source-absolute" })
  if vim.v.shell_error ~= 0 then sources = {} end
  local map = {}
  for i, t in ipairs(targets) do
    local s = sources[i] or ""
    map[t] = s:match("%.tmpl$") and "template" or "managed"
  end
  return map
end

local function drift_map()
  local lines = vim.fn.systemlist({ "chezmoi", "status" })
  if vim.v.shell_error ~= 0 then return {} end
  local home = vim.fn.expand("$HOME")
  local map = {}
  for _, line in ipairs(lines) do
    if #line >= 4 then
      local code = line:sub(1, 2)
      local path = line:sub(4)
      if not path:match("^/") then path = home .. "/" .. path end
      map[path] = code
    end
  end
  return map
end

local function state_glyph(state)
  if state == "template" then return "◆ ", "ChezmoiTemplate" end
  if state == "managed"  then return "● ", "ChezmoiManaged"  end
  return "○ ", "ChezmoiUnmanaged"
end

local function format_drift(code)
  if not code or code == "  " then return nil end
  return (code:gsub(" ", "·"))
end

local function build_managed_dirs(managed)
  local set = {}
  for path, _ in pairs(managed) do
    local dir = vim.fn.fnamemodify(path, ":h")
    while dir and dir ~= "" and dir ~= "/" and not set[dir] do
      set[dir] = true
      local parent = vim.fn.fnamemodify(dir, ":h")
      if parent == dir then break end
      dir = parent
    end
  end
  return set
end

local function make_format(managed, drift, managed_dirs)
  return function(item, picker)
    local Snacks = require("snacks")
    local ret = Snacks.picker.format.file(item, picker)
    if item.dir then
      if managed_dirs[item.file] then
        table.insert(ret, 1, { "● ", "ChezmoiManaged" })
      end
      return ret
    end
    local state = managed[item.file] or "unmanaged"
    local glyph, hl = state_glyph(state)
    table.insert(ret, 1, { glyph, hl })
    local d = format_drift(drift[item.file])
    if d then
      table.insert(ret, { " " .. d, "ChezmoiDrift" })
    end
    return ret
  end
end

local function make_preview(managed)
  return function(ctx)
    local Snacks = require("snacks")
    local item = ctx.item
    if not item or item.dir then return Snacks.picker.preview.file(ctx) end
    if not managed[item.file] then return Snacks.picker.preview.file(ctx) end
    local out = vim.fn.systemlist({ "chezmoi", "diff", item.file })
    if vim.v.shell_error ~= 0 or #out == 0 then
      return Snacks.picker.preview.file(ctx)
    end
    item.diff = table.concat(out, "\n")
    return Snacks.picker.preview.diff(ctx)
  end
end

-- Resolve current buffer's chezmoi state. Returns: state, file_path, source_path.
-- state: "unmanaged" | "managed" | "template" | nil (no file in buffer)
local function current_state()
  local file = vim.fn.expand("%:p")
  if file == "" then return nil end
  local source = trim(vim.fn.system({ "chezmoi", "source-path", file }))
  if vim.v.shell_error ~= 0 then return "unmanaged", file, nil end
  if source:match("%.tmpl$") then return "template", file, source end
  return "managed", file, source
end

-- per-file commands ----------------------------------------------------------

local function cmd_add()
  local state, file = current_state()
  if not state then notify_warn("no file in buffer"); return end
  vim.cmd("write")
  if state == "unmanaged" then
    run({ "chezmoi", "add", file }, "added " .. file)
  elseif state == "template" then
    notify_warn("file is a template — use <leader>czm to merge")
  else
    run({ "chezmoi", "re-add", file }, "re-added " .. file)
  end
end

local function cmd_apply()
  local state, file = current_state()
  if not state then notify_warn("no file in buffer"); return end
  if state == "unmanaged" then notify_warn("file not managed"); return end
  run({ "chezmoi", "apply", file }, "applied " .. file)
  vim.cmd("checktime")
end

local function cmd_diff()
  local state, file = current_state()
  if not state then notify_warn("no file in buffer"); return end
  if state == "unmanaged" then notify_warn("file not managed"); return end
  term_tab("chezmoi diff " .. vim.fn.shellescape(file))
end

local function cmd_merge()
  local state, file = current_state()
  if state ~= "template" then notify_warn("file is not a template"); return end
  vim.cmd("write")
  term_tab("chezmoi merge " .. vim.fn.shellescape(file))
end

local function cmd_forget()
  local state, file = current_state()
  if state == "unmanaged" or not state then notify_warn("file not managed"); return end
  vim.ui.input({ prompt = "Forget " .. file .. "? (y/N) " }, function(ans)
    if ans and ans:lower() == "y" then
      run({ "chezmoi", "forget", "--force", file }, "forgot " .. file)
    end
  end)
end

local function cmd_destroy()
  local state, file = current_state()
  if state == "unmanaged" or not state then notify_warn("file not managed"); return end
  vim.ui.input({ prompt = "DESTROY " .. file .. "? type 'destroy' to confirm: " }, function(ans)
    if ans == "destroy" then
      run({ "chezmoi", "destroy", "--force", file }, "destroyed " .. file)
    end
  end)
end

-- global commands ------------------------------------------------------------

local function cmd_status() term_tab("chezmoi status") end
local function cmd_update() term_tab("chezmoi update --verbose") end

local function cmd_browse()
  local ok, snacks = pcall(require, "snacks")
  if not ok or not snacks.picker then
    vim.notify("snacks.picker not available", vim.log.levels.ERROR)
    return
  end
  local managed = managed_map()
  local drift = drift_map()
  local mdirs = build_managed_dirs(managed)
  snacks.picker.explorer({
    cwd = vim.fn.getcwd(),
    tree = true,
    hidden = true,
    layout = "default",
    title = "chezmoi · tree",
    format = make_format(managed, drift, mdirs),
    preview = make_preview(managed),
  })
end

local function cmd_lazygit()
  local dir = source_dir()
  if not dir then notify_err("source-path failed"); return end
  local ok, snacks = pcall(require, "snacks")
  if ok and snacks.lazygit then
    snacks.lazygit({ cwd = dir })
  else
    term_tab("lazygit -p " .. vim.fn.shellescape(dir))
  end
end

-- autocmd --------------------------------------------------------------------

local function on_save(args)
  local file = args.file
  if file == "" then return end
  local src_dir = source_dir()
  if src_dir and file:sub(1, #src_dir) == src_dir then return end
  vim.system({ "chezmoi", "source-path", file }, { text = true }, function(obj)
    if obj.code ~= 0 then return end
    local source = trim(obj.stdout or "")
    if source:match("%.tmpl$") then
      vim.schedule(function()
        vim.notify("chezmoi: template — use <leader>czm to merge", vim.log.levels.INFO)
      end)
      return
    end
    vim.system({ "chezmoi", "re-add", file }, { text = true }, function(obj2)
      if obj2.code ~= 0 then
        vim.schedule(function()
          vim.notify("chezmoi re-add failed: " .. (obj2.stderr or ""), vim.log.levels.ERROR)
        end)
      end
    end)
  end)
end

local function is_state(...)
  local want = { ... }
  return function()
    local s = current_state()
    for _, v in ipairs(want) do if s == v then return true end end
    return false
  end
end

return {
  {
    "folke/snacks.nvim",
    keys = {
      { "<leader>cza", cmd_add,     desc = "Add / Re-add" },
      { "<leader>czA", cmd_apply,   desc = "Apply (source → live)" },
      { "<leader>czd", cmd_diff,    desc = "Diff" },
      { "<leader>czm", cmd_merge,   desc = "Merge template" },
      { "<leader>czf", cmd_forget,  desc = "Forget" },
      { "<leader>czX", cmd_destroy, desc = "Destroy" },
      { "<leader>czs", cmd_status,  desc = "Status" },
      { "<leader>czu", cmd_update,  desc = "Update repo" },
      { "<leader>czb", cmd_browse,  desc = "Browse" },
      { "<leader>czg", cmd_lazygit, desc = "Lazygit" },
    },
    init = function()
      vim.api.nvim_set_hl(0, "ChezmoiManaged",   { fg = "#a6e3a1", default = true })
      vim.api.nvim_set_hl(0, "ChezmoiTemplate",  { fg = "#f9e2af", default = true })
      vim.api.nvim_set_hl(0, "ChezmoiUnmanaged", { link = "Comment", default = true })
      vim.api.nvim_set_hl(0, "ChezmoiDrift",     { fg = "#f38ba8", bold = true, default = true })

      vim.api.nvim_create_autocmd("BufWritePost", {
        group = vim.api.nvim_create_augroup("chezmoi_auto_readd", { clear = true }),
        callback = on_save,
      })
    end,
  },
  {
    "folke/which-key.nvim",
    optional = true,
    opts = {
      spec = {
        { "<leader>cz", group = "chezmoi" },
        -- per-file actions: filtered by current buffer's state
        { "<leader>cza", cond = is_state("unmanaged") },
        { "<leader>cza", desc = "Re-add",        cond = is_state("managed") },
        { "<leader>cza", desc = "(template)",    cond = is_state("template") },
        { "<leader>czA", cond = is_state("managed", "template") },
        { "<leader>czd", cond = is_state("managed", "template") },
        { "<leader>czm", cond = is_state("template") },
        { "<leader>czf", cond = is_state("managed", "template") },
        { "<leader>czX", cond = is_state("managed", "template") },
      },
    },
  },
}
