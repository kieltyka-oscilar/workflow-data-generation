const fs = require('fs');

const lines = fs.readFileSync('../rptest5.jsonl', 'utf8').trim().split('\n');

for (let i = 0; i < lines.length; i++) {
  const data = JSON.parse(lines[i]);
  let equifax = data.equifaxDecision || '';
  let phone = data.phone_email_risk || 0;
  let device = data.deviceRiskScore || 0;
  let behavior = data.behaviorRiskScore || 0;
  let sum = device + behavior;
  let emailage = data.emailage || {};
  let sentilink = data.sentilink_score || 0;
  let telesign = data.telesign_verified || false;

  console.log(`Rec ${i}: eq=${equifax}, sum=${sum}, emailage=${emailage.risk_rating}, sentilink=${sentilink}, tele=${telesign}`);
}
