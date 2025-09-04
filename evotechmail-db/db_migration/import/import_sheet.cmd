
REM =======================
REM CONFIG — EDIT THESE
REM =======================
set "PGHOST=localhost"
set "PGPORT=5444"
set "PGDATABASE=evotechmail"
set "PGUSER=postgres"
set "PGPASSWORD=postgres"

set "PGSCHEMA=evomail"
set "PGTABLE=google_sheet"

set PGPASSWORD=postgres

REM TSV file path. You can also pass it as the first argument to this .bat.
set "TSV_FILE=E:\dev\evogit\evotechmail-db\import\allsubscribers.tsv"


REM =======================
REM IMPORT TSV
REM: =======================
echo [INFO] Importing "%TSV_FILE%" into %PGSCHEMA%.%PGTABLE% ...

psql -h "%PGHOST%" -p %PGPORT% -U "%PGUSER%" -d "%PGDATABASE%" -c ^
"\copy %PGSCHEMA%.%PGTABLE% (pmb, first_name, last_name, company, phone, email, address, status, source, bcg, notes) FROM "%TSV_FILE%" WITH (FORMAT csv, DELIMITER E'\t', HEADER true, NULL '', QUOTE '\"')"


echo [OK] Import completed.
exit /b 0