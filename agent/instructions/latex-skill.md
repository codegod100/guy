## Math Formatting

Use this skill when the user asks to clean up, rewrite, convert, or format
mathematical text, especially when the input contains pseudo-display delimiters
like `[` and `]`, HoTT/type-theory notation, or expressions such as `n |-> n+1`.

### Pick the format for the target surface FIRST

LaTeX/KaTeX only renders on surfaces that run a math plugin (the web chat UI via
Streamdown + KaTeX). **Raft/Slock chat does NOT render LaTeX** — `$...$`,
`$$...$$`, and commands like `\mathsf{}` show up as literal characters there.

- **Web chat UI (KaTeX available):** use LaTeX math — `$...$` inline and
  `$$ ... $$` for display blocks.
- **Raft / Slock / plain chat (no KaTeX):** do NOT emit LaTeX. Use readable
  Unicode/plain-text math instead. No `$` delimiters, no backslash commands.

When unsure which surface you are writing to, prefer the Unicode/plain-text form
because it is readable everywhere.

### LaTeX form (KaTeX surfaces only)

- Replace bracket-only display math like:

```text
[
\mathsf{Cover} : S^1 \to \mathsf{Type}
]
```

with:

```markdown
$$
\mathsf{Cover} : S^1 \to \mathsf{Type}
$$
```

- For short inline expressions, use inline math: `$n \mapsto n+1$`.
- Prefer `\mathsf{}` for named type-theoretic constants when the surrounding text
  already uses that style, e.g. `\mathsf{transport}`, `\mathsf{Cover}`,
  `\mathsf{loop}`, `\mathsf{base}`, `\mathsf{Type}`.
- Use `\mathbb{Z}` for integers and `\mathbb{N}` for naturals.
- Use `:` for typing judgments and `\to` for function types.

### Unicode / plain-text form (Raft and other non-KaTeX surfaces)

Translate commands to plain symbols and drop all `$` delimiters:

| LaTeX | Plain text |
| --- | --- |
| `\to` | `->` |
| `\mapsto` | `\|->` |
| `\mathbb{Z}` | `Z` (or "the integers") |
| `\mathbb{N}` | `N` (or "the naturals") |
| `\simeq` | `~=` |
| `\mathsf{loop}^{-1}` | `loop^-1` |
| `S^1` | `S^1` |
| `x^{n}` | `x^n` |
| `\mathsf{Cover}` | `Cover` |

Keep named constants in plain words (`transport`, `Cover`, `loop`, `base`).

### Example

Input:

```text
Yes — in that example, (n \mapsto n+1) means exactly:

[
\mathsf{transport}^{\mathsf{Cover}}(\mathsf{loop}, n) = n + 1
]
```

LaTeX output (KaTeX surface):

```markdown
Yes — in that example, $n \mapsto n + 1$ means exactly:

$$
\mathsf{transport}^{\mathsf{Cover}}(\mathsf{loop}, n) = n + 1
$$
```

Plain-text output (Raft surface):

```text
Yes — in that example, n |-> n + 1 means exactly:

  transport^Cover(loop, n) = n + 1
```

### Mathematical caution

When the text discusses transport along paths, equivalences, covers, or winding
numbers, preserve reversibility details. For the standard winding-number cover of
the circle, use the integers Z rather than the naturals N unless the user
explicitly wants naturals.
