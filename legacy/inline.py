#!/usr/bin/env python3
"""Inline assets/css/styles.css and assets/js/{data,app}.js into each HTML file.
Idempotent: subsequent runs replace previously inlined blocks via marker comments."""

import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))

def read(p):
    with open(os.path.join(ROOT, p), 'r', encoding='utf-8') as f:
        return f.read()

CSS = read('assets/css/styles.css')
DATA = read('assets/js/data.js')
APP = read('assets/js/app.js')

S_CSS, E_CSS = '<!--nemi:css:start-->', '<!--nemi:css:end-->'
S_JS, E_JS = '<!--nemi:js:start-->', '<!--nemi:js:end-->'

css_block = f'{S_CSS}\n<style>\n{CSS}\n</style>\n{E_CSS}'
js_block = f'{S_JS}\n<script>\n{DATA}\n\n{APP}\n</script>\n{E_JS}'

html_files = [f for f in os.listdir(ROOT) if f.endswith('.html')]

for hf in sorted(html_files):
    p = os.path.join(ROOT, hf)
    s = read(hf)

    # --- CSS ---
    if S_CSS in s and E_CSS in s:
        # Replace between markers
        s = re.sub(re.escape(S_CSS) + r'.*?' + re.escape(E_CSS), css_block, s, flags=re.DOTALL)
    else:
        # First-time inline: try replacing external <link>; otherwise the first <style>...</style> block
        s_new, n = re.subn(r'<link rel="stylesheet" href="assets/css/styles\.css"\s*/?>', css_block, s)
        if n == 0:
            s_new, n = re.subn(r'<style>.*?</style>', css_block, s, count=1, flags=re.DOTALL)
        s = s_new

    # --- JS ---
    if S_JS in s and E_JS in s:
        s = re.sub(re.escape(S_JS) + r'.*?' + re.escape(E_JS), js_block, s, flags=re.DOTALL)
    else:
        s_new, n = re.subn(r'<script src="assets/js/data\.js"></script>\s*<script src="assets/js/app\.js"></script>', js_block, s)
        if n == 0:
            # Heuristic: replace the <script>...</script> block that contains "window.NEMI_DATA"
            pat = re.compile(r'<script>\s*\n*//\s*=+\s*Нэми Mock Data.*?</script>', re.DOTALL)
            s_new, n = pat.subn(js_block, s, count=1)
        s = s_new

    with open(p, 'w', encoding='utf-8') as f:
        f.write(s)
    print(f'inlined → {hf}')

print('done')
