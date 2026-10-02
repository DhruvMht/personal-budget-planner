import axios from "axios";

function getBaseUrl() {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  if (typeof window !== "undefined") {
    const { protocol, hostname, port } = window.location;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      if (port === "5000" || port === "80" || port === "" || port === "443") {
        return `${protocol}//${hostname}${port ? ":" + port : ""}/api`;
      }
      return `${protocol}//${hostname}:5000/api`;
    }
  }
  return "http://localhost:5000/api";
}

const api = axios.create({
  baseURL: getBaseUrl(),
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("bp_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && localStorage.getItem("bp_token")) {
      localStorage.removeItem("bp_token");
      localStorage.removeItem("bp_user");
      if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

/** Turns any axios/network failure into a readable message for the UI. */
export function getErrorMessage(error) {
  return (
    error?.response?.data?.message ||
    error?.message ||
    "Something went wrong. Please try again."
  );
}

export default api;
