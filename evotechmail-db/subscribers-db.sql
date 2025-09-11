-- =========================================
-- Schema (optional)
-- =========================================
CREATE SCHEMA IF NOT EXISTS evomail;

SET search_path to evomail;

--CREATE EXTENSION IF NOT EXISTS pgcrypto;


CREATE OR REPLACE FUNCTION evomail.uuid_v4()
RETURNS uuid
LANGUAGE sql VOLATILE
AS $$
  SELECT (
    lpad(to_hex((random()*4294967295)::bigint), 8,  '0') || '-' ||
    lpad(to_hex((random()*65535)::int),         4,  '0') || '-' ||
    '4' || substr(lpad(to_hex((random()*65535)::int), 4, '0'), 2, 3) || '-' ||
    substr('89ab', (floor(random()*4)::int + 1), 1) ||
      substr(lpad(to_hex((random()*65535)::int), 4, '0'), 2, 3) || '-' ||
    lpad(to_hex((random()*4294967295)::bigint), 8,  '0') ||
    lpad(to_hex((random()*65535)::int),         4,  '0')
  )::uuid;
$$;


DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'evomail'
      AND c.relkind IN ('r','p')  -- 'r' = ordinary table, 'p' = partitioned table
      AND c.relname != 'google_sheet'
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE;', r.schema_name, r.table_name);
  END LOOP;
END;
$$;


-- =========================================
-- Lookup tables
-- =========================================

-- 1) status lookup 
CREATE TABLE IF NOT EXISTS status (
  status_id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status_cd           text        NOT NULL UNIQUE,  -- e.g., owner, active, onboarding, closed
  status_desc         text,
  create_user_id      text        NOT NULL,
  create_ts           timestamptz NOT NULL DEFAULT now(),
  last_mod_user_id    text        NOT NULL,
  last_mod_ts         timestamptz NOT NULL DEFAULT now()
);

-- Fast unique lookups by normalized status_cd
CREATE UNIQUE INDEX IF NOT EXISTS status_code_norm_ux
  ON status(lower(btrim(status_cd)));

-- 2) bcg status lookup
CREATE TABLE IF NOT EXISTS bcg_status (
  bcg_status_id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bcg_status_cd       text        NOT NULL UNIQUE,  -- e.g., owner, complete, new, closed, incomplete, email
  bcg_status_desc     text,
  create_user_id      text        NOT NULL,
  create_ts           timestamptz NOT NULL DEFAULT now(),
  last_mod_user_id    text        NOT NULL,
  last_mod_ts         timestamptz NOT NULL DEFAULT now()
);

-- Fast unique lookups by normalized bcg_status_cd
CREATE UNIQUE INDEX IF NOT EXISTS bcg_status_code_norm_ux
  ON bcg_status(lower(btrim(bcg_status_cd)));

-- 3) mail partners lookup (case per your values)
CREATE TABLE IF NOT EXISTS mail_partner (
  mail_partner_id     bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  partner_cd          text        NOT NULL UNIQUE,  -- e.g., Owner, Davinci, PostScanMail, iPostal, AnyTimeMailBox
  partner_desc        text,
  has_portal_yn       varchar(1)  NOT NULL default 'Y',
  create_user_id      text        NOT NULL DEFAULT user,
  create_ts           timestamptz NOT NULL DEFAULT now(),
  last_mod_user_id    text        NOT NULL,
  last_mod_ts         timestamptz NOT NULL DEFAULT now()
);

-- Fast unique lookups by normalized partner_cd
CREATE UNIQUE INDEX IF NOT EXISTS mail_partner_cd_norm_ux
  ON mail_partner(lower(btrim(partner_cd)));


--4)  mail_status lookup

CREATE TABLE IF NOT EXISTS mail_status(
  mail_status_id      bigserial PRIMARY KEY,
  mail_status_cd      text NOT NULL UNIQUE,   -- e.g., INSERTED, OPENED_SCANNED, FORWARDED, RECYCLED, SHREDDED
  mail_status_desc    text,
  create_user_id      text        NOT NULL DEFAULT user,
  create_ts           timestamptz NOT NULL DEFAULT now(),
  last_mod_user_id    text        NOT NULL,
  last_mod_ts         timestamptz NOT NULL DEFAULT now()
);

-- Fast unique lookups by normalized mail_status_cd
CREATE UNIQUE INDEX IF NOT EXISTS mail_status_cd_norm_ux
  ON mail_status(lower(btrim(mail_status_cd)));

--5)  mail_type lookup

CREATE TABLE IF NOT EXISTS mail_type(
  mail_type_id        bigserial PRIMARY KEY,
  mail_type_cd        text NOT NULL UNIQUE,   -- LETTER, ENVELOPE, LARGE_ENVELOPE, PACKAGE
  mail_type_desc      text,
  create_user_id      text        NOT NULL DEFAULT user,
  create_ts           timestamptz NOT NULL DEFAULT now(),
  last_mod_user_id    text        NOT NULL,
  last_mod_ts         timestamptz NOT NULL DEFAULT now()
);

-- Fast unique lookups by normalized mail_status_cd
CREATE UNIQUE INDEX IF NOT EXISTS mail_type_cd_norm_ux
  ON mail_type(lower(btrim(mail_type_cd)));


-- Seed values

INSERT INTO status (status_cd, status_desc, create_user_id, last_mod_user_id)
VALUES
  ('Owner','owner record','system','system'),
  ('Active','active subscriber','system','system'),
  ('Onboarding','onboarding in progress','system','system'),
  ('Closed','subscription closed','system','system'),
  ('Suspended','subscription Suspended','system','system'),
  ('InActive','subscription InActive','system','system'),
  ('Payment Issue','subscription Payment Issue','system','system'),
  ('Locked','subscription Locked','system','system'),
  ('OnHold','subscription OnHold','system','system')
ON CONFLICT (status_cd) DO NOTHING;

INSERT INTO bcg_status (bcg_status_cd, bcg_status_desc, create_user_id, last_mod_user_id)
VALUES
  ('Owner','owner record','system','system'),
  ('Complete','complete','system','system'),
  ('New','new','system','system'),
  ('Closed','closed','system','system'),
  ('Incomplete','incomplete','system','system'),
  ('Email','email sent/needed','system','system'),
  ('Update','bcg records need to be updated','system','system'),
  ('Reminder Email','Reminder Email','system','system'),
  ('Text','Text','system','system'),
  ('Reminder text','Reminder Email','system','system')
ON CONFLICT (bcg_status_cd) DO NOTHING;

INSERT INTO mail_partner (partner_cd, partner_desc, has_portal_yn,create_user_id, last_mod_user_id)
VALUES
  ('Owner','internal/owner','N','system','system'),
  ('Davinci','Davinci Virtual Office','N','system','system'),
  ('PostScanMail','PostScanMail','Y','system','system'),
  ('iPostal','iPostal1','Y','system','system'),
  ('AnyTimeMailBox','AnyTimeMailBox','Y','system','system')
ON CONFLICT (partner_cd) DO NOTHING;

INSERT INTO mail_status (mail_status_cd, mail_status_desc, create_user_id, last_mod_user_id) VALUES
  ('Inserted','Mail item inserted/received','system','system'),
  ('Scanned','Opened and scanned','system','system'),
  ('Forwarded','Forwarded to recipient','system','system'),
  ('Recycled','Recycled/discarded','system','system'),
  ('Shredded','Shredded securely','system','system'),
  ('PickedUp','PickedUp by subscriber','system','system')
ON CONFLICT (mail_status_cd) DO NOTHING;

INSERT INTO mail_type (mail_type_cd, mail_type_desc, create_user_id, last_mod_user_id) VALUES
  ('Letter','Letter','system','system'),
  ('Envelope','Envelope','system','system'),
  ('Large Envelope','Large Envelope','system','system'),
  ('Package','Package','system','system')
ON CONFLICT (mail_type_cd) DO NOTHING;

-- =========================================
-- Core: subscriber
-- =========================================
CREATE TABLE IF NOT EXISTS subscriber (
  subscriber_id         bigint  GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pmb                   integer NOT NULL,
  first_name            text,
  last_name             text,
  company               text,
  phone                 text,
  email                 text,
  fk_status_id          bigint REFERENCES status(status_id),
  last_status_ts        TIMESTAMP (6) WITH TIME ZONE NULL,
  fk_bcg_status_id      bigint REFERENCES bcg_status(bcg_status_id),
  fk_mail_partner_id    bigint REFERENCES mail_partner(mail_partner_id),
  usps_compliant        boolean NOT NULL DEFAULT false,
  create_user_id        text    NOT NULL,
  create_ts             timestamptz NOT NULL DEFAULT now(),
  last_mod_user_id      text    NOT NULL,
  last_mod_ts           timestamptz NOT NULL DEFAULT now()
);

-- Useful index for quick search by name/email
CREATE INDEX IF NOT EXISTS idx_subscriber_name_email
  ON subscriber (last_name, first_name, email);
  
-- filter compliant/non-compliant
CREATE INDEX IF NOT EXISTS idx_subscriber_usps_true
  ON subscriber (subscriber_id) WHERE usps_compliant;

CREATE INDEX IF NOT EXISTS idx_subscriber_usps_false
  ON subscriber (subscriber_id) WHERE NOT usps_compliant;

-- =========================================
-- Addresses (separate table; allow multiple)
-- =========================================
CREATE TABLE IF NOT EXISTS subscriber_address (
  address_id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fk_subscriber_id      bigint NOT NULL REFERENCES subscriber(subscriber_id),
  address_line_1        text NOT NULL,
  address_line_2        text,
  city                  text,
  state_province        text,
  postal_code           text,
  country               text,
  is_primary            boolean     NOT NULL DEFAULT false,
  create_user_id        text        NOT NULL,
  create_ts             timestamptz NOT NULL DEFAULT now(),
  last_mod_user_id      text        NOT NULL,
  last_mod_ts           timestamptz NOT NULL DEFAULT now()
);

-- Ensure only one primary address per subscriber
CREATE UNIQUE INDEX IF NOT EXISTS uk_subscriber_one_primary_addr
  ON subscriber_address (fk_subscriber_id)
  WHERE is_primary = true;

-- =========================================
-- Notes (separate table with timestamp and user)
-- =========================================
CREATE TABLE IF NOT EXISTS subscriber_note (
  note_id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fk_subscriber_id      bigint NOT NULL REFERENCES subscriber(subscriber_id),
  note_text             text   NOT NULL,
  note_ts               timestamptz NOT NULL DEFAULT now(),
  note_user_id          text   NOT NULL,
  note_type_cd          text   NOT NULL DEFAULT 'system',
  create_user_id        text    NOT NULL,
  create_ts             timestamptz NOT NULL DEFAULT now(),
  last_mod_user_id      text    NOT NULL,
  last_mod_ts           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriber_note
  ADD CONSTRAINT chk_note_type_cd
  CHECK (note_type_cd IN ('system','user','compliance'));

-- notes timeline per subscriber
CREATE INDEX IF NOT EXISTS idx_subscriber_note_sub_ts
  ON subscriber_note (fk_subscriber_id, note_ts DESC);

-- optional: quick fetch of compliance-only notes
CREATE INDEX IF NOT EXISTS idx_subscriber_note_compliance
  ON subscriber_note (fk_subscriber_id, note_ts DESC)
  WHERE note_type_cd = 'compliance';


-- =========================================
-- subscriber_mail
-- =========================================
CREATE TABLE IF NOT EXISTS subscriber_mail(
  mail_id           bigserial PRIMARY KEY,
  fk_subscriber_id  bigint NOT NULL REFERENCES subscriber(subscriber_id),
  image_path        text,                  -- stored file path (or URL) to the captured image
  weight_oz         numeric(10,2),         -- ounces (pick your unit)
  width_in          numeric(10,2),
  length_in         numeric(10,2),
  height_in         numeric(10,2),
  fk_mail_type_id   bigint NOT NULL REFERENCES     mail_type(mail_type_id),
  fk_mail_status_id bigint NOT NULL REFERENCES     mail_status(mail_status_id),
  insertion_time    timestamptz NOT NULL DEFAULT now(),
  last_status_ts    timestamptz,           -- auto-stamped by trigger
  create_user_id    text        NOT NULL ,
  create_ts         timestamptz NOT NULL DEFAULT now(),
  last_mod_user_id  text        NOT NULL,
  last_mod_ts       timestamptz NOT NULL DEFAULT now()
);

-- =========================================
-- mail_life
-- =========================================
CREATE TABLE IF NOT EXISTS mail_life_events (
  id                bigserial PRIMARY KEY,
  fk_mail_id        bigint NOT NULL REFERENCES subscriber_mail(mail_id),
  fk_mail_status_id bigint NOT NULL REFERENCES mail_status(mail_status_id),
  create_ts         timestamptz NOT NULL DEFAULT now(),
  create_user_id    text        NOT NULL ,
  comment           text
);


-- Users
CREATE TABLE IF NOT EXISTS user_account (
  user_id        BIGSERIAL PRIMARY KEY,
  email          TEXT NOT NULL, -- normalized, case-insensitive key for uniqueness
  pass_hash      TEXT NOT NULL,                           -- argon2id full hash string
  display_name   TEXT,
  role_cd        TEXT NOT NULL DEFAULT 'admin'     CHECK (role_cd IN ('admin','staff')),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_ts  TIMESTAMPTZ,
  create_ts      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast unique lookups by normalized email
CREATE UNIQUE INDEX IF NOT EXISTS user_account_email_norm_ux
  ON user_account(lower(btrim(email)));

-- (Optional) keep a simple unique too; harmless if you already had it
CREATE UNIQUE INDEX IF NOT EXISTS user_account_email_ux
  ON user_account(email);

-- Sessions (cookie stores session_id UUID)
CREATE TABLE IF NOT EXISTS user_session (
  session_id   UUID PRIMARY KEY DEFAULT evomail.uuid_v4(), --gen_random_uuid() -> from pgcrypto
  user_id      BIGINT NOT NULL REFERENCES user_account(user_id) ON DELETE CASCADE,
  ip_addr      INET,
  user_agent   TEXT,
  expires_ts   TIMESTAMPTZ NOT NULL,
  create_ts    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- indexes
CREATE INDEX IF NOT EXISTS user_session_user_idx     ON evomail.user_session(user_id);
CREATE INDEX IF NOT EXISTS user_session_expires_idx  ON evomail.user_session(expires_ts DESC);


-- =========================================
-- subscriber_vw
-- =========================================

DROP VIEW IF EXISTS subscriber_vw;

CREATE OR REPLACE VIEW subscriber_vw AS
SELECT
  s.subscriber_id,
  s.pmb,
  s.first_name,
  s.last_name,
  s.company,
  s.phone,
  s.email,
  -- primary address (if any)
  sa.address_line_1 || CASE WHEN sa.address_line_2 IS NOT NULL AND sa.address_line_2 <> '' THEN ' ' || sa.address_line_2 ELSE '' END
     || CASE WHEN sa.city IS NOT NULL THEN ', ' || sa.city ELSE '' END
     || CASE WHEN sa.state_province IS NOT NULL THEN ' ' || sa.state_province ELSE '' END
     || CASE WHEN sa.postal_code IS NOT NULL THEN ' ' || sa.postal_code ELSE '' END
     || CASE WHEN sa.country IS NOT NULL THEN ' ' || sa.country ELSE '' END  AS primary_address,
  sl.status_cd        AS status,
  mpl.partner_cd      AS source,
  bl.bcg_status_cd    AS bcg,
  /* ALL notes as JSON (newest first) */
  COALESCE(sn.notes_json, '[]'::jsonb) AS notes_json,
  /* Optional: handy text of the newest note for simple UIs */
  COALESCE(sn.latest_note_text, '')    AS latest_note_text,
  /* NEW: all addresses as JSON (primary first) */
  COALESCE(aj.addresses_json, '[]'::jsonb) AS addresses_json
FROM subscriber s
LEFT JOIN LATERAL (
  SELECT *
  FROM subscriber_address a
  WHERE a.fk_subscriber_id = s.subscriber_id
    AND a.is_primary
  ORDER BY a.is_primary DESC, a.address_id
  LIMIT 1
) sa ON true
LEFT JOIN LATERAL (
  SELECT
    jsonb_agg(
      jsonb_build_object(
        'note_id',         n.note_id,
        'note_user_id',    n.note_user_id,
        'note_type_cd',    n.note_type_cd,
        'note_ts',         to_jsonb(n.note_ts),
        'note_text',       n.note_text
      )
      ORDER BY n.note_ts DESC, n.note_id DESC
    ) AS notes_json,
    /* convenience: latest note's text */
    (
      SELECT n2.note_text
      FROM evomail.subscriber_note n2
      WHERE n2.fk_subscriber_id = s.subscriber_id
        AND n2.note_type_cd != 'compliance'
      ORDER BY n2.note_ts DESC, n2.note_id DESC
      LIMIT 1
    ) AS latest_note_text
  FROM evomail.subscriber_note n
  WHERE n.fk_subscriber_id = s.subscriber_id
    AND n.note_type_cd != 'compliance'
) sn ON TRUE
/* NEW: Addresses JSON (all addresses, primary first) */
LEFT JOIN LATERAL (
  SELECT jsonb_agg(
           jsonb_build_object(
             'address_id',       sa.address_id,
             'address_line_1',   sa.address_line_1,
             'is_primary',       sa.is_primary,
             'create_user_id',   sa.create_user_id,
             'create_ts',        to_jsonb(sa.create_ts),
             'last_mod_user_id', sa.last_mod_user_id,
             'last_mod_ts',      to_jsonb(sa.last_mod_ts)
           )
           ORDER BY sa.is_primary DESC, sa.address_id
         ) AS addresses_json
  FROM evomail.subscriber_address sa
  WHERE sa.fk_subscriber_id = s.subscriber_id
) aj ON TRUE
LEFT JOIN status          sl  ON sl.status_id        = s.fk_status_id
LEFT JOIN bcg_status      bl  ON bl.bcg_status_id    = s.fk_bcg_status_id
LEFT JOIN mail_partner    mpl ON mpl.mail_partner_id = s.fk_mail_partner_id;




-- =========================================
-- notification
-- =========================================
CREATE TABLE IF NOT EXISTS notification (
  notification_id BIGSERIAL PRIMARY KEY,
  batch_id        UUID        NOT NULL,
  attempt_no      INTEGER     NOT NULL DEFAULT 1,
  last_attempt_ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- addressing
  from_addr       TEXT        NOT NULL,
  subject         TEXT,
  to_addrs        TEXT[]      NOT NULL DEFAULT '{}',
  cc_addrs        TEXT[]      NOT NULL DEFAULT '{}',
  bcc_addrs       TEXT[]      NOT NULL DEFAULT '{}',
  -- content (HTML if present, else text)
  body            TEXT,
  -- metadata + results
  delivery_meta   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  result_details  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  -- overall outcome
  status          TEXT        NOT NULL CHECK (status IN ('SUCCESS','FAILED')),
  -- label for what triggered it
  context         TEXT,
  create_ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
  create_user_id  TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS email_notification_create_ts_idx  ON notification (create_ts DESC);
CREATE INDEX IF NOT EXISTS email_notification_status_idx     ON notification (status);
CREATE INDEX IF NOT EXISTS email_notification_batch_idx      ON notification (batch_id);
CREATE INDEX IF NOT EXISTS email_notification_context_idx    ON notification (context);
-- Helpful extras (optional)
CREATE INDEX IF NOT EXISTS email_notification_failed_idx     ON notification (create_ts DESC)
  WHERE status='FAILED';
CREATE INDEX IF NOT EXISTS email_notification_delivery_gin   ON notification USING GIN (delivery_meta);
CREATE INDEX IF NOT EXISTS email_notification_result_gin     ON notification USING GIN (result_details);



-- =========================================
-- reports
-- =========================================
CREATE TABLE IF NOT EXISTS reports (
  report_id        BIGSERIAL PRIMARY KEY,
  report_name      TEXT NOT NULL UNIQUE,
  report_sql       TEXT NOT NULL,                -- includes #TITLE# sections
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  create_user_id   TEXT NOT NULL,
  create_ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_mod_user_id TEXT NOT NULL,
  last_mod_ts      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_active ON reports(active);


-- =========================================
-- reports_execution_log
-- =========================================
CREATE TABLE IF NOT EXISTS reports_execution_log (
  id               BIGSERIAL PRIMARY KEY,
  fk_report_id     BIGINT NOT NULL REFERENCES evomail.reports(report_id),
  started_ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_ts         TIMESTAMPTZ,
  status_cd        TEXT NOT NULL CHECK (status_cd IN ('SUCCESS','FAIL')),
  rowsets          INTEGER NOT NULL DEFAULT 0,   -- number of datasets returned
  rows_total       INTEGER NOT NULL DEFAULT 0,   -- total rows across datasets
  message          TEXT,                         -- error text or summary
  executed_by      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_log_report ON reports_execution_log(fk_report_id, started_ts DESC);

-- =========================================
-- Used now for google drive secret token
-- =========================================
CREATE TABLE IF NOT EXISTS oauth_tokens (
  id            TEXT PRIMARY KEY,
  access_token  TEXT,           -- optional/unused
  refresh_token TEXT NOT NULL,  -- we put the encrypted blob here
  scope         TEXT,           -- optional/unused
  token_type    TEXT,           -- optional/unused
  expiry_date   BIGINT,         -- optional/unused
  updated_at    TIMESTAMPTZ DEFAULT now()
);


-- =========================================
-- (Optional) Triggers to auto-update last_mod_ts
-- =========================================
-- === touch helper: updates last_mod_ts on write ===
CREATE OR REPLACE FUNCTION evomail.tg_touch_last_mod()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.last_mod_ts := now();
  RETURN NEW;
END
$$;

-- create a touch trigger if it doesn't already exist (table by table)
DO $do$
BEGIN
  -- subscriber
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c      ON c.oid = t.tgrelid
    JOIN pg_namespace n  ON n.oid = c.relnamespace
    WHERE t.tgname='trg_touch_subscriber'
      AND n.nspname='evomail' AND c.relname='subscriber'
  ) THEN
    CREATE TRIGGER trg_touch_subscriber
      BEFORE UPDATE ON evomail.subscriber
      FOR EACH ROW EXECUTE PROCEDURE evomail.tg_touch_last_mod();
  END IF;

  -- subscriber_address
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE t.tgname='trg_touch_subscriber_address'
      AND n.nspname='evomail' AND c.relname='subscriber_address'
  ) THEN
    CREATE TRIGGER trg_touch_subscriber_address
      BEFORE UPDATE ON evomail.subscriber_address
      FOR EACH ROW EXECUTE PROCEDURE evomail.tg_touch_last_mod();
  END IF;

  -- subscriber_note
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE t.tgname='trg_touch_subscriber_note'
      AND n.nspname='evomail' AND c.relname='subscriber_note'
  ) THEN
    CREATE TRIGGER trg_touch_subscriber_note
      BEFORE UPDATE ON evomail.subscriber_note
      FOR EACH ROW EXECUTE PROCEDURE evomail.tg_touch_last_mod();
  END IF;

  -- status
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE t.tgname='trg_touch_status'
      AND n.nspname='evomail' AND c.relname='status'
  ) THEN
    CREATE TRIGGER trg_touch_status
      BEFORE UPDATE ON evomail.status
      FOR EACH ROW EXECUTE PROCEDURE evomail.tg_touch_last_mod();
  END IF;

  -- bcg_status
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE t.tgname='trg_touch_bcg_status'
      AND n.nspname='evomail' AND c.relname='bcg_status'
  ) THEN
    CREATE TRIGGER trg_touch_bcg_status
      BEFORE UPDATE ON evomail.bcg_status
      FOR EACH ROW EXECUTE PROCEDURE evomail.tg_touch_last_mod();
  END IF;

  -- mail_partner
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE t.tgname='trg_touch_mail_partner'
      AND n.nspname='evomail' AND c.relname='mail_partner'
  ) THEN
    CREATE TRIGGER trg_touch_mail_partner
      BEFORE UPDATE ON evomail.mail_partner
      FOR EACH ROW EXECUTE PROCEDURE evomail.tg_touch_last_mod();
  END IF;

  -- mail_status
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE t.tgname='trg_touch_mail_status'
      AND n.nspname='evomail' AND c.relname='mail_status'
  ) THEN
    CREATE TRIGGER trg_touch_mail_status
      BEFORE UPDATE ON evomail.mail_status
      FOR EACH ROW EXECUTE PROCEDURE evomail.tg_touch_last_mod();
  END IF;

  -- mail_type
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE t.tgname='trg_touch_mail_type'
      AND n.nspname='evomail' AND c.relname='mail_type'
  ) THEN
    CREATE TRIGGER trg_touch_mail_type
      BEFORE UPDATE ON evomail.mail_type
      FOR EACH ROW EXECUTE PROCEDURE evomail.tg_touch_last_mod();
  END IF;

  -- subscriber_mail
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE t.tgname='trg_touch_subscriber_mail'
      AND n.nspname='evomail' AND c.relname='subscriber_mail'
  ) THEN
    CREATE TRIGGER trg_touch_subscriber_mail
      BEFORE UPDATE ON evomail.subscriber_mail
      FOR EACH ROW EXECUTE PROCEDURE evomail.tg_touch_last_mod();
  END IF;
END
$do$ LANGUAGE plpgsql;

-- === subscriber_mail_status: stamp last_status_ts on insert/update of status ===
CREATE OR REPLACE FUNCTION evomail.subscriber_mail_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.fk_mail_status_id IS NOT NULL THEN
      NEW.last_status_ts := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.fk_mail_status_id IS DISTINCT FROM OLD.fk_mail_status_id THEN
      NEW.last_status_ts := now();
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname='trg_fk_mail_status_id'
      AND n.nspname='evomail' AND c.relname='subscriber_mail'
  ) THEN
    CREATE TRIGGER trg_fk_mail_status_id
      BEFORE INSERT OR UPDATE ON evomail.subscriber_mail
      FOR EACH ROW EXECUTE PROCEDURE evomail.subscriber_mail_status();
  END IF;
END
$do$ LANGUAGE plpgsql;

-- === subscriber_status: stamp last_status_ts on insert/update of status ===
CREATE OR REPLACE FUNCTION evomail.subscriber_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.fk_status_id IS NOT NULL THEN
      NEW.last_status_ts := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.fk_status_id IS DISTINCT FROM OLD.fk_status_id THEN
      NEW.last_status_ts := now();
    END IF;
  END IF;
  RETURN NEW;
END
$$;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c     ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE t.tgname='trg_fk_status_id'
      AND n.nspname='evomail' AND c.relname='subscriber'
  ) THEN
    CREATE TRIGGER trg_fk_status_id
      BEFORE INSERT OR UPDATE ON evomail.subscriber
      FOR EACH ROW EXECUTE PROCEDURE evomail.subscriber_status();
  END IF;
END
$do$ LANGUAGE plpgsql;




INSERT INTO user_account (email, pass_hash, display_name, role_cd)
VALUES ('h.zabin@evotechservice.com', '$argon2id$v=19$m=65536,t=3,p=4$db4JJq3iXxfjTS14PZyRJA$3DIPjbH4GJO5MWGSs5MIeBVSYCN054HUrhD28f2y0Dw', 'Hamzah Zabin', 'admin');

INSERT INTO user_account (email, pass_hash, display_name, role_cd)
VALUES ('k.alkofahi@evotechservice.com', '$argon2id$v=19$m=65536,t=3,p=4$2ih5SVtUzvxfZ6Kz9LJwiA$TJ2nBjYylYpWS/dFjNNURx77sJTkELvWEaXzhpaeELk', 'Khaled Alkofahi', 'admin');

INSERT INTO user_account (email, pass_hash, display_name, role_cd)
VALUES ('m.amoah@evotechservice.com', '$argon2id$v=19$m=65536,t=3,p=4$ezdD9DuhQYBItLHXgko2FQ$GHTRN2zEtIMl8xueZUpJijw7kzItZ4thm3dplxEmpFY', 'Michael Amoah', 'staff');

INSERT INTO user_account (email, pass_hash, display_name, role_cd)
VALUES ('b.reddy@evotechservice.com', '$argon2id$v=19$m=65536,t=3,p=4$9elre4Z9DFLZNVfnJ62Olg$fPLwzA/zNN9eBepx1/c0h7DfrmXh37jd7Ul4IxX1Ro4', 'Bharath Reddy', 'staff');



/*Sample Reports Below*/

INSERT INTO evomail."reports" (
                               report_name,
                               report_sql,
                               active,
                               create_user_id,
                               create_ts,
                               last_mod_user_id,
                               last_mod_ts)
     VALUES (
             'Subscriber Turn Ins/Outs',
             '#TITLE# Subscribers by status

Select ss.status_cd as "Status", count(*) as "Count"
  From subscriber s, evomail.status ss
 Where s.fk_status_id = ss.status_id
Group by ss.status_cd
Order by 2 desc;

#TITLE# Weekly changes

Select DATE_TRUNC(''week'', s.last_status_ts ) as "Week Start", ss.status_cd as "Status", count(*) as "Count"
  From evomail.subscriber s, evomail.status ss
 Where s.fk_status_id = ss.status_id
   And s.last_status_ts is not null
Group by 1,2
Order by 1 asc, 2 desc;

#TITLE# Monthly Changes

Select DATE_TRUNC(''month'', s.last_status_ts ) as "Month Start", ss.status_cd as "Status", count(*) as "Count"
  From evomail.subscriber s, evomail.status ss
 Where s.fk_status_id = ss.status_id
   And s.last_status_ts is not null
Group by 1,2
Order by 1 asc, 2 desc;',
             true,
             'web',
             TO_TIMESTAMP('08/31/2025 12:51:26.440', 'MM/DD/YYYY fmHH24fm:MI:SS.FF')::TIMESTAMP WITH TIME ZONE,
             'Hamzah Zabin',
             TO_TIMESTAMP('08/31/2025 18:50:37.338', 'MM/DD/YYYY fmHH24fm:MI:SS.FF')::TIMESTAMP WITH TIME ZONE);INSERT INTO evomail."reports" (
                               report_name,
                               report_sql,
                               active,
                               create_user_id,
                               create_ts,
                               last_mod_user_id,
                               last_mod_ts)
     VALUES (
             'Schema Tables',
             '#TITLE# Schema tables

SELECT table_schema as "Schema", table_name as "Table Name"
FROM information_schema.tables
WHERE table_type = ''BASE TABLE''
  AND table_schema NOT IN (''pg_catalog'', ''information_schema'')
ORDER BY 1, 2;
',
             true,
             'Hamzah Zabin',
             TO_TIMESTAMP('08/31/2025 20:30:12.504', 'MM/DD/YYYY fmHH24fm:MI:SS.FF')::TIMESTAMP WITH TIME ZONE,
             'Hamzah Zabin',
             TO_TIMESTAMP('08/31/2025 20:30:50.435', 'MM/DD/YYYY fmHH24fm:MI:SS.FF')::TIMESTAMP WITH TIME ZONE);INSERT INTO evomail."reports" (
                               report_name,
                               report_sql,
                               active,
                               create_user_id,
                               create_ts,
                               last_mod_user_id,
                               last_mod_ts)
     VALUES (
             'Compliance Reports',
             '#TITLE# Overall Compliance(Non closed accounts)

Select case when s.usps_compliant then ''Yes''
            else ''No''
       end as "Compliant" , count(*) as "Count"
  From subscriber s, evomail.status ss
 Where s.fk_status_id = ss.status_id
   And lower(ss.status_cd) != ''closed''
Group by s.usps_compliant
Order by 2 desc;

#TITLE# Compliance vs Subscriber status

Select ss.status_cd as "Status", 
       case when s.usps_compliant then ''Yes''
            else ''No''
       end as "Compliant" , count(*) as "Count"
  From subscriber s, evomail.status ss
 Where s.fk_status_id = ss.status_id
   And lower(ss.status_cd) != ''closed''
Group by ss.status_cd, s.usps_compliant
Order by 2 desc;

#TITLE# Compliance vs USPS BCG status

Select bs.bcg_status_cd as "BCG Status", 
       case when s.usps_compliant then ''Yes''
            else ''No''
       end as "Compliant" , count(*) as "Count"
  From subscriber s, evomail.bcg_status bs, evomail.status ss
 Where s.fk_status_id = ss.status_id
    And lower(ss.status_cd) != ''closed''
   And s.fk_bcg_status_id = bs.bcg_status_id
Group by bs.bcg_status_cd, s.usps_compliant
Order by 2 desc;


#TITLE# Compliance vs Status and USPS BCG status

Select ss.status_cd as "Status" , bs.bcg_status_cd as "BCG Status", 
       case when s.usps_compliant then ''Yes''
            else ''No''
       end as "Compliant" , count(*) as "Count"
  From subscriber s, evomail.bcg_status bs, evomail.status ss
 Where s.fk_status_id = ss.status_id
    And lower(ss.status_cd) != ''closed''
   And s.fk_bcg_status_id = bs.bcg_status_id
Group by ss.status_cd, bs.bcg_status_cd, s.usps_compliant
Order by 1 desc,3 asc;',
             true,
             'Hamzah Zabin',
             TO_TIMESTAMP('08/31/2025 19:04:33.883', 'MM/DD/YYYY fmHH24fm:MI:SS.FF')::TIMESTAMP WITH TIME ZONE,
             'Hamzah Zabin',
             TO_TIMESTAMP('08/31/2025 23:45:29.44', 'MM/DD/YYYY fmHH24fm:MI:SS.FF')::TIMESTAMP WITH TIME ZONE);

COMMIT;