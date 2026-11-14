import api from '../../../shared/api/axiosInstance';

const data = (response) => response?.data?.__raw ?? response?.data ?? response;

export const palkibusAdminService = {
  listDhabas: (search = '') => api.get('/admin/palkibus/dhabas', { params: { search } }).then(data),
  createDhaba: (payload) => api.post('/admin/palkibus/dhabas', payload).then(data),
  updateDhaba: (id, payload) => api.patch(`/admin/palkibus/dhabas/${id}`, payload).then(data),
  deleteDhaba: (id) => api.delete(`/admin/palkibus/dhabas/${id}`).then(data),
  listDhabaOrders: (params = {}) => api.get('/admin/palkibus/dhaba-orders', { params }).then(data),
  pendingDhabaCount: () => api.get('/admin/palkibus/dhabas/pending-count').then(data),
  approveDhaba: (id, payload = {}) => api.post(`/admin/palkibus/dhabas/${id}/approve`, payload).then(data),
  rejectDhaba: (id, reason) => api.post(`/admin/palkibus/dhabas/${id}/reject`, { reason }).then(data),
  dhabaMenu: (id) => api.get(`/admin/palkibus/dhabas/${id}/menu`).then(data),
  addDhabaMenuItem: (id, payload) => api.post(`/admin/palkibus/dhabas/${id}/menu`, payload).then(data),
  updateDhabaMenuItem: (id, itemId, payload) => api.patch(`/admin/palkibus/dhabas/${id}/menu/${itemId}`, payload).then(data),
  deleteDhabaMenuItem: (id, itemId) => api.delete(`/admin/palkibus/dhabas/${id}/menu/${itemId}`).then(data),
  foodCategories: () => api.get('/admin/palkibus/food-categories').then(data),
  createFoodCategory: (payload) => api.post('/admin/palkibus/food-categories', payload).then(data),
  updateFoodCategory: (id, payload) => api.patch(`/admin/palkibus/food-categories/${id}`, payload).then(data),
  deleteFoodCategory: (id) => api.delete(`/admin/palkibus/food-categories/${id}`).then(data),
  reorderFoodCategories: (ids) => api.post('/admin/palkibus/food-categories/reorder', { ids }).then(data),
  dhabaPayouts: () => api.get('/admin/palkibus/dhaba-payouts').then(data),
  dhabaLedger: (id) => api.get(`/admin/palkibus/dhabas/${id}/ledger`).then(data),
  recordDhabaPayout: (id, payload) => api.post(`/admin/palkibus/dhabas/${id}/payouts`, payload).then(data),
  deleteDhabaPayout: (id, payoutId) => api.delete(`/admin/palkibus/dhabas/${id}/payouts/${payoutId}`).then(data),

  listChannels: () => api.get('/admin/palkibus/channels').then(data),
  createChannel: (payload) => api.post('/admin/palkibus/channels', payload).then(data),
  updateChannel: (id, payload) => api.patch(`/admin/palkibus/channels/${id}`, payload).then(data),
  rotateChannelKey: (id) => api.post(`/admin/palkibus/channels/${id}/rotate-key`).then(data),
  listChannelEvents: (id) => api.get(`/admin/palkibus/channels/${id}/events`).then(data),

  tripInventory: (params) => api.get('/admin/palkibus/inventory', { params }).then(data),

  connectorTypes: () => api.get('/admin/palkibus/connector-types').then(data),
  syncChannelNow: (id) => api.post(`/admin/palkibus/channels/${id}/sync-now`).then(data),

  listOperators: () => api.get('/admin/palkibus/operators').then(data),
  createOperator: (payload) => api.post('/admin/palkibus/operators', payload).then(data),
  updateOperator: (id, payload) => api.patch(`/admin/palkibus/operators/${id}`, payload).then(data),
  operatorReport: (id, params) => api.get(`/admin/palkibus/operators/${id}/report`, { params }).then(data),
  searchOwners: (search) => api.get('/admin/palkibus/owners', { params: { search } }).then(data),
};
