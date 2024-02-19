---@type MappingsTable
local M = {}

M.general = {
  n = {
    [";"] = { ":", "enter command mode", opts = { nowait = true } },
    --["<leader>a"] = { "<cmd>AerialToggle!<cr>", "Aerial toggle", opts = { nowait = true } },
  },
}

return M
