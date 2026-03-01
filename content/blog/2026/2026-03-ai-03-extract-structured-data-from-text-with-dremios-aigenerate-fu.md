---
title: "Extract Structured Data from Text with Dremio's AI_GENERATE Function"
date: "2026-03-01"
description: "Unstructured text is the most underused data in most organizations. Customer emails sit in inboxes. Contract notes live in text fields. Meeting summaries exi..."
author: "Alex Merced"
category: "AI Features"
bannerImage: "./images/AI_FEATURE_BLOGS/03/banner.png"
tags:
  - dremio
  - AI
  - SQL
  - data lakehouse
  - machine learning
---

Unstructured text is the most underused data in most organizations. Customer emails sit in inboxes. Contract notes live in text fields. Meeting summaries exist as free-text columns in CRM systems. The information is there, but it's locked inside prose that SQL can't filter, join, or aggregate.

Dremio's `AI_GENERATE` function breaks that lock. It sends unstructured text to an LLM and returns structured rows with typed columns. You define the output schema directly in SQL, and the LLM extracts the fields you specify. An email becomes a row with `sender`, `subject`, `priority`, and `action_items` columns. A contract note becomes a row with `party_name`, `contract_value`, `start_date`, and `terms`.

This tutorial builds a complete document processing pipeline in a fresh Dremio Cloud account. You'll create sample email and contract data, build a medallion architecture, and use `AI_GENERATE` to extract structured fields from free text. A separate section covers using `AI_GENERATE` with `LIST_FILES` to process unstructured files (PDFs, text files) stored in object storage.

## What You'll Build

By the end of this tutorial, you'll have:
- A dataset with 50+ raw emails and 25+ contract notes containing free-text descriptions
- Bronze views that standardize raw data
- Silver views that join emails with contract information
- Gold views that use `AI_GENERATE` with `WITH SCHEMA` to extract structured fields from text
- Materialized Iceberg tables that persist extracted data for downstream analytics
- An understanding of how to combine `AI_GENERATE` with `LIST_FILES` for file-based extraction

## Prerequisites

- **Dremio Cloud account** — [sign up free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=ai-generate-dremio-cloud&utm_content=alexmerced) with $400 in compute credits
- **AI enabled** — go to Admin → Project Settings → Preferences → AI section and enable AI features
- **Model Provider configured** — Dremio provides a hosted LLM by default, or connect your own (OpenAI, Anthropic, Google Gemini, AWS Bedrock, Azure OpenAI)

> **Note:** Tables in the built-in Open Catalog use `folder.subfolder.table_name` without a catalog prefix. External sources use `source_name.schema.table_name`.

## Understanding AI_GENERATE

`AI_GENERATE` is the most powerful of Dremio's AI SQL functions because it returns structured data from unstructured input. The function signature:

```sql
AI_GENERATE(
  [model_name VARCHAR,]
  prompt VARCHAR,
  target_data VARCHAR
  [WITH SCHEMA (field_name DATA_TYPE, ...)]
) → ROW | VARCHAR
```

**Parameters:**
- **model_name** (optional) — specify a model like `'openai.gpt-4o'`. Format is `modelProvider.modelName`.
- **prompt** — the extraction instruction telling the LLM what fields to find in the target data.
- **target_data** — the unstructured text column to process. This is usually a column from your table containing emails, notes, descriptions, or document content.
- **WITH SCHEMA** (optional but recommended) — defines the output structure as a ROW type with named, typed columns. Without it, `AI_GENERATE` returns a `VARCHAR` (plain text). With it, you get a `ROW` that you can expand using dot notation.

The `WITH SCHEMA` clause is what makes `AI_GENERATE` different from `AI_COMPLETE`. Instead of getting free-form text back, you get a typed row where each field is a column you defined, ready for filtering, joining, and aggregating.

### ROW Type Output

When you use `WITH SCHEMA`, the result is a `ROW` type. Access individual fields with dot notation:

```sql
SELECT
  result.sender,
  result.priority,
  result.action_items
FROM (
  SELECT AI_GENERATE(
    'Extract key information from this email',
    email_body
    WITH SCHEMA (sender VARCHAR, priority VARCHAR, action_items VARCHAR)
  ) AS result
  FROM emails
);
```

## Step 1: Create Your Folder Structure

Open the **SQL Runner**:

```sql
CREATE FOLDER IF NOT EXISTS aigenerateexp;
CREATE FOLDER IF NOT EXISTS aigenerateexp.document_data;
CREATE FOLDER IF NOT EXISTS aigenerateexp.bronze;
CREATE FOLDER IF NOT EXISTS aigenerateexp.silver;
CREATE FOLDER IF NOT EXISTS aigenerateexp.gold;
```

## Step 2: Seed Your Sample Data

### Raw Emails Table

This table simulates emails stored in a CRM system. Each email has a free-text body that contains multiple pieces of information: who sent it, what they're asking about, how urgent it is, and what action is needed. Extracting these fields manually would require a human to read each email. `AI_GENERATE` automates this.

```sql
CREATE TABLE aigenerateexp.document_data.raw_emails (
  email_id INT,
  received_date DATE,
  email_body VARCHAR
);

INSERT INTO aigenerateexp.document_data.raw_emails VALUES
(1, '2025-09-01', 'Hi team, this is Sarah Chen from Acme Corp. We need to urgently discuss the renewal of our enterprise license. Our current contract expires on October 15th and we want to add 200 additional seats. Can someone from your licensing team contact me by end of week? My direct line is 555-0142. Thanks, Sarah'),
(2, '2025-09-02', 'To whom it may concern, I am writing to report a critical production outage affecting our CloudSync deployment. All file synchronization stopped at 3:47 AM EST this morning. Over 500 users are impacted. We need immediate escalation to your Level 3 support team. This is a P1 issue per our SLA terms. Regards, James Rodriguez, VP of IT, Global Industries'),
(3, '2025-09-03', 'Hello, my name is Emily Watson and I am the procurement manager at TechStart Inc. We are evaluating DataVault Enterprise for our compliance requirements. Could you send me pricing information for a 3-year commitment with 150 users? Also interested in the SOC 2 audit documentation. Our budget review is scheduled for next month so no rush. Best, Emily'),
(4, '2025-09-05', 'URGENT: Our QuickReport installation has been down for 6 hours. Dashboard presentations to the board of directors are in 2 hours. We need the reporting engine restored immediately. Client: MegaCorp Financial. Contact: David Kim, CFO. Phone: 555-0198. This is affecting our quarterly earnings presentation.'),
(5, '2025-09-06', 'Hi there, I wanted to share some positive feedback. Your DevPipeline product has reduced our deployment time from 45 minutes to under 3 minutes. Our engineering team of 80 developers is very happy with the migration. We are considering expanding to our European offices next quarter. Great product! - Michael Brown, CTO, CloudNine Software'),
(6, '2025-09-08', 'Dear Support, we recently purchased MailForge for our marketing team but are having trouble with the SMTP relay configuration. Emails are being flagged as spam by Gmail and Outlook recipients. Our deliverability rate dropped from 98% to 62% after switching to MailForge. This is not urgent but needs resolution by end of month before our holiday campaign launches. Sincerely, Lisa Park, Marketing Director, RetailPlus'),
(7, '2025-09-10', 'To the sales team: We are a healthcare organization looking for a HIPAA-compliant backup solution. We evaluated CloudBackup but have concerns about the BAA terms in section 4.2. Can your legal team review our proposed amendments? We handle PHI for approximately 50000 patients. Timeline: need decision by November 1st. Contact: Dr. Anna Kowalski, Chief Medical Information Officer, Metro Health System'),
(8, '2025-09-11', 'I am writing to formally request cancellation of our HelpDesk360 subscription effective immediately. The product has not met our expectations. Response routing is inaccurate, the knowledge base search returns irrelevant results, and we have experienced 3 unplanned outages in the past month. Please process our refund for the remaining 8 months on our annual contract. Robert Taylor, Operations Director, ServiceFirst Ltd'),
(9, '2025-09-12', 'Quick question: does FormBuilder support WCAG 2.1 AA compliance for government forms? We are a state agency and this is a hard requirement for procurement. If yes, can you point me to the VPAT documentation? Thanks, Maria Garcia, Accessibility Coordinator, State of California Department of Technology'),
(10, '2025-09-14', 'Hi, our team has been using TeamBoard for 6 months and we love it. However we really need a way to export Gantt charts to PDF while preserving the formatting. The current export flattens all the dependency lines and makes the chart unreadable. Is this on your roadmap? Our PMO presents these charts to clients weekly. Tom Williams, PMO Lead, ConsultCo'),
(11, '2025-09-15', 'INCIDENT REPORT: At approximately 14:22 UTC our SecureSign production environment began experiencing signature verification failures. Approximately 340 pending documents across 12 customer accounts are affected. Root cause appears to be an expired intermediate SSL certificate in your signing chain. We need immediate remediation. Kevin Thompson, Security Engineer, LegalTech Partners'),
(12, '2025-09-17', 'Dear team, we operate DataStream to process 2TB of Kafka events daily. Starting last week we noticed exactly-once processing guarantees are failing intermittently. Approximately 0.3% of events are being duplicated in our downstream Postgres sink. This is causing financial reconciliation errors in our billing system. Medium priority but needs attention within 2 weeks. Jennifer Lee, Senior Data Engineer, FinServ Analytics'),
(13, '2025-09-18', 'I would like to schedule a product demo of AdOptimizer for our digital marketing agency. We manage ad spend for 45 clients across Google Ads Facebook and LinkedIn totaling approximately 2.5M monthly. Currently using a competitor but unhappy with the attribution modeling accuracy. When is your team available next week? Chris Martinez, Founder, DigitalEdge Agency'),
(14, '2025-09-20', 'Hi, we just completed our evaluation of ContractManager and would like to proceed with a purchase for 75 seats. We need the Salesforce integration enabled from day one. Our legal team processes roughly 200 contracts per month and we are currently tracking everything in spreadsheets. What is the implementation timeline? Rachel Adams, General Counsel, NovaTech Industries'),
(15, '2025-09-22', 'Attention: We detected unauthorized API access attempts against our LogInsight deployment between 2AM and 4AM EST today. The requests originated from IP addresses in a known threat intelligence database. While our firewall blocked the attempts, we want to understand if LogInsight has additional rate limiting or IP blocking capabilities we should enable. Mark Allen, CISO, DataShield Corp'),
(16, '2025-09-24', 'To billing department: Our organization PayFlow account 8847291 shows a currency conversion fee of 2.8% on GBP transactions. Our contract specifies a 1.5% rate for all EUR and GBP conversions. Please correct this billing discrepancy retroactively for September transactions totaling approximately 45000 GBP. Amanda Clark, Treasury Manager, EuroCommerce BV'),
(17, '2025-09-25', 'Hello, we have been running ChatAssist for our e-commerce customer support and the intent classification accuracy is excellent at around 94%. However we need to add support for Portuguese and Thai languages. Our customer base expanded to Brazil and Thailand this quarter. Is the multi-language add-on available for our current plan tier? Steven Moore, VP Customer Experience, GlobalShop'),
(18, '2025-09-27', 'I am the HR director at a 2000-employee manufacturing company. We need SchedulePro to handle complex shift patterns including rotating shifts split shifts and on-call schedules. Our current system cannot handle the overtime calculations required by state-specific labor laws in California New York and Texas. Can SchedulePro handle multi-state labor law compliance? Catherine Hall, HR Director, PrecisionMfg Inc'),
(19, '2025-09-28', 'Feature request: DesignHub needs better support for design tokens and component variables. When we update a color in our design system it should propagate to all linked components across all projects automatically. Currently we have to manually update 200+ components which defeats the purpose of a design system. Otherwise great product. Brian Harris, Design Systems Lead, PixelPerfect Studio'),
(20, '2025-09-30', 'Dear sales, I am reaching out on behalf of a consortium of 12 regional banks looking for a unified API management solution. We collectively process 4.2M API requests daily and need a solution that supports PSD2 compliance including strong customer authentication and secure communication. Can we arrange a meeting with your banking vertical team? Daniel Wilson, Technology Director, Regional Banking Alliance'),
(21, '2025-10-01', 'Hi, quick update on our InventoryTrack implementation. The barcode scanning module is working perfectly in our main warehouse but the multi-warehouse sync is showing a 15-minute delay between facilities. For perishable goods this delay causes stock discrepancies. Can we reduce the sync interval to real-time? Sophia Nguyen, Warehouse Operations Manager, FreshFoods Distribution'),
(22, '2025-10-03', 'To the product team at CloudSync: I have been a loyal customer for 3 years and want to share feedback. The recent UI redesign is excellent but the new settings menu is confusing. I cannot find the bandwidth throttling option which I use daily. Please make frequently used settings more accessible. Otherwise love the product and have recommended it to 5 colleagues. Laura Jackson, IT Consultant'),
(23, '2025-10-05', 'CRITICAL: Our DataVault encryption at rest failed an internal penetration test. The AES-256 implementation is using ECB mode instead of CBC or GCM for blocks larger than 16 bytes. This is a known vulnerability pattern. We need confirmation that this will be patched before our next compliance audit on November 15th. Michelle Lopez, Information Security Analyst, SecureBank NA'),
(24, '2025-10-06', 'Hello, I am a professor at MIT and we use QuickReport for our research data visualization. We are interested in an academic licensing program. Our department has 35 researchers and 120 graduate students who would benefit from the tool. Is there an education discount available? Dr. Jessica Young, Department of Data Science, MIT'),
(25, '2025-10-08', 'Support ticket follow-up: Our MailForge DKIM configuration issue ticket 4421 was marked resolved but we are still failing DMARC checks from Yahoo and AOL. The DKIM record appears correctly in DNS but the selector value does not match what MailForge sends in the email headers. Need this escalated back to engineering. Andrew White, Email Administrator, NewsMedia Group');
```

### Contract Notes Table

This table simulates free-text contract summaries written by account managers. Each note contains key contract details buried in natural language that `AI_GENERATE` will extract into structured columns.

```sql
CREATE TABLE aigenerateexp.document_data.contract_notes (
  note_id INT,
  account_manager VARCHAR,
  note_date DATE,
  note_text VARCHAR
);

INSERT INTO aigenerateexp.document_data.contract_notes VALUES
(1, 'Patricia Moore', '2025-09-01', 'Closed deal with Acme Corp for CloudSync Pro enterprise license. 500 seats at $22/seat/month for 3-year term. Total contract value $396,000. Includes premium support and 99.99% SLA. Renewal auto-triggers 90 days before expiration. Key contact: Sarah Chen, VP Engineering.'),
(2, 'Marcus Johnson', '2025-09-04', 'MegaCorp Financial signed for QuickReport Premium. 200 users, 2-year commitment at $42/user/month. TCV $201,600. Custom integration with their Bloomberg terminal data feed required. Implementation starts Oct 1st. Executive sponsor: David Kim, CFO.'),
(3, 'Patricia Moore', '2025-09-08', 'Renewal discussion with Global Industries for DataVault Enterprise. Current contract of 350 seats expires Dec 31. They want to expand to 600 seats and add the healthcare compliance module. Proposed pricing: $75/seat/month for 600 seats, 3-year term. TCV $1,620,000. Pending legal review of updated BAA.'),
(4, 'Sandra Lee', '2025-09-12', 'New customer TechStart Inc closed for DataVault Enterprise. 150 seats, 3-year term at $82/seat/month. TCV $443,880. SOC 2 documentation provided. Implementation timeline: 6 weeks starting Oct 15. Procurement contact: Emily Watson.'),
(5, 'Marcus Johnson', '2025-09-15', 'DigitalEdge Agency signed AdOptimizer Enterprise with custom attribution modeling. 10 managed accounts, $1,499/month flat rate, 1-year term with option to renew. TCV $17,988. Agency plans to expand to 45 accounts in Q2 2026. Founder Chris Martinez is very enthusiastic about the attribution improvements.'),
(6, 'Sandra Lee', '2025-09-18', 'NovaTech Industries purchased ContractManager Professional. 75 seats at $62/seat/month, 2-year term. TCV $111,600. Salesforce integration required for day-one launch. Processing 200+ contracts monthly currently using spreadsheets. General Counsel Rachel Adams leading internal rollout.'),
(7, 'Patricia Moore', '2025-09-20', 'Lost deal: ServiceFirst Ltd cancelling HelpDesk360 subscription. 8 months remaining on annual contract at $54/seat for 100 seats. Refund request of $43,200 pending finance approval. Customer cited routing accuracy issues, knowledge base relevance problems, and 3 outages. Risk of negative public review.'),
(8, '  Marcus Johnson', '2025-09-22', 'Expansion deal with CloudNine Software for DevPipeline. Adding 80 European developer seats to existing 80 US seats. European deployment at $72/seat/month, 2-year aligned with US contract end. Additional TCV $138,240. CTO Michael Brown driving the expansion after successful US rollout.'),
(9, 'Sandra Lee', '2025-09-25', 'State of California DPT evaluating FormBuilder for government forms. WCAG 2.1 AA compliance confirmed. Potential 500-seat deployment at government rate of $15/seat/month, 5-year term. TCV $450,000. Requires VPAT documentation submission to procurement. Long sales cycle expected, 6-9 months.'),
(10, 'Patricia Moore', '2025-09-28', 'EuroCommerce BV billing dispute on PayFlow. Customer contract guarantees 1.5% FX rate on EUR/GBP but system charged 2.8% for September. Estimated overcharge: approximately $900 on 45K GBP volume. Finance investigating root cause. Treasury Manager Amanda Clark expects retroactive correction.'),
(11, 'Marcus Johnson', '2025-10-01', 'Regional Banking Alliance consortium deal for APIGateway Pro. 12 banks, centralized deployment, 4.2M daily API calls. PSD2 compliance required. Proposed tiered pricing based on volume: $15,000/month for the consortium. 3-year term. TCV $540,000. Technology Director Daniel Wilson coordinating across all 12 institutions.'),
(12, 'Sandra Lee', '2025-10-03', 'FreshFoods Distribution requesting InventoryTrack real-time sync upgrade. Current standard sync has 15-min delay between 4 warehouses causing perishable goods discrepancies. Upgrade to real-time tier: additional $20/warehouse/month. Annual incremental revenue: $960. Operations Manager Sophia Nguyen is the champion.'),
(13, 'Patricia Moore', '2025-10-05', 'GlobalShop expansion for ChatAssist multi-language support. Adding Portuguese and Thai to existing English and Spanish deployment. Current contract: 300 seats at $68/seat/month. Multi-language add-on: additional $12/seat/month. Added TCV for remaining 18 months: $64,800. VP Customer Experience Steven Moore confirmed budget approval.'),
(14, 'Marcus Johnson', '2025-10-06', 'PrecisionMfg Inc evaluating SchedulePro for 2000 employees across 3 US states. Complex requirements: rotating shifts, split shifts, on-call, multi-state overtime compliance for CA, NY, TX. Enterprise tier at $12/employee/month, 2-year term. TCV $576,000. HR Director Catherine Hall leading evaluation. POC planned for November.'),
(15, 'Sandra Lee', '2025-10-08', 'MIT academic licensing request for QuickReport. 35 researchers plus 120 graduate students. Academic program pricing: 70% discount, $14.99/seat/month for 155 seats. 1-year renewable. TCV $27,881. Dr. Jessica Young in Department of Data Science. Low revenue but high brand visibility in academic publications.');
```

## Step 3: Build Bronze Views

Bronze views cast dates to timestamps and standardize column names.

```sql
CREATE OR REPLACE VIEW aigenerateexp.bronze.v_emails AS
SELECT
  email_id,
  CAST(received_date AS TIMESTAMP) AS received_timestamp,
  email_body
FROM aigenerateexp.document_data.raw_emails;

CREATE OR REPLACE VIEW aigenerateexp.bronze.v_contracts AS
SELECT
  note_id,
  account_manager,
  CAST(note_date AS TIMESTAMP) AS note_timestamp,
  note_text
FROM aigenerateexp.document_data.contract_notes;
```

## Step 4: Build Silver Views

This Silver view provides the unified email data that Gold views will process. At this stage, we simply promote the Bronze view for downstream extraction.

```sql
CREATE OR REPLACE VIEW aigenerateexp.silver.v_email_pipeline AS
SELECT
  email_id,
  received_timestamp,
  email_body
FROM aigenerateexp.bronze.v_emails;
```

## Step 5: Build Gold Views with AI_GENERATE

### Gold View 1: Email Information Extraction

This is the core use case for `AI_GENERATE`. Each email contains a sender, their company, the topic, the urgency level, and an action item, but all of this is embedded in free-text prose. The `WITH SCHEMA` clause tells the LLM exactly what fields to extract and what types to return.

```sql
CREATE OR REPLACE VIEW aigenerateexp.gold.v_email_extracted AS
SELECT
  email_id,
  received_timestamp,
  email_body,
  extracted.sender_name,
  extracted.company,
  extracted.topic,
  extracted.urgency,
  extracted.action_required
FROM (
  SELECT
    email_id,
    received_timestamp,
    email_body,
    AI_GENERATE(
      'Extract the following information from this email. If a field is not present, return N/A.',
      email_body
      WITH SCHEMA (
        sender_name VARCHAR,
        company VARCHAR,
        topic VARCHAR,
        urgency VARCHAR,
        action_required VARCHAR
      )
    ) AS extracted
  FROM aigenerateexp.silver.v_email_pipeline
);
```

The subquery calls `AI_GENERATE` and aliases the result as `extracted`. The outer query then expands the ROW using dot notation (`extracted.sender_name`, `extracted.company`, etc.). Each field becomes a regular column you can filter, group, or join on.

### Gold View 2: Contract Detail Extraction

Contract notes contain structured deal information in natural language. `AI_GENERATE` extracts the client name, product, seat count, contract value, term, and key contact into individual columns.

```sql
CREATE OR REPLACE VIEW aigenerateexp.gold.v_contract_details AS
SELECT
  note_id,
  account_manager,
  note_timestamp,
  note_text,
  details.client_name,
  details.product,
  details.seat_count,
  details.monthly_rate,
  details.contract_term_years,
  details.total_contract_value,
  details.key_contact,
  details.deal_status
FROM (
  SELECT
    note_id,
    account_manager,
    note_timestamp,
    note_text,
    AI_GENERATE(
      'Extract deal information from this contract note. For total_contract_value use only the numeric amount. For deal_status classify as Won, Lost, Pending, or Expansion.',
      note_text
      WITH SCHEMA (
        client_name VARCHAR,
        product VARCHAR,
        seat_count INT,
        monthly_rate DECIMAL(10,2),
        contract_term_years INT,
        total_contract_value DECIMAL(12,2),
        key_contact VARCHAR,
        deal_status VARCHAR
      )
    ) AS details
  FROM aigenerateexp.bronze.v_contracts
);
```

Notice the `WITH SCHEMA` uses `INT` for seat count, `DECIMAL` for monetary values, and `VARCHAR` for text fields. The LLM converts the free-text values to the types you specify. If a contract note says "75 seats," the `seat_count` column returns the integer `75`.

### How WITH SCHEMA Changes the Output

Without `WITH SCHEMA`, `AI_GENERATE` returns a `VARCHAR` with the LLM's freeform response. This is harder to work with downstream:

```sql
-- Without WITH SCHEMA: returns plain text
SELECT AI_GENERATE(
  'Extract the sender name and company from this email',
  email_body
) AS raw_text
FROM aigenerateexp.bronze.v_emails
LIMIT 3;
```

The raw text might look like: "Sender: Sarah Chen, Company: Acme Corp" but there's no guarantee of consistent formatting across rows. With `WITH SCHEMA`, every row returns the same column structure, making the output predictable and queryable.

## Persisting Results with CTAS

Materialize your extracted data into Iceberg tables to avoid repeated LLM calls:

```sql
CREATE TABLE aigenerateexp.gold.emails_extracted AS
SELECT * FROM aigenerateexp.gold.v_email_extracted;

CREATE TABLE aigenerateexp.gold.contracts_extracted AS
SELECT * FROM aigenerateexp.gold.v_contract_details;
```

Once materialized, you can run standard SQL analytics on the extracted fields without incurring LLM token costs. Refresh the tables when new emails or contracts arrive.

## Step 6: Enable AI-Generated Wikis and Tags

1. Click **Admin** in the left sidebar, then go to **Project Settings**.
2. Select the **Preferences** tab.
3. Scroll to the **AI** section and enable **Generate Wikis and Labels**.
4. Go to the **Catalog** and navigate to your Gold views under `aigenerateexp.gold`.
5. Click the **Edit** button (pencil icon) next to each view.
6. In the **Details** tab, click **Generate Wiki** and **Generate Tags**.
7. Repeat for all Gold views.

Enhance the generated wikis with context like "sender_name and company are LLM-extracted from raw email text. Urgency is classified by the LLM based on language cues like 'urgent', 'critical', and 'immediate'."

## Step 7: Ask Questions with the AI Agent

**"Which companies sent urgent emails?"**

The Agent queries `v_email_extracted`, filters by `urgency` containing 'urgent' or 'critical', and returns the company names and topics.

**"Show me a chart of email topics by urgency level"**

The Agent groups by `topic` and `urgency` in `v_email_extracted` and creates a visualization showing which topics generate the most urgent communications.

**"List all won deals over $100,000 with their key contacts"**

The Agent filters `v_contract_details` for `deal_status = 'Won'` and `total_contract_value > 100000`, returning client names, products, values, and key contacts.

**"Create a chart showing total contract value by account manager and deal status"**

The Agent creates a stacked bar chart from `v_contract_details` comparing each account manager's total pipeline across Won, Lost, Pending, and Expansion statuses.

## Processing Unstructured Files with AI_GENERATE and LIST_FILES

The examples above process text that's already stored in table columns. But many organizations have unstructured files, such as PDFs, text documents, images, and scanned invoices, sitting in object storage (S3, Azure Blob, GCS) that have never been queryable through SQL.

Dremio's `LIST_FILES` table function bridges this gap. It recursively lists files from a connected source and returns metadata about each file. Combined with `AI_GENERATE`, you can read file content and extract structured data from documents that were previously invisible to your analytics platform.

### How LIST_FILES Works

`LIST_FILES` is a table function that returns metadata for files in a connected storage source:

```sql
SELECT *
FROM TABLE(
  LIST_FILES(
    path => 'your_s3_source.folder_name',
    recursive => true
  )
);
```

The function returns columns including the file source, path, size, and last modification time. This metadata feeds into `AI_GENERATE` as file references.

### Hypothetical Example: Invoice Processing

Suppose you have an S3 bucket connected to Dremio as a source called `company_s3`, with a folder `/invoices/2025/` containing PDF invoices from vendors. Here's how you'd extract structured data:

```sql
-- Step 1: List all invoice files
SELECT *
FROM TABLE(
  LIST_FILES(
    path => 'company_s3.invoices.2025',
    recursive => true
  )
);

-- Step 2: Extract structured data from each invoice
SELECT
  invoice_data.vendor_name,
  invoice_data.invoice_number,
  invoice_data.invoice_date,
  invoice_data.total_amount,
  invoice_data.currency,
  invoice_data.line_items
FROM (
  SELECT AI_GENERATE(
    'Extract the vendor name, invoice number, date, total amount, currency, and a summary of line items from this invoice.',
    file_content
    WITH SCHEMA (
      vendor_name VARCHAR,
      invoice_number VARCHAR,
      invoice_date VARCHAR,
      total_amount DECIMAL(12,2),
      currency VARCHAR,
      line_items VARCHAR
    )
  ) AS invoice_data
  FROM TABLE(
    LIST_FILES(
      path => 'company_s3.invoices.2025',
      recursive => true
    )
  )
);
```

### Hypothetical Example: Resume Screening

An HR team stores candidate resumes as PDFs in an S3 bucket. `AI_GENERATE` extracts candidate information for structured analysis:

```sql
SELECT
  candidate.full_name,
  candidate.email,
  candidate.years_experience,
  candidate.primary_skill,
  candidate.education_level,
  candidate.current_company
FROM (
  SELECT AI_GENERATE(
    'Extract candidate information from this resume. For years_experience provide a numeric estimate.',
    file_content
    WITH SCHEMA (
      full_name VARCHAR,
      email VARCHAR,
      years_experience INT,
      primary_skill VARCHAR,
      education_level VARCHAR,
      current_company VARCHAR
    )
  ) AS candidate
  FROM TABLE(
    LIST_FILES(
      path => 'hr_s3.resumes.2025_q4',
      recursive => true
    )
  )
);
```

### Hypothetical Example: Quarterly Report Analysis

Finance stores quarterly PDF reports from subsidiaries. Extract key financial metrics without manual reading:

```sql
SELECT
  metrics.subsidiary_name,
  metrics.quarter,
  metrics.total_revenue,
  metrics.net_income,
  metrics.headcount,
  metrics.key_risks
FROM (
  SELECT AI_GENERATE(
    'Extract financial summary data from this quarterly report.',
    file_content
    WITH SCHEMA (
      subsidiary_name VARCHAR,
      quarter VARCHAR,
      total_revenue DECIMAL(15,2),
      net_income DECIMAL(15,2),
      headcount INT,
      key_risks VARCHAR
    )
  ) AS metrics
  FROM TABLE(
    LIST_FILES(
      path => 'finance_s3.quarterly_reports.2025',
      recursive => true
    )
  )
);
```

### Materializing File Extraction Results

Once you've extracted structured data from files, persist it as an Iceberg table:

```sql
CREATE TABLE aigenerateexp.gold.invoices_extracted AS
SELECT
  invoice_data.vendor_name,
  invoice_data.invoice_number,
  invoice_data.total_amount,
  invoice_data.currency
FROM (
  SELECT AI_GENERATE(
    'Extract invoice details',
    file_content
    WITH SCHEMA (vendor_name VARCHAR, invoice_number VARCHAR, total_amount DECIMAL(12,2), currency VARCHAR)
  ) AS invoice_data
  FROM TABLE(LIST_FILES(path => 'company_s3.invoices.2025', recursive => true))
);
```

This creates a governed, queryable Iceberg table from raw PDF invoices. The table supports time travel, schema evolution, and ACID transactions. Build Reflections on it for dashboard acceleration.

### Key Considerations for LIST_FILES + AI_GENERATE

**Source connectivity:** `LIST_FILES` requires a connected storage source (S3, Azure Storage, GCS) in your Dremio project. The source must be configured with appropriate read permissions.

**File format support:** Dremio's AI functions can process text-based content including PDFs, text files, and document formats. The LLM interprets the file content and extracts fields per your schema definition.

**Token costs:** Processing files through the LLM consumes tokens proportional to file size. Filter your `LIST_FILES` results before passing them to `AI_GENERATE` to avoid processing unnecessary files:

```sql
-- Filter to only recent files before AI processing
SELECT AI_GENERATE(...)
FROM TABLE(LIST_FILES(path => 'company_s3.invoices.2025', recursive => true))
WHERE modification_time > TIMESTAMP '2025-09-01 00:00:00';
```

**Engine routing:** Use `query_calls_ai_functions()` to route file processing queries to a dedicated engine, isolating heavy batch extraction from your regular analytical workloads.

## Why Apache Iceberg Matters

Extracted data stored as Iceberg tables benefits from automated performance management. As your extraction pipeline grows from hundreds to thousands of documents, Iceberg's compaction, manifest optimization, and clustering keep query performance consistent without manual tuning.

### Iceberg vs. Federated for AI_GENERATE Workloads

**Use CTAS materialization when:** You're extracting from historical documents (past invoices, old contracts, archived emails). Run the extraction once, query the results forever.

**Use live views when:** You need real-time extraction from a continuously updating text column in a federated database. Pair with manual Reflections to cache results at a controlled refresh interval, balancing extraction cost against data freshness.

## Next Steps

1. **Connect your real data sources** — replace simulated tables with federated connections to your email system, CRM, and document storage
2. **Connect an S3 or Azure source** — enable `LIST_FILES` processing on your actual unstructured file repositories
3. **Add FGAC** — mask extracted PII fields (emails, phone numbers, names) for downstream consumers who shouldn't see personal data
4. **Build Reflections** — create Reflections on CTAS-materialized extraction tables for fast dashboard queries at zero LLM cost

If your organization has unstructured text trapped in database columns or files sitting unanalyzed in object storage, `AI_GENERATE` turns that text into structured, queryable, governed data. Define a schema, write a prompt, and run a query. The extraction happens inside your lakehouse with the same access controls and governance that apply to all your other data.

[Try Dremio Cloud free for 30 days](https://www.dremio.com/get-started?utm_source=ev_buffer&utm_medium=influencer&utm_campaign=pag&utm_term=ai-generate-dremio-cloud&utm_content=alexmerced) and start extracting structured data from your unstructured text.
