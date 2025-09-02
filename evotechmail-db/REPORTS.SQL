#1
Subscriber Turn Ins/Outs

#TITLE# Subscribers by status

Select ss.status_cd as "Status", count(*) as "Count"
  From subscriber s, evomail.status ss
 Where s.fk_status_id = ss.status_id
Group by ss.status_cd
Order by 2 desc;

#TITLE# Weekly changes

Select DATE_TRUNC('week', s.last_status_ts ) as "Week Start", ss.status_cd as "Status", count(*) as "Count"
  From evomail.subscriber s, evomail.status ss
 Where s.fk_status_id = ss.status_id
   And s.last_status_ts is not null
Group by 1,2
Order by 1 asc, 2 desc;

#TITLE# Monthly Changes

Select DATE_TRUNC('month', s.last_status_ts ) as "Month Start", ss.status_cd as "Status", count(*) as "Count"
  From evomail.subscriber s, evomail.status ss
 Where s.fk_status_id = ss.status_id
   And s.last_status_ts is not null
Group by 1,2
Order by 1 asc, 2 desc;

#2
Compliance Reports

#TITLE# Overall Compliance(Non closed accounts)

Select case when s.usps_compliant then 'Yes'
            else 'No'
       end as "Compliant" , count(*) as "Count"
  From subscriber s, evomail.status ss
 Where s.fk_status_id = ss.status_id
   And lower(ss.status_cd) != 'closed'
Group by s.usps_compliant
Order by 2 desc;

#TITLE# Compliance vs Subscriber status

Select ss.status_cd as "Status", 
       case when s.usps_compliant then 'Yes'
            else 'No'
       end as "Compliant" , count(*) as "Count"
  From subscriber s, evomail.status ss
 Where s.fk_status_id = ss.status_id
   And lower(ss.status_cd) != 'closed'
Group by ss.status_cd, s.usps_compliant
Order by 2 desc;

#TITLE# Compliance vs USPS BCG status

Select bs.bcg_status_cd as "BCG Status", 
       case when s.usps_compliant then 'Yes'
            else 'No'
       end as "Compliant" , count(*) as "Count"
  From subscriber s, evomail.bcg_status bs, evomail.status ss
 Where s.fk_status_id = ss.status_id
    And lower(ss.status_cd) != 'closed'
   And s.fk_bcg_status_id = bs.bcg_status_id
Group by bs.bcg_status_cd, s.usps_compliant
Order by 2 desc;


#TITLE# Compliance vs Status and USPS BCG status

Select ss.status_cd as "Status" , bs.bcg_status_cd as "BCG Status", 
       case when s.usps_compliant then 'Yes'
            else 'No'
       end as "Compliant" , count(*) as "Count"
  From subscriber s, evomail.bcg_status bs, evomail.status ss
 Where s.fk_status_id = ss.status_id
    And lower(ss.status_cd) != 'closed'
   And s.fk_bcg_status_id = bs.bcg_status_id
Group by ss.status_cd, bs.bcg_status_cd, s.usps_compliant
Order by 1 desc,3 asc;
