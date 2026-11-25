// condition is a MySQL reserved word.
export const ITEM_LIST_FIELDS = `
  i.id, i.title, i.price, i.original_price AS originalPrice,
  i.item_condition AS \`condition\`, i.status, i.trade_place AS tradePlace,
  i.view_count AS viewCount, i.created_at AS createdAt,
  c.id AS categoryId, c.name AS categoryName,
  u.id AS sellerId, u.nickname AS sellerNickname, u.campus AS sellerCampus
`;

export const ITEM_BOOK_FIELDS = `
  b.genre AS bookGenre, b.course AS bookCourse, b.annotation AS bookAnnotation, b.edition AS bookEdition
`;

export const ITEM_COVER_FIELD = '(SELECT url FROM item_images im WHERE im.item_id=i.id ORDER BY im.sort, im.id LIMIT 1) AS cover';
