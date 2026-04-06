# Workflow data generation

Generate realistic, rule-constrained synthetic test data from your Oscilar workflow JSON and a real sample dataset — no backend required, runs entirely in your browser.

---

## Quick Start

### Prerequisites

- **Node.js 18+** — [download here](https://nodejs.org/en/download)

### Mac / Linux

```bash
# 1. Get the project (git clone or unzip)
git clone https://github.com/kieltyka-oscilar/workflow-data-generation

# 2. Enter the project folder
cd workflow-data-generation

# 3. Make the script executable (first time only)
chmod +x install.sh

# 4. Run it!
./install.sh
```

### Windows

1. Unzip (or clone) the project folder
2. Double-click **`install.bat`** — or open a Command Prompt in the folder and run:

   ```bat
   install.bat
   ```

The app installs its dependencies and opens automatically at **`http://localhost:5173`**.

To stop the app, press **Ctrl+C** in the terminal window.

---

## How It Works

The app walks you through **7 steps** to produce a `.jsonl` file filled with synthetic records engineered to hit specific decision outcomes in your workflow rules.

```
Upload Assets → Confirm Rules → Confirm Schema → Configure Data → Distribution → Preview → Generate
```

---

## Step-by-Step Guide

### Step 1 — Upload Assets

You need two files to get started:

| File | Format | Description |
|------|--------|-------------|
| **Workflow Definition** | `.json` | Your Oscilar workflow exported as JSON. Must contain a `workflows` or `actions` key. |
| **Sample Test Set** | `.jsonl` | Real data records, one JSON object per line. Used to infer the data schema and as a fuzzing baseline. |

**How to upload:** Click either upload box or drag-and-drop the file directly onto it. Once both files are loaded, click **Analyze and Proceed**.

> **Tip:** Fields prefixed with `osc_` or `onboarding_events_` are automatically stripped from the schema to keep the output clean.

#### Resuming a previous session

Instead of uploading files fresh, click **Import Previous Project** to load a `.json` project file you saved earlier. This restores all settings exactly where you left off, including rules, schema, distribution config, and which step you were on.

---

### Step 2 — Confirm Rules

The app parses your workflow's decision steps and extracts every rule condition it finds. Rules are grouped by **Ruleset** (the name of the decision step they belong to).

**What you see:**
- **Ruleset name** — the decision node name (e.g., *Approve Account*, *Manual Review*)
- **Rule conditions** — the boolean logic plaintext (e.g., `credit_score >= 700 AND income > 50000`)

#### External Lists

If any rule uses an `IN` operator referencing a variable (e.g., `userID IN blocklist`), the app will detect those variables and prompt you to supply their values. You can enter them as:
- Comma-separated values: `val1, val2, val3`
- A JSON array: `["val1", "val2", "val3"]`

The app will try to auto-populate these lists using unique values found in your sample data.

Click **Looks Good, Proceed** when done.

---

### Step 3 — Confirm Schema

The app infers the data schema from the first record of your sample file. Every top-level and nested field is listed with its detected type and an example value from your data.

**What you can do on this screen:**

| Action | How |
|--------|-----|
| **Change a field's type** | Use the dropdown next to the field (`String`, `Number`, `Boolean`, `Array`, `Object`) |
| **Mark a field as nullable** | Check the **Nullable** checkbox — the generator will occasionally produce `null` for that field |
| **Remove a field** | Click the trash icon — that field will be excluded from all generated records |

Nested objects are shown indented under their parent field.

Click **Confirm Schema** to proceed.

---

### Step 4 — Configure Data Generation

This step lets you fine-tune how each field is generated, overriding the default random behavior.

**For number fields:**
- Set a **Min Value** and/or **Max Value** to constrain the random range

**For any field:**
- Provide a **Set of allowed values** as a JSON array (e.g., `["active", "inactive", "pending"]`). When set, the generator will only pick values from this list.

#### AI Prompt Button

Next to the allowed-values input for each field is an **AI Prompt** button (✦ wand icon). Clicking it opens **Glean Chat** in a new tab with a pre-written prompt asking for 15 realistic example values for that field, based on its name, type, and example value. Copy the returned JSON array and paste it into the allowed values input.

Click **Continue to Distribution** when ready.

---

### Step 5 — Configure Test Distribution

Set how many records to generate and what proportion should target each rule outcome.

**Controls:**
- **Total records** — the total number of records to generate (1 – 100,000)
- **Per-outcome sliders** — drag or type a percentage (0–100%) for each outcome
- **Randomize** — click to auto-assign percentages that sum exactly to 100%

**Outcomes available:**
- One entry per unique **Ruleset** name detected from your workflow rules
- **Default (No Match)** — records that satisfy *no* rule (all conditions fail)

The derived row count for each outcome is shown live (e.g., `250 rows`). The percentage total indicator turns red if you go over 100%.

> **Note:** Percentages do not need to sum to 100%. Any unallocated percentage simply won't be generated.

Click **Preview Generated Data** to continue.

---

### Step 6 — Preview

Before committing to the full batch, the app generates one sample record per outcome and displays each one as formatted JSON.

**What to look for:**
- Each card shows the target outcome and the generated record
- A **schema validation badge** indicates whether the record matches the expected schema:
  - ✅ **Valid** — all fields present and correctly typed
  - ⚠ **Warnings** — unexpected extra fields or type mismatches
  - ✕ **Errors** — required fields are missing

Expand the validation panel on any card to see the full field-level breakdown.

Click **Re-roll Samples** to regenerate fresh examples. Once you're satisfied, click **Confirm and Run Batch**.

---

### Step 7 — Generate

The engine runs the full batch generation asynchronously, processing records in chunks to keep the UI responsive.

**How the engine works:**
- For **pass conditions** (e.g., Approve): it extracts the rule's constraints and generates values that satisfy them — numbers land just inside the boundary (e.g., exactly at the threshold or 1–5 units beyond it).
- For **fail / Default (No Match)** records: it inverts all rule constraints so every rule evaluates to false — numbers land just *outside* the boundary (e.g., 1–5 units below the minimum or above the maximum), making them useful edge-case tests.
- For **string and enum fields** with a configured allowed-values list, the generator picks randomly from that list.

Progress is shown per-outcome. When complete:

- **Download JSONL** — saves a `.jsonl` file (one JSON record per line), ready to use as a test set
- **Start Over** — resets the entire app back to Step 1

---

## Saving & Resuming Your Project

At any point after uploading your files, a **Save Setup** button appears in the top-right corner of the app. Clicking it downloads a `.json` project file containing your entire configuration:

- Workflow and parsed rules
- Schema (including any type overrides and nullable flags)
- Field configurations (min/max, allowed values)
- Distribution percentages and total record count
- Which step you're currently on

To resume later, go to Step 1 and click **Import Previous Project**, then select your saved `.json` file.

---

## File Format Reference

### Workflow JSON

Must be a valid Oscilar workflow export. The file must contain a top-level `workflows` array (each entry has an `execution_graph` with `steps`). Decision steps have `type: "decision"` and an `edges` array where each edge has a `condition.plaintext` string.

### Sample Test Set (JSONL)

One JSON object per line. All records should share the same schema. The first record is used to infer the field list and types. Example:

```jsonl
{"user_id": "u_001", "credit_score": 720, "income": 85000, "status": "active"}
{"user_id": "u_002", "credit_score": 610, "income": 42000, "status": "inactive"}
```

### Generated Output (JSONL)

The downloaded file is in the same JSONL format — one synthetic record per line — making it easy to feed directly into any system that accepts your original test set format.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| *"Invalid format: File is not a valid Oscilar workflow"* | Ensure the workflow JSON has a `workflows` or `actions` top-level key |
| *"Failed to parse JSONL"* | Check that each line in your sample file is valid JSON with no trailing commas |
| External list field shows empty | Manually enter values in the text area on Step 2, or ensure the field exists in your sample data |
| Generated data doesn't satisfy rules | Check that the relevant field is included in the schema and has the correct type set in Step 3 |
| App won't start | Ensure Node.js 18+ is installed: `node --version` |
