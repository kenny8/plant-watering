console.log('Loading Login.jsx...');

if (!window.React || !window.AuthContext) {
  console.error('Login.jsx: React or AuthContext not loaded');
  throw new Error('React or AuthContext not loaded');
}

const React = window.React;
const { useState } = React;
const { useAuth } = window.AuthContext;

function Login() {
  console.log('Login.jsx: Rendering');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('Login.jsx: Login attempt:', username);
    const success = await login(username, password);
    if (success) {
      console.log('Login.jsx: Login success');
      window.history.pushState({}, '', '/');
    } else {
      console.log('Login.jsx: Login failed');
      setError('Неверный логин или пароль');
    }
  };

  return React.createElement(
    'div',
    { className: 'flex items-center justify-center min-h-screen bg-gray-100' },
    React.createElement(
      'div',
      { className: 'bg-white p-8 rounded-lg shadow-md w-full max-w-md' },
      React.createElement('h2', { className: 'text-2xl font-bold text-center text-blue-600' }, 'Вход'),
      error && React.createElement('p', { className: 'text-red-500 text-center mt-2' }, error),
      React.createElement(
        'form',
        { onSubmit: handleSubmit, className: 'mt-4' },
        React.createElement(
          'div',
          { className: 'mb-4' },
          React.createElement('label', { className: 'block text-gray-700 text-sm font-bold mb-2' }, 'Логин'),
          React.createElement('input', {
            type: 'text',
            value: username,
            onChange: (e) => setUsername(e.target.value),
            className: 'w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
            placeholder: 'Введите логин'
          })
        ),
        React.createElement(
          'div',
          { className: 'mb-6' },
          React.createElement('label', { className: 'block text-gray-700 text-sm font-bold mb-2' }, 'Пароль'),
          React.createElement('input', {
            type: 'password',
            value: password,
            onChange: (e) => setPassword(e.target.value),
            className: 'w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
            placeholder: 'Введите пароль'
          })
        ),
        React.createElement(
          'button',
          {
            type: 'submit',
            className: 'w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
          },
          'Войти'
        )
      )
    )
  );
}

window.Login = Login;
console.log('Login.jsx: Login exported:', window.Login);