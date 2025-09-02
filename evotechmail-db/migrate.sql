-- =========================================
-- Row-by-row migration from evomail.google_sheet
-- Allows duplicate PMBs (historical rows etc.)
-- =========================================

SET search_path to evomail;

-- 1) Main loop: iterate google_sheet and insert one-by-one

DO $migrate$
DECLARE
  r                RECORD;

  v_pmb            integer;
  v_first_name     text;
  v_last_name      text;
  v_company        text;
  v_phone          text;
  v_email          text;
  v_address        text;
  v_status_cd      text;  -- lowercased
  v_bcg_cd         text;  -- lowercased
  v_partner_cd     text;  -- keep case per your lookup values
  v_notes          text;

  v_status_id      bigint;
  v_bcg_status_id  bigint;
  v_partner_id     bigint;

  v_subscriber_id  bigint;
BEGIN
  FOR r IN
    SELECT
      pmb, first_name, last_name, company, phone, email,
      address, status, bcg, source, notes
    FROM evomail.google_sheet
    ORDER BY pmb::int asc
  LOOP
    -- Clean & coerce
    v_pmb        := NULLIF(btrim(r.pmb), '')::integer;  -- will raise if non-numeric; we’ll catch below
    v_first_name := NULLIF(btrim(r.first_name), '');
    v_last_name  := NULLIF(btrim(r.last_name), '');
    v_company    := NULLIF(btrim(r.company), '');
    v_phone      := NULLIF(btrim(r.phone), '');
    v_email      := NULLIF(btrim(r.email), '');
    v_address    := coalesce(btrim(r.address), 'TBD');
    v_status_cd  := NULLIF(btrim(r.status), ''); -- spec: status lowercase
    v_bcg_cd     := NULLIF(btrim(r.bcg), '');    -- spec: bcg lowercase
    v_partner_cd := NULLIF(btrim(r.source), ''); -- partner codes as given (Owner, Davinci, ... )
    v_notes      := NULLIF(btrim(r.notes), '');

    -- Guard: skip rows with no numeric PMB
    IF v_pmb IS NULL THEN
      RAISE NOTICE '[SKIP] Non-numeric or empty PMB in google_sheet row -> %', r;
      CONTINUE;
    END IF;

    -- Lookup IDs (nullable if not found)
    SELECT s.status_id INTO v_status_id
    FROM evomail.status s
    WHERE lower(s.status_cd) = lower(v_status_cd);

    SELECT b.bcg_status_id INTO v_bcg_status_id
    FROM evomail.bcg_status b
    WHERE lower(b.bcg_status_cd) = lower(v_bcg_cd);

    SELECT m.mail_partner_id INTO v_partner_id
    FROM evomail.mail_partner m
    WHERE lower(m.partner_cd) = lower(v_partner_cd);

    BEGIN
      -- Insert subscriber (NO upsert; duplicates allowed)
      INSERT INTO evomail.subscriber
        (pmb, first_name, last_name, company, phone, email,
         fk_status_id, fk_bcg_status_id, fk_mail_partner_id,
         create_user_id, last_mod_user_id)
      VALUES
        (v_pmb, v_first_name, v_last_name, v_company, v_phone, v_email,
         v_status_id, v_bcg_status_id, v_partner_id,
         'system', 'system')
      RETURNING subscriber_id INTO v_subscriber_id;

      -- Insert primary address if present (flat string kept in address_line_1)
      IF v_address IS NOT NULL THEN
        INSERT INTO evomail.subscriber_address
          (fk_subscriber_id, address_line_1, address_line_2, city, state_province, postal_code, country,
           is_primary, create_user_id, last_mod_user_id)
        VALUES
          (v_subscriber_id, v_address, NULL, NULL, NULL, NULL, NULL,
           TRUE, 'system', 'system');
        -- If you prefer only the first ever address per PMB to be primary,
        -- you could flip is_primary to FALSE when another row for same PMB already exists.
      END IF;

      -- Insert note if present
      IF v_notes IS NOT NULL THEN
        INSERT INTO evomail.subscriber_note
          (fk_subscriber_id, note_text, note_ts, note_user_id, note_type_cd, create_user_id, last_mod_user_id)
        VALUES
          (v_subscriber_id, v_notes, now(), 'system', 'user', 'system', 'system');
      END IF;

    EXCEPTION
      WHEN others THEN
        -- Log the row and keep going
        RAISE NOTICE '[ERROR] Failed to insert subscriber for PMB %: %', v_pmb, SQLERRM;
        CONTINUE;
    END;
  END LOOP;

  RAISE NOTICE 'Row-by-row migration completed.';
END;
$migrate$;


/*
  Update bcg status for closed accounts that so not have a bcg status
*/

Select ss.status_cd, count(*)
  From subscriber s, status ss
 Where s.fk_status_id = ss.status_id
   And s.fk_bcg_status_id is null
Group by ss.status_cd;

UPDATE evomail.subscriber s
SET fk_bcg_status_id = bs.bcg_status_id
FROM evomail.status st
JOIN evomail.bcg_status bs
  ON lower(bs.bcg_status_cd) = 'closed'
WHERE st.status_id = s.fk_status_id
  AND lower(st.status_cd) = 'closed'
  AND s.fk_bcg_status_id is null
  AND s.fk_bcg_status_id IS DISTINCT FROM bs.bcg_status_id;

Select ss.status_cd, count(*)
  From subscriber s, status ss
 Where s.fk_status_id = ss.status_id
   And s.fk_bcg_status_id is null
Group by ss.status_cd;


-- Quick checks

--SELECT COUNT(*) FROM evomail.subscriber;

--SELECT pmb, COUNT(*) FROM evomail.subscriber GROUP BY pmb HAVING COUNT(*) > 1 ORDER BY COUNT(*) DESC;


/*

-- Fix addresses:

-- Parse + fill structured address fields for US addresses
-- Assumes table: evomail.subscriber_address(address_id, address_line_1/2, city, state_province, postal_code, country)

WITH tofix AS (
  SELECT
    a.address_id,
    -- normalise whitespace, strip trailing commas/spaces
    regexp_replace(regexp_replace(btrim(a.address_line_1), '[\s,]+$', '', 'g'), '\s+', ' ', 'g') AS norm
  FROM evomail.subscriber_address a
  WHERE (a.city IS NULL OR a.state_province IS NULL OR a.postal_code IS NULL)
),
-- match "... <city> <state> <zip>" at end; commas/spaces both OK; allow junk after ZIP
m AS (
  SELECT
    f.address_id,
    f.norm,
    regexp_matches(
      f.norm,
      '([A-Za-z.\- ]+)[,\s]+([A-Za-z]{2})[,\s]+(\d{5}(?:-\d{4})?)(?:\D.*)?$',
      'i'
    ) AS arr
  FROM tofix f
),
parts AS (
  SELECT
    m.address_id,
    m.norm,
    (m.arr)[1]                             AS city_raw,
    upper((m.arr)[2])                      AS state_any,
    (m.arr)[3]                             AS zip_raw,
    -- remove " <city> <state> <zip>..." from the end to get the street/units part
    btrim(
      regexp_replace(
        m.norm,
        '[,\s]*[A-Za-z.\- ]+[,\s]+[A-Za-z]{2}[,\s]+\d{5}(?:-\d{4})?(?:\D.*)?$',
        ''
      )
    )                                       AS street_raw
  FROM m
),
us_only AS (
  -- keep only rows where the "state" is a real US postal abbrev
  SELECT
    p.address_id,
    p.street_raw,
    initcap(btrim(p.city_raw))              AS city,
    p.state_any                             AS state,
    p.zip_raw                               AS zip
  FROM parts p
  WHERE p.state_any = ANY (ARRAY[
    'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA',
    'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM',
    'NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VA','VT','WA',
    'WI','WV','PR'
  ])
),
split_unit AS (
  -- Pull Apt/Unit/Ste/# into address_line_2 when present (at end of street)
  SELECT
    u.address_id,
    CASE
      WHEN u.street_raw ~* '\b(apt|apartment|unit|ste|suite|bldg|fl|floor|rm|room|#)\b'
        THEN btrim(regexp_replace(
               u.street_raw,
               '(?i)\s*,?\s*(apt|apartment|unit|ste|suite|bldg|fl|floor|rm|room|#)\s*([A-Za-z0-9\-]+.*)$',
               ''
             ))
      ELSE btrim(u.street_raw)
    END AS addr1,
    CASE
      WHEN u.street_raw ~* '\b(apt|apartment|unit|ste|suite|bldg|fl|floor|rm|room|#)\b'
        THEN btrim(regexp_replace(
               u.street_raw,
               '(?i)^(.*?)(?:,?\s*)?(apt|apartment|unit|ste|suite|bldg|fl|floor|rm|room|#)\s*([A-Za-z0-9\-]+.*)$',
               '\2 \3'
             ))
      ELSE NULL
    END AS addr2,
    u.city,
    u.state,
    u.zip
  FROM us_only u
)
UPDATE evomail.subscriber_address a
SET
  address_line_1 = COALESCE(s.addr1, a.address_line_1),
  address_line_2 = COALESCE(NULLIF(s.addr2, ''), a.address_line_2),
  city           = COALESCE(NULLIF(s.city, ''), a.city),
  state_province = COALESCE(NULLIF(s.state, ''), a.state_province),
  postal_code    = COALESCE(NULLIF(s.zip, ''), a.postal_code),
  country        = COALESCE('USA', a.country)   -- default USA when we successfully parsed a US state+ZIP
FROM split_unit s
WHERE a.address_id = s.address_id;


*/

