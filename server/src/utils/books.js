import {badRequest} from './response.js';

export const BOOK_GENRES=['textbook','exam','reading','other'];
export const BOOK_NOTES=['none','light','heavy','unknown'];
export const isBookCategory=slug=>['book','books'].includes(slug);

/** 空 ISBN 可省略；填写时接受 ISBN-10 / ISBN-13，含校验位检查。 */
function validIsbn(value){
 if(!value)return true;
 if(/^\d{13}$/.test(value))return [...value].reduce((sum,n,i)=>sum+Number(n)*(i%2?3:1),0)%10===0;
 if(/^\d{9}[\dX]$/.test(value))return [...value].reduce((sum,n,i)=>sum+(n==='X'?10:Number(n))*(10-i),0)%11===0;
 return false;
}
export function normalizeBook(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw badRequest('书籍信息格式不正确');
 const result={};
 for(const [name,max] of [['author',100],['publisher',100],['edition',60],['isbn',30],['course',80]]){
  const field=value[name]??'';
  if(typeof field!=='string'||field.trim().length>max)throw badRequest('书籍字段格式或长度不正确');
  result[name]=field.trim();
 }
 result.isbn=result.isbn.replace(/[\s-]/g,'').toUpperCase();
 if(!validIsbn(result.isbn))throw badRequest('ISBN 格式或校验位不正确，可留空后补充');
 result.genre=value.genre??'textbook';result.annotation=value.annotation??'unknown';
 if(!BOOK_GENRES.includes(result.genre))throw badRequest('书籍类型不正确');
 if(!BOOK_NOTES.includes(result.annotation))throw badRequest('笔记程度不正确');
 return result;
}
export async function saveBook(conn,itemId,book){
 await conn.execute(`INSERT INTO item_books(item_id,author,publisher,edition,isbn,course,genre,annotation)
  VALUES (?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE author=VALUES(author),publisher=VALUES(publisher),edition=VALUES(edition),isbn=VALUES(isbn),course=VALUES(course),genre=VALUES(genre),annotation=VALUES(annotation)`,
 [itemId,book.author,book.publisher,book.edition,book.isbn,book.course,book.genre,book.annotation]);
}
