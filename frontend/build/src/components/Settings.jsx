console.log('Loading Settings.jsx...');

if (!window.React || !window.AuthContext) {
  console.error('Settings.jsx: React or AuthContext not loaded');
  throw new Error('React or AuthContext not loaded');
}

const React = window.React;
const { useState, useEffect } = React;
const { useAuth } = window.AuthContext;

function Settings() {
  console.log('Settings.jsx: Rendering');
  const { token } = useAuth();
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [botProxyUrl, setBotProxyUrl] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    console.log('Settings.jsx: Checking saved bot token and proxy');
    const savedToken = localStorage.getItem('telegram_bot_token') || '';
    const savedProxy = localStorage.getItem('bot_proxy_url') || '';
    setTelegramBotToken(savedToken);
    setBotProxyUrl(savedProxy);
  }, []);

  const handleSave = async () => {
    console.log('Settings.jsx: Saving bot token:', telegramBotToken, 'proxy:', botProxyUrl);
    if (!token) {
      console.error('Settings.jsx: No auth token available');
      setMessage('Ошибка: Вы не авторизованы');
      return;
    }

    try {
      const response = await window.axios.post(
        '/api/settings/bot-token',
        { 
          telegram_bot_token: telegramBotToken,
          bot_proxy_url: botProxyUrl
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('Settings.jsx: Save response:', response.data);
      localStorage.setItem('telegram_bot_token', telegramBotToken);
      localStorage.setItem('bot_proxy_url', botProxyUrl);
      setMessage('Настройки сохранены успешно!');
    } catch (error) {
      console.error('Settings.jsx: Save failed:', error.response?.data || error.message);
      setMessage('Ошибка при сохранении настроек');
    }
  };

  return React.createElement(
    'div',
    { className: 'flex flex-col items-center min-h-screen bg-gray-100 py-8' },
    React.createElement(
      'div',
      { className: 'w-full max-w-4xl' },
      
      // Заголовок
      React.createElement('h1', { 
        className: 'text-3xl font-bold text-center text-blue-600 mb-8' 
      }, 'Настройки'),
      
      // Содержимое без лишнего контейнера
      React.createElement('h2', { 
        className: 'text-xl font-semibold text-gray-700 mb-4' 
      }, 'Настройка Telegram бота'),
      
      React.createElement(
        'div',
        { className: 'mb-4' },
        React.createElement('label', { 
          className: 'block text-gray-700 text-sm font-bold mb-2' 
        }, 'Токен Telegram бота'),
        React.createElement('input', {
          type: 'text',
          value: telegramBotToken,
          onChange: (e) => setTelegramBotToken(e.target.value),
          className: 'w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
          placeholder: 'Введите токен Telegram бота'
        })
      ),
      
      React.createElement(
        'div',
        { className: 'mb-4' },
        React.createElement('label', { 
          className: 'block text-gray-700 text-sm font-bold mb-2' 
        }, 'Proxy URL для бота (Cloudflare Workers)'),
        React.createElement('input', {
          type: 'text',
          value: botProxyUrl,
          onChange: (e) => setBotProxyUrl(e.target.value),
          className: 'w-full px-3 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500',
          placeholder: 'https://your-proxy.workers.dev/bot'
        }),
        React.createElement('p', {
          className: 'text-xs text-gray-500 mt-1'
        }, 'Формат: https://имя-прокси.workers.dev/bot')
      ),
      
      React.createElement(
        'button',
        {
          onClick: handleSave,
          className: 'bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
        },
        'Сохранить'
      ),
      
      message && React.createElement('p', { 
        className: `mt-4 ${message.includes('Ошибка') ? 'text-red-500' : 'text-green-600'}` 
      }, message)
    )
  );
}

window.Settings = Settings;
console.log('Settings.jsx: Settings exported:', window.Settings);