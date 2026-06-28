# eve Agent App

This project uses the eve framework. Before writing code, always read the relevant guide in `node_modules/eve/docs/`.

To work on this project locally, you also need `devenv` installed and available in your environment.

The frontend (Next.js) has been removed; the agent is reachable directly via the eve dev server.

```
npm run dev       # in one terminal — starts `eve dev` on http://127.0.0.1:3000
npm run runner    # in another — polls Raft and drives eve over HTTP
```


jj is used for version control instead of git. dont use pager it breaks our agent
