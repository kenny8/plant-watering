console.log('Loading Devices.jsx...');

if (!window.React || !window.AuthContext) {
  console.error('Devices.jsx: React or AuthContext not loaded');
  throw new Error('React or AuthContext not loaded');
}

const React = window.React;
const { useState, useEffect } = React;
const { useAuth } = window.AuthContext;

function Devices() {
  console.log('Devices.jsx: Rendering');
  const { token } = useAuth();
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');
  const [builds, setBuilds] = useState({});

  useEffect(() => {
    console.log('Devices.jsx: Fetching devices and builds');
    if (!token) {
      console.error('Devices.jsx: No auth token available');
      setError('Ошибка: Вы не авторизованы');
      return;
    }

    // Загружаем сборки для получения человеческих имен
    window.axios
      .get('/api/builds', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => {
        console.log('Devices.jsx: Builds fetched:', response.data);
        const buildsMap = {};
        response.data.forEach(build => {
          buildsMap[build.id] = build.human_name;
        });
        setBuilds(buildsMap);
        
        // Загружаем устройства
        return window.axios.get('/api/devices', { headers: { Authorization: `Bearer ${token}` } });
      })
      .then((response) => {
        console.log('Devices.jsx: Devices fetched:', response.data);
        setDevices(response.data);
      })
      .catch((error) => {
        console.error('Devices.jsx: Fetch failed:', error.response?.data || error.message);
        setError('Ошибка при загрузке данных');
      });
  }, [token]);

  const handleDelete = async (id) => {
    console.log(`Devices.jsx: Delete button clicked for device id ${id}`);
    
    try {
      await window.axios.delete(`/api/devices/${id}`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      
      // Удаляем устройство из состояния
      setDevices(devices.filter(device => device.id !== id));
      console.log(`Devices.jsx: Device ${id} deleted successfully`);
    } catch (error) {
      console.error('Devices.jsx: Delete failed:', error.response?.data || error.message);
      setError('Ошибка при удалении устройства');
    }
  };

  const handleViewData = (device) => {
    console.log(`Devices.jsx: View data button clicked for device:`, device);
	// Переходим на страницу данных устройства
	window.history.pushState({}, '', `/device-data/${device.id}`);
	window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return React.createElement(
    'div',
    { className: 'flex flex-col items-center min-h-screen bg-gray-100 py-8' },
    React.createElement(
      'div',
      { className: 'w-full max-w-6xl' },
      React.createElement('h1', { className: 'text-2xl font-bold text-center text-blue-600 mb-6' }, 'Устройства'),
      error && React.createElement('p', { className: 'text-red-500 text-center mb-4' }, error),
      devices.length === 0 && !error
        ? React.createElement('p', { className: 'text-gray-600 text-center' }, 'Устройства отсутствуют')
        : React.createElement(
            'table',
            { className: 'w-full bg-white shadow-md rounded-lg overflow-hidden' },
            React.createElement(
              'thead',
              { className: 'bg-blue-600 text-white' },
              React.createElement(
                'tr',
                null,
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'ID устройства'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Человеческое имя'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Сборка'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Создано'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Действия')
              )
            ),
            React.createElement(
              'tbody',
              null,
              devices.map((device) =>
                React.createElement(
                  'tr',
                  { key: device.id, className: 'border-t hover:bg-gray-50' },
                  React.createElement('td', { className: 'py-3 px-4 font-mono' }, device.id),
                  React.createElement('td', { className: 'py-3 px-4' }, device.human_name || '—'),
                  React.createElement('td', { className: 'py-3 px-4' }, builds[device.build_id] || `ID: ${device.build_id}`),
                  React.createElement('td', { className: 'py-3 px-4 text-sm' }, 
                    new Date(device.created_at).toLocaleString('ru-RU')
                  ),
                  React.createElement(
                    'td',
                    { className: 'py-3 px-4 space-x-2' },
                    React.createElement(
                      'button',
                      {
                        onClick: () => handleViewData(device),
                        className: 'bg-green-600 text-white py-1 px-3 rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 text-sm'
                      },
                      'Данные'
                    ),
                    React.createElement(
                      'button',
                      {
                        onClick: () => handleDelete(device.id),
                        className: 'bg-red-600 text-white py-1 px-3 rounded hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 text-sm'
                      },
                      'Удалить'
                    )
                  )
                )
              )
            )
          )
    )
  );
}

window.Devices = Devices;
console.log('Devices.jsx: Devices exported:', window.Devices);