import api from "./api";

const investmentService = {
  searchInstruments: (type, q, signal) => api.get("/investments/instruments", { params: { type, q }, signal }).then((r) => r.data.results),
  getQuote: (provider, instrument_id, signal) => api.get("/investments/instruments/quote", { params: { provider, instrument_id }, signal }).then((r) => r.data.quote),
  calculate: (payload, signal) => api.post("/investments/calculate", payload, { signal }).then((r) => r.data),
  list: (filters = {}) => api.get("/investments", { params: filters }).then((r) => r.data),
  summary: (month) => api.get("/investments/summary", { params: { month } }).then((r) => r.data),
  create: (payload) => api.post("/investments", payload).then((r) => r.data),
  update: (id, payload) => api.put(`/investments/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/investments/${id}`).then((r) => r.data),
  syncPrices: (month, automatic = false) =>
    api.post("/investments/sync-prices", {}, { params: { ...(month ? { month } : {}), ...(automatic ? { automatic: "true" } : {}) } }).then((r) => r.data),
  syncSinglePrice: (id) => api.post(`/investments/${id}/sync-price`).then((r) => r.data),
};

export default investmentService;
