set search_path to evomail;

DROP TABLE IF EXISTS google_sheet;

CREATE TABLE IF NOT EXISTS google_sheet
(
  PMB              text,
  first_name       text,
  last_name        text,
  Company          text,
  Phone            text,
  Email            text,
  address          text,
  status           text,
  source           text,
  bcg              text,
  notes            text
);
