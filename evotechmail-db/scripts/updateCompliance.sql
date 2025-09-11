

Select count(*)
  From evomail.subscriber s
 Where s.fk_status_id = (Select status_id from evomail.status where lower(status_cd) = 'closed')
   And s.fk_bcg_status_id = (Select bcg_status_id from evomail.bcg_status where lower(bcg_status_cd) = 'closed')
   And NOT usps_compliant
;

--304

update evomail.subscriber s
   set usps_compliant = true
 Where s.fk_status_id = (Select status_id from evomail.status where lower(status_cd) = 'closed')
   And s.fk_bcg_status_id = (Select bcg_status_id from evomail.bcg_status where lower(bcg_status_cd) = 'closed')
   And NOT usps_compliant
;

--304

commit;

