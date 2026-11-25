export async function recordAudit(conn, actor, action, targetType, targetId, detail) {
  await conn.execute(
    'INSERT INTO admin_audit (actor_name, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)',
    [actor.username, action, targetType, targetId, detail],
  );
}
