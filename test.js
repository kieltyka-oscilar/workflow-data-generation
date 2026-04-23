const condition = "a OR b";
const keyword = /\bOR\b/i;
let i = 1;
const remaining = condition.slice(i); // " OR b"
const m = remaining.match(keyword);
console.log("remaining:", remaining);
console.log("m.index:", m ? m.index : null);
