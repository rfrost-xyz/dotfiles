" general
set nocompatible
filetype plugin on

" mappings
source ~/.config/nvim/plugconfig/plugins.vim
source ~/.config/nvim/plugconfig/coc.vim
source ~/.config/nvim/plugconfig/markdown-preview.vim
source ~/.config/nvim/plugconfig/vim-airline.vim
source ~/.config/nvim/plugconfig/vim-markdown.vim
source ~/.config/nvim/plugconfig/vimwiki.vim

" colour
syntax on
colorscheme dracula
if has("termguicolors") " check for 24-bit color support
	set termguicolors
endif

" syntax highlight
autocmd BufRead,BufNewFile *.md set filetype=markdown

" layout
set number " line numbers
set scrolloff=3 " top/bottom scroll padding

" text wrap
set wrap
set linebreak

" folding
let g:markdown_folding = 1
au FileType markdown setlocal foldlevel=99

" spacing
set textwidth=79
set noexpandtab
set tabstop=4
set shiftwidth=4

" spelling
set spelllang=en_gb "spelling
autocmd BufRead,BufNewFile *.md setlocal spell " automatic spell check within markdown

" netrw
" hide top banner (I to toggle)
let g:netrw_banner = 0
" open new file to right
let g:netrw_altv=1
" default directory list style
let g:netrw_liststyle= 3

" terminal
set t_Co=256
set background=dark

" mappings
let mapleader = ","
" map <space> <leader>
nmap <leader>bb : buffers<CR>
nmap <leader>1 : bp<CR>
nmap <leader>2 : bn<CR>
nmap <leader>3 : bd<CR>
nmap <leader>[ : set wrap<CR>
nmap <leader>] : set nowrap<CR>
nmap <leader>mp : MarkdownPreviewToggle<CR>
nmap <leader>ss : set spell!<CR>
map <leader>w : %s/\s\+$//e <CR>
map <leader>gs : Git status<CR>
map <leader>ga : Git add
map <leader>gaa : Git add --all
map <leader>gac : Git commit -am
map <leader>gf : Git fetch<CR>
map <leader>gu : Git pull<CR>
map <leader>gp : Git push<CR>
map <leader>go : Git checkout<CR>
map <leader>gd : Git diff
map <leader>gl : Git log<CR>
map <leader>t : VimwikiToggleListItem<CR>

" python config windows
" let g:python_host_prog  = 'C:\Program Files\Python39\python.exe'
" let g:python3_host_prog = 'C:\Program Files\Python39\python.exe'
