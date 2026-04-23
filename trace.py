import json

with open('rpsetup2.json') as f:
    wf = json.load(f)['workflow']['workflows'][1]['execution_graph']['steps']

with open('rptest5.jsonl') as f:
    lines = f.readlines()

def eval_cond(record, cond):
    # Mocking the boolean logic for known conditions
    pt = cond.get('plaintext', '')
    if 'deviceRiskScore + behaviorRiskScore < 30' in pt:
        return record.get('deviceRiskScore',0) + record.get('behaviorRiskScore',0) < 30
    elif '> 30.0 AND' in pt and '< 60.0' in pt:
        s = record.get('deviceRiskScore',0) + record.get('behaviorRiskScore',0)
        return s > 30 and s < 60
    elif 'deviceRiskScore + behaviorRiskScore > 60' in pt:
        return record.get('deviceRiskScore',0) + record.get('behaviorRiskScore',0) > 60
    elif 'phone_email_risk < 25' in pt:
        return record.get('phone_email_risk',0) < 25
    elif 'phone_email_risk > 25 AND phone_email_risk < 60' in pt:
        p = record.get('phone_email_risk',0)
        return p > 25 and p < 60
    elif 'phone_email_risk > 60' in pt:
        return record.get('phone_email_risk',0) > 60
    elif 'sentilink_score > 600' in pt:
        return record.get('sentilink_score',0) > 600
    elif 'sentilink_score < 600 AND sentilink_score > 300' in pt:
        s = record.get('sentilink_score',0)
        return s < 600 and s > 300
    elif 'sentilink_score < 300' in pt:
        return record.get('sentilink_score',0) < 300
    elif "emailage.risk_rating = 'high'" in pt:
        return record.get('emailage',{}).get('risk_rating') == 'high'
    elif "emailage.review_status = 'pass'" in pt:
        return record.get('emailage',{}).get('review_status') == 'pass'
    elif "telesign_verified = TRUE" in pt:
        return record.get('telesign_verified') == True
    elif "telesign_verified = FALSE" in pt:
        return record.get('telesign_verified') == False
    elif "account_holder_string != latest_kyc_account_holder" in pt:
        return False
    elif "address_string != latest_kyc_address" in pt:
        return False
    elif "payment_account_string != latest_kyc_payment_account" in pt:
        return False
    elif "rerun_flag = TRUE AND payment_update = FALSE" in pt:
        return False
    elif "rerun_flag = TRUE AND payment_update = TRUE" in pt:
        return False
    elif "rerun_flag = FALSE AND payment_update = TRUE" in pt:
        return True # Since we are trying to approve
    elif "equifaxDecision" in pt and "deny" in pt:
        return record.get('equifaxDecision', '').lower() == 'deny'
    elif "equifaxDecision" in pt and "review" in pt:
        return record.get('equifaxDecision', '').lower() == 'review'
    return False

for i, line in enumerate(lines):
    record = json.loads(line)
    curr = 19
    path = [curr]
    while True:
        step = wf[curr]
        if step.get('type') == 'action':
            print(f"Record {i} Terminated at {curr} ({step.get('label')}) path={path}")
            break
        matched = False
        for edge in step.get('edges', []):
            if eval_cond(record, edge.get('condition', {})):
                matched = True
                nxt = edge.get('next_step_id')
                if nxt is not None:
                    curr = nxt
                else:
                    curr = step.get('default_step_id')
                break
        if not matched:
            nxt = step.get('default_step_id')
            if nxt is not None:
                curr = nxt
            else:
                print(f"Record {i} Dead End at {curr}")
                break
        if curr is None:
            print(f"Record {i} None at {curr}")
            break
        path.append(curr)

