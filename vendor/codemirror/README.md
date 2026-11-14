# CodeMirror 6 local bundle (Cronoff)

`cm.js` is a prebuilt, minified IIFE (about 690 KB) that sets `window.CM`. It is committed, so there is no build step on deploy and it works offline.
`entry.src.js` is the source it was built from. To rebuild (only when changing languages or upgrading):

    npm i esbuild @codemirror/state @codemirror/view @codemirror/commands @codemirror/language @codemirror/legacy-modes \
      @codemirror/lang-python @codemirror/lang-javascript @codemirror/lang-cpp @codemirror/lang-sql @codemirror/lang-html @codemirror/lang-css @lezer/highlight
    npx esbuild entry.src.js --bundle --minify --format=iife --target=es2019 --legal-comments=none --outfile=cm.js

Built with: state 6.7.6, view 6.43.15, commands 6.11.1, language 6.13.1, legacy-modes 6.5.5. MIT license (see LICENSE).
