console.log('Loading AuthContext.jsx...');

if (!window.React) {
  console.error('AuthContext.jsx: React is not loaded');
  throw new Error('React is not loaded');
}

const React = window.React;
const { useState, useEffect } = React;

// Инициализация глобального состояния
window.authState = window.authState || {
  isAuthenticated: false,
  token: null,
  listeners: []
};

// Функция для уведомления всех слушателей об изменении состояния
function notifyListeners() {
  console.log('AuthContext: Notifying listeners with state:', window.authState);
  window.authState.listeners.forEach(listener => listener(window.authState));
}

// Глобальные функции login и logout
async function login(username, password) {
  try {
    console.log('AuthContext: Login attempt:', username);
    const response = await window.axios.post('/api/auth/login', { username, password });
    console.log('AuthContext: Login response:', response.data);
    window.authState = {
      ...window.authState,
      isAuthenticated: true,
      token: response.data.token
    };
    localStorage.setItem('token', response.data.token);
    notifyListeners();
    return true;
  } catch (error) {
    console.error('AuthContext: Login failed:', error.response?.data || error.message);
    return false;
  }
}

function logout() {
  console.log('AuthContext: Logging out');
  window.authState = {
    ...window.authState,
    isAuthenticated: false,
    token: null
  };
  localStorage.removeItem('token');
  notifyListeners();
  window.history.pushState({}, '', '/login');
}

// Компонент AuthProvider
function AuthProvider(props) {
  console.log('AuthProvider: Rendering with props:', props);
  if (!props || !props.children) {
    console.error('AuthProvider: No children provided');
    return React.createElement('div', { className: 'text-red-500 text-center' }, 'Error: No children provided');
  }

  return React.createElement('div', null, props.children);
}

// Хук useAuth для доступа к состоянию и функциям
function useAuth() {
  const [state, setState] = useState(window.authState);

  useEffect(() => {
    console.log('useAuth: Subscribing to authState changes');
    const listener = (newState) => {
      console.log('useAuth: State updated:', newState);
      setState({ ...newState });
    };
    window.authState.listeners.push(listener);
    return () => {
      console.log('useAuth: Unsubscribing from authState changes');
      window.authState.listeners = window.authState.listeners.filter(l => l !== listener);
    };
  }, []);

  return {
    isAuthenticated: state.isAuthenticated,
    token: state.token,
    login: login,
    logout: logout
  };
}

// Проверка загрузки axios
if (!window.axios) {
  console.error('AuthContext.jsx: Axios is not loaded');
  throw new Error('Axios is not loaded');
}

// Экспорт
window.AuthContext = { AuthProvider, useAuth };
console.log('AuthContext.jsx: AuthContext exported:', window.AuthContext);