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

  const [showDeviceScenarios, setShowDeviceScenarios] = useState(null);
  const [deviceScenarios, setDeviceScenarios] = useState([]);

  const handleDeviceScenariosClick = async (device) => {
    console.log(`Devices.jsx: Device scenarios button clicked for device:`, device);
    if (showDeviceScenarios === device.id) {
      setShowDeviceScenarios(null);
      return;
    }
    setShowDeviceScenarios(device.id);
    
    try {
      const response = await window.axios.get(`/api/devices/${device.id}/scenarios`, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setDeviceScenarios(response.data.scenarios || response.data || []);
    } catch (error) {
      console.error('Error fetching device scenarios:', error);
      setDeviceScenarios([]);
    }
  };

  const handleDeviceScenarioToggle = async (deviceId, scenarioId, currentStatus) => {
    try {
      await window.axios.patch(`/api/devices/${deviceId}/scenarios/${scenarioId}/toggle`, {}, { 
        headers: { Authorization: `Bearer ${token}` } 
      });
      setDeviceScenarios(deviceScenarios.map(s => 
        s.id === scenarioId ? { ...s, is_active: !currentStatus } : s
      ));
    } catch (error) {
      console.error('Error toggling device scenario:', error);
    }
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
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'ID'),
                React.createElement('th', { className: 'py-3 px-4 text-left' }, 'Название'),
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
                        onClick: () => handleDeviceScenariosClick(device),
                        className: 'bg-purple-600 text-white py-1 px-3 rounded hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm'
                      },
                      'Сценарии'
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
            ),
            showDeviceScenarios && React.createElement(
              'div',
              { className: 'mt-4 bg-white shadow-md rounded-lg p-4' },
              React.createElement('h3', { className: 'text-lg font-bold mb-2' }, `Сценарии устройства (ID: ${showDeviceScenarios})`),
              deviceScenarios.length === 0
                ? React.createElement('p', { className: 'text-gray-500' }, 'Сценарии не найдены')
                : React.createElement(
                    'div',
                    { className: 'space-y-2' },
                    deviceScenarios.map(scenario =>
                      React.createElement(
                        'div',
                        { key: scenario.id, className: 'flex justify-between items-center p-2 border rounded' },
                        React.createElement('span', null, scenario.human_name || scenario.machine_name),
                        React.createElement(
                          'button',
                          {
                            onClick: () => handleDeviceScenarioToggle(showDeviceScenarios, scenario.id, scenario.is_active),
                            className: `relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scenario.is_active ? 'bg-green-600' : 'bg-gray-300'}`
                          },
                          React.createElement(
                            'span',
                            {
                              className: `inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${scenario.is_active ? 'translate-x-6' : 'translate-x-1'}`
                            }
                          )
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