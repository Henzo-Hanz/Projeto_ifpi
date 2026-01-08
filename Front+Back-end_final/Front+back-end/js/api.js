const baseURL = "http://localhost:8000/api/";
const TIMEOUT = 10000; // 10 seconds
const RETRY_COUNT = 2;
const CACHE_TTL = 30000; // 30 seconds

let cache = new Map();

function getToken() {
  return localStorage.getItem('token');
}

function setToken(token) {
  localStorage.setItem('token', token);
}

function clearToken() {
  localStorage.removeItem('token');
}

function isNetworkError(error) {
  return error.name === 'TypeError' || error.message.includes('fetch');
}

async function apiRequest(endpoint, options = {}, useCache = false, cacheKey = null) {
  const url = baseURL + endpoint;

  // Check cache if enabled
  if (useCache && cacheKey) {
    const cached = getCached(cacheKey);
    if (cached) {
      if (window.apiDebug) console.log('Cache hit for', cacheKey, cached);
      return cached;
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  const token = getToken();
  if (token) {
    headers['Authorization'] = `Token ${token}`;
  }

  const config = {
    ...options,
    headers
  };

  let lastError;
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TIMEOUT);

      const response = await fetch(url, {
        ...config,
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (window.apiDebug) console.log('API Request:', url, config, 'Response:', response.status, response);

      if (!response.ok) {
        if (response.status === 401) {
          clearToken();
          window.location.href = 'login.html';
          throw new Error('Unauthorized');
        }
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      if (window.apiDebug) console.log('API Response data:', data);

      // Cache if enabled
      if (useCache && cacheKey) {
        setCached(cacheKey, data);
      }

      return data;
    } catch (error) {
      lastError = error;
      if (window.apiDebug) console.error('API Error:', error);
      if (isNetworkError(error) && attempt < RETRY_COUNT) {
        continue; // retry
      }
      break;
    }
  }

  // Centralized error handler
  handleApiError(lastError);
  throw lastError;
}

function getCached(key) {
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL) {
    return item.data;
  }
  cache.delete(key);
  return null;
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function handleApiError(error) {
  // Show friendly error messages
  let message = 'An error occurred. Please try again.';
  if (error.message.includes('401')) {
    message = 'Session expired. Redirecting to login.';
  } else if (error.message.includes('403')) {
    message = 'Permission denied.';
  } else if (error.message.includes('404')) {
    message = 'Not found.';
  } else if (error.message.includes('500')) {
    message = 'Server error. Please try later.';
  } else if (isNetworkError(error)) {
    message = 'Network error. Check your connection.';
  }
  alert(message); // Simple UX, can be improved with DOM
}

// Auth methods
async function login(email, password) {
  const data = await apiRequest('auth/login/', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  setToken(data.token);
  return data;
}

async function register(nome, email, password, password2) {
  const data = await apiRequest('auth/register/', {
    method: 'POST',
    body: JSON.stringify({ nome, email, password, password2 })
  });
  setToken(data.token);
  return data;
}

async function logout() {
  await apiRequest('auth/logout/', { method: 'POST' });
  clearToken();
  window.location.href = 'login.html';
}

async function getProfile() {
  return await apiRequest('auth/profile/');
}

async function updateProfile(nome) {
  return await apiRequest('auth/profile/', {
    method: 'PUT',
    body: JSON.stringify({ nome })
  });
}

// News methods
async function getNews(filters = {}) {
  const query = new URLSearchParams(filters).toString();
  const endpoint = `news/?${query}`;
  return await apiRequest(endpoint, {}, true, `news-${query}`);
}

async function getNewsById(id) {
  return await apiRequest(`news/${id}/`, {}, true, `news-${id}`);
}

async function getMyNews() {
  return await apiRequest('news/my/');
}

async function getHomeNews() {
  return await apiRequest('news/home/', {}, true, 'home-news');
}

async function createNews(data) {
  return await apiRequest('news/', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

async function updateNews(id, data) {
  return await apiRequest(`news/${id}/`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

async function deleteNews(id) {
  return await apiRequest(`news/${id}/`, {
    method: 'DELETE'
  });
}

// Comments methods
async function getComments(newsId) {
  return await apiRequest(`comments/?news=${newsId}`);
}

async function createComment(newsId, conteudo) {
  return await apiRequest('comments/', {
    method: 'POST',
    body: JSON.stringify({ news: newsId, conteudo })
  });
}

async function updateComment(id, conteudo) {
  return await apiRequest(`comments/${id}/`, {
    method: 'PUT',
    body: JSON.stringify({ conteudo })
  });
}

async function deleteComment(id) {
  return await apiRequest(`comments/${id}/`, {
    method: 'DELETE'
  });
}

// Expose to window for global access
window.api = {
  login,
  register,
  logout,
  getProfile,
  updateProfile,
  getNews,
  getNewsById,
  getMyNews,
  getHomeNews,
  createNews,
  updateNews,
  deleteNews,
  getComments,
  createComment,
  updateComment,
  deleteComment
};

// Debug mode
window.apiDebug = false;