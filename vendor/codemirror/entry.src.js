import { EditorState, Compartment, Prec, StateEffect, StateField, RangeSetBuilder, Annotation } from "@codemirror/state";
import { EditorView, Decoration, GutterMarker, gutter, lineNumbers, lineNumberMarkers, highlightActiveLine, keymap, placeholder, drawSelection } from "@codemirror/view";
import { history, historyKeymap, defaultKeymap, undo, redo, insertTab, indentLess, insertNewline } from "@codemirror/commands";
import { StreamLanguage, syntaxHighlighting, bracketMatching, indentUnit, LanguageSupport } from "@codemirror/language";
import { tagHighlighter, tags } from "@lezer/highlight";
import { python } from "@codemirror/lang-python";
import { javascript } from "@codemirror/lang-javascript";
import { cpp } from "@codemirror/lang-cpp";
import { sql, SQLite } from "@codemirror/lang-sql";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import { lua } from "@codemirror/legacy-modes/mode/lua";
import { ruby } from "@codemirror/legacy-modes/mode/ruby";
import { scheme } from "@codemirror/legacy-modes/mode/scheme";
import { go } from "@codemirror/legacy-modes/mode/go";
import { rust } from "@codemirror/legacy-modes/mode/rust";
import { java, csharp, kotlin } from "@codemirror/legacy-modes/mode/clike";

window.CM = {
  version: "6",
  EditorState, Compartment, Prec, StateEffect, StateField, RangeSetBuilder, Annotation,
  EditorView, Decoration, GutterMarker, gutter, lineNumbers, lineNumberMarkers, highlightActiveLine, keymap, placeholder, drawSelection,
  history, historyKeymap, defaultKeymap, undo, redo, insertTab, indentLess, insertNewline,
  StreamLanguage, syntaxHighlighting, bracketMatching, indentUnit, LanguageSupport, tagHighlighter, tags,
  langs: {
    py: () => python(), js: () => javascript(), ts: () => javascript({ typescript: true }),
    cpp: () => cpp(), sql: () => sql({ dialect: SQLite }), html: () => html(), css: () => css(),
    lua: () => StreamLanguage.define(lua), rb: () => StreamLanguage.define(ruby), scm: () => StreamLanguage.define(scheme),
    go: () => StreamLanguage.define(go), rs: () => StreamLanguage.define(rust),
    java: () => StreamLanguage.define(java), cs: () => StreamLanguage.define(csharp), kt: () => StreamLanguage.define(kotlin),
  },
};
