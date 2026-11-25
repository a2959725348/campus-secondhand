import request from './request';

// ---------- 认证 ----------
export const register = (data) => request.post('/auth/register', data);
export const login = (data) => request.post('/auth/login', data);
export const fetchMe = () => request.get('/auth/me');
export const updateMe = (data) => request.put('/auth/me', data);

// ---------- 分类 ----------
export const fetchCategories = () => request.get('/categories');

// ---------- 商品 ----------
export const fetchItems = (params) => request.get('/items', { params });
export const fetchItemDetail = (id) => request.get(`/items/${id}`);
export const createItem = (data) => request.post('/items', data);
export const updateItem = (id, data) => request.put(`/items/${id}`, data);
export const deleteItem = (id) => request.delete(`/items/${id}`);
export const fetchMyItems = (params) => request.get('/items/mine/list', { params });

/** 图片上传：用 FormData 走 multipart，返回可直接存库的 url */
export const uploadImage = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return request.post('/items/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// ---------- 订单 ----------
export const createOrder = (data) => request.post('/orders', data);
export const fetchOrders = (params) => request.get('/orders', { params });
export const completeOrder = (id) => request.put(`/orders/${id}/complete`);
export const cancelOrder = (id) => request.put(`/orders/${id}/cancel`);

// ---------- 收藏 ----------
export const fetchFavorites = (params) => request.get('/favorites', { params });
export const addFavorite = (itemId) => request.post(`/favorites/${itemId}`);
export const removeFavorite = (itemId) => request.delete(`/favorites/${itemId}`);

// Community: public reads, authenticated writes, real database persistence.
export const fetchQuestions=(id,params)=>request.get(`/community/items/${id}/questions`,{params});
export const postQuestion=(id,data)=>request.post(`/community/items/${id}/questions`,data);
export const replyQuestion=(id,data)=>request.put(`/community/questions/${id}/reply`,data);
export const fetchReviews=(id,params)=>request.get(`/community/items/${id}/reviews`,{params});
export const postReview=(id,data)=>request.post(`/community/orders/${id}/review`,data);
export const fetchOverview=()=>request.get('/community/me/overview');

// ---------- 正式交易与后台 ----------
export const fetchAddresses=()=>request.get('/addresses');
export const createAddress=data=>request.post('/addresses',data);
export const updateAddress=(id,data)=>request.put(`/addresses/${id}`,data);
export const deleteAddress=id=>request.delete(`/addresses/${id}`);
export const setDefaultAddress=id=>request.put(`/addresses/${id}/default`);
export const fetchOrder=id=>request.get(`/orders/${id}`);
export const shipOrder=(id,data)=>request.put(`/orders/${id}/ship`,data);
export const changePassword=data=>request.put('/auth/password',data);
export const adminOverview=()=>request.get('/admin/overview');
export const adminOrders=params=>request.get('/admin/orders',{params});
export const adminOrder=id=>request.get(`/admin/orders/${id}`);
export const adminCancelOrder=(id,data)=>request.put(`/admin/orders/${id}/cancel`,data);
export const adminItems=params=>request.get('/admin/items',{params});
export const adminItemStatus=(id,data)=>request.put(`/admin/items/${id}/status`,data);
export const adminUsers=params=>request.get('/admin/users',{params});
export const adminUserStatus=(id,data)=>request.put(`/admin/users/${id}/status`,data);
export const adminAudit=params=>request.get('/admin/audit',{params});
