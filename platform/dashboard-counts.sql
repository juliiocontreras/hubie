-- Counts for C008 dashboard. 6 bound organization_id arguments. Never show disabled tools.
SELECT metrics.tool_id, SUM(metrics.qty) AS total
FROM (
 SELECT tr.tool_id, COUNT(*) AS qty
 FROM tenant_tool_records tr
 WHERE tr.organization_id = ? AND tr.archived_at IS NULL
   AND tr.tool_id NOT IN ('C001','C002','C004','C005')
 GROUP BY tr.tool_id
 UNION ALL
 SELECT 'C001' AS tool_id, COUNT(*) AS qty FROM tenant_client_profiles WHERE organization_id = ? AND archived_at IS NULL
 UNION ALL
 SELECT 'C002' AS tool_id, COUNT(*) AS qty FROM tenant_crm_deals WHERE organization_id = ? AND archived_at IS NULL
 UNION ALL
 SELECT 'C004' AS tool_id, COUNT(*) AS qty FROM tenant_schedule_events WHERE organization_id = ?
 UNION ALL
 SELECT 'C005' AS tool_id, COUNT(*) AS qty FROM tenant_inventory_items WHERE organization_id = ? AND archived_at IS NULL
) AS metrics
JOIN tenant_tools tt ON tt.organization_id = ? AND tt.tool_id = metrics.tool_id AND tt.enabled = 1
GROUP BY metrics.tool_id
HAVING SUM(metrics.qty)>0;
