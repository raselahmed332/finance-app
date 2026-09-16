function i(c,a,s){const o=n=>`"${String(n??"").replace(/"/g,'""')}"`,l=[a.map(o).join(","),...s.map(n=>n.map(o).join(","))].join(`
`),d=new Blob(["\uFEFF"+l],{type:"text/csv;charset=utf-8;"}),t=URL.createObjectURL(d),e=document.createElement("a");e.href=t,e.download=c,document.body.appendChild(e),e.click(),e.remove(),URL.revokeObjectURL(t)}export{i as d};
