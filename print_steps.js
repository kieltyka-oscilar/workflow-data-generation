const fs = require('fs');
const data = JSON.parse(fs.readFileSync('rpnewsetup.json'));
const wf = data.workflows[0];
wf.execution_graph.steps.forEach((s, idx) => {
  console.log(`Step ID: ${idx}, Label: ${s.label}, Type: ${s.type}`);
  if (s.type === 'decision') {
      s.edges.forEach(e => {
          console.log(`  -> edge ${e.name} to ${e.next_step_id}`);
      });
      console.log(`  -> default to ${s.default_step_id}`);
  } else {
      console.log(`  -> default to ${s.default_step_id}`);
  }
});
