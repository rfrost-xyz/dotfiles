-- omaterm-ansi — 16-colour terminal-follow colorscheme for headless boxes.
--
-- Headless containers (omaterm) have no omarchy `theme.lua`, so nvim would
-- otherwise fall back to a fixed truecolor scheme (tokyonight-moon) that never
-- matches the omarchy theme the connecting terminal is painting. This scheme
-- turns truecolor OFF and paints every group from the terminal's themed 16
-- ANSI slots (ctermfg 0-15). omarchy re-themes those slots live on
-- `omarchy theme set`, so nvim tracks the desktop theme with zero sync.
-- Lower fidelity than the laptop's truecolor scheme — by design: this is the
-- "no-sync, live" corner of the trilemma.

vim.o.termguicolors = false
vim.cmd("highlight clear")
if vim.fn.exists("syntax_on") == 1 then
  vim.cmd("syntax reset")
end
vim.g.colors_name = "omaterm-ansi"

-- ANSI slot roles. Indices resolve to the terminal's themed palette, so the
-- *meaning* stays stable while the actual colour follows the omarchy theme.
local c = {
  gray = 8, -- base03 · comments, UI chrome
  red = 1, -- errors, deletions, builtins
  green = 2, -- strings, additions
  yellow = 3, -- constants, types, numbers
  blue = 4, -- identifiers, directories, links titles
  magenta = 5, -- keywords, statements
  cyan = 6, -- preproc, specials, fields
  white = 7, -- bright fg accents
  brblue = 12, -- functions (distinct from plain identifiers)
  bryellow = 11, -- cursor line number / active accents
}

local function hl(group, spec)
  vim.api.nvim_set_hl(0, group, spec)
end

-- editor UI -----------------------------------------------------------------
hl("Normal", {}) -- terminal default fg on (transparent) terminal bg
hl("NormalNC", {})
hl("NormalFloat", {})
hl("FloatBorder", { ctermfg = c.gray })
hl("FloatTitle", { ctermfg = c.blue, bold = true })
hl("LineNr", { ctermfg = c.gray })
hl("CursorLineNr", { ctermfg = c.bryellow, bold = true })
hl("CursorLine", { ctermbg = "NONE" })
hl("CursorColumn", { ctermbg = "NONE" })
hl("SignColumn", { ctermbg = "NONE" })
hl("ColorColumn", { ctermbg = c.gray })
hl("Visual", { ctermbg = c.gray })
hl("Search", { ctermfg = 0, ctermbg = c.yellow })
hl("IncSearch", { ctermfg = 0, ctermbg = c.bryellow })
hl("CurSearch", { ctermfg = 0, ctermbg = c.bryellow })
hl("MatchParen", { ctermfg = c.bryellow, bold = true })
hl("Pmenu", { ctermbg = c.gray })
hl("PmenuSel", { ctermfg = 0, ctermbg = c.blue })
hl("PmenuSbar", { ctermbg = c.gray })
hl("PmenuThumb", { ctermbg = c.white })
hl("StatusLine", { ctermbg = c.gray })
hl("StatusLineNC", { ctermfg = c.gray, ctermbg = "NONE" })
hl("TabLine", { ctermfg = c.gray, ctermbg = "NONE" })
hl("TabLineSel", { ctermfg = c.blue, bold = true })
hl("TabLineFill", { ctermbg = "NONE" })
hl("WinSeparator", { ctermfg = c.gray })
hl("VertSplit", { ctermfg = c.gray })
hl("Folded", { ctermfg = c.gray, ctermbg = "NONE" })
hl("FoldColumn", { ctermfg = c.gray })
hl("NonText", { ctermfg = c.gray })
hl("Whitespace", { ctermfg = c.gray })
hl("EndOfBuffer", { ctermfg = c.gray })
hl("Directory", { ctermfg = c.blue })
hl("Title", { ctermfg = c.blue, bold = true })
hl("Conceal", { ctermfg = c.gray })
hl("SpecialKey", { ctermfg = c.gray })
hl("WildMenu", { ctermfg = 0, ctermbg = c.blue })
hl("QuickFixLine", { ctermbg = c.gray })
hl("Cursor", { cterm = { reverse = true } })

-- messages / prompts --------------------------------------------------------
hl("ErrorMsg", { ctermfg = c.red })
hl("WarningMsg", { ctermfg = c.yellow })
hl("MoreMsg", { ctermfg = c.green })
hl("ModeMsg", { bold = true })
hl("Question", { ctermfg = c.green })

-- syntax (treesitter @captures inherit via nvim's default group links) ------
hl("Comment", { ctermfg = c.gray, italic = true })
hl("Constant", { ctermfg = c.yellow })
hl("String", { ctermfg = c.green })
hl("Character", { ctermfg = c.green })
hl("Number", { ctermfg = c.yellow })
hl("Boolean", { ctermfg = c.yellow })
hl("Float", { ctermfg = c.yellow })
hl("Identifier", { ctermfg = c.blue })
hl("Function", { ctermfg = c.brblue })
hl("Statement", { ctermfg = c.magenta })
hl("Conditional", { ctermfg = c.magenta })
hl("Repeat", { ctermfg = c.magenta })
hl("Label", { ctermfg = c.magenta })
hl("Operator", {}) -- terminal default fg
hl("Keyword", { ctermfg = c.magenta })
hl("Exception", { ctermfg = c.magenta })
hl("PreProc", { ctermfg = c.cyan })
hl("Include", { ctermfg = c.cyan })
hl("Define", { ctermfg = c.cyan })
hl("Macro", { ctermfg = c.cyan })
hl("PreCondit", { ctermfg = c.cyan })
hl("Type", { ctermfg = c.yellow })
hl("StorageClass", { ctermfg = c.yellow })
hl("Structure", { ctermfg = c.yellow })
hl("Typedef", { ctermfg = c.yellow })
hl("Special", { ctermfg = c.cyan })
hl("SpecialChar", { ctermfg = c.cyan })
hl("Tag", { ctermfg = c.blue })
hl("Delimiter", {}) -- terminal default fg
hl("SpecialComment", { ctermfg = c.gray, bold = true })
hl("Debug", { ctermfg = c.red })
hl("Underlined", { ctermfg = c.blue, underline = true })
hl("Error", { ctermfg = 15, ctermbg = c.red })
hl("Todo", { ctermfg = 0, ctermbg = c.yellow, bold = true })

-- diff / vcs ----------------------------------------------------------------
hl("DiffAdd", { ctermfg = c.green })
hl("DiffChange", { ctermfg = c.yellow })
hl("DiffDelete", { ctermfg = c.red })
hl("DiffText", { ctermfg = c.bryellow, bold = true })
hl("Added", { ctermfg = c.green })
hl("Changed", { ctermfg = c.yellow })
hl("Removed", { ctermfg = c.red })
hl("GitSignsAdd", { ctermfg = c.green })
hl("GitSignsChange", { ctermfg = c.yellow })
hl("GitSignsDelete", { ctermfg = c.red })

-- diagnostics ---------------------------------------------------------------
hl("DiagnosticError", { ctermfg = c.red })
hl("DiagnosticWarn", { ctermfg = c.yellow })
hl("DiagnosticInfo", { ctermfg = c.blue })
hl("DiagnosticHint", { ctermfg = c.cyan })
hl("DiagnosticOk", { ctermfg = c.green })
hl("DiagnosticUnderlineError", { ctermfg = c.red, undercurl = true })
hl("DiagnosticUnderlineWarn", { ctermfg = c.yellow, undercurl = true })
hl("DiagnosticUnderlineInfo", { ctermfg = c.blue, undercurl = true })
hl("DiagnosticUnderlineHint", { ctermfg = c.cyan, undercurl = true })

-- treesitter captures not covered by the default links ----------------------
hl("@variable", {}) -- terminal default fg
hl("@variable.builtin", { ctermfg = c.red })
hl("@variable.parameter", {})
hl("@property", { ctermfg = c.cyan })
hl("@field", { ctermfg = c.cyan })
hl("@constructor", { ctermfg = c.yellow })
hl("@module", { ctermfg = c.yellow })
hl("@punctuation", {})
hl("@punctuation.bracket", {})
hl("@punctuation.delimiter", {})
hl("@tag", { ctermfg = c.magenta })
hl("@tag.attribute", { ctermfg = c.yellow })
hl("@tag.delimiter", { ctermfg = c.gray })
hl("@markup.heading", { ctermfg = c.blue, bold = true })
hl("@markup.link", { ctermfg = c.cyan, underline = true })
hl("@markup.raw", { ctermfg = c.green })
hl("@markup.list", { ctermfg = c.magenta })
hl("@markup.strong", { bold = true })
hl("@markup.italic", { italic = true })
hl("@lsp.type.class", { link = "Type" })
hl("@lsp.type.function", { link = "Function" })
hl("@lsp.type.variable", { link = "@variable" })
