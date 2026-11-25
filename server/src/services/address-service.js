import { notFound } from '../utils/response.js';

export const ADDRESS_FIELDS = 'receiver_name AS receiverName, phone, province, city, district, detail, label';

export async function addressSnapshot(conn, userId, addressId) {
  const [[address]] = await conn.execute(
    `SELECT ${ADDRESS_FIELDS} FROM addresses WHERE id=? AND user_id=?`,
    [addressId, userId],
  );
  if (!address) throw notFound('收货地址不存在');
  return address;
}
