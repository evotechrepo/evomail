


Select mp.partner_cd, st.status_cd, count(*)
  From subscriber s, status st, mail_partner mp
 Where s.fk_status_id = st.status_id
   And s.fk_mail_partner_id = mp.mail_partner_id
   And st.status_cd = 'active'
Group by mp.partner_cd, st.status_cd;

Select mp.partner_cd, st.status_cd, count(*)
  From subscriber s, status st, mail_partner mp
 Where s.fk_status_id = st.status_id
   And s.fk_mail_partner_id = mp.mail_partner_id
   And st.status_cd = 'closed'
Group by mp.partner_cd, st.status_cd;




Select mp.partner_cd, st.status_cd, count(*)
  From subscriber s, status st, mail_partner mp
 Where s.fk_status_id = st.status_id
   And s.fk_mail_partner_id = mp.mail_partner_id
Group by mp.partner_cd, st.status_cd
order by mp.partner_cd asc;


Select sum(a.cnt)::int as "Total Active Subscribers" from
(
Select mp.partner_cd, st.status_cd, count(*) cnt
  From subscriber s, status st, mail_partner mp
 Where s.fk_status_id = st.status_id
   And s.fk_mail_partner_id = mp.mail_partner_id
   And st.status_cd = 'active'
Group by mp.partner_cd, st.status_cd
) a;


SELECT version();



    SELECT
      v.pmb, v.first_name, v.last_name, COALESCE(v.company,'Individual') AS company,
      v.phone, v.email, v.primary_address, LOWER(COALESCE(v.status,'')) AS status,
      v.source, v.bcg, v.notes
    FROM evomail.subscriber_vw v
    ORDER BY CASE LOWER(COALESCE(v.status,''))
              WHEN 'active'     THEN 0
              WHEN 'owner'      THEN 2
              WHEN 'onboarding' THEN 1
              ELSE 9
          END, v.pmb::int asc;


WITH activesubsperpartner AS 
     (
	  SELECT mp.partner_cd AS partner,
		     COUNT(*)::int  AS acnt
	    FROM subscriber s
	    JOIN status       st ON st.status_id       = s.fk_status_id
	    JOIN mail_partner mp ON mp.mail_partner_id = s.fk_mail_partner_id
	   WHERE st.status_cd = 'active'
	  GROUP BY mp.partner_cd
     ),
     all_subs as
     (
	  SELECT initcap(st.status_cd) status, COUNT(*)::int  AS bcnt
	    FROM subscriber s
	    JOIN status       st ON st.status_id       = s.fk_status_id
	    JOIN mail_partner mp ON mp.mail_partner_id = s.fk_mail_partner_id
	  GROUP BY st.status_cd
     ),
     bcg_prompts as
     (
	  Select case when st.status_cd = 'closed' then '' else initcap(bs.bcg_status_cd) end bcg_status_cd, initcap(st.status_cd) status_cd,  count(*) ccnt 
		From subscriber s, status st, bcg_status bs
	   WHere s.fk_status_id = st.status_id
		 And s.fk_bcg_status_id = bs.bcg_status_id
		 And (
			  (
					bs.bcg_status_cd in ( 'new','update')
				And st.status_cd in ('onboarding','active')
			  )
			 OR
			  (
				   st.status_cd      = 'closed'
			   And bs.bcg_status_cd != 'closed'
			  )
			 )
	Group by case when st.status_cd = 'closed' then '' else initcap(bs.bcg_status_cd) end, initcap(st.status_cd)
     )
SELECT
  'Active Subscribers' || E'\n' ||
  COALESCE(
    (SELECT string_agg( a.partner || ' = ' || a.acnt, E'\n' ORDER BY a.acnt DESC, a.partner  ) FROM activesubsperpartner a) ,'') AS "Active Subscribers",
  COALESCE(
    (SELECT string_agg( b.status || ' = ' || b.bcnt, E'\n' ORDER BY b.bcnt DESC, b.status ) FROM all_subs b) ,'') AS "All Subscribers",
  COALESCE(
    (SELECT string_agg( trim(c.bcg_status_cd || ' ' || c.status_cd || ' = ' || c.ccnt), E'\n' ORDER BY c.ccnt DESC, c.status_cd ) FROM bcg_prompts c ) ,'') AS "USPS BCG Actions";
  
  
  
  


    SELECT
      v.subscriber_id,v.pmb, v.first_name, v.last_name, COALESCE(v.company,'Individual') AS company,
      v.phone, v.email, v.primary_address, LOWER(COALESCE(v.status,'')) AS status,
      v.source, v.bcg, v.notes_json, v.addresses_json
    FROM evomail.subscriber_vw v
;



      select *
        from evomail.subscriber s
        join evomail.status st on st.status_id = s.fk_status_id
       where s.pmb::text = '50'
         and lower(st.status_cd) <> 'closed'
       --limit 1
       ;



       
INSERT INTO notification (batch_id,attempt_no,last_attempt_ts,from_addr,subject,to_addrs,cc_addrs,bcc_addrs,body,delivery_meta,result_details,status,context,create_ts,create_user_id)
SELECT batch_id,attempt_no,last_attempt_ts,from_addr,subject,to_addrs,cc_addrs,bcc_addrs,body,delivery_meta,result_details,status,context,create_ts,create_user_id
  From notification;
       
       


      SELECT s.subscriber_id, s.pmb, s.first_name, s.last_name, s.company
      FROM evomail.subscriber s
      JOIN mail_partner p ON p.mail_partner_id = s.fk_mail_partner_id
      WHERE p.has_portal_yn = 'N';
      
      
      
SELECT mail_status_id FROM evomail.mail_status WHERE upper(mail_status_cd) = upper('INSERTED') LIMIT 1
       